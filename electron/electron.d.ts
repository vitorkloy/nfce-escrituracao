// Declaração de tipos para a API do Electron exposta via contextBridge

export interface CertInfo {
  thumbprint: string
  subject: string
  cnpj: string
  nome: string
  emissor: string
  validade: string
  expirado: boolean
  origem: 'store'
}

interface CertConfig {
  pfxPath: string
  thumbprint?: string
  origemStore: boolean
  ambiente: 'homologacao' | 'producao'
}

interface SefazConfig extends CertConfig {
  senha: string
}

interface ResultadoListagem {
  ok: boolean
  cStat?: string
  xMotivo?: string
  chaves?: string[]
  total?: number
  incompleto?: boolean
  dhEmisUltNfce?: string
  /** CNPJ do certificado (matriz) para distinguir de filiais */
  cnpj?: string
}

interface NfeProc {
  versao: string
  dhInc: string
  nProt: string
  nfeXml: string
}

interface EventoProc {
  versao: string
  dhInc: string
  nProt: string
  eventoXml: string
}

interface ResultadoDownload {
  ok: boolean
  cStat?: string
  xMotivo?: string
  nfeProc?: NfeProc
  eventos?: EventoProc[]
}

interface ProgressoLote {
  atual: number
  total: number
  chave: string
}

declare global {
  interface Window {
    electron: {
      cert: {
        // Repositório do sistema
        listarSistema(): Promise<{ ok: boolean; certs?: CertInfo[]; erro?: string }>
        testarStore(thumbprint: string, senha: string): Promise<{ ok: boolean; mensagem: string }>
        // Arquivo manual
        selecionarArquivo(): Promise<string | null>
        salvarConfig(config: CertConfig): Promise<boolean>
        carregarConfig(): Promise<CertConfig | null>
        testar(pfxPath: string, senha: string): Promise<{ ok: boolean; mensagem: string }>
      }
      sefaz: {
        listarChaves(
          config: SefazConfig,
          dataInicial: string,
          dataFinal: string | undefined,
          paginacaoAuto: boolean
        ): Promise<ResultadoListagem>
        downloadXml(config: SefazConfig, chave: string): Promise<ResultadoDownload>
        downloadLote(
          config: SefazConfig,
          chaves: string[],
          pastaSaida: string
        ): Promise<{ chave: string; ok: boolean; erro?: string }[]>
        onProgressoListagem(cb: (total: number) => void): () => void
        onProgressoLote(cb: (info: ProgressoLote) => void): () => void
      }
      fs: {
        selecionarPasta(): Promise<string | null>
        salvarXml(conteudo: string, nomeArquivo: string): Promise<boolean>
        abrirPasta(caminho: string): Promise<void>
      }
      app: {
        setBusy(busy: boolean): void
      }
    }
  }
}

export {}
