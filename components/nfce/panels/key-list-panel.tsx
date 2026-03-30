'use client'

import { useEffect, useState } from 'react'
import { IonIcon } from '@ionic/react'
import { downloadOutline, searchOutline, squareOutline } from 'ionicons/icons'
import { useIsElectron } from '@/hooks/useIsElectron'
import { getErrorMessage } from '@/lib/error-utils'
import {
  extractIssuerCnpjFromAccessKey,
  formatAccessKeyForDisplay,
  formatCnpjForDisplay,
  normalizeDatetimeForSefaz,
  formatDateForDatetimeLocalInput,
} from '@/lib/nfce-format'
import type {
  BatchDownloadResponse,
  CertificateUiState,
  EmitenteFilter,
  KeyListItem,
  LoadingUiState,
  ToastVariant,
} from '@/types/nfce-app'
import { CertificatePasswordWarning } from '@/components/nfce/certificate-password-warning'
import { Badge } from '@/components/nfce/ui/badge'
import { BUTTON_PRIMARY_CLASS, BUTTON_TEAL_GHOST_CLASS, INPUT_BASE_CLASS, SURFACE_CARD_CLASS } from '@/components/nfce/ui/classes'
import { Spinner } from '@/components/nfce/ui/spinner'

export interface KeyListPanelProps {
  certificateState: CertificateUiState
  showToast: (variant: ToastVariant, message: string) => void
  onLoadingStateChange: (state: LoadingUiState) => void
}

export function KeyListPanel({ certificateState, showToast, onLoadingStateChange }: KeyListPanelProps) {
  const { isElectron } = useIsElectron()
  const today = new Date()
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  const [startDateTime, setStartDateTime] = useState(formatDateForDatetimeLocalInput(monthStart))
  const [endDateTime, setEndDateTime] = useState(formatDateForDatetimeLocalInput(today))
  const [autoPaginate, setAutoPaginate] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const [listingProgress, setListingProgress] = useState(0)
  const [keys, setKeys] = useState<KeyListItem[]>([])
  const [keyFilterText, setKeyFilterText] = useState('')
  const [certificateCnpjDigits, setCertificateCnpjDigits] = useState('')
  const [emitenteFilter, setEmitenteFilter] = useState<EmitenteFilter>('todos')
  const [showRelatorioModal, setShowRelatorioModal] = useState(false)
  const [downloadKeysSnapshot, setDownloadKeysSnapshot] = useState<string[]>([])

  useEffect(() => {
    if (!isElectron) return
    const unsubscribe = window.electron.sefaz.onProgressoListagem((total) => {
      setListingProgress(total)
      if (isSearching) onLoadingStateChange({ type: 'listagem', total })
    })
    return unsubscribe
  }, [isElectron, isSearching, onLoadingStateChange])

  useEffect(() => {
    if (!isElectron) return
    const unsubscribe = window.electron.sefaz.onProgressoLote((info) => {
      onLoadingStateChange({ type: 'lote', atual: info.atual, total: info.total })
    })
    return unsubscribe
  }, [isElectron, onLoadingStateChange])

  async function searchKeys() {
    if (!isElectron) {
      showToast('erro', 'Funcionalidade disponível apenas no aplicativo desktop.')
      return
    }
    if (!certificateState.origemStore && !certificateState.senha) {
      showToast('erro', 'Configure a senha do certificado primeiro.')
      return
    }
    if (!certificateState.thumbprint && !certificateState.pfxPath) {
      showToast('erro', 'Selecione um certificado na aba Configuração.')
      return
    }
    if (!startDateTime) {
      showToast('erro', 'Informe a data inicial.')
      return
    }

    setIsSearching(true)
    setListingProgress(0)
    setKeys([])
    onLoadingStateChange({ type: 'listagem', total: 0 })
    if (isElectron && window.electron?.app) window.electron.app.setBusy(true)

    try {
      const response = await window.electron.sefaz.listarChaves(
        certificateState as never,
        normalizeDatetimeForSefaz(startDateTime),
        endDateTime ? normalizeDatetimeForSefaz(endDateTime) : undefined,
        autoPaginate
      )

      if (!response.ok) {
        showToast('erro', response.xMotivo ?? 'Erro desconhecido ao consultar a SEFAZ.')
        return
      }

      const items: KeyListItem[] = (response.chaves ?? []).map((chave) => ({
        chave,
        selecionada: false,
      }))
      setKeys(items)
      setCertificateCnpjDigits((response as { cnpj?: string }).cnpj ?? '')
      setEmitenteFilter('todos')

      if (items.length === 0) {
        showToast('info', 'Nenhuma NFC-e encontrada no período informado.')
      } else {
        showToast('ok', `${items.length} chave(s) encontrada(s).`)
      }
    } catch (err) {
      showToast('erro', `Erro inesperado: ${getErrorMessage(err, 'Tente novamente.')}`)
    } finally {
      setIsSearching(false)
      onLoadingStateChange({ type: null })
      if (isElectron && window.electron?.app) window.electron.app.setBusy(false)
    }
  }

  function toggleKeySelected(accessKey: string) {
    setKeys((prev) =>
      prev.map((item) =>
        item.chave === accessKey ? { ...item, selecionada: !item.selecionada } : item
      )
    )
  }

  function toggleAllVisible() {
    const allVisibleSelected =
      visibleRows.length > 0 && visibleRows.every((row) => row.selecionada)
    const visibleSet = new Set(visibleRows.map((row) => row.chave))
    setKeys((prev) =>
      prev.map((item) =>
        visibleSet.has(item.chave) ? { ...item, selecionada: !allVisibleSelected } : item
      )
    )
  }

  const selectedKeys = keys.filter((item) => item.selecionada)
  const certificateCnpjNormalized = certificateCnpjDigits.replace(/\D/g, '')

  const countByIssuerCnpj = keys.reduce<Record<string, number>>((acc, item) => {
    const issuerCnpj = extractIssuerCnpjFromAccessKey(item.chave)
    if (issuerCnpj) acc[issuerCnpj] = (acc[issuerCnpj] ?? 0) + 1
    return acc
  }, {})
  const uniqueIssuerCnpjs = Object.keys(countByIssuerCnpj).sort()
  const matrizCount = certificateCnpjNormalized ? (countByIssuerCnpj[certificateCnpjNormalized] ?? 0) : 0

  function matchesEmitenteFilter(accessKey: string): boolean {
    const issuerFromKey = extractIssuerCnpjFromAccessKey(accessKey)
    if (emitenteFilter === 'todos') return true
    if (emitenteFilter === 'matriz') {
      return Boolean(certificateCnpjNormalized && issuerFromKey === certificateCnpjNormalized)
    }
    if (emitenteFilter === 'filiais') {
      return Boolean(certificateCnpjNormalized && issuerFromKey !== certificateCnpjNormalized)
    }
    return issuerFromKey === emitenteFilter
  }

  const afterTextFilter = keyFilterText
    ? keys.filter((item) => item.chave.includes(keyFilterText))
    : keys
  const visibleRows = afterTextFilter.filter((item) => matchesEmitenteFilter(item.chave))

  async function downloadBatchXmlImpl(relatorioModo: 'agora' | 'depois') {
    if (!isElectron) return
    if (downloadKeysSnapshot.length === 0) {
      showToast('info', 'Selecione ao menos uma chave.')
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

    showToast('info', `Iniciando download de ${downloadKeysSnapshot.length} XMLs…`)
    onLoadingStateChange({ type: 'lote', atual: 0, total: downloadKeysSnapshot.length })
    if (isElectron && window.electron?.app) window.electron.app.setBusy(true)

    try {
      const rawResult = await window.electron.sefaz.downloadLoteRelatorio(
        certificateState as never,
        downloadKeysSnapshot,
        targetFolder,
        relatorioModo
      )
      const resultado = rawResult as BatchDownloadResponse & {
        relatorio?: { arquivos?: string[]; aprovados?: number; cancelados?: number }
      }
      const resultados = resultado.resultados ?? []
      const failed = resultados.filter((r) => !r.ok)
      const errorCount = failed.length

      if (errorCount === 0) {
        showToast('ok', `${downloadKeysSnapshot.length} XML(s) salvos com sucesso.`)
        try {
          await window.electron.fs.abrirPasta(targetFolder)
        } catch {
          /* pasta já foi escolhida; falha ao abrir é opcional */
        }
        if (relatorioModo === 'agora' && resultado.relatorio?.arquivos?.length) {
          const aprovados = resultado.relatorio.aprovados ?? 0
          const cancelados = resultado.relatorio.cancelados ?? 0
          showToast('ok', `Relatórios XLSX gerados (${aprovados} aprovados, ${cancelados} cancelados).`)
        }
      } else {
        const firstError = (failed[0]?.erro ?? 'Erro desconhecido').slice(0, 150)
        const ellipsis = (failed[0]?.erro?.length ?? 0) > 150 ? '…' : ''
        showToast(
          'erro',
          `${downloadKeysSnapshot.length - errorCount} OK · ${errorCount} com erro: ${firstError}${ellipsis}`
        )
      }
    } catch (err) {
      showToast('erro', `Falha no download em lote: ${getErrorMessage(err, 'Erro')}`)
    } finally {
      onLoadingStateChange({ type: null })
      if (isElectron && window.electron?.app) window.electron.app.setBusy(false)
    }
  }

  function requestDownloadWithReport() {
    if (!isElectron) return
    if (selectedKeys.length === 0) {
      showToast('info', 'Selecione ao menos uma chave.')
      return
    }
    setDownloadKeysSnapshot(selectedKeys.map((item) => item.chave))
    setShowRelatorioModal(true)
  }

  return (
    <div className="fade-in flex flex-col h-full">
      <div className="p-6 pb-4 border-b border-[var(--border)]">
        <h2 className="text-xl font-semibold mb-4 text-[var(--text-primary)]">
          Listagem de Chaves
        </h2>

        {!certificateState.origemStore && !certificateState.senha && certificateState.pfxPath && (
          <CertificatePasswordWarning context="listagem" />
        )}

        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-widest text-[var(--text-muted)]">
              Data inicial
            </label>
            <input
              type="datetime-local"
              value={startDateTime}
              onChange={(e) => setStartDateTime(e.target.value)}
              className={`px-3 py-2 text-sm ${INPUT_BASE_CLASS}`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-widest text-[var(--text-muted)]">
              Data final
            </label>
            <input
              type="datetime-local"
              value={endDateTime}
              onChange={(e) => setEndDateTime(e.target.value)}
              className={`px-3 py-2 text-sm ${INPUT_BASE_CLASS}`}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none no-drag text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={autoPaginate}
              onChange={(e) => setAutoPaginate(e.target.checked)}
              className="w-4 h-4 accent-blue-500"
            />
            <span className="text-sm">Paginação automática</span>
          </label>
          <button
            type="button"
            onClick={searchKeys}
            disabled={isSearching}
            className={[
              `flex items-center gap-2 px-5 py-2 text-sm transition-all ml-auto ${BUTTON_PRIMARY_CLASS}`,
              isSearching
                ? 'bg-[var(--bg-raised)] text-[var(--text-muted)]'
                : '',
            ].join(' ')}
          >
            {isSearching ? (
              <>
                <Spinner /> {listingProgress > 0 ? `${listingProgress} chaves…` : 'Buscando…'}
              </>
            ) : (
              <>
                <IonIcon icon={searchOutline} className="w-4 h-4" />
                Buscar
              </>
            )}
          </button>
        </div>
      </div>

      {keys.length > 0 && (
        <div className={`flex flex-col gap-2 px-6 py-3 border-b border-[var(--border)] ${SURFACE_CARD_CLASS}`}>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-[var(--text-secondary)]">
              {keys.length} chaves
              {selectedKeys.length > 0 && (
                <>
                  {' '}
                  · <span className="text-[var(--teal)]">{selectedKeys.length} selecionadas</span>
                </>
              )}
            </span>
            {certificateCnpjNormalized && (
              <select
                value={emitenteFilter}
                onChange={(e) => setEmitenteFilter(e.target.value as EmitenteFilter)}
                className="px-3 py-1.5 rounded text-xs no-drag bg-[var(--bg-raised)] border border-[var(--border)] text-[var(--text-primary)]"
                aria-label="Filtrar por emitente"
              >
                <option value="todos">Todas</option>
                <option value="matriz">Só Matriz</option>
                <option value="filiais">Só Filiais</option>
                {uniqueIssuerCnpjs
                  .filter((cnpj) => cnpj !== certificateCnpjNormalized)
                  .map((cnpj) => (
                    <option key={cnpj} value={cnpj}>
                      Filial {formatCnpjForDisplay(cnpj)}
                    </option>
                  ))}
              </select>
            )}
            <input
              type="text"
              value={keyFilterText}
              onChange={(e) => setKeyFilterText(e.target.value)}
              placeholder="Filtrar chaves…"
              className="px-3 py-1.5 rounded text-xs no-drag w-56 bg-[var(--bg-raised)] border border-[var(--border)]"
            />
            {selectedKeys.length > 0 && (
              <div className="flex items-center gap-3 ml-auto">
                {certificateCnpjNormalized &&
                  (() => {
                    const selectedMatriz = selectedKeys.filter(
                      (item) => extractIssuerCnpjFromAccessKey(item.chave) === certificateCnpjNormalized
                    ).length
                    const selectedFiliais = selectedKeys.length - selectedMatriz
                    const parts: string[] = []
                    if (selectedMatriz > 0) parts.push(`${selectedMatriz} Matriz`)
                    if (selectedFiliais > 0) parts.push(`${selectedFiliais} Filiais`)
                    return parts.length > 0 ? (
                      <span className="text-xs text-[var(--text-muted)]">
                        {parts.join(' · ')}
                      </span>
                    ) : null
                  })()}
                <button
                  type="button"
                  onClick={requestDownloadWithReport}
                  className={`flex items-center gap-1.5 px-4 py-1.5 text-xs ${BUTTON_TEAL_GHOST_CLASS}`}
                >
                  <IonIcon icon={downloadOutline} className="w-3.5 h-3.5" />
                  Baixar XMLs ({selectedKeys.length})
                </button>
              </div>
            )}
          </div>
          {certificateCnpjNormalized && (
            <div className="flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
              {matrizCount > 0 && <span>{matrizCount} Matriz</span>}
              {uniqueIssuerCnpjs
                .filter((cnpj) => cnpj !== certificateCnpjNormalized)
                .map((cnpj) => (
                  <span key={cnpj}>
                    {countByIssuerCnpj[cnpj] ?? 0} Filial {formatCnpjForDisplay(cnpj)}
                  </span>
                ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {keys.length === 0 && !isSearching && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--text-muted)]">
            <IonIcon icon={squareOutline} className="text-4xl" />
            <span className="text-sm">Nenhuma busca realizada</span>
          </div>
        )}
        {keys.length > 0 && (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[var(--bg-surface)] border-b border-[var(--border)]">
                <th className="px-4 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={visibleRows.length > 0 && visibleRows.every((row) => row.selecionada)}
                    onChange={toggleAllVisible}
                    aria-label="Selecionar todas"
                  />
                </th>
                <th
                  className="px-4 py-3 text-left text-xs uppercase tracking-widest w-12 text-[var(--text-muted)]"
                >
                  #
                </th>
                <th
                  className="px-4 py-3 text-left text-xs uppercase tracking-widest text-[var(--text-muted)]"
                >
                  Chave de Acesso
                </th>
                {certificateCnpjNormalized && (
                  <th
                    className="px-4 py-3 text-left text-xs uppercase tracking-widest w-40 text-[var(--text-muted)]"
                  >
                    Emitente
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((item, index) => {
                const issuerCnpj = extractIssuerCnpjFromAccessKey(item.chave)
                const isMatriz = certificateCnpjNormalized && issuerCnpj === certificateCnpjNormalized
                return (
                  <tr
                    key={item.chave}
                    className={[
                      'transition-colors cursor-pointer border-b border-[var(--border)]',
                      item.selecionada
                        ? 'bg-[var(--teal-glow)]'
                        : index % 2 === 0
                          ? 'bg-transparent'
                          : 'bg-[var(--bg-surface)]',
                    ].join(' ')}
                    onClick={() => toggleKeySelected(item.chave)}
                  >
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={item.selecionada}
                        onChange={() => {}}
                        aria-label={`Selecionar chave ${item.chave}`}
                      />
                    </td>
                    <td
                      className="px-4 py-2.5 tabular-nums text-[11px] text-[var(--text-muted)]"
                    >
                      {index + 1}
                    </td>
                    <td className="px-4 py-2.5 chave-acesso">{formatAccessKeyForDisplay(item.chave)}</td>
                    {certificateCnpjNormalized && (
                      <td className="px-4 py-2.5">
                        {isMatriz ? (
                          <Badge tone="green" label="Matriz" />
                        ) : (
                          <Badge tone="teal" label={`Filial ${formatCnpjForDisplay(issuerCnpj)}`} />
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showRelatorioModal && (
        <div className="fixed inset-0 z-[250] bg-black/60 flex items-center justify-center no-drag">
          <div className="w-full max-w-[560px] rounded bg-[var(--bg-surface)] border border-[var(--border)] p-4">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">
              Gerar relatório XLSX agora ou depois?
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Você está iniciando um download em lote. O relatório interno usa os XMLs baixados.
              Durante o download, fechar a janela pode interromper o processo.
            </p>

            <div className="text-xs text-[var(--text-muted)] mb-4">
              <p className="mb-1">
                <span className="font-semibold text-[var(--text-primary)]">Gerar agora</span>: cria{" "}
                <span className="font-mono">comparativo_aprovado.xlsx</span> e{" "}
                <span className="font-mono">comparativo_cancelamento.xlsx</span> na pasta escolhida.
              </p>
              <p>
                <span className="font-semibold text-[var(--text-primary)]">Gerar depois</span>: você gera na aba{" "}
                <span className="font-semibold">Relatório</span> quando quiser.
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowRelatorioModal(false)
                  setDownloadKeysSnapshot([])
                }}
                className="px-4 py-2.5 rounded text-xs font-semibold no-drag border border-[var(--border)] bg-[var(--bg-raised)] text-[var(--text-secondary)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowRelatorioModal(false)
                  await downloadBatchXmlImpl('agora')
                }}
                className={`px-4 py-2.5 rounded text-xs font-semibold no-drag border border-[var(--teal-dim)] bg-[var(--teal-glow)] text-[var(--teal)]`}
              >
                Gerar agora
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowRelatorioModal(false)
                  await downloadBatchXmlImpl('depois')
                }}
                className="px-4 py-2.5 rounded text-xs font-semibold no-drag border border-[var(--border)] bg-[var(--bg-raised)] text-[var(--text-primary)]"
              >
                Gerar depois
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
