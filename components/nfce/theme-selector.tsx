'use client'

import { useAppTheme, type ThemePreference } from '@/app/theme-provider'

const THEME_OPTIONS: { id: ThemePreference; label: string }[] = [
  { id: 'system', label: 'Sistema' },
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Escuro' },
]

export function ThemeSelector() {
  const { theme, setTheme } = useAppTheme()

  return (
    <div className="mb-3 no-drag" role="group" aria-label="Tema da interface">
      <p className="text-xs uppercase tracking-widest mb-2 text-[var(--text-muted)]">
        Tema
      </p>
      <div className="flex rounded overflow-hidden border border-[var(--border)]">
        {THEME_OPTIONS.map((option, index) => (
          <button
            key={option.id}
            type="button"
            onClick={() => {
              void setTheme(option.id)
            }}
            className={[
              'flex-1 py-1.5 text-xs font-medium transition-all',
              theme === option.id
                ? 'bg-[var(--teal-glow)] text-[var(--teal)]'
                : 'bg-[var(--bg-raised)] text-[var(--text-secondary)]',
              index < THEME_OPTIONS.length - 1 ? 'border-r border-[var(--border)]' : '',
            ].join(' ')}
            aria-pressed={theme === option.id}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
