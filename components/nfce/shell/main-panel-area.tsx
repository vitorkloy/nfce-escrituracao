'use client'

import { ConfigPanel } from '@/components/nfce/panels/config-panel'
import { DownloadXmlPanel } from '@/components/nfce/panels/download-xml-panel'
import { KeyListPanel } from '@/components/nfce/panels/key-list-panel'
import { ManualPanel } from '@/components/nfce/panels/manual-panel'
import { NfeDistribuicaoDfePanel } from '@/components/nfce/panels/nfe-distribuicao-dfe-panel'
import { NfeRecepcaoEventoPanel } from '@/components/nfce/panels/nfe-recepcao-evento-panel'
import { RelatorioPanel } from '@/components/nfce/panels/relatorio-panel'
import type {
  AppModule,
  AppTab,
  CertificateUiState,
  LoadingUiState,
  ToastVariant,
} from '@/types/nfce-app'

type MainPanelAreaProps = {
  activeTab: AppTab
  appModule: AppModule
  certificateState: CertificateUiState
  onCertificateChange: (next: CertificateUiState) => void
  showToast: (variant: ToastVariant, message: string) => void
  onLoadingStateChange: (state: LoadingUiState) => void
}

export function MainPanelArea({
  activeTab,
  appModule,
  certificateState,
  onCertificateChange,
  showToast,
  onLoadingStateChange,
}: MainPanelAreaProps) {
  return (
    <main className="flex-1 min-h-0 overflow-hidden flex flex-col bg-[var(--bg-base)]">
      <div className="drag-region h-8 shrink-0 bg-[var(--bg-base)] hidden md:block" />
      <div className="flex-1 overflow-hidden">
        {activeTab === 'config' && (
          <div className="h-full overflow-auto">
            <ConfigPanel
              certificateState={certificateState}
              onCertificateChange={onCertificateChange}
              showToast={showToast}
            />
          </div>
        )}
        {activeTab === 'listagem' && (
          <div className="h-full flex flex-col overflow-hidden">
            <KeyListPanel
              appModule={appModule}
              certificateState={certificateState}
              showToast={showToast}
              onLoadingStateChange={onLoadingStateChange}
            />
          </div>
        )}
        {activeTab === 'download' && (
          <div className="h-full flex flex-col overflow-hidden">
            <DownloadXmlPanel
              appModule={appModule}
              certificateState={certificateState}
              showToast={showToast}
              onLoadingStateChange={onLoadingStateChange}
            />
          </div>
        )}
        {activeTab === 'relatorio' && (
          <div className="h-full flex flex-col overflow-hidden">
            <RelatorioPanel appModule={appModule} showToast={showToast} />
          </div>
        )}
        {activeTab === 'manual' && (
          <div className="h-full flex flex-col overflow-hidden">
            <ManualPanel />
          </div>
        )}
        {activeTab === 'nfe-dist-dfe' && appModule === 'nfe' && (
          <div className="h-full flex flex-col overflow-hidden">
            <NfeDistribuicaoDfePanel
              certificateState={certificateState}
              showToast={showToast}
              onLoadingStateChange={onLoadingStateChange}
            />
          </div>
        )}
        {activeTab === 'nfe-recepcao-evento' && appModule === 'nfe' && (
          <div className="h-full flex flex-col overflow-hidden">
            <NfeRecepcaoEventoPanel
              certificateState={certificateState}
              showToast={showToast}
              onLoadingStateChange={onLoadingStateChange}
            />
          </div>
        )}
      </div>
    </main>
  )
}
