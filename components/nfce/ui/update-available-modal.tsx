'use client'

import type { UpdateUiPhase } from '@/hooks/use-auto-updater'

export function UpdateAvailableModal({
  open,
  phase,
  currentVersion,
  remoteVersion,
  releaseNotes,
  percent,
  errorMessage,
  onDismiss,
  onDownload,
  onInstall,
}: {
  open: boolean
  phase: UpdateUiPhase
  currentVersion: string
  remoteVersion: string
  releaseNotes: string
  percent: number
  errorMessage: string
  onDismiss: () => void
  onDownload: () => void
  onInstall: () => void
}) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-modal-title"
    >
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--bg-base)] shadow-xl overflow-hidden">
        <div className="px-5 pt-5 pb-3 border-b border-[var(--border)]">
          <h2 id="update-modal-title" className="text-base font-semibold text-[var(--text-primary)]">
            Nova versão disponível
          </h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">
            Você não está na versão mais recente. A versão instalada é{' '}
            <span className="font-mono text-[var(--teal)]">{currentVersion || '—'}</span> e a mais recente é{' '}
            <span className="font-mono text-[var(--teal)]">{remoteVersion || '—'}</span>.
            Atualize para obter correções e melhorias.
          </p>
        </div>

        {releaseNotes && phase === 'available' && (
          <div className="px-5 py-3 max-h-32 overflow-y-auto text-xs text-[var(--text-muted)] border-b border-[var(--border)] whitespace-pre-wrap">
            {releaseNotes}
          </div>
        )}

        {phase === 'downloading' && (
          <div className="px-5 py-4">
            <p className="text-sm text-[var(--text-secondary)] mb-2">Baixando atualização…</p>
            <div className="w-full h-2 rounded-full overflow-hidden bg-[var(--bg-raised)]">
              <div
                className="h-full rounded-full transition-all duration-300 bg-[var(--teal)]"
                style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
              />
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1">{percent}%</p>
          </div>
        )}

        {phase === 'ready' && (
          <div className="px-5 py-4">
            <p className="text-sm text-[var(--text-secondary)]">
              Download concluído. Instale para aplicar a nova versão (o app será reiniciado).
            </p>
          </div>
        )}

        {phase === 'error' && errorMessage && (
          <div className="px-5 py-3 text-sm text-red-400 border-b border-[var(--border)]">{errorMessage}</div>
        )}

        <div className="flex flex-wrap gap-2 justify-end px-5 py-4 bg-[var(--bg-raised)]">
          {phase !== 'downloading' && (
            <button
              type="button"
              onClick={onDismiss}
              className="px-4 py-2 rounded-lg text-sm border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-base)] transition-colors no-drag"
            >
              Depois
            </button>
          )}
          {phase === 'available' && (
            <button
              type="button"
              onClick={onDownload}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--teal)] text-[var(--bg-deep)] hover:opacity-90 transition-opacity no-drag"
            >
              Atualizar agora
            </button>
          )}
          {phase === 'error' && (
            <button
              type="button"
              onClick={onDownload}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--teal)] text-[var(--bg-deep)] hover:opacity-90 transition-opacity no-drag"
            >
              Tentar novamente
            </button>
          )}
          {phase === 'ready' && (
            <button
              type="button"
              onClick={onInstall}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--teal)] text-[var(--bg-deep)] hover:opacity-90 transition-opacity no-drag"
            >
              Instalar e reiniciar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
