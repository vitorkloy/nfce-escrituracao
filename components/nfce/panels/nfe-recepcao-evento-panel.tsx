'use client'

import { useState } from 'react'
import type { CertificateUiState, ToastVariant } from '@/types/nfce-app'
import { useIsElectron } from '@/hooks/useIsElectron'
import { BUTTON_PRIMARY_CLASS, INPUT_BASE_CLASS, SURFACE_CARD_CLASS } from '@/components/nfce/ui/classes'
import { Spinner } from '@/components/nfce/ui/spinner'

type NfeRecepcaoEventoPanelProps = {
  certificateState: CertificateUiState
  showToast: (variant: ToastVariant, message: string) => void
}

const ENDPOINT_INFO =
  'https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx — produção (AN).'

export function NfeRecepcaoEventoPanel({ certificateState, showToast }: NfeRecepcaoEventoPanelProps) {
  const { isElectron } = useIsElectron()
  const [xml, setXml] = useState('')
  const [resposta, setResposta] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function enviar() {
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
    setResposta(null)
    try {
      const resp = await window.electron.nfe.recepcaoEvento(certificateState as never, xml.trim())
      if (!resp.ok) {
        showToast('erro', resp.xMotivo ?? 'Falha na Recepção de Evento.')
        return
      }
      setResposta(resp.xmlResposta ?? '')
      showToast('ok', 'Resposta recebida da SEFAZ.')
    } catch (err) {
      showToast('erro', err instanceof Error ? err.message : 'Erro ao chamar Recepção de Evento.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fade-in h-full overflow-auto p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-1">NFeRecepcaoEvento4</h2>
        <p className="text-xs text-[var(--text-muted)]">{ENDPOINT_INFO}</p>
        <p className="text-xs text-[var(--text-secondary)] mt-2">
          Cole apenas o XML que vai dentro de <code className="text-[11px]">nfeDadosMsg</code> (lote de eventos),
          sem o envelope SOAP.
        </p>
      </div>

      <textarea
        value={xml}
        onChange={(e) => setXml(e.target.value)}
        className={`${INPUT_BASE_CLASS} min-h-[180px] font-mono text-xs w-full resize-y`}
        placeholder="<envEvento xmlns=&quot;http://www.portalfiscal.inf.br/nfe&quot; versao=&quot;1.00&quot;>...</envEvento>"
        spellCheck={false}
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void enviar()}
          disabled={isLoading}
          className={`flex items-center gap-2 px-4 py-2 no-drag ${BUTTON_PRIMARY_CLASS}`}
        >
          {isLoading ? (
            <>
              <Spinner /> Enviando…
            </>
          ) : (
            'Enviar nfeRecepcaoEventoNF'
          )}
        </button>
      </div>

      {resposta !== null && (
        <div className={`p-4 ${SURFACE_CARD_CLASS} flex-1 min-h-0 flex flex-col`}>
          <p className="text-xs text-[var(--text-muted)] mb-2">Resposta (XML)</p>
          <pre className="text-xs font-mono whitespace-pre-wrap break-all overflow-auto max-h-[420px] text-[var(--text-primary)]">
            {resposta || '—'}
          </pre>
        </div>
      )}
    </div>
  )
}
