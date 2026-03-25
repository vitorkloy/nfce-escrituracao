'use client'

import { useEffect, useState } from 'react'

export interface ElectronEnvironment {
  /** `true` quando `window.electron` está disponível (app desktop). */
  isElectron: boolean
  /**
   * `false` até o primeiro efeito no cliente — evita tratar “não montado” como “não é Electron”.
   */
  isMounted: boolean
}

/**
 * Detecta execução dentro do Electron (preload expõe `window.electron`).
 */
export function useIsElectron(): ElectronEnvironment {
  const [isElectron, setIsElectron] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    const hasBridge = typeof window !== 'undefined' && typeof window.electron !== 'undefined'
    setIsElectron(hasBridge)
    setIsMounted(true)
  }, [])

  return { isElectron, isMounted }
}
