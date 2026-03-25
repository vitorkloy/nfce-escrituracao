#!/usr/bin/env node
/**
 * Diagnóstico NFCeListagemChaves — mesmo cliente de electron/sefaz.ts
 *
 * Ativa log do envelope/resposta SOAP quando DEBUG=sefaz (padrão deste script).
 *
 * Uso:
 *   npm run build:electron
 *   node scripts/diagnostico-listagem.cjs [--rapido] <caminho.pfx> <senha> <homologacao|producao> <dataInicial> [dataFinal]
 *
 * Exemplo:
 *   node scripts/diagnostico-listagem.cjs "C:\\certs\\empresa.pfx" "senha" homologacao 2026-01-01T00:00 2026-03-25T23:59
 *
 * --rapido = uma única página (sem paginação automática por cStat 101)
 */

const path = require('path')

if (!process.env.DEBUG) process.env.DEBUG = 'sefaz'

const argv = process.argv.slice(2).filter((a) => a !== '--rapido')
const rapido = process.argv.slice(2).includes('--rapido')

function uso() {
  console.error(`
Uso:
  node scripts/diagnostico-listagem.cjs [--rapido] <pfx> <senha> <homologacao|producao> <dataInicial> [dataFinal]

  dataInicial/dataFinal: formato AAAA-MM-DDThh:mm (16 caracteres, como no app)

Variável opcional: set DEBUG= (vazio) para silenciar o dump SOAP.
`)
}

if (argv.length < 4) {
  uso()
  process.exit(1)
}

const [pfxPath, senha, ambienteRaw, dataInicial, dataFinal] = argv
const ambiente = ambienteRaw === 'producao' || ambienteRaw === 'homologacao' ? ambienteRaw : null
if (!ambiente) {
  console.error('Ambiente inválido. Use homologacao ou producao.')
  process.exit(1)
}

function extrairCNPJDaChave(chave) {
  if (!chave || chave.length < 20) return ''
  return chave.substring(6, 20)
}

function formatarCNPJ(c) {
  return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

const sefazPath = path.join(__dirname, '..', 'dist-electron', 'sefaz.js')
let listarChaves
let listarTodasChaves
try {
  ;({ listarChaves, listarTodasChaves } = require(sefazPath))
} catch (e) {
  console.error('Não foi possível carregar dist-electron/sefaz.js. Rode: npm run build:electron')
  console.error(e.message)
  process.exit(1)
}

const config = { pfxPath, senha, ambiente }

async function main() {
  console.log('[diagnostico] DEBUG=', process.env.DEBUG || '(off)')
  console.log('[diagnostico] Ambiente=', ambiente, '| Período=', dataInicial, '→', dataFinal || '(sem fim)')

  let chaves
  let meta = {}
  if (rapido) {
    const r = await listarChaves(config, dataInicial, dataFinal || undefined)
    chaves = r.chaves
    meta = { cStat: r.cStat, xMotivo: r.xMotivo, incompleto: r.incompleto, dhEmisUltNfce: r.dhEmisUltNfce }
  } else {
    chaves = await listarTodasChaves(config, dataInicial, dataFinal || undefined)
    meta = { paginacao: 'auto (listarTodasChaves)' }
  }

  console.log('\n--- Resumo (após parse, como no app) ---')
  console.log('Total de chaves:', chaves.length)
  if (Object.keys(meta).length) console.log('Meta:', JSON.stringify(meta))

  const porCnpj = {}
  for (const ch of chaves) {
    const c = extrairCNPJDaChave(String(ch).trim())
    if (c.length === 14) porCnpj[c] = (porCnpj[c] || 0) + 1
    else porCnpj['(inválido/curto)'] = (porCnpj['(inválido/curto)'] || 0) + 1
  }

  const ordenado = Object.entries(porCnpj).sort((a, b) => b[1] - a[1])
  console.log('\nCNPJ emitente (extraído das chaves, pos. 6–19) — quantidade:')
  for (const [cnpj, n] of ordenado) {
    if (/^\d{14}$/.test(cnpj)) console.log(`  ${formatarCNPJ(cnpj)}  →  ${n}`)
    else console.log(`  ${cnpj}  →  ${n}`)
  }

  if (ordenado.length <= 1 && chaves.length > 0) {
    console.log(
      '\n[interpretação] Todas as chaves têm o mesmo CNPJ emitente na chave. ' +
        'No app, o filtro "Filiais" ficaria vazio (nada de errado no filtro).'
    )
  }
}

main().catch((err) => {
  console.error('\n[diagnostico] Falha:', err.message || err)
  process.exit(1)
})
