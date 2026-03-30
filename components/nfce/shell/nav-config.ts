import {
  bookOutline,
  cloudDownloadOutline,
  documentTextOutline,
  downloadOutline,
  listOutline,
  sendOutline,
  settingsOutline,
} from 'ionicons/icons'
import type { NavTabConfig } from '@/types/nfce-app'

export const NFCE_NAV_TABS: NavTabConfig[] = [
  { id: 'config', label: 'Certificado', icon: settingsOutline },
  { id: 'listagem', label: 'Listagem', icon: listOutline },
  { id: 'download', label: 'Download XML', icon: downloadOutline },
  { id: 'relatorio', label: 'Relatório', icon: documentTextOutline },
  { id: 'manual', label: 'Manual', icon: bookOutline },
]

export const NFE_NAV_TABS: NavTabConfig[] = [
  { id: 'config', label: 'Certificado', icon: settingsOutline },
  { id: 'nfe-dist-dfe', label: 'Distribuição DFe', icon: cloudDownloadOutline },
  { id: 'nfe-recepcao-evento', label: 'Recepção evento', icon: sendOutline },
  { id: 'manual', label: 'Manual', icon: bookOutline },
]

export function navTabsForModule(modulo: 'nfce' | 'nfe'): NavTabConfig[] {
  return modulo === 'nfe' ? NFE_NAV_TABS : NFCE_NAV_TABS
}
