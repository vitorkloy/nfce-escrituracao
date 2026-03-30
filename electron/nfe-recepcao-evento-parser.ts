import { extrairTagTextoLocal } from './nfe-dist-dfe-parser'

export interface RetEnvEventoResumo {
  idLote?: string
  tpAmb?: string
  cStat: string
  xMotivo: string
}

/** Extrai o XML interno (retEnvEvento) do envelope SOAP de NFeRecepcaoEvento4. */
export function extrairXmlNfeRecepcaoEventoResult(soapXml: string): string {
  const fault = soapXml.match(/<faultstring>([^<]*)<\/faultstring>/i)
  if (fault?.[1]) throw new Error(`SOAP Fault: ${fault[1].trim()}`)

  const cdata = soapXml.match(/<!\[CDATA\[([\s\S]*?)\]\]>/)
  if (cdata?.[1]?.includes('retEnvEvento')) return cdata[1].trim()

  const inner = soapXml.match(
    /<nfeRecepcaoEventoNFResult[^>]*>([\s\S]*?)<\/nfeRecepcaoEventoNFResult>/i
  )
  if (inner?.[1]) {
    let s = inner[1].trim()
    s = s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    if (s.includes('retEnvEvento')) return s
  }

  const direto = soapXml.match(/<retEnvEvento[\s\S]*?<\/retEnvEvento>/i)
  if (direto) return direto[0]
  throw new Error('Não foi possível localizar retEnvEvento na resposta SOAP.')
}

export function parsearRetEnvEvento(retXml: string): RetEnvEventoResumo {
  return {
    idLote: extrairTagTextoLocal(retXml, 'idLote') || undefined,
    tpAmb: extrairTagTextoLocal(retXml, 'tpAmb') || undefined,
    cStat: extrairTagTextoLocal(retXml, 'cStat') || '0',
    xMotivo: extrairTagTextoLocal(retXml, 'xMotivo'),
  }
}
