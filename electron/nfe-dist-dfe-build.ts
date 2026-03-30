/** Montagem distDFeInt (espelha lib/nfe-dist-dfe-xml — pasta electron isolada no tsc). */
const NAMESPACE_NFE = 'http://www.portalfiscal.inf.br/nfe'
const DIST_DFE_VERSAO = '1.01'
const TP_AMB_PRODUCAO = '1'

export function formatarUltNsu(valor: string): string {
  const digitos = valor.replace(/\D/g, '').slice(0, 15)
  return digitos.padStart(15, '0')
}

export function montarDistDfeIntListagemNsu(params: {
  cnpj14: string
  cUFAutor: string
  ultNSU: string
}): string {
  const cnpj = params.cnpj14.replace(/\D/g, '')
  if (cnpj.length !== 14) throw new Error('CNPJ deve ter 14 dígitos.')
  const uf = params.cUFAutor.replace(/\D/g, '')
  if (!/^\d{2}$/.test(uf)) throw new Error('cUFAutor inválido (2 dígitos IBGE).')
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
