'use client'

import { useCallback, useRef, useState } from 'react'
import type { ToastMessage, ToastVariant } from '@/types/nfce-app'

const MAX_VISIBLE_TOASTS = 5
const TOAST_AUTO_DISMISS_MS = 5000

export function useToastStack() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const toastSeq = useRef(0)

  const showToast = useCallback((variant: ToastVariant, message: string) => {
    const id = ++toastSeq.current
    setToasts((prev) => [...prev.slice(-(MAX_VISIBLE_TOASTS - 1)), { id, tipo: variant, msg: message }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), TOAST_AUTO_DISMISS_MS)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return { toasts, showToast, dismissToast }
}
