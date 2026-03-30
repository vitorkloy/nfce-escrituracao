'use client'

import { IonIcon } from '@ionic/react'
import { documentTextOutline, receiptOutline } from 'ionicons/icons'
import type { AppModule } from '@/types/nfce-app'

type ModulePickerScreenProps = {
  onSelectModule: (modulo: AppModule) => void
}

export function ModulePickerScreen({ onSelectModule }: ModulePickerScreenProps) {
  return (
    <div className="h-screen w-screen bg-[var(--bg-deep)] flex items-center justify-center p-6">
      <div className="w-full max-w-[620px] rounded border border-[var(--border)] bg-[var(--bg-base)] p-6">
        <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Escolha o módulo</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-5">
          Selecione qual tipo de documento deseja operar neste acesso.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => onSelectModule('nfce')}
            className="rounded border border-[var(--teal-dim)] bg-[var(--teal-glow)] p-4 text-left no-drag"
          >
            <div className="flex items-center gap-2 mb-2 text-[var(--teal)]">
              <IonIcon icon={receiptOutline} className="w-5 h-5" />
              <span className="font-semibold">NFC-e</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">Serviços de apoio à escrituração da NFC-e.</p>
          </button>
          <button
            type="button"
            onClick={() => onSelectModule('nfe')}
            className="rounded border border-[var(--border)] bg-[var(--bg-raised)] p-4 text-left no-drag"
          >
            <div className="flex items-center gap-2 mb-2 text-[var(--text-primary)]">
              <IonIcon icon={documentTextOutline} className="w-5 h-5" />
              <span className="font-semibold">NF-e</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">Integração de NF-e (v4.00) em fase inicial.</p>
          </button>
        </div>
      </div>
    </div>
  )
}
