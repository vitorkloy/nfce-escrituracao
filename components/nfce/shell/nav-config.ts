import {
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
]

export const NFE_NAV_TABS: NavTabConfig[] = [
  { id: 'config', label: 'Certificado', icon: settingsOutline },
  { id: 'nfe-dist-dfe', label: 'Distribuição DFe', icon: cloudDownloadOutline },
  { id: 'nfe-recepcao-evento', label: 'Recepção evento', icon: sendOutline },
]

export const RELATORIO_NAV_TABS: NavTabConfig[] = [
  { id: 'relatorio', label: 'Relatório', icon: documentTextOutline },
]

export function navTabsForModule(modulo: 'nfce' | 'nfe' | 'relatorio'): NavTabConfig[] {
  if (modulo === 'nfe') return NFE_NAV_TABS
  if (modulo === 'relatorio') return RELATORIO_NAV_TABS
  return NFCE_NAV_TABS
}
