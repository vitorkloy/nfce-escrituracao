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

/** Decodifica conteúdo docZip: Base64 + compactação → UTF-8 (AN costuma usar gzip). */
export function decodificarDocZipBase64Gzip(base64: string): string {
  const buf = Buffer.from(base64.replace(/\s/g, ''), 'base64')
  try {
    return zlib.gunzipSync(buf).toString('utf-8')
  } catch {
    try {
      return zlib.inflateSync(buf).toString('utf-8')
    } catch {
      return zlib.inflateRawSync(buf).toString('utf-8')
    }
  }
}

/** Lista elementos docZip (atributos NSU e schema + texto interno). Aceita prefixo de namespace. */
function extrairDocZips(retXml: string): DocZipItem[] {
  const out: DocZipItem[] = []
  const re = /<(?:[\w.-]+:)?docZip\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?docZip>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(retXml)) !== null) {
    const attrs = m[1]
    const body = m[2].trim()
    const nsuM =
      attrs.match(/\bNSU\s*=\s*["']([^"']+)["']/i) ?? attrs.match(/\bnsu\s*=\s*["']([^"']+)["']/i)
    const schM = attrs.match(/\bschema\s*=\s*["']([^"']+)["']/i)
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

/** Primeira chave de 44 dígitos no XML (infNFe Id, chNFe, resNFe, procNFe, etc.). */
export function extrairChaveAcesso44(xml: string): string | undefined {
  const id = xml.match(/Id\s*=\s*["']NFe(\d{44})["']/i)
  if (id?.[1]) return id[1]
  const idPref = xml.match(/Id\s*=\s*["'][^"']*NFe(\d{44})["']/i)
  if (idPref?.[1]) return idPref[1]
  const ch = xml.match(/<(?:[\w.-]+:)?chNFe>(\d{44})<\/(?:[\w.-]+:)?chNFe>/i)
  if (ch?.[1]) return ch[1]
  const any = xml.match(CHAVE_44)
  return any?.[1]
}

/** Ano e mês (YYYY, MM) a partir de dhEmi / dEmi. */
export function extrairAnoMesEmissao(xml: string): { ano: string; mes: string } | null {
  const tagComPrefixo = (localName: string) => {
    const m = xml.match(
      new RegExp(`<(?:[\\w.-]+:)?${localName}>([^<]+)</(?:[\\w.-]+:)?${localName}>`, 'i')
    )
    return m?.[1]
  }
  const candidatos = [
    tagComPrefixo('dhEmi'),
    tagComPrefixo('dEmi'),
    tagComPrefixo('dhRecbto'),
    tagComPrefixo('dhEvento'),
    tagComPrefixo('dhRegEvento'),
    tagComPrefixo('dhReg'),
  ].filter(Boolean) as string[]
  for (const raw of candidatos) {
    const iso = raw.trim()
    const y = iso.slice(0, 4)
    const m = iso.slice(5, 7)
    if (/^\d{4}$/.test(y) && /^\d{2}$/.test(m)) return { ano: y, mes: m }
    const ymd = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (ymd) return { ano: ymd[1], mes: ymd[2] }
  }
  return null
}

/** Sufixo de arquivo para evitar colisão: mesma chave pode ter procNFe, resNFe e eventos. */
export type DistDfeArquivoTipo = 'procNFe' | 'resNFe' | 'evento' | 'outro'

/** Filtro na sincronização: notas em que o CNPJ consultado é emitente (saída) ou destinatário (entrada). */
export type DistDfeFiltroPapel = 'todos' | 'emitente' | 'destinatario'

/** CNPJ do emitente embutido na chave de acesso (modelo 55 — posições 6–19, 14 dígitos). */
export function extrairCnpjEmitenteDaChave44(chave: string): string | undefined {
  const d = chave.replace(/\D/g, '')
  if (d.length !== 44) return undefined
  return d.slice(6, 20)
}

/** Corpo da primeira ocorrência de uma tag local com ou sem prefixo (ex.: emit / nfe:emit). */
function corpoPrimeiraTagLocal(xml: string, localName: string): string | undefined {
  const esc = localName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(
    `<(?:[\\w.-]+:)?${esc}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${esc}>`,
    'i'
  )
  const m = xml.match(re)
  return m?.[1]
}

/** Primeiro CNPJ 14 dígitos dentro de um fragmento (aceita &lt;CNPJ&gt; ou &lt;nfe:CNPJ&gt;). */
function extrairPrimeiroCnpj14NoBloco(bloco: string): string | undefined {
  const m = bloco.match(/<(?:[\w.-]+:)?CNPJ>(\d{14})<\/(?:[\w.-]+:)?CNPJ>/i)
  return m?.[1]
}

/** Emitente em procNFe/NFe, resNFe resumo ou, em último caso, pela chave. */
export function extrairCnpjEmitenteDistDfe(xml: string): string | undefined {
  const emitCorpo = corpoPrimeiraTagLocal(xml, 'emit')
  if (emitCorpo) {
    const c = extrairPrimeiroCnpj14NoBloco(emitCorpo)
    if (c) return c
  }
  if (/<(?:[\w.-]+:)?resNFe\b/i.test(xml)) {
    const corpoRes = corpoPrimeiraTagLocal(xml, 'resNFe')
    if (corpoRes) {
      const c = extrairPrimeiroCnpj14NoBloco(corpoRes)
      if (c) return c
    }
  }
  const chave = extrairChaveAcesso44(xml)
  if (chave) return extrairCnpjEmitenteDaChave44(chave)
  return undefined
}

/** Destinatário em NFe (tag dest). resNFe costuma não trazer dest — aí não há match para filtro “entrada”. */
export function extrairCnpjDestinatarioDistDfe(xml: string): string | undefined {
  const destCorpo = corpoPrimeiraTagLocal(xml, 'dest')
  if (!destCorpo) return undefined
  return extrairPrimeiroCnpj14NoBloco(destCorpo)
}

/** CNPJ do autor do evento (infEvento) — ex.: manifestação pelo dest ou cancelamento pelo emit. */
export function extrairCnpjAutorEventoNFe(xml: string): string | undefined {
  const corpo = corpoPrimeiraTagLocal(xml, 'infEvento')
  if (!corpo) return undefined
  return extrairPrimeiroCnpj14NoBloco(corpo)
}

/**
 * Se false, o documento não é gravado em disco; o NSU da fila AN continua sendo consumido normalmente.
 */
export function devePersistirDocumentoDistDfe(
  xml: string,
  schema: string,
  cnpj14: string,
  filtro: DistDfeFiltroPapel
): boolean {
  if (filtro === 'todos') return true
  const cnpj = cnpj14.replace(/\D/g, '')
  if (cnpj.length !== 14) return true

  const tipo = inferirTipoArquivoDistDfe(schema, xml)
  if (tipo === 'evento') {
    if (filtro === 'emitente') {
      const ch = extrairChaveAcesso44(xml)
      const emDaChave = ch ? extrairCnpjEmitenteDaChave44(ch) : undefined
      return Boolean(emDaChave && emDaChave === cnpj)
    }
    const autor = extrairCnpjAutorEventoNFe(xml)
    return Boolean(autor && autor === cnpj)
  }

  if (filtro === 'emitente') {
    const em = extrairCnpjEmitenteDistDfe(xml)
    return Boolean(em && em === cnpj)
  }

  const de = extrairCnpjDestinatarioDistDfe(xml)
  return Boolean(de && de === cnpj)
}

export function inferirTipoArquivoDistDfe(schema: string, xml: string): DistDfeArquivoTipo {
  const s = (schema ?? '').toLowerCase()
  if (s.includes('procnfe')) return 'procNFe'
  if (s.includes('resnfe')) return 'resNFe'
  if (s.includes('resevento') || s.includes('proceventonfe') || s.includes('procevento')) return 'evento'
  if (s.includes('evento')) return 'evento'

  const x = xml ?? ''
  if (/<(?:[\w.-]+:)?nfeProc\b/i.test(x)) return 'procNFe'
  if (/<(?:[\w.-]+:)?procEventoNFe\b/i.test(x)) return 'evento'
  if (/<(?:[\w.-]+:)?resNFe\b/i.test(x)) return 'resNFe'
  if (/<(?:[\w.-]+:)?resEvento\b/i.test(x)) return 'evento'
  return 'outro'
}

/** Contagem por tipo de schema AN (para log/diag). */
export function resumirTiposDocZipPorSchema(documentos: DocZipItem[]): string {
  let procNFe = 0
  let resNFe = 0
  let evento = 0
  let outro = 0
  for (const d of documentos) {
    const s = d.schema.toLowerCase()
    if (s.includes('resevento') || s.includes('proceventonfe') || s.includes('evento')) evento++
    else if (s.includes('procnfe')) procNFe++
    else if (s.includes('resnfe')) resNFe++
    else outro++
  }
  return `procNFe=${procNFe} resNFe=${resNFe} evento=${evento} outro=${outro}`
}
