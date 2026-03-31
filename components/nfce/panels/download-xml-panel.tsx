'use client'

import { useEffect, useMemo, useState } from 'react'
import { IonIcon } from '@ionic/react'
import { downloadOutline, documentTextOutline, saveOutline } from 'ionicons/icons'
import { useIsElectron } from '@/hooks/useIsElectron'
import { getErrorMessage } from '@/lib/error-utils'
import { TAMANHO_CHAVE_ACESSO } from '@/lib/nfce-format'
import type { AppModule, CertificateUiState, LoadingUiState, ToastVariant } from '@/types/nfce-app'
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
  appModule: AppModule
  certificateState: CertificateUiState
  showToast: (variant: ToastVariant, message: string) => void
  onLoadingStateChange: (state: LoadingUiState) => void
}

export function DownloadXmlPanel({
  appModule,
  certificateState,
  showToast,
  onLoadingStateChange,
}: DownloadXmlPanelProps) {
  type DownloadMode = 'unico' | 'lote'
  const { isElectron } = useIsElectron()
  const [downloadMode, setDownloadMode] = useState<DownloadMode>('unico')
  const [accessKeyInput, setAccessKeyInput] = useState('')
  const [batchInput, setBatchInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isBatchLoading, setIsBatchLoading] = useState(false)
  const [downloadResult, setDownloadResult] = useState<DownloadXmlResult | null>(null)
  const batchKeys = useMemo(() => {
    const keys = batchInput.match(/\d{44}/g) ?? []
    return Array.from(new Set(keys))
  }, [batchInput])

  useEffect(() => {
    if (!isElectron) return
    const unsubscribe = window.electron.sefaz.onProgressoLote((info) => {
      onLoadingStateChange({ type: 'lote', atual: info.atual, total: info.total })
    })
    return unsubscribe
  }, [isElectron, onLoadingStateChange])

  async function downloadXml() {
    if (appModule === 'nfe') {
      showToast('info', 'Módulo NF-e selecionado. O download por chave será disponibilizado em breve.')
      return
    }
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

  async function downloadBatchXml() {
    if (appModule === 'nfe') {
      showToast('info', 'Módulo NF-e selecionado. O download em lote por chave será disponibilizado em breve.')
      return
    }
    if (!isElectron) {
      showToast('erro', 'Funcionalidade disponível apenas no aplicativo desktop.')
      return
    }
    if (!certificateState.origemStore && !certificateState.senha) {
      showToast('erro', 'Configure a senha do certificado primeiro.')
      return
    }
    if (batchKeys.length === 0) {
      showToast('info', 'Informe ao menos uma chave válida de 44 dígitos para o lote.')
      return
    }

    let targetFolder: string | null = null
    try {
      targetFolder = await window.electron.fs.selecionarPasta()
    } catch (err) {
      showToast('erro', `Erro ao selecionar pasta: ${getErrorMessage(err, 'Erro')}`)
      return
    }
    if (!targetFolder) return

    setIsBatchLoading(true)
    onLoadingStateChange({ type: 'lote', atual: 0, total: batchKeys.length })
    if (window.electron?.app) window.electron.app.setBusy(true)
    showToast('info', `Iniciando download de ${batchKeys.length} XML(s)…`)

    try {
      const result = await window.electron.sefaz.downloadLote(
        certificateState as never,
        batchKeys,
        targetFolder
      )
      const resultados = result.resultados ?? []
      const failed = resultados.filter((item) => !item.ok)
      if (failed.length === 0) {
        showToast('ok', `${batchKeys.length} XML(s) salvos com sucesso.`)
        try {
          await window.electron.fs.abrirPasta(targetFolder)
        } catch {
          /* abrir pasta é opcional */
        }
      } else {
        const firstError = (failed[0]?.erro ?? 'Erro desconhecido').slice(0, 150)
        const ellipsis = (failed[0]?.erro?.length ?? 0) > 150 ? '…' : ''
        showToast('erro', `${batchKeys.length - failed.length} OK · ${failed.length} com erro: ${firstError}${ellipsis}`)
      }
    } catch (err) {
      showToast('erro', `Falha no download em lote: ${getErrorMessage(err, 'Erro')}`)
    } finally {
      setIsBatchLoading(false)
      onLoadingStateChange({ type: null })
      if (window.electron?.app) window.electron.app.setBusy(false)
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

        <div className="mb-4 inline-flex rounded border border-[var(--border)] bg-[var(--bg-surface)] p-1">
          <button
            type="button"
            onClick={() => {
              setDownloadMode('unico')
              setDownloadResult(null)
            }}
            className={[
              'px-3 py-1.5 rounded text-xs font-semibold no-drag transition-colors',
              downloadMode === 'unico'
                ? 'bg-[var(--teal-glow)] text-[var(--teal)]'
                : 'text-[var(--text-secondary)]',
            ].join(' ')}
          >
            Único
          </button>
          <button
            type="button"
            onClick={() => {
              setDownloadMode('lote')
              setDownloadResult(null)
            }}
            className={[
              'px-3 py-1.5 rounded text-xs font-semibold no-drag transition-colors',
              downloadMode === 'lote'
                ? 'bg-[var(--teal-glow)] text-[var(--teal)]'
                : 'text-[var(--text-secondary)]',
            ].join(' ')}
          >
            Lote
          </button>
        </div>

        {downloadMode === 'unico' ? (
          <>
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
                  <>
                    <IonIcon icon={downloadOutline} className="w-4 h-4" />
                    Baixar
                  </>
                )}
              </button>
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Cole a chave de acesso de 44 dígitos ou copie da tela Listagem. Pressione Enter para baixar.
            </p>
          </>
        ) : (
          <div className={`p-4 ${SURFACE_CARD_CLASS}`}>
            <div className="flex items-center justify-between gap-3 mb-2">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Download em lote por chaves</h3>
              <span className="text-xs text-[var(--text-muted)]">{batchKeys.length} chave(s) válida(s)</span>
            </div>
            <textarea
              value={batchInput}
              onChange={(e) => setBatchInput(e.target.value)}
              placeholder="Cole várias chaves (uma por linha, ou separadas por espaço/vírgula)."
              rows={4}
              className="w-full px-3 py-2.5 rounded text-xs font-mono no-drag bg-[var(--bg-raised)] border border-[var(--border)]"
              aria-label="Chaves de acesso para download em lote"
            />
            <div className="mt-2 flex items-center justify-between">
              <p className="text-xs text-[var(--text-muted)]">Somente sequências de 44 dígitos entram no lote.</p>
              <button
                type="button"
                onClick={downloadBatchXml}
                disabled={isBatchLoading}
                className={[
                  `flex items-center gap-2 px-4 py-2 text-xs ${BUTTON_TEAL_GHOST_CLASS}`,
                  isBatchLoading ? 'opacity-70 cursor-default' : '',
                ].join(' ')}
              >
                {isBatchLoading ? (
                  <>
                    <Spinner /> Baixando lote…
                  </>
                ) : (
                  <>
                    <IonIcon icon={downloadOutline} className="w-3.5 h-3.5" />
                    Baixar lote
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {downloadMode === 'unico' && !downloadResult && !isLoading && (
          <div
            className="flex flex-col items-center justify-center h-full gap-3 text-[var(--text-muted)]"
          >
            <IonIcon icon={documentTextOutline} className="text-4xl" />
            <span className="text-sm">Informe uma chave para baixar o XML</span>
          </div>
        )}
        {downloadMode === 'unico' && downloadResult && (
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
                    <IonIcon icon={saveOutline} className="w-3.5 h-3.5" />
                    Salvar XML
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
                        <IonIcon icon={downloadOutline} className="w-3.5 h-3.5" />
                        XML
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
