'use client'

import { IonIcon } from '@ionic/react'
import { bookOutline, documentTextOutline } from 'ionicons/icons'
import { ThemeSelector } from '@/components/nfce/theme-selector'
import type { AppModule, AppTab, CertificateUiState, NavTabConfig } from '@/types/nfce-app'
import { navTabsForModule } from './nav-config'
import { SidebarCertificatePreview } from './sidebar-certificate-preview'

type AppSidebarProps = {
  appModule: AppModule
  activeTab: AppTab
  onSelectTab: (tab: AppTab) => void
  certificateState: CertificateUiState
  certificateReady: boolean
  hasSelectedCertificate: boolean
  appVersion: string
  onSelectModule: (modulo: AppModule) => void
}

function SidebarNav({
  tabs,
  activeTab,
  onSelectTab,
}: {
  tabs: NavTabConfig[]
  activeTab: AppTab
  onSelectTab: (tab: AppTab) => void
}) {
  return (
    <nav className="flex flex-col gap-0.5 px-3 flex-1" aria-label="Navegação principal">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelectTab(tab.id)}
          className={[
            'flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-all text-left no-drag',
            activeTab === tab.id
              ? 'bg-[var(--teal-glow)] text-[var(--teal)] font-medium'
              : 'bg-transparent text-[var(--text-secondary)] font-normal',
          ].join(' ')}
          aria-current={activeTab === tab.id ? 'page' : undefined}
        >
          <IonIcon icon={tab.icon} className="w-5 h-5" />
          {tab.label}
        </button>
      ))}
    </nav>
  )
}

function ModuleToggle({
  appModule,
  onSelectModule,
}: {
  appModule: AppModule
  onSelectModule: (m: AppModule) => void
}) {
  return (
    <div className="mb-3">
      <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-1.5">Módulo</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onSelectModule('nfce')}
          className={[
            'py-1.5 rounded text-xs font-semibold no-drag border',
            appModule === 'nfce'
              ? 'border-[var(--teal-dim)] bg-[var(--teal-glow)] text-[var(--teal)]'
              : 'border-[var(--border)] bg-[var(--bg-raised)] text-[var(--text-secondary)]',
          ].join(' ')}
        >
          NFC-e
        </button>
        <button
          type="button"
          onClick={() => onSelectModule('nfe')}
          className={[
            'py-1.5 rounded text-xs font-semibold no-drag border',
            appModule === 'nfe'
              ? 'border-[var(--teal-dim)] bg-[var(--teal-glow)] text-[var(--teal)]'
              : 'border-[var(--border)] bg-[var(--bg-raised)] text-[var(--text-secondary)]',
          ].join(' ')}
        >
          NF-e
        </button>
      </div>
    </div>
  )
}

export function AppSidebar({
  appModule,
  activeTab,
  onSelectTab,
  certificateState,
  certificateReady,
  hasSelectedCertificate,
  appVersion,
  onSelectModule,
}: AppSidebarProps) {
  const tabs = navTabsForModule(appModule)

  return (
    <aside className="flex flex-col w-56 shrink-0 bg-[var(--bg-base)] border-r border-[var(--border)]">
      <div className="drag-region h-8 shrink-0" />
      <div className="px-5 pb-6">
        <div className="flex items-center gap-2.5 mb-1">
          <IonIcon icon={documentTextOutline} className="text-2xl text-[var(--teal)]" />
          <span className="font-semibold text-sm leading-tight text-[var(--text-primary)]">
            Escrituração Fiscal
            <br />
            <span className="font-medium text-[var(--text-secondary)]">
              {appModule === 'nfe' ? 'NF-e' : 'NFC-e'}
            </span>
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
          <p className="text-[10px] uppercase tracking-wider mb-1 text-[var(--text-muted)]">Certificado</p>
          <SidebarCertificatePreview certificateState={certificateState} />
        </div>
      </div>

      <SidebarNav tabs={tabs} activeTab={activeTab} onSelectTab={onSelectTab} />

      <div className="px-5 py-4 border-t border-[var(--border)]">
        <button
          type="button"
          onClick={() => onSelectTab('manual')}
          className={[
            'mb-3 w-full flex items-center gap-2 px-3 py-2 rounded text-sm no-drag border transition-colors',
            activeTab === 'manual'
              ? 'border-[var(--teal-dim)] bg-[var(--teal-glow)] text-[var(--teal)] font-medium'
              : 'border-[var(--border)] bg-[var(--bg-raised)] text-[var(--text-secondary)]',
          ].join(' ')}
        >
          <IonIcon icon={bookOutline} className="w-4 h-4" />
          Manual
        </button>

        <ModuleToggle appModule={appModule} onSelectModule={onSelectModule} />
        <ThemeSelector />
        {appVersion && (
          <p className="text-xs font-mono mb-1 text-[var(--teal)]" title="Versão do aplicativo">
            App v{appVersion}
          </p>
        )}
        <p className="text-xs text-[var(--text-muted)]">
          {appModule === 'nfe' ? 'SAE-NF-e' : 'SAE-NFC-e'} v2.0.0
        </p>
        <p className="text-xs text-[var(--text-muted)]">SEFAZ-SP · NT 2026</p>
      </div>
    </aside>
  )
}
