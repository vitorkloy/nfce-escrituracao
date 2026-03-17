/**
 * Cliente SOAP para os Serviços de Apoio à Escrituração da NFC-e
 * Nota Técnica 2026 — SAE-NFC-e v1.0.0 — SEFAZ-SP
 *
 * Roda no processo principal do Electron (Node.js).
 * Faz mTLS com o .pfx diretamente, sem expor o certificado ao renderer.
 */

import https from 'https'
import fs from 'fs'
import axios from 'axios'
import { XMLParser, XMLBuilder } from 'fast-xml-parser'

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const VERSAO = '1.00'
const NAMESPACE = 'http://www.portalfiscal.inf.br/nfe'

const ENDPOINTS = {
  homologacao: {
    listagem: 'https://homologacao.nfce.fazenda.sp.gov.br/ws/NFCeListagemChaves.asmx',
    download: 'https://homologacao.nfce.fazenda.sp.gov.br/ws/NFCeDownloadXML.asmx',
  },
  producao: {
    listagem: 'https://nfce.fazenda.sp.gov.br/ws/NFCeListagemChaves.asmx',
    download: 'https://nfce.fazenda.sp.gov.br/ws/NFCeDownloadXML.asmx',
  },
} as const

const TP_AMB = { producao: '1', homologacao: '2' } as const

// Códigos que indicam sucesso (com ou sem ressalvas)
const CODIGOS_SUCESSO = new Set(['100', '101', '107', '200'])

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type Ambiente = 'homologacao' | 'producao'

export interface ConfigCert {
  pfxPath: string
  senha: string
  ambiente: Ambiente
}

export interface ResultadoListagem {
  cStat: string
  xMotivo: string
  tpAmb: string
  dhReq: string
  chaves: string[]
  dhEmisUltNfce?: string
  incompleto: boolean
}

export interface NfeProc {
  versao: string
  dhInc: string
  nProt: string
  nfeXml: string
}

export interface EventoProc {
  versao: string
  dhInc: string
  nProt: string
  eventoXml: string
}

export interface ResultadoDownload {
  cStat: string
  xMotivo: string
  tpAmb: string
  dhReq: string
  nfeProc?: NfeProc
  eventos: EventoProc[]
}

export class SefazError extends Error {
  constructor(public cStat: string, public xMotivo: string) {
    super(`[${cStat}] ${xMotivo}`)
    this.name = 'SefazError'
  }
}

// ---------------------------------------------------------------------------
// Criação do agente HTTPS com mTLS usando o .pfx
// ---------------------------------------------------------------------------

function criarAgente(pfxPath: string, senha: string): https.Agent {
  const pfxBuffer = fs.readFileSync(pfxPath)
  return new https.Agent({
    pfx: pfxBuffer,
    passphrase: senha,
    rejectUnauthorized: true,
  })
}

// ---------------------------------------------------------------------------
// Montagem dos XMLs de requisição
// ---------------------------------------------------------------------------

function xmlListagem(tpAmb: string, dataInicial: string, dataFinal?: string): string {
  let body = `<nfceListagemChaves versao="${VERSAO}" xmlns="${NAMESPACE}">`
  body += `<tpAmb>${tpAmb}</tpAmb>`
  body += `<dataHoraInicial>${dataInicial}</dataHoraInicial>`
  if (dataFinal) body += `<dataHoraFinal>${dataFinal}</dataHoraFinal>`
  body += `</nfceListagemChaves>`
  return body
}

function xmlDownload(tpAmb: string, chave: string): string {
  return (
    `<nfceDownloadXML versao="${VERSAO}" xmlns="${NAMESPACE}">` +
    `<tpAmb>${tpAmb}</tpAmb>` +
    `<chNFCe>${chave}</chNFCe>` +
    `</nfceDownloadXML>`
  )
}

// ---------------------------------------------------------------------------
// Envelope SOAP 1.1
// ---------------------------------------------------------------------------

function soapEnvelope(acao: string, xmlCorpo: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header/>
  <soap:Body>
    <${acao} xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/${acao}">
      <nfeDadosMsg>${xmlCorpo}</nfeDadosMsg>
    </${acao}>
  </soap:Body>
</soap:Envelope>`
}

// ---------------------------------------------------------------------------
// POST SOAP
// ---------------------------------------------------------------------------

async function postSoap(url: string, acao: string, xmlCorpo: string, agente: https.Agent): Promise<string> {
  const envelope = soapEnvelope(acao, xmlCorpo)

  const resp = await axios.post(url, envelope, {
    headers: {
      'Content-Type': 'text/xml; charset="utf-8"',
      SOAPAction: `"http://www.portalfiscal.inf.br/nfe/wsdl/${acao}/${acao}"`,
    },
    httpsAgent: agente,
    timeout: 60_000,
    responseType: 'text',
  })

  return resp.data as string
}

// ---------------------------------------------------------------------------
// Parse das respostas
// ---------------------------------------------------------------------------

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
})

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
})

function extrairRetorno(xmlStr: string, tagRaiz: string): Record<string, unknown> {
  const parsed = parser.parse(xmlStr)
  // Navega pelo envelope SOAP → Body → *Response → *Result → tagRaiz
  const body = parsed?.Envelope?.Body ?? parsed?.['soap:Envelope']?.['soap:Body']
  if (!body) throw new Error('Resposta SOAP inválida: Body não encontrado.')

  // Busca recursiva pela tag de retorno
  function buscar(obj: unknown): Record<string, unknown> | null {
    if (typeof obj !== 'object' || obj === null) return null
    const o = obj as Record<string, unknown>
    if (tagRaiz in o) return o[tagRaiz] as Record<string, unknown>
    for (const v of Object.values(o)) {
      const found = buscar(v)
      if (found) return found
    }
    return null
  }

  const retorno = buscar(body)
  if (!retorno) throw new Error(`Tag "${tagRaiz}" não encontrada na resposta.`)
  return retorno
}

function verificarStatus(cStat: string, xMotivo: string) {
  if (!CODIGOS_SUCESSO.has(cStat)) {
    throw new SefazError(cStat, xMotivo)
  }
}

function objParaXml(obj: unknown): string {
  if (obj === null || obj === undefined) return ''
  try {
    return xmlBuilder.build(obj as Record<string, unknown>) ?? ''
  } catch {
    return ''
  }
}

function parseListagem(xmlStr: string): ResultadoListagem {
  const ret = extrairRetorno(xmlStr, 'retNfceListagemChaves')

  const cStat = String(ret.cStat ?? '')
  const xMotivo = String(ret.xMotivo ?? '')
  verificarStatus(cStat, xMotivo)

  // chNFCe pode ser string única ou array
  const raw = ret.chNFCe
  const chaves: string[] = !raw ? [] : Array.isArray(raw) ? (raw as string[]) : [raw as string]

  return {
    cStat,
    xMotivo,
    tpAmb: String(ret.tpAmb ?? ''),
    dhReq: String(ret.dhReq ?? ''),
    chaves,
    dhEmisUltNfce: ret.dhEmisUltNfce ? String(ret.dhEmisUltNfce) : undefined,
    incompleto: cStat === '101',
  }
}

function parseDownload(xmlStr: string): ResultadoDownload {
  const ret = extrairRetorno(xmlStr, 'retNfceDownloadXML')

  const cStat = String(ret.cStat ?? '')
  const xMotivo = String(ret.xMotivo ?? '')
  verificarStatus(cStat, xMotivo)

  const proc = ret.proc as Record<string, unknown> | undefined
  let nfeProc: NfeProc | undefined
  const eventos: EventoProc[] = []

  if (proc) {
    const nfeNode = proc.nfeProc as Record<string, unknown> | undefined
    if (nfeNode) {
      const nfeObj = nfeNode.NFe
      nfeProc = {
        versao: String(nfeNode['@_versao'] ?? ''),
        dhInc: String(nfeNode.dhInc ?? ''),
        nProt: String(nfeNode.nProt ?? ''),
        nfeXml: nfeObj ? objParaXml(nfeObj) : '',
      }
    }

    const rawEventos = proc.procEventoNFe
    const eventoArr = !rawEventos ? [] : Array.isArray(rawEventos) ? rawEventos : [rawEventos]
    for (const ev of eventoArr as Record<string, unknown>[]) {
      const evObj = ev.evento
      eventos.push({
        versao: String(ev['@_versao'] ?? ''),
        dhInc: String(ev.dhInc ?? ''),
        nProt: String(ev.nProt ?? ''),
        eventoXml: evObj ? objParaXml(evObj) : '',
      })
    }
  }

  return {
    cStat,
    xMotivo,
    tpAmb: String(ret.tpAmb ?? ''),
    dhReq: String(ret.dhReq ?? ''),
    nfeProc,
    eventos,
  }
}

// ---------------------------------------------------------------------------
// API pública — chamada pelo main.ts via IPC
// ---------------------------------------------------------------------------

export async function listarChaves(
  config: ConfigCert,
  dataInicial: string,
  dataFinal?: string
): Promise<ResultadoListagem> {
  const agente = criarAgente(config.pfxPath, config.senha)
  const tpAmb = TP_AMB[config.ambiente]
  const url = ENDPOINTS[config.ambiente].listagem
  const xml = xmlListagem(tpAmb, dataInicial, dataFinal)
  const resposta = await postSoap(url, 'nfceListagemChaves', xml, agente)
  return parseListagem(resposta)
}

export async function downloadXml(config: ConfigCert, chave: string): Promise<ResultadoDownload> {
  if (!/^\d{44}$/.test(chave)) {
    throw new Error(`Chave inválida: deve ter exatamente 44 dígitos numéricos.`)
  }
  const agente = criarAgente(config.pfxPath, config.senha)
  const tpAmb = TP_AMB[config.ambiente]
  const url = ENDPOINTS[config.ambiente].download
  const xml = xmlDownload(tpAmb, chave)
  const resposta = await postSoap(url, 'nfceDownloadXML', xml, agente)
  return parseDownload(resposta)
}

/**
 * Faz paginação automática usando dhEmisUltNfce quando cStat=101.
 * Retorna todas as chaves do período.
 */
export async function listarTodasChaves(
  config: ConfigCert,
  dataInicial: string,
  dataFinal?: string,
  onProgresso?: (parcial: number) => void
): Promise<string[]> {
  const todasChaves: string[] = []
  let di = dataInicial
  let pagina = 1

  while (true) {
    const resultado = await listarChaves(config, di, dataFinal)
    todasChaves.push(...resultado.chaves)
    onProgresso?.(todasChaves.length)

    if (resultado.incompleto && resultado.dhEmisUltNfce) {
      di = resultado.dhEmisUltNfce.substring(0, 16) // AAAA-MM-DDThh:mm
      pagina++
      console.log(`[SEFAZ] Página ${pagina}: ${todasChaves.length} chaves até agora. Buscando a partir de ${di}...`)
    } else {
      break
    }
  }

  // Remove duplicatas preservando ordem
  return [...new Set(todasChaves)]
}
