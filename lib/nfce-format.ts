/** Comprimento da chave de acesso (NFC-e / NF-e). */
export const TAMANHO_CHAVE_ACESSO = 44

/** Último segmento de um caminho Windows ou POSIX (nome do arquivo). */
export function fileNameFromPath(filePath: string): string {
  const i = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return i === -1 ? filePath : filePath.slice(i + 1)
}

/**
 * Texto da sidebar quando o certificado vem da loja Windows mas o nome ainda não foi resolvido
 * (ex.: a listagem da loja falhou ou o cert não aparece em certmgr).
 */
export function storeCertificateSidebarFallback(thumbprint: string | undefined): {
  primary: string
  title: string
} {
  const normalized = thumbprint?.replace(/\s/g, '') ?? ''
  if (normalized.length >= 8) {
    return {
      primary: `Repositório Windows · ${normalized.slice(0, 8)}…`,
      title: `Certificado do repositório do Windows. Thumbprint: ${normalized}`,
    }
  }
  return {
    primary: 'Repositório Windows',
    title: 'Certificado do repositório do Windows',
  }
}

const REGEX_CHAVE_SEGMENTADA = /^(\d{4})(\d{2})(\d{8})(\d{6})(\d{9})(\d{9})(\d{6})$/
const REGEX_CNPJ_FORMATADO = /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/

/** Data/hora local no formato esperado por <input type="datetime-local" />. */
export function formatDateForDatetimeLocalInput(date: Date): string {
  const two = (value: number) => String(value).padStart(2, '0')
  return (
    `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}` +
    `T${two(date.getHours())}:${two(date.getMinutes())}`
  )
}

/**
 * NT 2026: dataHoraInicial / dataHoraFinal = AAAA-MM-DDThh:mm (sem timezone).
 * O valor do input já vem nesse formato; mantemos função explícita para documentar o contrato.
 */
export function normalizeDatetimeForSefaz(valueFromInput: string): string {
  return valueFromInput
}

/** Formata chave 44 caracteres para leitura (grupos separados por espaço). */
export function formatAccessKeyForDisplay(accessKey: string): string {
  return accessKey.replace(
    REGEX_CHAVE_SEGMENTADA,
    '$1 $2 $3 $4 $5 $6 $7'
  )
}

/** CNPJ numérico 14 dígitos → máscara brasileira. */
export function formatCnpjForDisplay(cnpjDigits: string): string {
  return cnpjDigits.replace(REGEX_CNPJ_FORMATADO, '$1.$2.$3/$4-$5')
}

/**
 * CNPJ do emitente embutido na chave de acesso (posições 6–19, índices base 0).
 * @see layout padrão da chave NF-e / NFC-e (Manual de Orientação).
 */
export function extractIssuerCnpjFromAccessKey(accessKey: string): string {
  if (!accessKey || accessKey.length < 20) return ''
  return accessKey.substring(6, 20)
}

export function formatDateOnlyPtBr(isoOrDateString: string): string {
  if (!isoOrDateString) return '–'
  try {
    return new Date(isoOrDateString).toLocaleDateString('pt-BR')
  } catch {
    return isoOrDateString
  }
}
