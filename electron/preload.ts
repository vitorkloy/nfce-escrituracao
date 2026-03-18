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
      ambiente: 'homologacao' | 'producao'
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

    downloadXml: (config: ConfigCert & { thumbprint?: string }, chave: string) =>
      ipcRenderer.invoke('sefaz:download-xml', config, chave),

    downloadLote: (config: ConfigCert & { thumbprint?: string }, chaves: string[], pastaSaida: string) =>
      ipcRenderer.invoke('sefaz:download-lote', config, chaves, pastaSaida),

    onProgressoListagem: (cb: (total: number) => void) => {
      ipcRenderer.on('sefaz:progresso-listagem', (_e, total) => cb(total))
      return () => ipcRenderer.removeAllListeners('sefaz:progresso-listagem')
    },

    onProgressoLote: (cb: (info: { atual: number; total: number; chave: string }) => void) => {
      ipcRenderer.on('sefaz:progresso-lote', (_e, info) => cb(info))
      return () => ipcRenderer.removeAllListeners('sefaz:progresso-lote')
    },
  },

  fs: {
    selecionarPasta:  ()                                => ipcRenderer.invoke('fs:selecionar-pasta'),
    salvarXml:        (c: string, n: string)            => ipcRenderer.invoke('fs:salvar-xml', c, n),
    abrirPasta:       (caminho: string)                 => ipcRenderer.invoke('fs:abrir-pasta', caminho),
  },

  app: {
    setBusy: (busy: boolean) => ipcRenderer.send('app:set-busy', busy),
  },
})
