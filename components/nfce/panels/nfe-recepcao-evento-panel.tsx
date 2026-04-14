'use client'

import { useState } from 'react'
import type { CertificateUiState, LoadingUiState, ToastVariant } from '@/types/nfce-app'
import { useIsElectron } from '@/hooks/useIsElectron'
import { BUTTON_PRIMARY_CLASS, INPUT_BASE_CLASS, SURFACE_CARD_CLASS } from '@/components/nfce/ui/classes'
import { Spinner } from '@/components/nfce/ui/spinner'

type NfeRecepcaoEventoPanelProps = {
  certificateState: CertificateUiState
  showToast: (variant: ToastVariant, message: string) => void
  onLoadingStateChange: (state: LoadingUiState) => void
}

const ENDPOINT_INFO =
  'https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx — produção (AN).'

export function NfeRecepcaoEventoPanel({
  certificateState,
  showToast,
  onLoadingStateChange,
}: NfeRecepcaoEventoPanelProps) {
  const { isElectron } = useIsElectron()
  const [xml, setXml] = useState('')
  const [resposta, setResposta] = useState<string | null>(null)
  const [resumo, setResumo] = useState<{
    cStat: string
    xMotivo: string
    idLote?: string
    tpAmb?: string
  } | null>(null)
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
    setResumo(null)
    onLoadingStateChange({ type: 'request', label: 'Enviando evento para SEFAZ…' })
    if (window.electron?.app) window.electron.app.setBusy(true)
    try {
      const resp = await window.electron.nfe.recepcaoEvento(certificateState as never, xml.trim())
      if (!resp.ok) {
        showToast('erro', resp.xMotivo ?? 'Falha na Recepção de Evento.')
        return
      }
      setResposta(resp.xmlResposta ?? '')
      const r = resp.resumoRecepcao
      setResumo(r ?? null)
      showToast(
        'ok',
        r ? `SEFAZ: [${r.cStat}] ${r.xMotivo || 'OK'}${r.idLote ? ` · lote ${r.idLote}` : ''}` : 'Resposta recebida da SEFAZ.',
      )
    } catch (err) {
      showToast('erro', err instanceof Error ? err.message : 'Erro ao chamar Recepção de Evento.')
    } finally {
      setIsLoading(false)
      onLoadingStateChange({ type: null })
      if (window.electron?.app) window.electron.app.setBusy(false)
    }
  }

  return (
    <div className="fade-in h-full overflow-auto p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-1">NFeRecepcaoEvento4</h2>
        <p className="text-xs text-[var(--text-muted)]">{ENDPOINT_INFO}</p>
        <p className="text-xs text-[var(--text-secondary)] mt-2">
          Cole apenas o XML que vai dentro de <code className="text-[11px]">nfeDadosMsg</code> (lote de eventos,
          ex. <code className="text-[11px]">envEvento</code>), sem o envelope SOAP. O app envolve o conteúdo em{' '}
          <code className="text-[11px]">CDATA</code> na chamada para evitar erro com <code className="text-[11px]">&amp;</code> ou{' '}
          <code className="text-[11px]">&lt;</code> no XML.
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

      {resumo !== null && (
        <div className={`p-3 ${SURFACE_CARD_CLASS} border-l-2 border-[var(--teal-dim)]`}>
          <p className="text-[10px] uppercase text-[var(--text-muted)] mb-1">retEnvEvento (resumo)</p>
          <p className="text-sm text-[var(--text-primary)]">
            <strong>cStat {resumo.cStat}</strong>
            {resumo.tpAmb != null && resumo.tpAmb !== '' ? ` · tpAmb ${resumo.tpAmb}` : ''}
            {resumo.idLote != null && resumo.idLote !== '' ? ` · idLote ${resumo.idLote}` : ''}
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">{resumo.xMotivo || '—'}</p>
        </div>
      )}

      {resposta !== null && (
        <div className={`p-4 ${SURFACE_CARD_CLASS} flex-1 min-h-0 flex flex-col`}>
          <p className="text-xs text-[var(--text-muted)] mb-2">Resposta (XML bruto SOAP)</p>
          <pre className="text-xs font-mono whitespace-pre-wrap break-all overflow-auto max-h-[420px] text-[var(--text-primary)]">
            {resposta || '—'}
          </pre>
        </div>
      )}
    </div>
  )
}
