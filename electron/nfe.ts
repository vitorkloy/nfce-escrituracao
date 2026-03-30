import axios, { AxiosError } from 'axios'
import type https from 'https'

export type Ambiente = 'homologacao' | 'producao'

export interface ConfigCertNfe {
  pfxPath: string
  senha: string
  ambiente: Ambiente
}

export interface NfeStatusServicoResultado {
  cStat: string
  xMotivo: string
  tpAmb?: string
  dhRecbto?: string
  versaoAplic?: string
}

export interface NfeConsultaProtocoloResultado {
  cStat: string
  xMotivo: string
  chave?: string
  nProt?: string
  dhRecbto?: string
  xNome?: string
  vNF?: string
}

const NAMESPACE = 'http://www.portalfiscal.inf.br/nfe'

const ENDPOINTS = {
  homologacao: {
    consultaProtocolo: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx',
    statusServico: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx',
  },
  producao: {
    consultaProtocolo: 'https://nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx',
    statusServico: 'https://nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx',
  },
} as const

const TP_AMB = { producao: '1', homologacao: '2' } as const

function soapEnvelope(acao: string, xmlCorpo: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/${acao}">${xmlCorpo}</nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`
}

function extrairTag(xml: string, tag: string): string | undefined {
  return xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`))?.[1]?.trim()
}

function validarChave(chave: string): void {
  if (!/^\d{44}$/.test(chave)) {
    throw new Error('Chave inválida: informe exatamente 44 dígitos numéricos.')
  }
}

async function postSoap(url: string, acao: string, bodyXml: string, agente: https.Agent): Promise<string> {
  const envelope = soapEnvelope(acao, bodyXml)
  try {
    const { data } = await axios.post(url, envelope, {
      httpsAgent: agente,
      timeout: 60000,
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
      },
      responseType: 'text',
      transformResponse: [(d) => d as string],
      validateStatus: () => true,
    })
    const xml = String(data ?? '')
    if (!xml) throw new Error('Resposta vazia da SEFAZ.')
    return xml
  } catch (err) {
    if (err instanceof AxiosError) {
      throw new Error(`Falha de conexão com a SEFAZ (NF-e): ${err.message}`)
    }
    throw err
  }
}

function xmlStatusServico(tpAmb: string): string {
  return (
    `<consStatServ xmlns="${NAMESPACE}" versao="4.00">` +
    `<tpAmb>${tpAmb}</tpAmb>` +
    `<cUF>35</cUF>` +
    `<xServ>STATUS</xServ>` +
    `</consStatServ>`
  )
}

function xmlConsultaProtocolo(tpAmb: string, chave: string): string {
  return (
    `<consSitNFe xmlns="${NAMESPACE}" versao="4.00">` +
    `<tpAmb>${tpAmb}</tpAmb>` +
    `<xServ>CONSULTAR</xServ>` +
    `<chNFe>${chave}</chNFe>` +
    `</consSitNFe>`
  )
}

function parseStatusServico(xml: string): NfeStatusServicoResultado {
  return {
    cStat: extrairTag(xml, 'cStat') ?? '',
    xMotivo: extrairTag(xml, 'xMotivo') ?? '',
    tpAmb: extrairTag(xml, 'tpAmb'),
    dhRecbto: extrairTag(xml, 'dhRecbto'),
    versaoAplic: extrairTag(xml, 'verAplic'),
  }
}

function parseConsultaProtocolo(xml: string): NfeConsultaProtocoloResultado {
  return {
    cStat: extrairTag(xml, 'cStat') ?? '',
    xMotivo: extrairTag(xml, 'xMotivo') ?? '',
    chave: extrairTag(xml, 'chNFe'),
    nProt: extrairTag(xml, 'nProt'),
    dhRecbto: extrairTag(xml, 'dhRecbto'),
    xNome: extrairTag(xml, 'xNome'),
    vNF: extrairTag(xml, 'vNF'),
  }
}

export async function nfeStatusServico(config: ConfigCertNfe, agente: https.Agent): Promise<NfeStatusServicoResultado> {
  const tpAmb = TP_AMB[config.ambiente]
  const xmlReq = xmlStatusServico(tpAmb)
  const xmlResp = await postSoap(ENDPOINTS[config.ambiente].statusServico, 'NFeStatusServico4', xmlReq, agente)
  return parseStatusServico(xmlResp)
}

export async function nfeConsultaProtocolo(
  config: ConfigCertNfe,
  chave: string,
  agente: https.Agent
): Promise<NfeConsultaProtocoloResultado> {
  validarChave(chave)
  const tpAmb = TP_AMB[config.ambiente]
  const xmlReq = xmlConsultaProtocolo(tpAmb, chave)
  const xmlResp = await postSoap(ENDPOINTS[config.ambiente].consultaProtocolo, 'NFeConsultaProtocolo4', xmlReq, agente)
  return parseConsultaProtocolo(xmlResp)
}

