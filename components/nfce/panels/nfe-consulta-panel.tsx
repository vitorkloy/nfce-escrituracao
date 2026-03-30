'use client'

import { useState } from 'react'
import type { CertificateUiState, ToastVariant } from '@/types/nfce-app'
import { useIsElectron } from '@/hooks/useIsElectron'
import { BUTTON_PRIMARY_CLASS, INPUT_BASE_CLASS, SURFACE_CARD_CLASS } from '@/components/nfce/ui/classes'
import { Spinner } from '@/components/nfce/ui/spinner'

interface NfeConsultaPanelProps {
  certificateState: CertificateUiState
  showToast: (variant: ToastVariant, message: string) => void
}

interface ConsultaResultado {
  ok?: boolean
  cStat?: string
  xMotivo?: string
  chave?: string
  nProt?: string
  dhRecbto?: string
  xNome?: string
  vNF?: string
}

export function NfeConsultaPanel({ certificateState, showToast }: NfeConsultaPanelProps) {
  const { isElectron } = useIsElectron()
  const [chave, setChave] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [resultado, setResultado] = useState<ConsultaResultado | null>(null)

  async function consultar() {
    if (!isElectron) return
    if (!/^\d{44}$/.test(chave.trim())) {
      showToast('erro', 'Informe uma chave NF-e com 44 dígitos.')
      return
    }
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
      const resp = await window.electron.nfe.consultarProtocolo(certificateState as never, chave.trim())
      setResultado(resp as ConsultaResultado)
      if (!resp.ok) showToast('erro', resp.xMotivo ?? 'Falha ao consultar protocolo da NF-e.')
    } catch (err) {
      showToast('erro', err instanceof Error ? err.message : 'Erro ao consultar protocolo da NF-e.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fade-in h-full overflow-auto p-6">
      <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">NF-e - Consulta protocolo</h2>
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          value={chave}
          onChange={(e) => setChave(e.target.value.replace(/\D/g, ''))}
          placeholder="Chave de acesso NF-e (44 dígitos)"
          maxLength={44}
          className={`flex-1 px-3 py-2 text-sm font-mono ${INPUT_BASE_CLASS}`}
        />
        <button
          type="button"
          onClick={consultar}
          disabled={isLoading}
          className={`flex items-center gap-2 px-4 py-2 no-drag ${BUTTON_PRIMARY_CLASS}`}
        >
          {isLoading ? <><Spinner /> Consultando...</> : 'Consultar'}
        </button>
      </div>

      {resultado && (
        <div className={`p-4 ${SURFACE_CARD_CLASS}`}>
          <p className="text-sm text-[var(--text-secondary)]">cStat: <strong>{resultado.cStat ?? '—'}</strong></p>
          <p className="text-sm text-[var(--text-secondary)]">Motivo: <strong>{resultado.xMotivo ?? '—'}</strong></p>
          <p className="text-sm text-[var(--text-secondary)]">Chave: <strong>{resultado.chave ?? '—'}</strong></p>
          <p className="text-sm text-[var(--text-secondary)]">Protocolo: <strong>{resultado.nProt ?? '—'}</strong></p>
          <p className="text-sm text-[var(--text-secondary)]">Recebido em: <strong>{resultado.dhRecbto ?? '—'}</strong></p>
          <p className="text-sm text-[var(--text-secondary)]">Emitente: <strong>{resultado.xNome ?? '—'}</strong></p>
          <p className="text-sm text-[var(--text-secondary)]">Valor NF: <strong>{resultado.vNF ?? '—'}</strong></p>
        </div>
      )}
    </div>
  )
}

