'use client'

import { useState } from 'react'
import type { CertificateUiState, ToastVariant } from '@/types/nfce-app'
import { useIsElectron } from '@/hooks/useIsElectron'
import { BUTTON_PRIMARY_CLASS, SURFACE_CARD_CLASS } from '@/components/nfce/ui/classes'
import { Spinner } from '@/components/nfce/ui/spinner'

interface NfeStatusPanelProps {
  certificateState: CertificateUiState
  showToast: (variant: ToastVariant, message: string) => void
}

interface StatusResultado {
  ok?: boolean
  cStat?: string
  xMotivo?: string
  tpAmb?: string
  dhRecbto?: string
  versaoAplic?: string
}

export function NfeStatusPanel({ certificateState, showToast }: NfeStatusPanelProps) {
  const { isElectron } = useIsElectron()
  const [isLoading, setIsLoading] = useState(false)
  const [resultado, setResultado] = useState<StatusResultado | null>(null)

  async function consultar() {
    if (!isElectron) return
    if (!certificateState.thumbprint && !certificateState.pfxPath) {
      showToast('erro', 'Selecione um certificado na aba Certificado.')
      return
    }
    if (!certificateState.origemStore && !certificateState.senha) {
      showToast('erro', 'Informe a senha do certificado.')
      return
    }

    setIsLoading(true)
    try {
      const resp = await window.electron.nfe.statusServico(certificateState as never)
      setResultado(resp as StatusResultado)
      if (!resp.ok) showToast('erro', resp.xMotivo ?? 'Falha ao consultar status da NF-e.')
    } catch (err) {
      showToast('erro', err instanceof Error ? err.message : 'Erro ao consultar status da NF-e.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fade-in h-full overflow-auto p-6">
      <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">NF-e - Status do serviço</h2>
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={consultar}
          disabled={isLoading}
          className={`flex items-center gap-2 px-4 py-2 no-drag ${BUTTON_PRIMARY_CLASS}`}
        >
          {isLoading ? <><Spinner /> Consultando...</> : 'Consultar status'}
        </button>
      </div>

      {resultado && (
        <div className={`p-4 ${SURFACE_CARD_CLASS}`}>
          <p className="text-sm text-[var(--text-secondary)]">cStat: <strong>{resultado.cStat ?? '—'}</strong></p>
          <p className="text-sm text-[var(--text-secondary)]">Motivo: <strong>{resultado.xMotivo ?? '—'}</strong></p>
          <p className="text-sm text-[var(--text-secondary)]">Ambiente: <strong>{resultado.tpAmb ?? '—'}</strong></p>
          <p className="text-sm text-[var(--text-secondary)]">Recebido em: <strong>{resultado.dhRecbto ?? '—'}</strong></p>
          <p className="text-sm text-[var(--text-secondary)]">Versão app SEFAZ: <strong>{resultado.versaoAplic ?? '—'}</strong></p>
        </div>
      )}
    </div>
  )
}

