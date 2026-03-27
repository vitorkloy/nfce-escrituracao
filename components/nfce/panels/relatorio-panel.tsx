'use client'

import { useState } from 'react'
import type { ToastVariant } from '@/types/nfce-app'
import { useIsElectron } from '@/hooks/useIsElectron'

export interface RelatorioPanelProps {
  showToast: (variant: ToastVariant, message: string) => void
}

export function RelatorioPanel({ showToast }: RelatorioPanelProps) {
  const { isElectron } = useIsElectron()
  const [pasta, setPasta] = useState<string>('')
  const [isGerando, setIsGerando] = useState(false)
  const [isCarregandoXmls, setIsCarregandoXmls] = useState(false)
  const [xmlArquivos, setXmlArquivos] = useState<string[]>([])

  async function carregarPreviewXmls(pastaAlvo: string) {
    if (!isElectron || !pastaAlvo) {
      setXmlArquivos([])
      return
    }
    setIsCarregandoXmls(true)
    try {
      const resp = await window.electron.relatorio.listarXmls(pastaAlvo)
      if (!resp.ok) {
        setXmlArquivos([])
        showToast('erro', resp.xMotivo ?? 'Falha ao listar XMLs.')
        return
      }
      setXmlArquivos(resp.arquivos ?? [])
    } catch (err) {
      setXmlArquivos([])
      showToast('erro', err instanceof Error ? err.message : 'Erro ao listar XMLs.')
    } finally {
      setIsCarregandoXmls(false)
    }
  }

  async function selecionarPasta() {
    if (!isElectron) return
    try {
      const r = await window.electron.fs.selecionarPasta()
      if (r) {
        setPasta(r)
        await carregarPreviewXmls(r)
      }
    } catch (err) {
      showToast('erro', err instanceof Error ? err.message : 'Erro ao selecionar pasta.')
    }
  }

  async function gerarCsv() {
    if (!isElectron) {
      showToast('erro', 'Funcionalidade disponível apenas no aplicativo desktop.')
      return
    }
    if (!pasta) {
      showToast('erro', 'Selecione a pasta onde estão os XMLs.')
      return
    }

    setIsGerando(true)
    try {
      const resp = await window.electron.relatorio.gerarComparativoCsv(pasta)
      if (!resp.ok) {
        showToast('erro', resp.xMotivo ?? 'Falha ao gerar o CSV.')
        return
      }

      const gerados = resp.gerados ?? 0
      const aprovados = resp.aprovados ?? 0
      const cancelados = resp.cancelados ?? 0
      const falhas = resp.falhas ?? 0

      showToast(
        'ok',
        falhas > 0
          ? `Relatórios gerados (${gerados} XMLs: ${aprovados} aprovados, ${cancelados} cancelados, ${falhas} falha(s)).`
          : `Relatórios gerados com sucesso (${aprovados} aprovados, ${cancelados} cancelados).`
      )
    } catch (err) {
      showToast('erro', err instanceof Error ? err.message : 'Erro ao gerar CSV.')
    } finally {
      setIsGerando(false)
    }
  }

  return (
    <div className="fade-in flex flex-col h-full">
      <div className="p-6 pb-4 border-b border-[var(--border)]">
        <h2 className="text-xl font-semibold mb-4 text-[var(--text-primary)]">
          Relatório interno (CSV)
        </h2>

        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Gera um comparativo a partir dos arquivos <span className="font-mono">*_nfce.xml</span> salvos na pasta.
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={selecionarPasta}
            className="flex-1 py-2.5 rounded text-sm font-semibold transition-all no-drag bg-[var(--bg-raised)] border border-[var(--border)] text-[var(--text-primary)]"
            disabled={isGerando}
          >
            {pasta ? 'Trocar pasta' : 'Selecionar pasta'}
          </button>
          <button
            type="button"
            onClick={gerarCsv}
            disabled={isGerando || !pasta}
            className="flex items-center justify-center px-5 py-2.5 rounded text-sm font-semibold no-drag bg-[var(--teal-glow)] border border-[var(--teal-dim)] text-[var(--teal)] disabled:opacity-60"
          >
            {isGerando ? 'Gerando...' : 'Gerar CSV'}
          </button>
        </div>

        <div className="mt-3">
          <p className="text-xs text-[var(--text-muted)]">Pasta atual</p>
          <p
            className="text-xs font-mono truncate"
            style={{ color: 'var(--text-primary)' }}
            title={pasta || '—'}
          >
            {pasta || '—'}
          </p>
        </div>

        <div className="mt-4 rounded border border-[var(--border)] bg-[var(--bg-raised)] p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs uppercase tracking-widest text-[var(--text-muted)]">
              Prévia dos XMLs
            </p>
            <span className="text-xs text-[var(--text-secondary)]">
              Total encontrado: <span className="font-semibold text-[var(--text-primary)]">{xmlArquivos.length}</span>
            </span>
          </div>

          {isCarregandoXmls ? (
            <p className="text-xs text-[var(--text-muted)]">Carregando arquivos…</p>
          ) : xmlArquivos.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">Nenhum arquivo *_nfce.xml encontrado.</p>
          ) : (
            <div className="max-h-32 overflow-auto rounded border border-[var(--border)] bg-[var(--bg-surface)]">
              {xmlArquivos.slice(0, 10).map((arquivo) => (
                <div
                  key={arquivo}
                  className="px-2 py-1 text-xs font-mono border-b border-[var(--border)] last:border-b-0 text-[var(--text-primary)]"
                  title={arquivo}
                >
                  {arquivo}
                </div>
              ))}
            </div>
          )}

          {xmlArquivos.length > 10 && (
            <p className="mt-2 text-[11px] text-[var(--text-muted)]">
              Mostrando 10 de {xmlArquivos.length} arquivos.
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <p className="text-sm text-[var(--text-muted)]">
          Serão gerados os arquivos <span className="font-mono">comparativo_aprovado.csv</span> e{' '}
          <span className="font-mono">comparativo_cancelamento.csv</span> dentro da pasta selecionada.
        </p>
      </div>
    </div>
  )
}

