'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>('system')

  const setTheme = useCallback(async (t: ThemePreference) => {
    setThemeState(t)
    applyDomTheme(t)
    if (typeof window !== 'undefined' && window.electron?.ui) {
      await window.electron.ui.setTheme(t)
    } else if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, t)
      } catch {
        /* ignore */
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function init() {
      let t: ThemePreference = 'system'
      if (typeof window !== 'undefined' && window.electron?.ui) {
        try {
          t = await window.electron.ui.getTheme()
        } catch {
          /* mantém system */
        }
      } else if (typeof window !== 'undefined') {
        try {
          const raw = localStorage.getItem(STORAGE_KEY)
          if (raw === 'light' || raw === 'dark' || raw === 'system') t = raw
        } catch {
          /* ignore */
        }
      }
      if (!cancelled) {
        setThemeState(t)
        applyDomTheme(t)
      }
    }
    init()
    return () => {
      cancelled = true
    }
  }, [])

  /* Quando o usuário muda o tema do SO e a preferência é "sistema", o CSS já reage via media queries. */
  useEffect(() => {
    if (theme !== 'system' || typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const noop = () => {
      /* força repaint se algum browser não atualizar variáveis sozinho */
      document.documentElement.dataset.theme = 'system'
    }
    mq.addEventListener('change', noop)
    return () => mq.removeEventListener('change', noop)
  }, [theme])

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme])

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useAppTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useAppTheme deve ser usado dentro de ThemeProvider')
  return ctx
}
