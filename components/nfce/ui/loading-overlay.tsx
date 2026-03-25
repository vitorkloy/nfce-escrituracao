import type { OverlayKind } from '@/types/nfce-app'
import { Spinner } from './spinner'

const DEFAULT_LABEL: Record<OverlayKind, string> = {
  listagem: 'Buscando chaves…',
  lote: 'Baixando XMLs…',
}

export function LoadingOverlay({
  kind,
  current,
  total,
  label,
}: {
  kind: OverlayKind
  current?: number
  total?: number
  label?: string
}) {
  const hasProgress = total != null && total > 0 && typeof current === 'number'
  const percent = hasProgress ? Math.round((current! / total!) * 100) : 0
  const text = label ?? DEFAULT_LABEL[kind]

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', pointerEvents: 'auto' }}
      role="alert"
      aria-busy="true"
      aria-live="polite"
    >
      <Spinner size={8} />
      <div className="flex flex-col items-center gap-2 min-w-[280px]">
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {text}
        </span>
        {hasProgress && (
          <>
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-raised)' }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${percent}%`, background: 'var(--teal)' }}
              />
            </div>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {current} / {total}
            </span>
          </>
        )}
      </div>
      <p className="text-xs max-w-xs text-center" style={{ color: 'var(--text-muted)' }}>
        Não feche a janela — o processo será interrompido.
      </p>
    </div>
  )
}
