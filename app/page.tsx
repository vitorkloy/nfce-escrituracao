'use client'

import { useCallback, useEffect, useState } from 'react'
import { AppSidebar, MainPanelArea } from '@/components/nfce/shell'
import { LoadingOverlay } from '@/components/nfce/ui/loading-overlay'
import { ToastStack } from '@/components/nfce/ui/toast-stack'
import { useCertificatePersistence } from '@/hooks/use-certificate-persistence'
import { useElectronAppMeta } from '@/hooks/use-electron-app-meta'
import { useToastStack } from '@/hooks/use-toast-stack'
import { useIsElectron } from '@/hooks/useIsElectron'
import type { AppModule, AppTab, LoadingUiState } from '@/types/nfce-app'

export default function Home() {
  const { isElectron } = useIsElectron()
  const { toasts, showToast, dismissToast } = useToastStack()
  const { certificateState, setCertificateState } = useCertificatePersistence(isElectron)
  const { appVersion, appModule, persistModuleSelection } = useElectronAppMeta(isElectron)

  const [activeTab, setActiveTab] = useState<AppTab>('config')
  const [loadingUi, setLoadingUi] = useState<LoadingUiState>({ type: null })
  const [isCancellingListagem, setIsCancellingListagem] = useState(false)

  const resolvedModule: AppModule = appModule ?? 'nfce'

  const certificateReady =
    (certificateState.origemStore && Boolean(certificateState.thumbprint)) ||
    (!certificateState.origemStore && Boolean(certificateState.pfxPath) && Boolean(certificateState.senha))

  const hasSelectedCertificate =
    (certificateState.origemStore && Boolean(certificateState.thumbprint)) ||
    (!certificateState.origemStore && Boolean(certificateState.pfxPath))

  const escolherModulo = useCallback(
    async (modulo: AppModule) => {
      if (!isElectron) return
      const ok = await persistModuleSelection(modulo)
      if (!ok) {
        showToast('erro', 'Não foi possível salvar o módulo selecionado.')
        return
      }
      setActiveTab('config')
    },
    [isElectron, persistModuleSelection, showToast],
  )

  const cancelarBuscaListagem = useCallback(async () => {
    if (!isElectron || loadingUi.type !== 'listagem' || isCancellingListagem) return
    try {
      setIsCancellingListagem(true)
      await window.electron.sefaz.cancelarListagem()
      showToast('info', 'Cancelando busca...')
    } catch {
      showToast('erro', 'Não foi possível cancelar a busca.')
    }
  }, [isElectron, loadingUi.type, isCancellingListagem, showToast])

  useEffect(() => {
    if (loadingUi.type !== 'listagem') setIsCancellingListagem(false)
  }, [loadingUi.type])

  return (
    <div className="flex h-screen select-none bg-[var(--bg-deep)]">
      <AppSidebar
        appModule={resolvedModule}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        certificateState={certificateState}
        certificateReady={certificateReady}
        hasSelectedCertificate={hasSelectedCertificate}
        appVersion={appVersion}
        onSelectModule={(m) => void escolherModulo(m)}
      />

      <MainPanelArea
        activeTab={activeTab}
        appModule={resolvedModule}
        certificateState={certificateState}
        onCertificateChange={setCertificateState}
        showToast={showToast}
        onLoadingStateChange={setLoadingUi}
      />

      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      {loadingUi.type && (
        <LoadingOverlay
          kind={loadingUi.type}
          current={loadingUi.atual}
          total={loadingUi.total}
          label={loadingUi.type === 'listagem' ? 'Buscando chaves…' : 'Baixando XMLs…'}
          onCancel={loadingUi.type === 'listagem' ? () => void cancelarBuscaListagem() : undefined}
          cancelDisabled={loadingUi.type === 'listagem' ? isCancellingListagem : undefined}
        />
      )}
    </div>
  )
}
