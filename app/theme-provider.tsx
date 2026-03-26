'use client'

import type { ReactNode } from 'react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from 'react'
import { ThemeProvider as NextThemesProvider, useTheme as useNextTheme } from 'next-themes'

export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'nfce-theme-pref'

const ThemeContext = createContext<{
  theme: ThemePreference
  setTheme: (t: ThemePreference) => void
} | null>(null)

function applyDomTheme(pref: ThemePreference) {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = pref
  }
}

function ThemeBridge({ children }: { children: ReactNode }) {
  const {
    theme: nextTheme,
    setTheme: setNextTheme,
  } = useNextTheme()

  const themePref = (nextTheme ?? 'system') as ThemePreference

  const setTheme = useCallback(
    async (t: ThemePreference) => {
      applyDomTheme(t)
      if (typeof window !== 'undefined' && window.electron?.ui) {
        await window.electron.ui.setTheme(t)
      }
      setNextTheme(t)
      try {
        localStorage.setItem(STORAGE_KEY, t)
      } catch {
        /* ignore */
      }
    },
    [setNextTheme]
  )

  // Aplica o data-theme para manter compatibilidade com `globals.css` (tokens atuais).
  useEffect(() => {
    applyDomTheme(themePref)
  }, [themePref])

  // Inicializa o tema a partir do Electron (quando disponível).
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.ui) return
    let cancelled = false
    window.electron.ui
      .getTheme()
      .then((t) => {
        if (cancelled) return
        applyDomTheme(t)
        setNextTheme(t)
      })
      .catch(() => {
        /* mantém padrão */
      })

    return () => {
      cancelled = true
    }
  }, [setNextTheme])

  const value = useMemo(() => ({ theme: themePref, setTheme }), [themePref, setTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Evita um primeiro paint com `data-theme` indefinido.
  if (typeof document !== 'undefined' && !document.documentElement.dataset.theme) {
    document.documentElement.dataset.theme = 'system'
  }

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey={STORAGE_KEY}
      disableTransitionOnChange
    >
      <ThemeBridge>{children}</ThemeBridge>
    </NextThemesProvider>
  )
}

export function useAppTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useAppTheme deve ser usado dentro de ThemeProvider')
  return ctx
}
