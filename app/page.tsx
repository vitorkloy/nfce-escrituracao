'use client'

import { useCallback, useEffect, useState } from 'react'
import { AppSidebar, MainPanelArea, ModulePickerScreen } from '@/components/nfce/shell'
import { LoadingOverlay } from '@/components/nfce/ui/loading-overlay'
import { UpdateAvailableModal } from '@/components/nfce/ui/update-available-modal'
import { ToastStack } from '@/components/nfce/ui/toast-stack'
import { useCertificatePersistence } from '@/hooks/use-certificate-persistence'
import { useElectronAppMeta } from '@/hooks/use-electron-app-meta'
import { useAutoUpdater } from '@/hooks/use-auto-updater'
import { useToastStack } from '@/hooks/use-toast-stack'
import { useIsElectron } from '@/hooks/useIsElectron'
import type { AppTab, LoadingUiState } from '@/types/nfce-app'

export default function Home() {
  const { isElectron } = useIsElectron()
  const { toasts, showToast, dismissToast } = useToastStack()
  const { certificateState, setCertificateState } = useCertificatePersistence(isElectron)
  const { appVersion, appModule, persistModuleSelection } = useElectronAppMeta(isElectron)
  const autoUpdate = useAutoUpdater(isElectron, appVersion, showToast)

  const [activeTab, setActiveTab] = useState<AppTab>('config')
  const [loadingUi, setLoadingUi] = useState<LoadingUiState>({ type: null })
  const [isCancellingListagem, setIsCancellingListagem] = useState(false)

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
      setActiveTab(modulo === 'relatorio' ? 'relatorio' : 'config')
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

  if (!appModule) {
    return (
      <div className="h-screen w-screen select-none bg-[var(--bg-deep)]">
        <ModulePickerScreen onSelectModule={(m) => void escolherModulo(m)} />
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
        <UpdateAvailableModal
          open={autoUpdate.updateModalOpen}
          phase={autoUpdate.updatePhase}
          currentVersion={autoUpdate.currentAppVersion}
          remoteVersion={autoUpdate.updateRemoteVersion}
          percent={autoUpdate.updatePercent}
          errorMessage={autoUpdate.updateErrorMessage}
          onDismiss={autoUpdate.dismissUpdateModal}
          onDownload={() => void autoUpdate.startUpdateDownload()}
          onInstall={() => void autoUpdate.installUpdate()}
        />
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col md:flex-row select-none bg-[var(--bg-deep)]">
      <AppSidebar
        appModule={appModule}
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
        appModule={appModule}
        certificateState={certificateState}
        onCertificateChange={setCertificateState}
        showToast={showToast}
        onLoadingStateChange={setLoadingUi}
      />

      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <UpdateAvailableModal
        open={autoUpdate.updateModalOpen}
        phase={autoUpdate.updatePhase}
        currentVersion={autoUpdate.currentAppVersion}
        remoteVersion={autoUpdate.updateRemoteVersion}
        percent={autoUpdate.updatePercent}
        errorMessage={autoUpdate.updateErrorMessage}
        onDismiss={autoUpdate.dismissUpdateModal}
        onDownload={() => void autoUpdate.startUpdateDownload()}
        onInstall={() => void autoUpdate.installUpdate()}
      />

      {loadingUi.type && (
        <LoadingOverlay
          kind={loadingUi.type}
          current={loadingUi.atual}
          total={loadingUi.total}
          label={
            loadingUi.label ??
            (loadingUi.type === 'listagem'
              ? 'Buscando chaves…'
              : loadingUi.type === 'lote'
                ? 'Baixando XMLs…'
                : 'Processando requisição…')
          }
          onCancel={loadingUi.type === 'listagem' ? () => void cancelarBuscaListagem() : undefined}
          cancelDisabled={loadingUi.type === 'listagem' ? isCancellingListagem : undefined}
        />
      )}
    </div>
  )
}
