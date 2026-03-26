'use client'

import { useState } from 'react'
import { useIsElectron } from '@/hooks/useIsElectron'
import { getErrorMessage } from '@/lib/error-utils'
import { TAMANHO_CHAVE_ACESSO } from '@/lib/nfce-format'
import type { CertificateUiState, ToastVariant } from '@/types/nfce-app'
import { CertificatePasswordWarning } from '@/components/nfce/certificate-password-warning'
import { Badge } from '@/components/nfce/ui/badge'
import { BUTTON_PRIMARY_CLASS, BUTTON_SUBTLE_CLASS, BUTTON_TEAL_GHOST_CLASS, SURFACE_CARD_CLASS } from '@/components/nfce/ui/classes'
import { Spinner } from '@/components/nfce/ui/spinner'

interface DownloadXmlResult {
  ok?: boolean
  cStat?: string
  xMotivo?: string
  nfeProc?: { versao: string; dhInc: string; nProt: string; nfeXml: string }
  eventos?: { versao: string; dhInc: string; nProt: string; eventoXml: string }[]
}

export interface DownloadXmlPanelProps {
  certificateState: CertificateUiState
  showToast: (variant: ToastVariant, message: string) => void
}

export function DownloadXmlPanel({ certificateState, showToast }: DownloadXmlPanelProps) {
  const { isElectron } = useIsElectron()
  const [accessKeyInput, setAccessKeyInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [downloadResult, setDownloadResult] = useState<DownloadXmlResult | null>(null)

  async function downloadXml() {
    const digitsOnly = accessKeyInput.replace(/\s/g, '')
    if (!new RegExp(`^\\d{${TAMANHO_CHAVE_ACESSO}}$`).test(digitsOnly)) {
      showToast('erro', 'A chave de acesso deve ter exatamente 44 dígitos numéricos.')
      return
    }
    if (!certificateState.origemStore && !certificateState.senha) {
      showToast('erro', 'Configure a senha do certificado primeiro.')
      return
    }
    if (!isElectron) {
      showToast('erro', 'Funcionalidade disponível apenas no aplicativo desktop.')
      return
    }

    setIsLoading(true)
    setDownloadResult(null)

    try {
      const response = await window.electron.sefaz.downloadXml(certificateState as never, digitsOnly)
      setDownloadResult(response)

      if (!response.ok) {
        showToast('erro', response.xMotivo ?? 'Erro ao baixar o XML.')
      } else {
        showToast('ok', `XML obtido. Protocolo: ${response.nfeProc?.nProt ?? '–'}`)
      }
    } catch (err) {
      showToast('erro', `Erro inesperado: ${getErrorMessage(err, 'Tente novamente.')}`)
    } finally {
      setIsLoading(false)
    }
  }

  async function saveXmlFile(xmlContent: string, fileName: string) {
    if (!isElectron) return
    try {
      const saved = await window.electron.fs.salvarXml(xmlContent, fileName)
      if (!saved) showToast('info', 'Operação de salvar cancelada.')
    } catch (err) {
      showToast('erro', `Erro ao salvar: ${getErrorMessage(err, 'Erro')}`)
    }
  }

  return (
    <div className="fade-in flex flex-col h-full">
      <div className="p-6 pb-4 border-b border-[var(--border)]">
        <h2 className="text-xl font-semibold mb-4 text-[var(--text-primary)]">
          Download de XML
        </h2>

        {!certificateState.origemStore && !certificateState.senha && certificateState.pfxPath && (
          <CertificatePasswordWarning context="download" />
        )}

        <div className="flex gap-3">
          <input
            type="text"
            value={accessKeyInput}
            onChange={(e) => setAccessKeyInput(e.target.value)}
            placeholder="Chave de acesso (44 dígitos)"
            maxLength={44}
            className="flex-1 px-3 py-2.5 rounded text-sm font-mono no-drag bg-[var(--bg-raised)] border border-[var(--border)]"
            onKeyDown={(e) => e.key === 'Enter' && !isLoading && downloadXml()}
            aria-label="Chave de acesso da NFC-e"
          />
          <button
            type="button"
            onClick={downloadXml}
            disabled={isLoading}
            className={[
              `flex items-center gap-2 px-5 py-2.5 text-sm ${BUTTON_PRIMARY_CLASS}`,
              isLoading
                ? 'bg-[var(--bg-raised)] text-[var(--text-muted)]'
                : '',
            ].join(' ')}
          >
            {isLoading ? (
              <>
                <Spinner /> Baixando…
              </>
            ) : (
              '↓ Baixar'
            )}
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Cole a chave de acesso de 44 dígitos ou copie da tela Listagem. Pressione Enter para baixar.
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {!downloadResult && !isLoading && (
          <div
            className="flex flex-col items-center justify-center h-full gap-3 text-[var(--text-muted)]"
          >
            <span className="text-4xl">⬡</span>
            <span className="text-sm">Informe uma chave para baixar o XML</span>
          </div>
        )}
        {downloadResult && (
          <div className="space-y-4 fade-in">
            <div
              className={`flex items-center gap-3 p-4 ${SURFACE_CARD_CLASS}`}
            >
              <Badge
                tone={downloadResult.cStat === '200' ? 'green' : 'red'}
                label={`cStat ${downloadResult.cStat ?? '?'}`}
              />
              <span className="text-[var(--text-secondary)]">{downloadResult.xMotivo}</span>
            </div>

            {downloadResult.nfeProc && (
              <div className={`p-4 ${SURFACE_CARD_CLASS}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium text-[var(--text-primary)]">
                    NFC-e
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      saveXmlFile(
                        downloadResult.nfeProc!.nfeXml,
                        `${downloadResult.nfeProc!.nProt}_nfce.xml`
                      )
                    }
                    className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium ${BUTTON_TEAL_GHOST_CLASS}`}
                  >
                    ↓ Salvar XML
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-[var(--text-muted)]">Protocolo</span>
                    <p className="font-mono mt-0.5 text-[var(--teal)]">
                      {downloadResult.nfeProc.nProt || '–'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)]">Incluído em</span>
                    <p className="font-mono mt-0.5 text-[var(--text-primary)]">
                      {downloadResult.nfeProc.dhInc || '–'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {(downloadResult.eventos?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs uppercase tracking-widest mb-2 text-[var(--text-muted)]">
                  Eventos ({downloadResult.eventos!.length})
                </p>
                <div className="space-y-2">
                  {downloadResult.eventos!.map((evento, index) => (
                    <div
                      key={evento.nProt || index}
                      className={`p-3 flex items-center justify-between ${SURFACE_CARD_CLASS}`}
                    >
                      <div className="text-sm">
                        <span className="font-mono text-[var(--amber)]">
                          {evento.nProt || '–'}
                        </span>
                        <span className="ml-3 text-[var(--text-secondary)]">
                          {evento.dhInc || '–'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => saveXmlFile(evento.eventoXml, `${evento.nProt}_evento.xml`)}
                        className={`flex items-center gap-1 px-2.5 py-1 text-xs ${BUTTON_SUBTLE_CLASS}`}
                      >
                        ↓ XML
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
