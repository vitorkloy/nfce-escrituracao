import zlib from 'zlib'
import { formatarUltNsu } from './nfe-dist-dfe-build'

export interface DocZipItem {
  nsu: string
  schema: string
  xmlUtf8: string
}

export interface RetDistDfeParseado {
  cStat: string
  xMotivo: string
  ultNSU: string
  maxNSU: string
  documentos: DocZipItem[]
}

/** Extrai XML interno do envelope SOAP (CDATA ou literal). */
export function extrairXmlRetDistDfeInt(soapXml: string): string {
  const fault = soapXml.match(/<faultstring>([^<]*)<\/faultstring>/i)
  if (fault?.[1]) throw new Error(`SOAP Fault: ${fault[1].trim()}`)

  const cdata = soapXml.match(/<!\[CDATA\[([\s\S]*?)\]\]>/)
  if (cdata?.[1]?.includes('retDistDFeInt')) return cdata[1].trim()

  const inner = soapXml.match(
    /<nfeDistDFeInteresseResult[^>]*>([\s\S]*?)<\/nfeDistDFeInteresseResult>/i
  )
  if (inner?.[1]) {
    let s = inner[1].trim()
    s = s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    if (s.includes('retDistDFeInt')) return s
  }

  const direto = soapXml.match(/<retDistDFeInt[\s\S]*?<\/retDistDFeInt>/i)
  if (direto) return direto[0]
  throw new Error('Não foi possível localizar retDistDFeInt na resposta SOAP.')
}

/** Valor de elemento XML com ou sem prefixo (ex.: ultNSU, nfe:ultNSU). */
export function extrairTagTextoLocal(xml: string, localName: string): string {
  const esc = localName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`<(?:[\\w.-]+:)?${esc}>([^<]*)</(?:[\\w.-]+:)?${esc}>`, 'i')
  const m = xml.match(re)
  return (m?.[1] ?? '').trim()
}

/** Decodifica conteúdo docZip: Base64 + GZip → UTF-8. */
export function decodificarDocZipBase64Gzip(base64: string): string {
  const buf = Buffer.from(base64.replace(/\s/g, ''), 'base64')
  return zlib.gunzipSync(buf).toString('utf-8')
}

/** Lista elementos docZip (atributos NSU e schema + texto interno). */
function extrairDocZips(retXml: string): DocZipItem[] {
  const out: DocZipItem[] = []
  const re = /<docZip\s+([^>]+)>([\s\S]*?)<\/docZip>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(retXml)) !== null) {
    const attrs = m[1]
    const body = m[2].trim()
    const nsuM =
      attrs.match(/\bNSU\s*=\s*["']([^"']+)["']/i) ?? attrs.match(/\bnsu\s*=\s*["']([^"']+)["']/i)
    const schM = attrs.match(/schema\s*=\s*["']([^"']+)["']/i)
    const nsu = (nsuM?.[1] ?? '').trim()
    const schema = (schM?.[1] ?? 'doc').trim()
    if (!body) continue
    try {
      const xmlUtf8 = decodificarDocZipBase64Gzip(body)
      out.push({ nsu, schema, xmlUtf8 })
    } catch {
      /* docZip inválido — ignora */
    }
  }
  return out
}

/** Compara NSUs 15 dígitos (strings homogêneas). */
export function compararNsu(a: string, b: string): number {
  const pa = formatarUltNsu(a)
  const pb = formatarUltNsu(b)
  if (pa < pb) return -1
  if (pa > pb) return 1
  return 0
}

/**
 * maxNSU só com zeros costuma ser resposta espúria (ex. erro); não encerrar sincronização
 * por ultNSU >= maxNSU nesse caso.
 */
export function maxNsuValidoParaTerminoSincronia(maxNSU: string): boolean {
  return compararNsu(formatarUltNsu(maxNSU), formatarUltNsu('0')) > 0
}

/** Maior NSU numérico entre os docZip (fallback se ret.ultNSU vier vazio). */
export function maiorNsuDosDocumentos(documentos: DocZipItem[]): string | undefined {
  let best = ''
  for (const d of documentos) {
    const n = d.nsu.replace(/\D/g, '')
    if (n.length === 0) continue
    const pad = formatarUltNsu(n)
    if (!best || compararNsu(pad, best) > 0) best = pad
  }
  return best || undefined
}

export function parsearRetDistDfeInt(retXml: string): RetDistDfeParseado {
  const cStat = extrairTagTextoLocal(retXml, 'cStat') || '0'
  const xMotivo = extrairTagTextoLocal(retXml, 'xMotivo')
  const documentos = extrairDocZips(retXml)

  let ultNSU = extrairTagTextoLocal(retXml, 'ultNSU')
  let maxNSU = extrairTagTextoLocal(retXml, 'maxNSU')

  if (!ultNSU || !/^\d+$/.test(ultNSU.replace(/\D/g, ''))) {
    const fallback = maiorNsuDosDocumentos(documentos)
    if (fallback) ultNSU = fallback
  }
  ultNSU = ultNSU ? formatarUltNsu(ultNSU.replace(/\D/g, '')) : formatarUltNsu('0')

  if (!maxNSU || !/^\d+$/.test(maxNSU.replace(/\D/g, ''))) {
    maxNSU = ultNSU
  }
  maxNSU = formatarUltNsu(maxNSU.replace(/\D/g, ''))

  return { cStat, xMotivo, ultNSU, maxNSU, documentos }
}

const CHAVE_44 = /\b(\d{44})\b/

/** Primeira chave de 44 dígitos no XML (infNFe Id, chNFe, etc.). */
export function extrairChaveAcesso44(xml: string): string | undefined {
  const id = xml.match(/Id\s*=\s*["']NFe(\d{44})["']/i)
  if (id?.[1]) return id[1]
  const ch = xml.match(/<chNFe>(\d{44})<\/chNFe>/i)
  if (ch?.[1]) return ch[1]
  const any = xml.match(CHAVE_44)
  return any?.[1]
}

/** Ano e mês (YYYY, MM) a partir de dhEmi / dEmi. */
export function extrairAnoMesEmissao(xml: string): { ano: string; mes: string } | null {
  const dh = xml.match(/<dhEmi>([^<]+)<\/dhEmi>/i)?.[1] ?? xml.match(/<dEmi>([^<]+)<\/dEmi>/i)?.[1]
  if (!dh) return null
  const iso = dh.trim()
  const y = iso.slice(0, 4)
  const m = iso.slice(5, 7)
  if (/^\d{4}$/.test(y) && /^\d{2}$/.test(m)) return { ano: y, mes: m }
  return null
}
