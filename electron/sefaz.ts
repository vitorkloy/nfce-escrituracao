/**
 * Cliente SOAP para os Serviços de Apoio à Escrituração da NFC-e
 * Nota Técnica 2026 — SAE-NFC-e v1.0.0 — SEFAZ-SP
 *
 * Roda no processo principal do Electron (Node.js).
 * Faz mTLS com o .pfx diretamente, sem expor o certificado ao renderer.
 */

import https from 'https'
import fs from 'fs'
import axios, { AxiosError } from 'axios'
import { XMLParser, XMLBuilder } from 'fast-xml-parser'

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const VERSAO    = '1.00'
const NAMESPACE = 'http://www.portalfiscal.inf.br/nfe'

const ENDPOINTS = {
  listagem: 'https://nfce.fazenda.sp.gov.br/ws/NFCeListagemChaves.asmx',
  download: 'https://nfce.fazenda.sp.gov.br/ws/NFCeDownloadXML.asmx',
} as const

const TP_AMB = '1' as const

/** Códigos que indicam sucesso (com ou sem ressalvas) */
const CODIGOS_SUCESSO = new Set(['100', '101', '107', '200'])

/** Limite de paginação: evita loop infinito se dhEmisUltNfce não avançar */
const MAX_PAGINAS = 200

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type Ambiente = 'producao'

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
  /** Número do documento (nNF) */
  nNF?: string
  /** Valor total do cupom (vNF) */
  vNF?: string
  /** Data/Hora de emissão (dhEmi) */
  dhEmi?: string
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

// ---------------------------------------------------------------------------
// Erros customizados
// ---------------------------------------------------------------------------

/** Erro de negócio retornado pela SEFAZ (cStat fora dos códigos de sucesso) */
export class SefazError extends Error {
  constructor(public readonly cStat: string, public readonly xMotivo: string) {
    super(`[${cStat}] ${xMotivo}`)
    this.name = 'SefazError'
  }
}

/** Erro de rede / conectividade */
export class SefazNetworkError extends Error {
  constructor(mensagem: string, public readonly original?: unknown) {
    super(mensagem)
    this.name = 'SefazNetworkError'
  }
}

/** Erro de parse / resposta inesperada */
export class SefazParseError extends Error {
  constructor(mensagem: string, public readonly xmlRecebido?: string) {
    super(mensagem)
    this.name = 'SefazParseError'
  }
}

/** Cancelamento solicitado pela UI durante operações longas (ex.: paginação). */
export class SefazCancelError extends Error {
  constructor(mensagem = 'Operação cancelada pelo usuário.') {
    super(mensagem)
    this.name = 'SefazCancelError'
  }
}

// ---------------------------------------------------------------------------
// Criação do agente HTTPS com mTLS usando o .pfx
// ---------------------------------------------------------------------------

export function criarAgente(pfxPath: string, senha: string): https.Agent {
  let pfxBuffer: Buffer

  try {
    pfxBuffer = fs.readFileSync(pfxPath)
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err)
    throw new Error(`Não foi possível ler o certificado em "${pfxPath}": ${detalhe}`)
  }

  if (!pfxBuffer || pfxBuffer.length < 100) {
    throw new Error(`O arquivo de certificado parece estar vazio ou corrompido: "${pfxPath}"`)
  }

  try {
    return new https.Agent({
      pfx: pfxBuffer,
      passphrase: senha,
      // O Node.js não inclui as CAs intermediárias da ICP-Brasil por padrão.
      // O servidor da SEFAZ-SP usa certificado emitido por AC raiz brasileira,
      // então desabilitamos a verificação da CA do servidor (mantemos o mTLS
      // do cliente — o e-CNPJ ainda é enviado e valida a identidade).
      rejectUnauthorized: false,
      // Força TLS 1.2 — padrão dos webservices da SEFAZ-SP
      minVersion: 'TLSv1.2',
    })
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err)
    const msg = detalhe.toLowerCase()
    if (msg.includes('mac') || msg.includes('password') || msg.includes('decrypt')) {
      throw new Error('Senha do certificado incorreta. Verifique e tente novamente.')
    }
    throw new Error(`Falha ao carregar o certificado. Detalhe: ${detalhe}`)
  }
}

// ---------------------------------------------------------------------------
// Validações de entrada
// ---------------------------------------------------------------------------

const REGEX_DATA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

function validarDataHora(valor: string, campo: string): void {
  if (!REGEX_DATA_HORA.test(valor)) {
    throw new Error(`${campo} inválido: esperado formato "AAAA-MM-DDThh:mm", recebido "${valor}"`)
  }
}

function validarChave(chave: string): void {
  if (!/^\d{44}$/.test(chave)) {
    throw new Error(`Chave de acesso inválida: deve ter exatamente 44 dígitos numéricos. Recebido: "${chave}"`)
  }
}

// ---------------------------------------------------------------------------
// Montagem dos XMLs de requisição
// ---------------------------------------------------------------------------

function xmlListagem(tpAmb: string, dataInicial: string, dataFinal?: string): string {
  // XSD SAE-NFC-e: elemento raiz no namespace NFe (portalfiscal.inf.br/nfe)
  let body = `<nfceListagemChaves xmlns="${NAMESPACE}" versao="${VERSAO}">`
  body += `<tpAmb>${tpAmb}</tpAmb>`
  body += `<dataHoraInicial>${dataInicial}</dataHoraInicial>`
  if (dataFinal) body += `<dataHoraFinal>${dataFinal}</dataHoraFinal>`
  body += `</nfceListagemChaves>`
  return body
}

function xmlDownload(tpAmb: string, chave: string): string {
  return (
    `<nfceDownloadXML xmlns="${NAMESPACE}" versao="${VERSAO}">` +
    `<tpAmb>${tpAmb}</tpAmb>` +
    `<chNFCe>${chave}</chNFCe>` +
    `</nfceDownloadXML>`
  )
}

// ---------------------------------------------------------------------------
// Envelope SOAP 1.1
// ---------------------------------------------------------------------------

function soapEnvelope(acao: string, xmlCorpo: string): string {
  // Estrutura EXATA conforme WSDL SEFAZ-SP (ordem de xmlns idêntica)
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/${acao}">${xmlCorpo}</nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`
}

// ---------------------------------------------------------------------------
// POST SOAP — com tratamento de erros de rede
// ---------------------------------------------------------------------------

async function postSoap(
  url: string,
  acao: string,
  xmlCorpo: string,
  agente: https.Agent,
  options?: { signal?: AbortSignal; shouldCancel?: () => boolean }
): Promise<string> {
  const envelope = soapEnvelope(acao, xmlCorpo)

  const debug = process.env.DEBUG === 'sefaz'
  if (debug) {
    console.log(`[SEFAZ] POST ${url}`)
    console.log(`[SEFAZ] Envelope:\n${envelope}`)
  }

  // Erros de rede transitórios — vale tentar novamente
  const ERROS_RETRY = new Set(['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNABORTED'])
  const MAX_TENTATIVAS = 3
  let ultimoErro: unknown

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    if (options?.shouldCancel?.()) throw new SefazCancelError()
    try {
      const resp = await axios.post(url, envelope, {
        headers: {
          // WSDL SEFAZ-SP: Content-Type sem action (conforme amostra oficial)
          'Content-Type': 'application/soap+xml; charset=utf-8',
        },
        httpsAgent: agente,
        timeout: 60_000,
        responseType: 'text',
        signal: options?.signal,
      })

      if (!resp.data || typeof resp.data !== 'string') {
        throw new SefazParseError(`Resposta vazia do serviço "${acao}"`)
      }

      if (debug) console.log(`[SEFAZ] Resposta HTTP ${resp.status}:\n${resp.data}`)
      return resp.data

    } catch (err) {
      ultimoErro = err

      if (err instanceof SefazParseError || err instanceof SefazNetworkError) throw err
      if (options?.shouldCancel?.()) throw new SefazCancelError()

      if (err instanceof AxiosError) {
        if (err.code === 'ERR_CANCELED') throw new SefazCancelError()
        const code = err.code ?? ''

        // Erros transitórios: faz retry com backoff
        if (ERROS_RETRY.has(code) && tentativa < MAX_TENTATIVAS) {
          const delay = tentativa * 2000
          if (debug) console.warn(`[SEFAZ] ${code} — retry ${tentativa}/${MAX_TENTATIVAS - 1}, aguardando ${delay}ms`)
          await new Promise(r => setTimeout(r, delay))
          continue
        }

        // Classifica e lança erro descritivo
        if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
          throw new SefazNetworkError(
            `Timeout ao conectar à SEFAZ-SP (${acao}). Verifique sua conexão e tente novamente.`, err)
        }
        if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
          throw new SefazNetworkError(
            `Não foi possível conectar à SEFAZ-SP (${acao}). Verifique sua conexão com a internet.`, err)
        }
        if (code === 'ECONNRESET' || code === 'EPIPE') {
          throw new SefazNetworkError(
            `Conexão interrompida pela SEFAZ-SP (${acao}). Tente novamente.`, err)
        }
        if (err.response) {
          const status = err.response.status
          if (status === 401 || status === 403) {
            throw new SefazNetworkError(
              `Acesso negado pelo servidor (HTTP ${status}). Verifique o certificado digital.`, err)
          }
          if (status === 500) {
            const body = err.response.data
            const detalhe = typeof body === 'string' && body.length > 0
              ? extrairDetalheFault(body) : null
            throw new SefazNetworkError(
              detalhe
                ? `Erro no servidor SEFAZ-SP (HTTP 500): ${detalhe}`
                : 'Erro interno no servidor da SEFAZ-SP (HTTP 500). Tente novamente em instantes.', err)
          }
          throw new SefazNetworkError(`Erro HTTP ${status} ao chamar o serviço "${acao}".`, err)
        }
        const sslMsg = err.message ?? ''
        if (code === 'CERT_HAS_EXPIRED' || sslMsg.includes('CERT_HAS_EXPIRED')) {
          throw new SefazNetworkError('O certificado digital expirou. Renove o e-CNPJ.', err)
        }
        if (sslMsg.includes('SSL') || sslMsg.includes('CERT') || sslMsg.includes('certificate')) {
          throw new SefazNetworkError(
            'Erro de TLS ao conectar à SEFAZ-SP. Verifique se o certificado está válido.', err)
        }
        throw new SefazNetworkError(`Erro de rede ao chamar "${acao}": ${err.message}`, err)
      }

      throw new SefazNetworkError(
        `Erro inesperado ao chamar "${acao}": ${err instanceof Error ? err.message : String(err)}`, err)
    }
  }

  throw new SefazNetworkError(
    `Falha após ${MAX_TENTATIVAS} tentativas ao chamar "${acao}". Verifique sua conexão.`, ultimoErro)
}

// ---------------------------------------------------------------------------
// Parse das respostas
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Extração de detalhe de falha SOAP (para erros HTTP 500)
// ---------------------------------------------------------------------------

function extrairDetalheFault(xmlStr: string): string | null {
  try {
    const p = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true })
    const parsed = p.parse(xmlStr) as Record<string, unknown>
    const envelope = (parsed?.Envelope ?? parsed?.['soap:Envelope'] ?? parsed?.['soap12:Envelope']) as Record<string, unknown> | undefined
    const body = envelope?.Body ?? envelope?.['soap:Body'] ?? envelope?.['soap12:Body']
    if (!body || typeof body !== 'object') return null
    const b = body as Record<string, unknown>
    const fault = b.Fault ?? b['soap:Fault'] ?? b['soap12:Fault']
    if (!fault || typeof fault !== 'object') return null
    const f = fault as Record<string, unknown>
    const faultstring = f.faultstring ?? f['soap:faultstring']
    if (typeof faultstring === 'string' && faultstring.trim()) return faultstring.trim()
    const reason = f.Reason ?? f['soap12:Reason']
    if (reason && typeof reason === 'object') {
      const text = (reason as Record<string, unknown>).Text
      if (typeof text === 'string' && text.trim()) return text.trim()
    }
    return null
  } catch {
    return null
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false, // evita chNFCe (44 dígitos) virar notação científica
})

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  format: false,
  suppressEmptyNode: true,
})

function extrairRetorno(xmlStr: string, tagRaiz: string): Record<string, unknown> {
  let parsed: Record<string, unknown>

  try {
    parsed = parser.parse(xmlStr)
  } catch (err) {
    throw new SefazParseError(
      `Resposta XML inválida: não foi possível fazer o parse. ${err instanceof Error ? err.message : ''}`,
      xmlStr
    )
  }

  // Garante que é um objeto antes de navegar
  if (typeof parsed !== 'object' || parsed === null) {
    throw new SefazParseError('Resposta XML resultou em valor não-objeto.', xmlStr)
  }

  const p = parsed as Record<string, unknown>
  const envelope = (p['Envelope'] ?? p['soap:Envelope']) as Record<string, unknown> | undefined
  const body = envelope?.['Body'] ?? envelope?.['soap:Body']

  if (!body || typeof body !== 'object') {
    throw new SefazParseError('Resposta SOAP inválida: Body não encontrado.', xmlStr)
  }

  // Busca recursiva pela tag de retorno
  function buscar(obj: unknown, profundidade = 0): Record<string, unknown> | null {
    if (profundidade > 10) return null // evita recursão excessiva
    if (typeof obj !== 'object' || obj === null) return null
    const o = obj as Record<string, unknown>
    if (tagRaiz in o) return o[tagRaiz] as Record<string, unknown>
    for (const v of Object.values(o)) {
      const found = buscar(v, profundidade + 1)
      if (found) return found
    }
    return null
  }

  const retorno = buscar(body)
  if (!retorno) {
    throw new SefazParseError(
      `Tag "${tagRaiz}" não encontrada na resposta. O serviço pode estar retornando um formato inesperado.`,
      xmlStr
    )
  }

  return retorno
}

function verificarStatus(cStat: string, xMotivo: string, xmlOriginal: string): void {
  if (!cStat) {
    throw new SefazParseError('Resposta sem código de status (cStat). Verifique o formato do envelope SOAP.', xmlOriginal)
  }
  if (!CODIGOS_SUCESSO.has(cStat)) {
    throw new SefazError(cStat, xMotivo || 'Sem descrição')
  }
}

function parseListagem(xmlStr: string): ResultadoListagem {
  const ret = extrairRetorno(xmlStr, 'retNfceListagemChaves')

  const cStat   = String(ret.cStat   ?? '')
  const xMotivo = String(ret.xMotivo ?? '')
  verificarStatus(cStat, xMotivo, xmlStr)

  // chNFCe pode vir como string única, array, ou ausente
  const raw    = ret.chNFCe
  const chaves: string[] = !raw
    ? []
    : Array.isArray(raw)
      ? (raw as string[]).filter(Boolean)
      : [String(raw)]

  const dhEmisRaw = ret.dhEmisUltNfce
  const dhEmisUltNfce = dhEmisRaw ? String(dhEmisRaw) : undefined

  return {
    cStat,
    xMotivo,
    tpAmb:         String(ret.tpAmb  ?? ''),
    dhReq:         String(ret.dhReq  ?? ''),
    chaves,
    dhEmisUltNfce,
    incompleto:    cStat === '101',
  }
}

function parseDownload(xmlStr: string): ResultadoDownload {
  const ret = extrairRetorno(xmlStr, 'retNfceDownloadXML')

  const cStat   = String(ret.cStat   ?? '')
  const xMotivo = String(ret.xMotivo ?? '')
  verificarStatus(cStat, xMotivo, xmlStr)

  const proc = ret.proc as Record<string, unknown> | undefined
  let nfeProc: NfeProc | undefined
  const eventos: EventoProc[] = []

  if (proc && typeof proc === 'object') {
    const nfeNode = proc.nfeProc as Record<string, unknown> | undefined
    if (nfeNode && typeof nfeNode === 'object') {
      // Reconstrói XML válido — não JSON — para poder salvar o arquivo .xml
      const nodeComNs = { ...(nfeNode as Record<string, unknown>) }
      if (!('@_xmlns' in nodeComNs)) nodeComNs['@_xmlns'] = NAMESPACE
      const nfeXml = xmlBuilder.build({ nfeProc: nodeComNs }) as string

      // Extrai campos do XML para o relatório (regex por performance e simplicidade).
      // Campos esperados na estrutura da NFC-e:
      // - <dhEmi> ... </dhEmi>
      // - <nNF> ... </nNF>
      // - <vNF> ... </vNF>
      const nNF = nfeXml.match(/<nNF>([^<]+)<\/nNF>/)?.[1]?.trim()
      const vNF = nfeXml.match(/<vNF>([^<]+)<\/vNF>/)?.[1]?.trim()
      const dhEmi = nfeXml.match(/<dhEmi>([^<]+)<\/dhEmi>/)?.[1]?.trim()

      nfeProc = {
        versao: String(nfeNode['@_versao'] ?? ''),
        dhInc: String(nfeNode.dhInc ?? ''),
        nProt: String(nfeNode.nProt ?? ''),
        nNF,
        vNF,
        dhEmi,
        nfeXml,
      }
    }

    const rawEventos = proc.procEventoNFe
    const eventoArr = !rawEventos
      ? []
      : Array.isArray(rawEventos) ? rawEventos : [rawEventos]

    for (const ev of eventoArr as Record<string, unknown>[]) {
      if (!ev || typeof ev !== 'object') continue
      eventos.push({
        versao:    String(ev['@_versao'] ?? ''),
        dhInc:     String(ev.dhInc      ?? ''),
        nProt:     String(ev.nProt      ?? ''),
        eventoXml: xmlBuilder.build({ procEventoNFe: ev }) as string,
      })
    }
  }

  return {
    cStat,
    xMotivo,
    tpAmb:  String(ret.tpAmb ?? ''),
    dhReq:  String(ret.dhReq ?? ''),
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
  dataFinal?: string,
  options?: { signal?: AbortSignal; shouldCancel?: () => boolean }
): Promise<ResultadoListagem> {
  validarDataHora(dataInicial, 'dataHoraInicial')
  if (dataFinal) validarDataHora(dataFinal, 'dataHoraFinal')

  if (dataFinal && dataFinal < dataInicial) {
    throw new Error('dataHoraFinal não pode ser anterior a dataHoraInicial.')
  }

  const agente  = criarAgente(config.pfxPath, config.senha)
  const tpAmb   = TP_AMB
  const url     = ENDPOINTS.listagem
  const xml     = xmlListagem(tpAmb, dataInicial, dataFinal)
  const resposta = await postSoap(url, 'NFCeListagemChaves', xml, agente, options)
  return parseListagem(resposta)
}

export async function downloadXml(
  config: ConfigCert,
  chave: string,
  agenteExterno?: https.Agent
): Promise<ResultadoDownload> {
  validarChave(chave)

  const agente   = agenteExterno ?? criarAgente(config.pfxPath, config.senha)
  const tpAmb    = TP_AMB
  const url      = ENDPOINTS.download
  const xml      = xmlDownload(tpAmb, chave)
  const resposta = await postSoap(url, 'NFCeDownloadXML', xml, agente)
  return parseDownload(resposta)
}

/**
 * Faz paginação automática usando dhEmisUltNfce quando cStat=101.
 * Retorna todas as chaves do período sem duplicatas.
 * Limita a MAX_PAGINAS páginas para evitar loop infinito.
 */
export async function listarTodasChaves(
  config: ConfigCert,
  dataInicial: string,
  dataFinal?: string,
  onProgresso?: (parcial: number) => void,
  shouldCancel?: () => boolean,
  signal?: AbortSignal
): Promise<string[]> {
  const todasChaves: string[] = []
  let di    = dataInicial
  let pagina = 1
  let ultimodhEmis: string | undefined

  while (pagina <= MAX_PAGINAS) {
    if (shouldCancel?.()) throw new SefazCancelError()
    const resultado = await listarChaves(config, di, dataFinal, { signal, shouldCancel })
    todasChaves.push(...resultado.chaves)
    onProgresso?.(todasChaves.length)

    if (!resultado.incompleto || !resultado.dhEmisUltNfce) break

    // Guarda-chuva contra loop infinito: se dhEmisUltNfce não avançou, para
    if (resultado.dhEmisUltNfce === ultimodhEmis) {
      console.warn('[SEFAZ] dhEmisUltNfce não avançou — encerrando paginação para evitar loop.')
      break
    }

    ultimodhEmis = resultado.dhEmisUltNfce
    di = resultado.dhEmisUltNfce.substring(0, 16) // AAAA-MM-DDThh:mm

    pagina++
    console.log(`[SEFAZ] Página ${pagina}/${MAX_PAGINAS}: ${todasChaves.length} chaves. Próximo ponto: ${di}`)
  }

  if (pagina > MAX_PAGINAS) {
    console.warn(`[SEFAZ] Limite de ${MAX_PAGINAS} páginas atingido. Pode haver chaves faltando.`)
  }

  // Remove duplicatas preservando ordem de chegada
  return [...new Set(todasChaves)]
}