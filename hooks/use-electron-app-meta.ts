'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AppModule } from '@/types/nfce-app'

export function useElectronAppMeta(isElectron: boolean) {
  const [appVersion, setAppVersion] = useState('')
  const [appModule, setAppModule] = useState<AppModule | null>(null)

  useEffect(() => {
    if (!isElectron) return
    window.electron.app.getVersion().then(setAppVersion).catch(() => setAppVersion(''))
  }, [isElectron])

  /** Módulo não vem do disco — toda sessão inicia sem seleção (tela de escolha). */
  useEffect(() => {
    if (!isElectron) return
    setAppModule(null)
  }, [isElectron])

  const persistModuleSelection = useCallback(async (modulo: AppModule): Promise<boolean> => {
    if (!isElectron) return false
    const ok = await window.electron.app.setModulo(modulo)
    if (ok) setAppModule(modulo)
    return ok
  }, [isElectron])

  return { appVersion, appModule, persistModuleSelection }
}
