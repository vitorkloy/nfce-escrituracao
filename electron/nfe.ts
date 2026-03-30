/**
 * NF-e — apenas os Web Services do Ambiente Nacional indicados (produção):
 * - NFeDistribuicaoDFe (v1.00)
 * - NFeRecepcaoEvento4 (v4.00)
 */
import axios, { AxiosError } from 'axios'
import type https from 'https'

export type Ambiente = 'homologacao' | 'producao'

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
 * nfeDadosMsg: WSDL document/literal com xs:any — XML filho literal dentro do elemento.
 */
function soapEnvelopeNfeDadosMsg(wsdlServiceId: string, xmlCorpo: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/${wsdlServiceId}">${xmlCorpo}</nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`
}

function soapEnvelopeDistribuicaoDFe(nfeDadosMsgInnerXml: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>${nfeDadosMsgInnerXml}</nfeDadosMsg>
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
