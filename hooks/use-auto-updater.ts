'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ToastVariant } from '@/types/nfce-app'

export type UpdateUiPhase = 'idle' | 'available' | 'downloading' | 'ready' | 'error'

function sanitizeUpdaterMessage(raw: string): string {
  const semHtml = raw.replace(/<[^>]*>/g, ' ')
  const linhas = semHtml
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^Made-with:\s*Cursor$/i.test(l))
  return linhas.join(' ').replace(/\s+/g, ' ').trim()
}

export function useAutoUpdater(
  isElectron: boolean,
  currentVersion: string,
  showToast: (kind: ToastVariant, message: string) => void
) {
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<UpdateUiPhase>('idle')
  const [remoteVersion, setRemoteVersion] = useState('')
  const [percent, setPercent] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!isElectron) return
    const u = window.electron.updater

    const offAvail = u.onUpdateAvailable((info) => {
      setRemoteVersion(info.version)
      setPhase('available')
      setOpen(true)
      setErrorMessage('')
      setPercent(0)
    })

    const offProg = u.onDownloadProgress((p) => {
      setPhase('downloading')
      setPercent(Math.round(p.percent ?? 0))
    })

    const offDone = u.onUpdateDownloaded(() => {
      setPhase('ready')
      setPercent(100)
    })

    const offErr = u.onUpdaterError((info) => {
      const msg = sanitizeUpdaterMessage(info.message || '') || 'Erro ao verificar ou baixar atualização.'
      showToast('erro', msg)
      setErrorMessage(msg)
      setPhase((prev) => (prev === 'downloading' || prev === 'ready' ? 'error' : prev))
    })

    return () => {
      offAvail()
      offProg()
      offDone()
      offErr()
    }
  }, [isElectron, showToast])

  const dismiss = useCallback(() => {
    setOpen(false)
    setPhase('idle')
    setErrorMessage('')
  }, [])

  const startDownload = useCallback(async () => {
    if (!isElectron) return
    setErrorMessage('')
    setPhase('downloading')
    setPercent(0)
    const r = await window.electron.updater.download()
    if (!r.ok) {
      const msg = sanitizeUpdaterMessage(r.message || '') || 'Erro ao baixar atualização.'
      setPhase('error')
      setErrorMessage(msg)
      showToast('erro', msg)
    }
  }, [isElectron, showToast])

  const install = useCallback(async () => {
    if (!isElectron) return
    await window.electron.updater.install()
  }, [isElectron])

  return {
    updateModalOpen: open,
    updatePhase: phase,
    updateRemoteVersion: remoteVersion,
    updatePercent: percent,
    updateErrorMessage: errorMessage,
    currentAppVersion: currentVersion,
    dismissUpdateModal: dismiss,
    startUpdateDownload: startDownload,
    installUpdate: install,
  }
}
