/**
 * Tipos compartilhados da UI (certificado, listagem, download).
 * Mantidos fora dos componentes para leitura e reutilização mais simples.
 */

export type AppTab =
  | 'config'
  | 'listagem'
  | 'download'
  | 'relatorio'
  | 'manual'
  | 'nfe-dist-dfe'
  | 'nfe-recepcao-evento'

/** Item da barra lateral (ícone Ionicons como data URI / nome). */
export interface NavTabConfig {
  id: AppTab
  label: string
  icon: string
}

export type SefazEnvironment = 'producao'
export type AppModule = 'nfce' | 'nfe'

export type CertificateSourceMode = 'store' | 'arquivo'

/** Estado do certificado na UI (inclui senha só em memória). */
export interface CertificateUiState {
  pfxPath: string
  thumbprint?: string
  origemStore: boolean
  senha: string
  ambiente: SefazEnvironment
  /** Nome exibido na sidebar (completo; o layout trunca com ellipsis). */
  certificadoNome?: string
  /** CNPJ somente dígitos (14), para formatar na UI. */
  certificadoCnpj?: string
}

export interface KeyListItem {
  chave: string
  selecionada: boolean
}

export type ToastVariant = 'ok' | 'erro' | 'info'

export interface ToastMessage {
  id: number
  tipo: ToastVariant
  msg: string
}

export type OverlayKind = 'listagem' | 'lote' | 'request'

export interface LoadingUiState {
  type: OverlayKind | null
  atual?: number
  total?: number
  label?: string
}

/** Resposta tipada do IPC de download em lote (alinhada ao retorno do main). */
export interface BatchDownloadResponse {
  ok?: boolean
  resultados?: Array<{ chave: string; ok: boolean; erro?: string }>
  xMotivo?: string
}

export type EmitenteFilter = 'todos' | 'matriz' | 'filiais' | (string & {})
