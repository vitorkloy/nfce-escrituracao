const NAMESPACE_NFE = 'http://www.portalfiscal.inf.br/nfe'
const DIST_DFE_VERSAO = '1.01'
const TP_AMB_PRODUCAO = '1'

/** ultNSU com 15 dígitos (primeira consulta: zeros). */
export function formatarUltNsu(valor: string): string {
  const digitos = valor.replace(/\D/g, '').slice(0, 15)
  return digitos.padStart(15, '0')
}

/** Monta distDFeInt — Modo 1 listagem por NSU (até 50 documentos por retorno). */
export function montarDistDfeIntListagemNsu(params: {
  cnpj14: string
  cUFAutor: string
  ultNSU: string
}): string {
  const cnpj = params.cnpj14.replace(/\D/g, '')
  if (cnpj.length !== 14) {
    throw new Error('CNPJ deve ter 14 dígitos.')
  }
  const uf = params.cUFAutor.replace(/\D/g, '')
  if (!/^\d{2}$/.test(uf)) {
    throw new Error('cUFAutor deve ser o código IBGE da UF (2 dígitos), ex.: 35 (SP).')
  }
  const ult = formatarUltNsu(params.ultNSU)

  return (
    `<distDFeInt xmlns="${NAMESPACE_NFE}" versao="${DIST_DFE_VERSAO}">` +
    `<tpAmb>${TP_AMB_PRODUCAO}</tpAmb>` +
    `<cUFAutor>${uf}</cUFAutor>` +
    `<CNPJ>${cnpj}</CNPJ>` +
    `<distNSU><ultNSU>${ult}</ultNSU></distNSU>` +
    `</distDFeInt>`
  )
}
