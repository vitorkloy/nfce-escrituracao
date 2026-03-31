/**
 * NF-e — apenas os Web Services do Ambiente Nacional indicados (produção):
 * - NFeDistribuicaoDFe (v1.00)
 * - NFeRecepcaoEvento4 (v4.00)
 */
import axios, { AxiosError } from 'axios'
import type https from 'https'

export type Ambiente = 'producao'

export interface ConfigCertNfe {
  pfxPath: string
  senha: string
  ambiente?: Ambiente
}

/** Únicos endpoints NF-e utilizados pela aplicação (AN, produção). */
export const ENDPOINTS_AN_PRODUCAO = {
  recepcaoEvento: 'https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
  distribuicaoDFe: 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
} as const

/**
 * CDATA protege o envelope SOAP se o XML fiscal tiver &, < ou texto com caracteres especiais.
 * Quebra de CDATA literal `]]>` no conteúdo é escapada conforme recomendação W3C.
 */
function embutirNfeDadosMsgCdata(xmlCorpo: string): string {
  const corpo = xmlCorpo ?? ''
  const safe = corpo.replace(/]]>/g, ']]]]><![CDATA[>')
  return `<![CDATA[${safe}]]>`
}

/**
 * Recepção de evento: CDATA evita quebrar o envelope se o XML colado tiver &, <, etc.
 */
function soapEnvelopeNfeDadosMsg(wsdlServiceId: string, xmlCorpo: string): string {
  const payload = embutirNfeDadosMsgCdata(xmlCorpo)
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/${wsdlServiceId}">${payload}</nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`
}

/**
 * Distribuição DFe: o `distDFeInt` deve ir como XML filho literal de nfeDadosMsg.
 * CDATA aqui faz a SEFAZ tratar o lote como texto e pode retornar cStat 243 (XML mal formado).
 */
function soapEnvelopeDistribuicaoDFe(nfeDadosMsgInnerXml: string): string {
  const payload = (nfeDadosMsgInnerXml ?? '').trim()
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>${payload}</nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`
}

async function postSoap(
  url: string,
  envelope: string,
  options: { soapAction?: string },
  agente: https.Agent
): Promise<string> {
  const contentType = options.soapAction
    ? `application/soap+xml; charset=utf-8; action="${options.soapAction}"`
    : 'application/soap+xml; charset=utf-8'

  try {
    const { data } = await axios.post(url, envelope, {
      httpsAgent: agente,
      timeout: 120000,
      headers: {
        'Content-Type': contentType,
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

export async function nfeRecepcaoEventoNF(
  _config: ConfigCertNfe,
  nfeDadosMsgXml: string,
  agente: https.Agent
): Promise<string> {
  void _config
  const envelope = soapEnvelopeNfeDadosMsg('NFeRecepcaoEvento4', nfeDadosMsgXml)
  return postSoap(
    ENDPOINTS_AN_PRODUCAO.recepcaoEvento,
    envelope,
    { soapAction: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEventoNF' },
    agente
  )
}

export async function nfeDistDFeInteresse(
  _config: ConfigCertNfe,
  nfeDadosMsgInnerXml: string,
  agente: https.Agent
): Promise<string> {
  void _config
  const envelope = soapEnvelopeDistribuicaoDFe(nfeDadosMsgInnerXml)
  return postSoap(
    ENDPOINTS_AN_PRODUCAO.distribuicaoDFe,
    envelope,
    { soapAction: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse' },
    agente
  )
}
