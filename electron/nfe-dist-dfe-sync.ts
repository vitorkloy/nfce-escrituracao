import fs from 'fs'
import path from 'path'
import type https from 'https'
import type { ConfigCertNfe } from './nfe'
import { nfeDistDFeInteresse } from './nfe'
import { montarDistDfeIntListagemNsu, formatarUltNsu } from './nfe-dist-dfe-build'
import {
  compararNsu,
  extrairAnoMesEmissao,
  extrairChaveAcesso44,
  extrairXmlRetDistDfeInt,
  maiorNsuDosDocumentos,
  maxNsuValidoParaTerminoSincronia,
  parsearRetDistDfeInt,
} from './nfe-dist-dfe-parser'

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
  totalSalvos?: number
  totalIgnorados?: number
  mensagem?: string
}

export interface NfeDistDfeSyncResultado {
  ok: boolean
  totalSalvos: number
  totalIgnorados: number
  ultNSU: string
  lotes: number
  xMotivo?: string
}

const STATE_FILENAME = '.nfe-dist-state.json'
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
  const am = extrairAnoMesEmissao(xml)
  const ano = am?.ano ?? 'sem-data'
  const mes = am?.mes ?? '00'
  const nomeArquivo = chave ? `${chave}.xml` : `NSU_${nsu}_${schema.replace(/[^a-zA-Z0-9_-]/g, '_')}.xml`

  const dir = path.join(pastaRaiz, cnpj, ano, mes)
  fs.mkdirSync(dir, { recursive: true })
  const destino = path.join(dir, nomeArquivo)

  if (fs.existsSync(destino)) return 'ignorado'
  fs.writeFileSync(destino, xml, 'utf-8')
  return 'salvo'
}

export type ProgressCallback = (p: NfeDistDfeSyncProgresso) => void

/**
 * Sincronização contínua: loop NSU até 138 ou ultNSU >= maxNSU; grava XMLs em CNPJ/ano/mês/chave.xml
 */
export async function sincronizarDistDfeNfe(params: {
  config: ConfigCertNfe
  agente: https.Agent
  pastaRaiz: string
  cnpj14: string
  cUFAutor: string
  /** Se true, ignora estado e começa do NSU 0 */
  reiniciarNsu: boolean
  onProgress?: ProgressCallback
}): Promise<NfeDistDfeSyncResultado> {
  const { config, agente, pastaRaiz, cnpj14, cUFAutor, reiniciarNsu, onProgress } = params

  let ultNSU = reiniciarNsu ? formatarUltNsu('0') : carregarUltNsu(pastaRaiz, cnpj14)
  let totalSalvos = 0
  let totalIgnorados = 0
  let lotes = 0

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
        return {
          ok: false,
          totalSalvos,
          totalIgnorados,
          ultNSU,
          lotes,
          xMotivo: `${e instanceof Error ? e.message : 'Parse SOAP'} — trecho: ${snippet}`,
        }
      }

      const ret = parsearRetDistDfeInt(retXml)
      lotes += 1

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
        return {
          ok: false,
          totalSalvos,
          totalIgnorados,
          ultNSU: ultApos656,
          lotes,
          xMotivo: `[656] ${detalhe}`,
        }
      }

      if (ret.cStat === '138') {
        persistirUltNsu(pastaRaiz, cnpj14, ret.ultNSU)
        emit({
          tipo: 'concluido',
          ultNSU: ret.ultNSU,
          maxNSU: ret.maxNSU,
          cStat: '138',
          totalSalvos,
          totalIgnorados,
          mensagem: ret.xMotivo || 'Sem novos documentos.',
        })
        return {
          ok: true,
          totalSalvos,
          totalIgnorados,
          ultNSU: ret.ultNSU,
          lotes,
        }
      }

      if (ret.cStat !== '137') {
        return {
          ok: false,
          totalSalvos,
          totalIgnorados,
          ultNSU,
          lotes,
          xMotivo: `[${ret.cStat}] ${ret.xMotivo || 'Resposta não sucedida.'}`,
        }
      }

      let loteSalvos = 0
      let loteIgnorados = 0
      for (const doc of ret.documentos) {
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
        return {
          ok: false,
          totalSalvos,
          totalIgnorados,
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
        cStat: '137',
        loteSalvos,
        loteIgnorados,
        totalSalvos,
        totalIgnorados,
        mensagem: ret.xMotivo,
      })

      if (maxNsuValidoParaTerminoSincronia(ret.maxNSU) && compararNsu(ultNSU, ret.maxNSU) >= 0) {
        emit({
          tipo: 'concluido',
          ultNSU,
          maxNSU: ret.maxNSU,
          totalSalvos,
          totalIgnorados,
          mensagem: 'Último NSU alcançou o máximo informado pela SEFAZ.',
        })
        return { ok: true, totalSalvos, totalIgnorados, ultNSU, lotes }
      }

      if (ret.documentos.length === 0) {
        emit({
          tipo: 'concluido',
          ultNSU,
          maxNSU: ret.maxNSU,
          totalSalvos,
          totalIgnorados,
          mensagem: 'cStat 137 sem docZip — encerrando para evitar loop.',
        })
        return { ok: true, totalSalvos, totalIgnorados, ultNSU, lotes }
      }
    }

    return {
      ok: false,
      totalSalvos,
      totalIgnorados,
      ultNSU,
      lotes,
      xMotivo: `Limite de ${MAX_LOTES_SEGURANCA} lotes atingido (proteção).`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    emit({ tipo: 'erro', mensagem: msg })
    return {
      ok: false,
      totalSalvos,
      totalIgnorados,
      ultNSU,
      lotes,
      xMotivo: msg,
    }
  }
}
