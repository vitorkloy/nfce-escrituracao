import type { ToastMessage, ToastVariant } from '@/types/nfce-app'

const BORDER_BY_VARIANT: Record<ToastVariant, string> = {
  ok: 'border-l-[var(--green)]',
  erro: 'border-l-[var(--red)]',
  info: 'border-l-[var(--teal)]',
}

const ICON_BY_VARIANT: Record<ToastVariant, string> = {
  ok: '✓',
  erro: '✕',
  info: '◈',
}

const ICON_COLOR: Record<ToastVariant, string> = {
  ok: 'var(--green)',
  erro: 'var(--red)',
  info: 'var(--teal)',
}

interface ToastStackProps {
  toasts: ToastMessage[]
  onDismiss: (id: number) => void
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  return (
    <div
      className="fixed bottom-6 right-6 flex flex-col gap-2 z-50 no-drag"
      role="region"
      aria-label="Notificações"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          role="alert"
          className={`flex items-start gap-3 px-4 py-3 rounded shadow-xl min-w-72 max-w-sm fade-in cursor-pointer border ${BORDER_BY_VARIANT[item.tipo]}`}
          style={{
            borderColor: 'var(--border)',
            borderLeftWidth: '4px',
            background: 'var(--bg-surface)',
          }}
          onClick={() => onDismiss(item.id)}
        >
          <span className="mt-0.5 text-sm shrink-0" style={{ color: ICON_COLOR[item.tipo] }}>
            {ICON_BY_VARIANT[item.tipo]}
          </span>
          <span className="text-sm break-words" style={{ color: 'var(--text-primary)' }}>
            {item.msg}
          </span>
        </div>
      ))}
    </div>
  )
}
