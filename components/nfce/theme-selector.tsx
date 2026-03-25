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
      <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
        Tema
      </p>
      <div className="flex rounded overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        {THEME_OPTIONS.map((option, index) => (
          <button
            key={option.id}
            type="button"
            onClick={() => {
              void setTheme(option.id)
            }}
            className="flex-1 py-1.5 text-xs font-medium transition-all"
            aria-pressed={theme === option.id}
            style={{
              background: theme === option.id ? 'var(--teal-glow)' : 'var(--bg-raised)',
              color: theme === option.id ? 'var(--teal)' : 'var(--text-secondary)',
              borderRight: index < THEME_OPTIONS.length - 1 ? '1px solid var(--border)' : undefined,
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
