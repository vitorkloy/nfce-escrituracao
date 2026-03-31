import fs from 'fs'
import path from 'path'

export interface NfeXmlSalvoInfo {
  chave: string
  caminho: string
  ano: string
  mes: string
}

export function listarXmlsNfeSalvos(
  pastaRaiz: string,
  cnpj14: string,
  filtro?: { ano?: string; mes?: string }
): NfeXmlSalvoInfo[] {
  const cnpj = cnpj14.replace(/\D/g, '')
  if (cnpj.length !== 14) return []
  const base = path.join(pastaRaiz.trim(), cnpj)
  if (!fs.existsSync(base)) return []

  const out: NfeXmlSalvoInfo[] = []

  const filtrarAno = (ano: string) => {
    if (!filtro?.ano) return true
    return filtro.ano === ano
  }

  const filtrarMes = (mes: string) => {
    if (!filtro?.mes) return true
    return filtro.mes === mes
  }

  for (const anoEnt of fs.readdirSync(base, { withFileTypes: true })) {
    if (!anoEnt.isDirectory()) continue
    const ano = anoEnt.name
    const anoEhPadrao = /^\d{4}$/.test(ano)
    if (!anoEhPadrao && ano !== 'sem-data') continue
    if (!filtrarAno(ano)) continue

    const anoPath = path.join(base, ano)
    for (const mesEnt of fs.readdirSync(anoPath, { withFileTypes: true })) {
      if (!mesEnt.isDirectory()) continue
      const mes = mesEnt.name
      const mesEhPadrao = /^\d{2}$/.test(mes)
      if (!mesEhPadrao && mes !== '00') continue
      if (!filtrarMes(mes)) continue

      const mesPath = path.join(anoPath, mes)
      for (const arq of fs.readdirSync(mesPath, { withFileTypes: true })) {
        if (!arq.isFile() || !arq.name.toLowerCase().endsWith('.xml')) continue
        const caminho = path.join(mesPath, arq.name)
        const baseNome = arq.name.replace(/\.xml$/i, '')
        const chaveComTipo = baseNome.match(/^(\d{44})_(procNFe|resNFe|evento|outro)$/)
        const chave =
          chaveComTipo?.[1] ??
          (/^\d{44}$/.test(baseNome) ? baseNome : baseNome)
        out.push({ chave, caminho, ano, mes })
      }
    }
  }

  out.sort((a, b) => (b.ano + b.mes).localeCompare(a.ano + a.mes) || b.chave.localeCompare(a.chave))
  return out
}
