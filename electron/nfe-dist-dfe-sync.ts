import fs from 'fs'
import path from 'path'
import type https from 'https'
import type { ConfigCertNfe } from './nfe'
import { nfeDistDFeInteresse } from './nfe'
import { montarDistDfeIntListagemNsu, montarDistDfeIntConsultaChave, formatarUltNsu } from './nfe-dist-dfe-build'
import {
  compararNsu,
  devePersistirDocumentoDistDfe,
  extrairAnoMesEmissao,
  extrairChaveAcesso44,
  extrairCnpjEmitenteDaChave44,
  extrairCnpjEmitenteDistDfe,
  extrairXmlRetDistDfeInt,
  extrairSufixoArquivoEventoNFe,
  inferirTipoArquivoDistDfe,
  maiorNsuDosDocumentos,
  maxNsuValidoParaTerminoSincronia,
  parsearRetDistDfeInt,
  resumirTiposDocZipPorSchema,
  type DistDfeFiltroPapel,
} from './nfe-dist-dfe-parser'

export type { DistDfeFiltroPapel }

export interface NfeDistDfeSyncStateFile {
  ultNSU: string
  atualizadoEm: string
  /** Chaves sem procNFe salvo; retomadas na fase consChNFe nas próximas sincronizações. */
  chavesPendentesProcNFe?: string[]
}

export interface NfeDistDfeSyncProgresso {
  tipo: 'lote' | 'concluido' | 'erro'
  ultNSU?: string
  maxNSU?: string
  cStat?: string
  loteSalvos?: number
  loteIgnorados?: number
  loteFiltrados?: number
  totalSalvos?: number
  totalIgnorados?: number
  totalFiltrados?: number
  mensagem?: string
}

export interface NfeDistDfeSyncResultado {
  ok: boolean
  totalSalvos: number
  totalIgnorados: number
  totalFiltrados: number
  ultNSU: string
  lotes: number
  xMotivo?: string
}

const STATE_FILENAME = '.nfe-dist-state.json'
const DEBUG_LOG_FILENAME = 'sync-debug.log'
const MAX_LOTES_SEGURANCA = 2000
/** Pausa entre lotes para reduzir 656 (consumo indevido) por requisições muito seguidas. */
const INTERVALO_ENTRE_LOTES_MS = 900
/**
 * Máximo de consultas consChNFe por execução (a AN costuma limitar ~20/hora; pendentes ficam no estado).
 */
const MAX_CONSULTAS_CHAVE = 20
/** ~3 min entre consultas para respeitar o limite de consumo (656) na prática. */
const INTERVALO_CONSULTA_CHAVE_MS = 185_000

/** cStat em que a nota não virá mais pelo DistDFe por chave — remove da fila persistente. */
const CSTAT_CONSULTA_CHAVE_DEFINITIVO = new Set(['632', '641', '653'])

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function anoMesDaChave(chave: string): { ano: string; mes: string } {
  const d = chave.replace(/\D/g, '')
  return { ano: `20${d.slice(2, 4)}`, mes: d.slice(4, 6) }
}

function procNFeJaExiste(pastaRaiz: string, cnpj: string, chave: string): boolean {
  const { ano, mes } = anoMesDaChave(chave)
  if (fs.existsSync(path.join(pastaRaiz, cnpj, ano, mes, `${chave}_procNFe.xml`))) return true
  return fs.existsSync(path.join(pastaRaiz, cnpj, 'sem-data', '00', `${chave}_procNFe.xml`))
}

function caminhoState(pastaRaiz: string, cnpj14: string): string {
  const base = path.join(pastaRaiz, cnpj14.replace(/\D/g, ''))
  return path.join(base, STATE_FILENAME)
}

function caminhoDebugLog(pastaRaiz: string, cnpj14: string): string {
  const base = path.join(pastaRaiz, cnpj14.replace(/\D/g, ''))
  return path.join(base, DEBUG_LOG_FILENAME)
}

function escreverDebugSync(
  pastaRaiz: string,
  cnpj14: string,
  payload: Record<string, string | number | boolean | undefined>
): void {
  try {
    const cnpj = cnpj14.replace(/\D/g, '')
    const dir = path.join(pastaRaiz, cnpj)
    fs.mkdirSync(dir, { recursive: true })
    const file = caminhoDebugLog(pastaRaiz, cnpj14)
    const ts = new Date().toISOString()
    const corpo = Object.entries(payload)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${String(v).replace(/\s+/g, ' ').trim()}`)
      .join(' | ')
    fs.appendFileSync(file, `[${ts}] ${corpo}\n`, 'utf-8')
  } catch {
    /* log nunca deve quebrar o fluxo principal */
  }
}

function lerStateArquivo(pastaRaiz: string, cnpj14: string): NfeDistDfeSyncStateFile | null {
  const p = caminhoState(pastaRaiz, cnpj14)
  try {
    const raw = fs.readFileSync(p, 'utf-8')
    const j = JSON.parse(raw) as NfeDistDfeSyncStateFile
    if (j && typeof j === 'object' && typeof j.ultNSU === 'string') return j
  } catch {
    /* sem estado */
  }
  return null
}

export function carregarUltNsu(pastaRaiz: string, cnpj14: string): string {
  const j = lerStateArquivo(pastaRaiz, cnpj14)
  if (j?.ultNSU && /^\d+$/.test(j.ultNSU.replace(/\D/g, ''))) return formatarUltNsu(j.ultNSU)
  return formatarUltNsu('0')
}

function carregarChavesPendentesProcNFe(pastaRaiz: string, cnpj14: string): Set<string> {
  const j = lerStateArquivo(pastaRaiz, cnpj14)
  const arr = j?.chavesPendentesProcNFe
  if (!Array.isArray(arr)) return new Set()
  const out = new Set<string>()
  for (const x of arr) {
    const d = String(x).replace(/\D/g, '')
    if (d.length === 44) out.add(d)
  }
  return out
}

function persistirEstadoDistDfe(
  pastaRaiz: string,
  cnpj14: string,
  ultNSU: string,
  chavesPendentesProcNFe: Set<string>
): void {
  const cnpj = cnpj14.replace(/\D/g, '')
  const dir = path.join(pastaRaiz, cnpj)
  fs.mkdirSync(dir, { recursive: true })
  const payload: NfeDistDfeSyncStateFile = {
    ultNSU: formatarUltNsu(ultNSU),
    atualizadoEm: new Date().toISOString(),
    chavesPendentesProcNFe: [...chavesPendentesProcNFe].sort(),
  }
  fs.writeFileSync(path.join(dir, STATE_FILENAME), JSON.stringify(payload, null, 2), 'utf-8')
}

function salvarDocumento(
  pastaRaiz: string,
  cnpj14: string,
  xml: string,
  nsu: string,
  schema: string
): 'salvo' | 'ignorado' {
  const cnpj = cnpj14.replace(/\D/g, '')
  const chave = extrairChaveAcesso44(xml)
  const tipo = inferirTipoArquivoDistDfe(schema, xml)
  const am = extrairAnoMesEmissao(xml)
  const ano = am?.ano ?? 'sem-data'
  const mes = am?.mes ?? '00'
  const nsuSeguro = (nsu || '0').replace(/\D/g, '') || '0'
  const schCurto = schema.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 48) || 'doc'
  let nomeArquivo: string
  if (chave && tipo === 'evento') {
    const suf = extrairSufixoArquivoEventoNFe(xml).replace(/[^\dA-Za-z_-]/g, '').slice(0, 40) || 'evt'
    nomeArquivo = `${chave}_evento_${suf}.xml`
  } else if (chave) {
    nomeArquivo = `${chave}_${tipo}.xml`
  } else {
    nomeArquivo = `NSU_${nsuSeguro}_${tipo}_${schCurto}.xml`
  }

  const dir = path.join(pastaRaiz, cnpj, ano, mes)
  fs.mkdirSync(dir, { recursive: true })
  const destino = path.join(dir, nomeArquivo)

  if (fs.existsSync(destino)) return 'ignorado'
  fs.writeFileSync(destino, xml, 'utf-8')
  return 'salvo'
}

export type ProgressCallback = (p: NfeDistDfeSyncProgresso) => void

/**
 * Fase 2: para cada chave que só tem evento ou resNFe, faz consulta individual (consChNFe)
 * para tentar obter o procNFe completo.
 */
async function buscarProcNFePorChaves(params: {
  config: ConfigCertNfe
  agente: https.Agent
  pastaRaiz: string
  cnpj14: string
  cUFAutor: string
  chaves: Set<string>
  chavesComProcNFe: Set<string>
  /** Atualizado ao concluir ou abandonar chaves (656, falhas definitivas da SEFAZ). */
  chavesPendentesProcNFe: Set<string>
  onProgress?: ProgressCallback
}): Promise<{ salvos: number; ignorados: number; falhas: number }> {
  const {
    config,
    agente,
    pastaRaiz,
    cnpj14,
    cUFAutor,
    chaves,
    chavesComProcNFe,
    chavesPendentesProcNFe,
    onProgress,
  } = params
  const cnpj = cnpj14.replace(/\D/g, '')
  let salvos = 0
  let ignorados = 0
  let falhas = 0

  const pendentes = Array.from(chaves)
    .filter((ch) => !chavesComProcNFe.has(ch))
    .filter((ch) => !procNFeJaExiste(pastaRaiz, cnpj, ch))
    .sort()
    .slice(0, MAX_CONSULTAS_CHAVE)

  if (pendentes.length === 0) return { salvos: 0, ignorados: 0, falhas: 0 }

  escreverDebugSync(pastaRaiz, cnpj14, {
    evento: 'consulta_chave_inicio',
    total: pendentes.length,
  })

  for (let i = 0; i < pendentes.length; i++) {
    const chave = pendentes[i]
    if (i > 0) await delay(INTERVALO_CONSULTA_CHAVE_MS)

    try {
      const distXml = montarDistDfeIntConsultaChave({ cnpj14, cUFAutor, chave })
      const soapXml = await nfeDistDFeInteresse(config, distXml, agente)
      const retXml = extrairXmlRetDistDfeInt(soapXml)
      const ret = parsearRetDistDfeInt(retXml)

      if (ret.cStat === '656') {
        escreverDebugSync(pastaRaiz, cnpj14, {
          evento: 'consulta_chave_656',
          chave,
          indice: i + 1,
          total: pendentes.length,
          xMotivo: ret.xMotivo,
        })
        break
      }

      if (ret.cStat !== '138') {
        falhas++
        escreverDebugSync(pastaRaiz, cnpj14, {
          evento: 'consulta_chave_sem_resultado',
          chave,
          cStat: ret.cStat,
          xMotivo: ret.xMotivo,
        })
        if (CSTAT_CONSULTA_CHAVE_DEFINITIVO.has(ret.cStat)) chavesPendentesProcNFe.delete(chave)
        continue
      }

      let salvouProcNFe = false
      for (const doc of ret.documentos) {
        const tipo = inferirTipoArquivoDistDfe(doc.schema, doc.xmlUtf8)
        if (tipo === 'procNFe') {
          const r = salvarDocumento(pastaRaiz, cnpj14, doc.xmlUtf8, doc.nsu, doc.schema)
          if (r === 'salvo') salvos++
          else ignorados++
          salvouProcNFe = true
          break
        }
      }
      if (salvouProcNFe) {
        chavesPendentesProcNFe.delete(chave)
      } else {
        for (const doc of ret.documentos) {
          const tipo = inferirTipoArquivoDistDfe(doc.schema, doc.xmlUtf8)
          if (tipo === 'resNFe') {
            const r = salvarDocumento(pastaRaiz, cnpj14, doc.xmlUtf8, doc.nsu, doc.schema)
            if (r === 'salvo') salvos++
            else ignorados++
            break
          }
        }
      }

      onProgress?.({
        tipo: 'lote',
        mensagem: `Buscando XML completo por chave… ${i + 1}/${pendentes.length}`,
        totalSalvos: salvos,
      })
    } catch (e) {
      falhas++
      escreverDebugSync(pastaRaiz, cnpj14, {
        evento: 'consulta_chave_erro',
        chave,
        motivo: e instanceof Error ? e.message : String(e),
      })
    }
  }

  escreverDebugSync(pastaRaiz, cnpj14, {
    evento: 'consulta_chave_fim',
    salvos,
    ignorados,
    falhas,
    total: pendentes.length,
  })

  return { salvos, ignorados, falhas }
}

/**
 * Sincronização contínua: loop NSU até 138 ou ultNSU >= maxNSU; grava em CNPJ/ano/mês/
 * como chave_procNFe.xml | chave_resNFe.xml | chave_evento_<nProt>.xml (vários eventos por nota).
 * Após o loop NSU, consulta individualmente (consChNFe) chaves que não têm procNFe.
 */
export async function sincronizarDistDfeNfe(params: {
  config: ConfigCertNfe
  agente: https.Agent
  pastaRaiz: string
  cnpj14: string
  cUFAutor: string
  /** Se true, ignora estado e começa do NSU 0 */
  reiniciarNsu: boolean
  /** Restringe o que grava em disco (NSU continua avançando). */
  filtroPapel?: DistDfeFiltroPapel
  onProgress?: ProgressCallback
}): Promise<NfeDistDfeSyncResultado> {
  const { config, agente, pastaRaiz, cnpj14, cUFAutor, reiniciarNsu, onProgress } = params
  const filtroPapel: DistDfeFiltroPapel = params.filtroPapel ?? 'todos'

  let ultNSU = reiniciarNsu ? formatarUltNsu('0') : carregarUltNsu(pastaRaiz, cnpj14)
  let totalSalvos = 0
  let totalIgnorados = 0
  let totalFiltrados = 0
  let lotes = 0
  const cnpjDir = cnpj14.replace(/\D/g, '')
  const chavesPendentes = carregarChavesPendentesProcNFe(pastaRaiz, cnpj14)
  for (const ch of [...chavesPendentes]) {
    if (procNFeJaExiste(pastaRaiz, cnpjDir, ch)) chavesPendentes.delete(ch)
  }
  const chavesComProcNFe = new Set<string>()
  let fase1Ok = false

  escreverDebugSync(pastaRaiz, cnpj14, {
    evento: 'sync_inicio',
    cnpj14: cnpj14.replace(/\D/g, ''),
    cUFAutor,
    reiniciarNsu,
    filtroPapel,
    ultNSUInicial: ultNSU,
    chavesPendentesArquivo: chavesPendentes.size,
  })

  const emit = (p: NfeDistDfeSyncProgresso) => {
    onProgress?.(p)
  }

  try {
    for (let i = 0; i < MAX_LOTES_SEGURANCA; i++) {
      if (i > 0) await delay(INTERVALO_ENTRE_LOTES_MS)

      const distXml = montarDistDfeIntListagemNsu({ cnpj14, cUFAutor, ultNSU })
      const soapXml = await nfeDistDFeInteresse(config, distXml, agente)

      let retXml: string
      try {
        retXml = extrairXmlRetDistDfeInt(soapXml)
      } catch (e) {
        const snippet = soapXml.slice(0, 800)
        escreverDebugSync(pastaRaiz, cnpj14, {
          evento: 'erro_extracao_soap',
          lote: i + 1,
          ultNSUSolicitado: ultNSU,
          motivo: e instanceof Error ? e.message : 'parse_soap',
        })
        return {
          ok: false,
          totalSalvos,
          totalIgnorados,
          totalFiltrados,
          ultNSU,
          lotes,
          xMotivo: `${e instanceof Error ? e.message : 'Parse SOAP'} — trecho: ${snippet}`,
        }
      }

      const ret = parsearRetDistDfeInt(retXml)
      lotes += 1
      escreverDebugSync(pastaRaiz, cnpj14, {
        evento: 'lote_recebido',
        lote: lotes,
        ultNSUSolicitado: ultNSU,
        cStat: ret.cStat,
        xMotivo: ret.xMotivo,
        ultNSURetorno: ret.ultNSU,
        maxNSURetorno: ret.maxNSU,
        docZip: ret.documentos.length,
        tiposSchema: resumirTiposDocZipPorSchema(ret.documentos),
      })

      if (ret.cStat === '656') {
        const nsuSolicitado656 = ultNSU
        const detalhe =
          ret.xMotivo ||
          'Consumo indevido: use sempre o ultNSU devolvido pela última resposta; aguarde ~1 h se a SEFAZ bloqueou.'
        const candidato656 = formatarUltNsu(ret.ultNSU.replace(/\D/g, ''))
        let ultApos656 = nsuSolicitado656
        if (candidato656 && compararNsu(candidato656, nsuSolicitado656) >= 0) {
          persistirEstadoDistDfe(pastaRaiz, cnpj14, candidato656, chavesPendentes)
          ultApos656 = candidato656
        } else {
          persistirEstadoDistDfe(pastaRaiz, cnpj14, nsuSolicitado656, chavesPendentes)
        }
        emit({ tipo: 'erro', cStat: '656', mensagem: detalhe })
        escreverDebugSync(pastaRaiz, cnpj14, {
          evento: 'erro_656',
          lote: lotes,
          ultNSUSolicitado: nsuSolicitado656,
          ultNSUPersistido: ultApos656,
          xMotivo: detalhe,
        })
        return {
          ok: false,
          totalSalvos,
          totalIgnorados,
          totalFiltrados,
          ultNSU: ultApos656,
          lotes,
          xMotivo: `[656] ${detalhe}`,
        }
      }

      // DistDFe AN: 138 = documento(s) localizado(s), 137 = nenhum documento localizado.
      if (ret.cStat === '137') {
        ultNSU = ret.ultNSU
        persistirEstadoDistDfe(pastaRaiz, cnpj14, ultNSU, chavesPendentes)
        escreverDebugSync(pastaRaiz, cnpj14, {
          evento: 'sync_concluido_137_sem_docs',
          lote: lotes,
          ultNSU,
          maxNSU: ret.maxNSU,
          totalSalvos,
          totalIgnorados,
          totalFiltrados,
          xMotivo: ret.xMotivo,
        })
        fase1Ok = true
        break
      }

      if (ret.cStat !== '138') {
        escreverDebugSync(pastaRaiz, cnpj14, {
          evento: 'erro_cstat_nao_sucesso',
          lote: lotes,
          cStat: ret.cStat,
          xMotivo: ret.xMotivo,
          ultNSU,
        })
        return {
          ok: false,
          totalSalvos,
          totalIgnorados,
          totalFiltrados,
          ultNSU,
          lotes,
          xMotivo: `[${ret.cStat}] ${ret.xMotivo || 'Resposta não sucedida.'}`,
        }
      }

      let loteSalvos = 0
      let loteIgnorados = 0
      let loteFiltrados = 0
      let filtDiag = { procNFe: 0, resNFe: 0, evento: 0, outro: 0, matchEmKey: 0 }
      const cnpjLimpo = cnpj14.replace(/\D/g, '')
      for (const doc of ret.documentos) {
        const persistir = devePersistirDocumentoDistDfe(doc.xmlUtf8, doc.schema, cnpj14, filtroPapel)
        if (!persistir) {
          loteFiltrados++
          totalFiltrados++
          if (filtroPapel !== 'todos') {
            const tipo = inferirTipoArquivoDistDfe(doc.schema, doc.xmlUtf8)
            const ch = extrairChaveAcesso44(doc.xmlUtf8)
            const emDaChave = ch ? extrairCnpjEmitenteDaChave44(ch) : undefined
            if (tipo === 'procNFe') filtDiag.procNFe++
            else if (tipo === 'resNFe') filtDiag.resNFe++
            else if (tipo === 'evento') filtDiag.evento++
            else filtDiag.outro++
            if (emDaChave === cnpjLimpo) filtDiag.matchEmKey++
            if (tipo !== 'evento' && emDaChave === cnpjLimpo) {
              const emExtraido = extrairCnpjEmitenteDistDfe(doc.xmlUtf8)
              escreverDebugSync(pastaRaiz, cnpj14, {
                evento: 'doc_filtrado_inesperado',
                lote: lotes,
                nsu: doc.nsu,
                schema: doc.schema,
                tipo,
                chave: ch ?? '(sem chave)',
                emitenteDaChave: emDaChave,
                emitenteExtraido: emExtraido ?? '(nenhum)',
                cnpjConsulta: cnpjLimpo,
                matchEmitente: String(emExtraido === cnpjLimpo),
                xmlTrecho: doc.xmlUtf8.slice(0, 300),
              })
            }
          }
          continue
        }
        const r = salvarDocumento(pastaRaiz, cnpj14, doc.xmlUtf8, doc.nsu, doc.schema)
        if (r === 'salvo') {
          loteSalvos++
          totalSalvos++
        } else {
          loteIgnorados++
          totalIgnorados++
        }
        const tipoSalvo = inferirTipoArquivoDistDfe(doc.schema, doc.xmlUtf8)
        const chaveSalva = extrairChaveAcesso44(doc.xmlUtf8)
        if (chaveSalva?.length === 44) {
          if (tipoSalvo === 'procNFe') {
            chavesComProcNFe.add(chaveSalva)
            chavesPendentes.delete(chaveSalva)
          } else if (!chavesComProcNFe.has(chaveSalva)) {
            chavesPendentes.add(chaveSalva)
          }
        }
      }
      if (filtroPapel !== 'todos' && loteFiltrados > 0) {
        escreverDebugSync(pastaRaiz, cnpj14, {
          evento: 'filtro_resumo_lote',
          lote: lotes,
          filtro: filtroPapel,
          filtProcNFe: filtDiag.procNFe,
          filtResNFe: filtDiag.resNFe,
          filtEvento: filtDiag.evento,
          filtOutro: filtDiag.outro,
          filtComChaveEmitMatch: filtDiag.matchEmKey,
          loteSalvos,
          loteIgnorados,
          loteFiltrados,
        })
      }

      const nsuSolicitadoNesteLote = ultNSU
      let proximoUlt = formatarUltNsu(ret.ultNSU)
      const maxDocNsu = maiorNsuDosDocumentos(ret.documentos)
      if (maxDocNsu && compararNsu(maxDocNsu, proximoUlt) > 0) {
        proximoUlt = maxDocNsu
      }
      if (compararNsu(proximoUlt, nsuSolicitadoNesteLote) <= 0 && ret.documentos.length > 0) {
        if (maxDocNsu) proximoUlt = maxDocNsu
      }
      if (compararNsu(proximoUlt, nsuSolicitadoNesteLote) <= 0 && ret.documentos.length > 0) {
        emit({
          tipo: 'erro',
          mensagem:
            'NSU não avançou após lote com documentos — possível falha de leitura do XML. Aguarde antes de tentar de novo.',
        })
        escreverDebugSync(pastaRaiz, cnpj14, {
          evento: 'erro_nsu_sem_avanco',
          lote: lotes,
          ultNSUSolicitado: nsuSolicitadoNesteLote,
          ultNSURetornado: ret.ultNSU,
          maxNSURetornado: ret.maxNSU,
          docZip: ret.documentos.length,
        })
        return {
          ok: false,
          totalSalvos,
          totalIgnorados,
          totalFiltrados,
          ultNSU: nsuSolicitadoNesteLote,
          lotes,
          xMotivo:
            'O ultNSU da resposta não superou o NSU solicitado. Verifique o XML retornado ou aguarde ~1 h se recebeu 656 antes.',
        }
      }

      ultNSU = proximoUlt
      persistirEstadoDistDfe(pastaRaiz, cnpj14, ultNSU, chavesPendentes)

      emit({
        tipo: 'lote',
        ultNSU,
        maxNSU: ret.maxNSU,
        cStat: '138',
        loteSalvos,
        loteIgnorados,
        loteFiltrados,
        totalSalvos,
        totalIgnorados,
        totalFiltrados,
        mensagem: ret.xMotivo,
      })

      if (maxNsuValidoParaTerminoSincronia(ret.maxNSU) && compararNsu(ultNSU, ret.maxNSU) >= 0) {
        escreverDebugSync(pastaRaiz, cnpj14, {
          evento: 'sync_concluido_max_nsu',
          lote: lotes,
          ultNSU,
          maxNSU: ret.maxNSU,
          totalSalvos,
          totalIgnorados,
          totalFiltrados,
        })
        fase1Ok = true
        break
      }

      if (ret.documentos.length === 0) {
        escreverDebugSync(pastaRaiz, cnpj14, {
          evento: 'sync_concluido_sem_doczip',
          lote: lotes,
          ultNSU,
          maxNSU: ret.maxNSU,
          totalSalvos,
          totalIgnorados,
          totalFiltrados,
          xMotivo: ret.xMotivo,
        })
        fase1Ok = true
        break
      }
    }

    // -----------------------------------------------------------------------
    // Fase 2: buscar procNFe completo por consChNFe para chaves pendentes
    // -----------------------------------------------------------------------
    if (fase1Ok && chavesPendentes.size > 0) {
      const f2 = await buscarProcNFePorChaves({
        config,
        agente,
        pastaRaiz,
        cnpj14,
        cUFAutor,
        chaves: chavesPendentes,
        chavesComProcNFe,
        chavesPendentesProcNFe: chavesPendentes,
        onProgress,
      })
      totalSalvos += f2.salvos
      totalIgnorados += f2.ignorados
      persistirEstadoDistDfe(pastaRaiz, cnpj14, ultNSU, chavesPendentes)
    }

    if (fase1Ok) {
      persistirEstadoDistDfe(pastaRaiz, cnpj14, ultNSU, chavesPendentes)
      emit({
        tipo: 'concluido',
        ultNSU,
        totalSalvos,
        totalIgnorados,
        totalFiltrados,
        mensagem: 'Sincronização concluída.',
      })
      return { ok: true, totalSalvos, totalIgnorados, totalFiltrados, ultNSU, lotes }
    }

    persistirEstadoDistDfe(pastaRaiz, cnpj14, ultNSU, chavesPendentes)
    return {
      ok: false,
      totalSalvos,
      totalIgnorados,
      totalFiltrados,
      ultNSU,
      lotes,
      xMotivo: `Limite de ${MAX_LOTES_SEGURANCA} lotes atingido (proteção).`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    try {
      persistirEstadoDistDfe(pastaRaiz, cnpj14, ultNSU, chavesPendentes)
    } catch {
      /* não falhar por I/O de estado */
    }
    escreverDebugSync(pastaRaiz, cnpj14, {
      evento: 'erro_excecao_sync',
      ultNSU,
      lotes,
      totalSalvos,
      totalIgnorados,
      totalFiltrados,
      motivo: msg,
    })
    emit({ tipo: 'erro', mensagem: msg })
    return {
      ok: false,
      totalSalvos,
      totalIgnorados,
      totalFiltrados,
      ultNSU,
      lotes,
      xMotivo: msg,
    }
  }
}
