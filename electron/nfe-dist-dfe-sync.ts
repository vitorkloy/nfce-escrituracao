import fs from 'fs'
import path from 'path'
import type https from 'https'
import type { ConfigCertNfe } from './nfe'
import { nfeDistDFeInteresse } from './nfe'
import { montarDistDfeIntListagemNsu, formatarUltNsu } from './nfe-dist-dfe-build'
import {
  compararNsu,
  devePersistirDocumentoDistDfe,
  extrairAnoMesEmissao,
  extrairChaveAcesso44,
  extrairXmlRetDistDfeInt,
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

export function carregarUltNsu(pastaRaiz: string, cnpj14: string): string {
  const p = caminhoState(pastaRaiz, cnpj14)
  try {
    const raw = fs.readFileSync(p, 'utf-8')
    const j = JSON.parse(raw) as NfeDistDfeSyncStateFile
    if (j.ultNSU && /^\d+$/.test(j.ultNSU.replace(/\D/g, ''))) return formatarUltNsu(j.ultNSU)
  } catch {
    /* sem estado */
  }
  return formatarUltNsu('0')
}

function persistirUltNsu(pastaRaiz: string, cnpj14: string, ultNSU: string): void {
  const cnpj = cnpj14.replace(/\D/g, '')
  const dir = path.join(pastaRaiz, cnpj)
  fs.mkdirSync(dir, { recursive: true })
  const payload: NfeDistDfeSyncStateFile = {
    ultNSU: formatarUltNsu(ultNSU),
    atualizadoEm: new Date().toISOString(),
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
  const nomeArquivo = chave
    ? `${chave}_${tipo}.xml`
    : `NSU_${nsuSeguro}_${tipo}_${schCurto}.xml`

  const dir = path.join(pastaRaiz, cnpj, ano, mes)
  fs.mkdirSync(dir, { recursive: true })
  const destino = path.join(dir, nomeArquivo)

  if (fs.existsSync(destino)) return 'ignorado'
  fs.writeFileSync(destino, xml, 'utf-8')
  return 'salvo'
}

export type ProgressCallback = (p: NfeDistDfeSyncProgresso) => void

/**
 * Sincronização contínua: loop NSU até 138 ou ultNSU >= maxNSU; grava em CNPJ/ano/mês/
 * como chave_procNFe.xml | chave_resNFe.xml | chave_evento.xml (evita sobrescrever nota com evento).
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
  escreverDebugSync(pastaRaiz, cnpj14, {
    evento: 'sync_inicio',
    cnpj14: cnpj14.replace(/\D/g, ''),
    cUFAutor,
    reiniciarNsu,
    filtroPapel,
    ultNSUInicial: ultNSU,
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
          persistirUltNsu(pastaRaiz, cnpj14, candidato656)
          ultApos656 = candidato656
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
        persistirUltNsu(pastaRaiz, cnpj14, ret.ultNSU)
        escreverDebugSync(pastaRaiz, cnpj14, {
          evento: 'sync_concluido_137_sem_docs',
          lote: lotes,
          ultNSU: ret.ultNSU,
          maxNSU: ret.maxNSU,
          totalSalvos,
          totalIgnorados,
          totalFiltrados,
          xMotivo: ret.xMotivo,
        })
        emit({
          tipo: 'concluido',
          ultNSU: ret.ultNSU,
          maxNSU: ret.maxNSU,
          cStat: '137',
          totalSalvos,
          totalIgnorados,
          totalFiltrados,
          mensagem: ret.xMotivo || 'Sem novos documentos.',
        })
        return {
          ok: true,
          totalSalvos,
          totalIgnorados,
          totalFiltrados,
          ultNSU: ret.ultNSU,
          lotes,
        }
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
      for (const doc of ret.documentos) {
        if (!devePersistirDocumentoDistDfe(doc.xmlUtf8, doc.schema, cnpj14, filtroPapel)) {
          loteFiltrados++
          totalFiltrados++
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
      persistirUltNsu(pastaRaiz, cnpj14, ultNSU)

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
        emit({
          tipo: 'concluido',
          ultNSU,
          maxNSU: ret.maxNSU,
          totalSalvos,
          totalIgnorados,
          totalFiltrados,
          mensagem: 'Último NSU alcançou o máximo informado pela SEFAZ.',
        })
        return { ok: true, totalSalvos, totalIgnorados, totalFiltrados, ultNSU, lotes }
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
        emit({
          tipo: 'concluido',
          ultNSU,
          maxNSU: ret.maxNSU,
          totalSalvos,
          totalIgnorados,
          totalFiltrados,
          mensagem: 'cStat 137 sem docZip — encerrando para evitar loop.',
        })
        return { ok: true, totalSalvos, totalIgnorados, totalFiltrados, ultNSU, lotes }
      }
    }

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
