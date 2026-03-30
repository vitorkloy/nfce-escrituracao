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

  for (const anoEnt of fs.readdirSync(base, { withFileTypes: true })) {
    if (!anoEnt.isDirectory()) continue
    const ano = anoEnt.name
    if (!/^\d{4}$/.test(ano)) continue
    if (filtro?.ano && filtro.ano !== ano) continue

    const anoPath = path.join(base, ano)
    for (const mesEnt of fs.readdirSync(anoPath, { withFileTypes: true })) {
      if (!mesEnt.isDirectory()) continue
      const mes = mesEnt.name
      if (!/^\d{2}$/.test(mes)) continue
      if (filtro?.mes && filtro.mes !== mes) continue

      const mesPath = path.join(anoPath, mes)
      for (const arq of fs.readdirSync(mesPath, { withFileTypes: true })) {
        if (!arq.isFile() || !arq.name.toLowerCase().endsWith('.xml')) continue
        const caminho = path.join(mesPath, arq.name)
        const baseNome = arq.name.replace(/\.xml$/i, '')
        const chave = /^\d{44}$/.test(baseNome) ? baseNome : baseNome
        out.push({ chave, caminho, ano, mes })
      }
    }
  }

  out.sort((a, b) => (b.ano + b.mes).localeCompare(a.ano + a.mes) || b.chave.localeCompare(a.chave))
  return out
}
