'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useIsElectron } from '@/hooks/useIsElectron'
import { ThemeSelector } from '@/components/nfce/theme-selector'
import { ConfigPanel } from '@/components/nfce/panels/config-panel'
import { KeyListPanel } from '@/components/nfce/panels/key-list-panel'
import { DownloadXmlPanel } from '@/components/nfce/panels/download-xml-panel'
import { LoadingOverlay } from '@/components/nfce/ui/loading-overlay'
import { ToastStack } from '@/components/nfce/ui/toast-stack'
import {
  fileNameFromPath,
  formatCnpjForDisplay,
  storeCertificateSidebarFallback,
} from '@/lib/nfce-format'
import type { AppTab, CertificateUiState, LoadingUiState, ToastMessage, ToastVariant } from '@/types/nfce-app'

const MAX_VISIBLE_TOASTS = 5
const TOAST_AUTO_DISMISS_MS = 5000

const MAIN_TABS: { id: AppTab; label: string; icon: string }[] = [
  { id: 'config', label: 'Certificado', icon: '⚙' },
  { id: 'listagem', label: 'Listagem', icon: '≡' },
  { id: 'download', label: 'Download XML', icon: '↓' },
]

export default function Home() {
  const { isElectron } = useIsElectron()
  const [appVersion, setAppVersion] = useState('')
  const [activeTab, setActiveTab] = useState<AppTab>('config')
  const [certificateState, setCertificateState] = useState<CertificateUiState>({
    pfxPath: '',
    thumbprint: undefined,
    origemStore: true,
    senha: '',
    ambiente: 'homologacao',
  })
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [loadingUi, setLoadingUi] = useState<LoadingUiState>({ type: null })
  const toastSeq = useRef(0)

  useEffect(() => {
    if (!isElectron) return
    window.electron.cert
      .carregarConfig()
      .then(async (saved) => {
        if (!saved) return

        let certificadoNome: string | undefined
        let certificadoCnpj: string | undefined

        if (saved.origemStore && saved.thumbprint) {
          try {
            const listed = await window.electron.cert.listarSistema()
            if (listed.ok && listed.certs) {
              const match = listed.certs.find((c) => c.thumbprint === saved.thumbprint)
              if (match) {
                certificadoNome = match.nome
                const digits = match.cnpj.replace(/\D/g, '')
                certificadoCnpj = digits.length === 14 ? digits : undefined
              }
            }
          } catch {
            /* mantém sidebar com fallback por thumbprint */
          }
        } else if (!saved.origemStore && saved.pfxPath) {
          certificadoNome = fileNameFromPath(saved.pfxPath)
        }

        setCertificateState((prev) => ({
          ...prev,
          pfxPath: saved.pfxPath ?? '',
          thumbprint: saved.thumbprint,
          origemStore: saved.origemStore ?? false,
          ambiente: saved.ambiente ?? 'homologacao',
          certificadoNome,
          certificadoCnpj,
        }))
      })
      .catch((err) => console.warn('[App] Falha ao carregar config:', err))
  }, [isElectron])

  /** Se ainda houver thumbprint sem nome (corrida / loja indisponível no boot), tenta de novo. */
  useEffect(() => {
    if (!isElectron) return
    if (!certificateState.origemStore || !certificateState.thumbprint || certificateState.certificadoNome) return

    let cancelled = false
    window.electron.cert.listarSistema().then((result) => {
      if (cancelled || !result.ok || !result.certs) return
      const match = result.certs.find((c) => c.thumbprint === certificateState.thumbprint)
      if (!match) return
      const digits = match.cnpj.replace(/\D/g, '')
      setCertificateState((prev) => ({
        ...prev,
        certificadoNome: match.nome,
        certificadoCnpj: digits.length === 14 ? digits : prev.certificadoCnpj,
      }))
    })
    return () => {
      cancelled = true
    }
  }, [isElectron, certificateState.origemStore, certificateState.thumbprint, certificateState.certificadoNome])

  useEffect(() => {
    if (!isElectron) return
    window.electron.app
      .getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion(''))
  }, [isElectron])

  const showToast = useCallback((variant: ToastVariant, message: string) => {
    const id = ++toastSeq.current
    setToasts((prev) => [...prev.slice(-(MAX_VISIBLE_TOASTS - 1)), { id, tipo: variant, msg: message }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), TOAST_AUTO_DISMISS_MS)
  }, [])

  const certificateReady =
    (certificateState.origemStore && Boolean(certificateState.thumbprint)) ||
    (!certificateState.origemStore && Boolean(certificateState.pfxPath) && Boolean(certificateState.senha))

  const hasSelectedCertificate =
    (certificateState.origemStore && Boolean(certificateState.thumbprint)) ||
    (!certificateState.origemStore && Boolean(certificateState.pfxPath))

  return (
    <div className="flex h-screen select-none bg-[var(--bg-deep)]">
      <aside className="flex flex-col w-56 shrink-0 bg-[var(--bg-base)] border-r border-[var(--border)]">
        <div className="drag-region h-8 shrink-0" />
        <div className="px-5 pb-6">
          <div className="flex items-center gap-2.5 mb-1">
            <span className="text-2xl text-[var(--teal)]">
              ⬡
            </span>
            <span className="font-semibold text-sm leading-tight text-[var(--text-primary)]">
              Escrituração
              <br />
              NFC-e
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <span
              className={[
                'inline-block w-1.5 h-1.5 rounded-full transition-colors',
                certificateReady ? 'bg-[var(--green)]' : 'bg-[var(--text-muted)]',
              ].join(' ')}
            />
            <span className="text-xs text-[var(--text-muted)]">
              {certificateReady ? certificateState.ambiente : 'sem certificado'}
            </span>
          </div>

          <div
            className={[
              'mt-3 max-w-full rounded px-2.5 py-2 transition-colors duration-150',
              hasSelectedCertificate
                ? 'border border-[var(--teal)] bg-[var(--teal-glow)]'
                : 'border border-dashed border-[var(--text-muted)] bg-transparent',
            ].join(' ')}
          >
            <p className="text-[10px] uppercase tracking-wider mb-1 text-[var(--text-muted)]">
              Certificado
            </p>
            {(() => {
              const hasStoreCert = certificateState.origemStore && Boolean(certificateState.thumbprint)
              const hasPfxFile = !certificateState.origemStore && Boolean(certificateState.pfxPath)
              if (!hasStoreCert && !hasPfxFile) {
                return (
                  <p className="text-xs text-[var(--text-muted)]">
                    Nenhum
                  </p>
                )
              }
              const fallbackStore = storeCertificateSidebarFallback(certificateState.thumbprint)
              const nomeExibicao = certificateState.certificadoNome
                ? certificateState.certificadoNome
                : hasPfxFile
                  ? fileNameFromPath(certificateState.pfxPath)
                  : fallbackStore.primary
              const tituloLinha = certificateState.certificadoNome
                ? certificateState.certificadoNome
                : hasPfxFile
                  ? certificateState.pfxPath
                  : fallbackStore.title
              const cnpjDigits = certificateState.certificadoCnpj
              return (
                <div className="min-w-0">
                  <p
                    className="text-xs font-medium truncate leading-snug text-[var(--text-primary)]"
                    title={tituloLinha}
                  >
                    {nomeExibicao}
                  </p>
                  {cnpjDigits && cnpjDigits.length === 14 && (
                    <p className="text-xs font-mono mt-1 leading-tight break-all text-[var(--text-secondary)]">
                      {formatCnpjForDisplay(cnpjDigits)}
                    </p>
                  )}
                </div>
              )
            })()}
          </div>
        </div>

        <nav className="flex flex-col gap-0.5 px-3 flex-1" aria-label="Navegação principal">
          {MAIN_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                'flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-all text-left no-drag',
                activeTab === tab.id
                  ? 'bg-[var(--teal-glow)] text-[var(--teal)] font-medium'
                  : 'bg-transparent text-[var(--text-secondary)] font-normal',
              ].join(' ')}
              aria-current={activeTab === tab.id ? 'page' : undefined}
            >
              <span className="w-5 text-center text-base">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-[var(--border)]">
          <ThemeSelector />
          {appVersion && (
            <p className="text-xs font-mono mb-1 text-[var(--teal)]" title="Versão do aplicativo">
              App v{appVersion}
            </p>
          )}
          <p className="text-xs text-[var(--text-muted)]">
            SAE-NFC-e v1.0.0
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            SEFAZ-SP · NT 2026
          </p>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden flex flex-col bg-[var(--bg-base)]">
        <div className="drag-region h-8 shrink-0 bg-[var(--bg-base)]" />
        <div className="flex-1 overflow-hidden">
          {activeTab === 'config' && (
            <div className="h-full overflow-auto">
              <ConfigPanel
                certificateState={certificateState}
                onCertificateChange={setCertificateState}
                showToast={showToast}
              />
            </div>
          )}
          {activeTab === 'listagem' && (
            <div className="h-full flex flex-col overflow-hidden">
              <KeyListPanel
                certificateState={certificateState}
                showToast={showToast}
                onLoadingStateChange={setLoadingUi}
              />
            </div>
          )}
          {activeTab === 'download' && (
            <div className="h-full flex flex-col overflow-hidden">
              <DownloadXmlPanel certificateState={certificateState} showToast={showToast} />
            </div>
          )}
        </div>
      </main>

      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

      {loadingUi.type && (
        <LoadingOverlay
          kind={loadingUi.type}
          current={loadingUi.atual}
          total={loadingUi.total}
          label={loadingUi.type === 'listagem' ? 'Buscando chaves…' : 'Baixando XMLs…'}
        />
      )}
    </div>
  )
}
