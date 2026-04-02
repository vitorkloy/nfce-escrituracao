import { contextBridge, ipcRenderer } from 'electron'
import type { ConfigCert } from './sefaz'

contextBridge.exposeInMainWorld('electron', {

  cert: {
    // Lê todos os certificados com chave privada do repositório do sistema (Windows/macOS)
    listarSistema: () =>
      ipcRenderer.invoke('cert:listar-sistema'),

    // Testa se o certificado do store pode ser exportado com a senha fornecida
    testarStore: (thumbprint: string, senha: string) =>
      ipcRenderer.invoke('cert:testar-store', thumbprint, senha),

    // Seleção manual de arquivo .pfx
    selecionarArquivo: () =>
      ipcRenderer.invoke('cert:selecionar-arquivo'),

    salvarConfig: (config: {
      pfxPath: string
      thumbprint?: string
      origemStore: boolean
      ambiente: 'producao'
    }) => ipcRenderer.invoke('cert:salvar-config', config),

    carregarConfig: () =>
      ipcRenderer.invoke('cert:carregar-config'),

    testar: (pfxPath: string, senha: string) =>
      ipcRenderer.invoke('cert:testar', pfxPath, senha),
  },

  sefaz: {
    listarChaves: (
      config: ConfigCert & { thumbprint?: string },
      dataInicial: string,
      dataFinal: string | undefined,
      paginacaoAuto: boolean
    ) => ipcRenderer.invoke('sefaz:listar-chaves', config, dataInicial, dataFinal, paginacaoAuto),
    cancelarListagem: () => ipcRenderer.invoke('sefaz:cancelar-listagem') as Promise<boolean>,

    downloadXml: (config: ConfigCert & { thumbprint?: string }, chave: string) =>
      ipcRenderer.invoke('sefaz:download-xml', config, chave),

    downloadLote: (config: ConfigCert & { thumbprint?: string }, chaves: string[], pastaSaida: string) =>
      ipcRenderer.invoke('sefaz:download-lote', config, chaves, pastaSaida),

    downloadLoteRelatorio: (
      config: ConfigCert & { thumbprint?: string },
      chaves: string[],
      pastaSaida: string,
      relatorioModo: 'agora' | 'depois' | 'nenhum'
    ) =>
      ipcRenderer.invoke('sefaz:download-lote', config, chaves, pastaSaida, relatorioModo),

    onProgressoListagem: (cb: (total: number) => void) => {
      ipcRenderer.on('sefaz:progresso-listagem', (_e, total) => cb(total))
      return () => ipcRenderer.removeAllListeners('sefaz:progresso-listagem')
    },

    onProgressoLote: (cb: (info: { atual: number; total: number; chave: string }) => void) => {
      ipcRenderer.on('sefaz:progresso-lote', (_e, info) => cb(info))
      return () => ipcRenderer.removeAllListeners('sefaz:progresso-lote')
    },
  },

  nfe: {
    distribuicaoDfe: (config: ConfigCert & { thumbprint?: string }, nfeDadosMsgXml: string) =>
      ipcRenderer.invoke('nfe:distribuicao-dfe', config, nfeDadosMsgXml),
    recepcaoEvento: (config: ConfigCert & { thumbprint?: string }, nfeDadosMsgXml: string) =>
      ipcRenderer.invoke('nfe:recepcao-evento', config, nfeDadosMsgXml),
    distDfeEstado: (pastaRaiz: string, cnpj14: string) =>
      ipcRenderer.invoke('nfe:dist-dfe-estado', pastaRaiz, cnpj14),
    syncDistDfe: (
      config: ConfigCert & { thumbprint?: string },
      opts: {
        pastaRaiz: string
        cnpj14: string
        cUFAutor: string
        reiniciarNsu: boolean
        filtroPapel?: 'todos' | 'emitente' | 'destinatario'
      }
    ) => ipcRenderer.invoke('nfe:sync-dist-dfe', config, opts),
    listarXmlsSalvos: (
      pastaRaiz: string,
      cnpj14: string,
      filtro?: { ano?: string; mes?: string }
    ) => ipcRenderer.invoke('nfe:listar-xmls-salvos', pastaRaiz, cnpj14, filtro),
    onSyncDistProgress: (cb: (p: {
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
    }) => void) => {
      const fn = (_e: Electron.IpcRendererEvent, p: Parameters<typeof cb>[0]) => cb(p)
      ipcRenderer.on('nfe:sync-dist-progress', fn)
      return () => ipcRenderer.removeListener('nfe:sync-dist-progress', fn)
    },
  },

  fs: {
    selecionarPasta:  ()                                => ipcRenderer.invoke('fs:selecionar-pasta'),
    salvarXml:        (c: string, n: string)            => ipcRenderer.invoke('fs:salvar-xml', c, n),
    abrirPasta:       (caminho: string)                 => ipcRenderer.invoke('fs:abrir-pasta', caminho),
    lerArquivoUtf8:   (caminho: string)                 => ipcRenderer.invoke('fs:ler-arquivo-utf8', caminho),
  },

  relatorio: {
    gerarComparativoXlsx: (pastaSaida: string) =>
      ipcRenderer.invoke('relatorio:comparativo-xlsx', pastaSaida),
    listarXmls: (pastaSaida: string) =>
      ipcRenderer.invoke('relatorio:listar-xmls', pastaSaida),
  },

  app: {
    setBusy: (busy: boolean) => ipcRenderer.send('app:set-busy', busy),
    getVersion: () => ipcRenderer.invoke('app:get-version') as Promise<string>,
    setModulo: (modulo: 'nfce' | 'nfe') => ipcRenderer.invoke('app:set-modulo', modulo) as Promise<boolean>,
    setNfeBlockTimer: (payload: {
      certId: string
      cnpj14?: string
      blockedAtMs: number
      retryAtMs: number
      cStat: '656'
    }) => ipcRenderer.invoke('app:set-nfe-block-timer', payload) as Promise<boolean>,
    getNfeBlockTimer: (certId: string) =>
      ipcRenderer.invoke('app:get-nfe-block-timer', certId) as Promise<{
        certId: string
        cnpj14?: string
        blockedAtMs: number
        retryAtMs: number
        cStat: '656'
      } | null>,
    clearNfeBlockTimer: (certId: string) =>
      ipcRenderer.invoke('app:clear-nfe-block-timer', certId) as Promise<boolean>,
  },

  ui: {
    getTheme: () =>
      ipcRenderer.invoke('ui:get-theme') as Promise<'light' | 'dark' | 'system'>,
    setTheme: (t: 'light' | 'dark' | 'system') =>
      ipcRenderer.invoke('ui:set-theme', t) as Promise<boolean>,
  },

  updater: {
    check: () =>
      ipcRenderer.invoke('updater:check') as Promise<
        | { ok: true; skipped?: true; updateInfo?: { version: string } }
        | { ok: false; message: string }
      >,
    download: () =>
      ipcRenderer.invoke('updater:download') as Promise<{ ok: true } | { ok: false; message: string }>,
    install: () => ipcRenderer.invoke('updater:install') as Promise<boolean>,
    onUpdateAvailable: (cb: (info: { version: string; releaseNotes: string }) => void) => {
      const fn = (_e: Electron.IpcRendererEvent, info: { version: string; releaseNotes: string }) => cb(info)
      ipcRenderer.on('updater:update-available', fn)
      return () => ipcRenderer.removeListener('updater:update-available', fn)
    },
    onDownloadProgress: (cb: (p: { percent: number; transferred: number; total: number }) => void) => {
      const fn = (_e: Electron.IpcRendererEvent, p: { percent: number; transferred: number; total: number }) =>
        cb(p)
      ipcRenderer.on('updater:download-progress', fn)
      return () => ipcRenderer.removeListener('updater:download-progress', fn)
    },
    onUpdateDownloaded: (cb: (info: { version: string }) => void) => {
      const fn = (_e: Electron.IpcRendererEvent, info: { version: string }) => cb(info)
      ipcRenderer.on('updater:update-downloaded', fn)
      return () => ipcRenderer.removeListener('updater:update-downloaded', fn)
    },
    onUpdaterError: (cb: (info: { message: string }) => void) => {
      const fn = (_e: Electron.IpcRendererEvent, info: { message: string }) => cb(info)
      ipcRenderer.on('updater:error', fn)
      return () => ipcRenderer.removeListener('updater:error', fn)
    },
  },
})
