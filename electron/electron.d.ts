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
  ambiente: 'producao'
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
  serie?: string
  nNF?: string
  vNF?: string
  dhEmi?: string
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

interface NfeSoapResumoRecepcao {
  cStat: string
  xMotivo: string
  idLote?: string
  tpAmb?: string
}

interface NfeSoapResumoDistribuicao {
  cStat: string
  xMotivo: string
  ultNSU: string
  maxNSU: string
}

interface NfeSoapResultado {
  ok: boolean
  /** XML bruto da resposta SOAP (envelope ou retorno). */
  xmlResposta?: string
  xMotivo?: string
  /** Preenchido quando a resposta contém retEnvEvento interpretável. */
  resumoRecepcao?: NfeSoapResumoRecepcao
  /** Preenchido quando a resposta contém retDistDFeInt interpretável. */
  resumoDistribuicao?: NfeSoapResumoDistribuicao
}

type NfeDistDfeFiltroPapel = 'todos' | 'emitente' | 'destinatario'

interface NfeDistDfeSyncProgresso {
  tipo: 'lote' | 'concluido' | 'erro'
  ultNSU?: string
  maxNSU?: string
  cStat?: string
  loteSalvos?: number
  loteIgnorados?: number
  loteFiltrados?: number
  totalSalvos?: number
  totalIgnorados?: number
  totalFiltrados?: number
  mensagem?: string
}

interface NfeDistDfeSyncResultado {
  ok: boolean
  totalSalvos: number
  totalIgnorados: number
  totalFiltrados: number
  ultNSU: string
  lotes: number
  xMotivo?: string
}

interface NfeXmlSalvoInfo {
  chave: string
  caminho: string
  ano: string
  mes: string
}

interface ProgressoLote {
  atual: number
  total: number
  chave: string
}

interface NfeBlockTimer {
  certId: string
  cnpj14?: string
  blockedAtMs: number
  retryAtMs: number
  cStat: '656'
}

type ThemePreference = 'light' | 'dark' | 'system'
type AppModule = 'nfce' | 'nfe'

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
        cancelarListagem(): Promise<boolean>
        downloadXml(config: SefazConfig, chave: string): Promise<ResultadoDownload>
        downloadLote(
          config: SefazConfig,
          chaves: string[],
          pastaSaida: string
        ): Promise<{
          ok: boolean
          resultados: Array<{ chave: string; ok: boolean; erro?: string }>
          xMotivo?: string
          relatorio?: {
            arquivos: string[]
            gerados: number
            aprovados: number
            cancelados: number
            falhas: number
          }
        }>
        downloadLoteRelatorio(
          config: SefazConfig,
          chaves: string[],
          pastaSaida: string,
          relatorioModo: 'agora' | 'depois' | 'nenhum'
        ): Promise<{
          ok: boolean
          resultados: Array<{ chave: string; ok: boolean; erro?: string }>
          xMotivo?: string
          relatorio?: {
            arquivos: string[]
            gerados: number
            aprovados: number
            cancelados: number
            falhas: number
          }
        }>
        onProgressoListagem(cb: (total: number) => void): () => void
        onProgressoLote(cb: (info: ProgressoLote) => void): () => void
      }
      nfe: {
        distribuicaoDfe(config: SefazConfig, nfeDadosMsgXml: string): Promise<NfeSoapResultado>
        recepcaoEvento(config: SefazConfig, nfeDadosMsgXml: string): Promise<NfeSoapResultado>
        distDfeEstado(pastaRaiz: string, cnpj14: string): Promise<{ ok: boolean; ultNSU?: string; xMotivo?: string }>
        syncDistDfe(
          config: SefazConfig,
          opts: {
            pastaRaiz: string
            cnpj14: string
            cUFAutor: string
            reiniciarNsu: boolean
            filtroPapel?: NfeDistDfeFiltroPapel
          }
        ): Promise<NfeDistDfeSyncResultado>
        listarXmlsSalvos(
          pastaRaiz: string,
          cnpj14: string,
          filtro?: { ano?: string; mes?: string }
        ): Promise<{ ok: boolean; arquivos?: NfeXmlSalvoInfo[]; total?: number; xMotivo?: string }>
        onSyncDistProgress(cb: (p: NfeDistDfeSyncProgresso) => void): () => void
      }
      fs: {
        selecionarPasta(): Promise<string | null>
        salvarXml(conteudo: string, nomeArquivo: string): Promise<boolean>
        abrirPasta(caminho: string): Promise<void>
        lerArquivoUtf8(caminho: string): Promise<{ ok: boolean; conteudo?: string; xMotivo?: string }>
      }
      relatorio: {
        gerarComparativoXlsx(pastaSaida: string): Promise<{
          ok: boolean
          arquivos?: string[]
          gerados?: number
          aprovados?: number
          cancelados?: number
          falhas?: number
          xMotivo?: string
        }>
        listarXmls(pastaSaida: string): Promise<{
          ok: boolean
          total: number
          arquivos: string[]
          totalCancelados: number
          cancelados: string[]
          xMotivo?: string
        }>
      }
      app: {
        setBusy(busy: boolean): void
        /** Versão semver do package.json (instalador NSIS usa o mesmo número) */
        getVersion(): Promise<string>
        /** Valida módulo na sessão (não persiste — nova escolha a cada abertura do app). */
        setModulo(modulo: AppModule): Promise<boolean>
        setNfeBlockTimer(payload: NfeBlockTimer): Promise<boolean>
        getNfeBlockTimer(certId: string): Promise<NfeBlockTimer | null>
        clearNfeBlockTimer(certId: string): Promise<boolean>
      }
      ui: {
        getTheme(): Promise<ThemePreference>
        setTheme(t: ThemePreference): Promise<boolean>
      }
      updater: {
        check(): Promise<
          | { ok: true; skipped?: true; updateInfo?: { version: string } }
          | { ok: false; message: string }
        >
        download(): Promise<{ ok: true } | { ok: false; message: string }>
        install(): Promise<boolean>
        onUpdateAvailable(cb: (info: { version: string; releaseNotes: string }) => void): () => void
        onDownloadProgress(
          cb: (p: { percent: number; transferred: number; total: number }) => void
        ): () => void
        onUpdateDownloaded(cb: (info: { version: string }) => void): () => void
        onUpdaterError(cb: (info: { message: string }) => void): () => void
      }
    }
  }
}

export {}
