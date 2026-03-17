import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFile, exec } from 'child_process'
import { promisify } from 'util'
import Store from 'electron-store'
import {
  listarTodasChaves,
  listarChaves,
  downloadXml,
  SefazError,
  type ConfigCert,
  type ResultadoListagem,
  type ResultadoDownload,
} from './sefaz'

const execAsync     = promisify(exec)
const execFileAsync = promisify(execFile)

// ---------------------------------------------------------------------------
// Config store
// ---------------------------------------------------------------------------

interface StoreSchema {
  cert: {
    pfxPath: string
    thumbprint?: string
    origemStore: boolean
    ambiente: 'homologacao' | 'producao'
  }
}

const store = new Store<StoreSchema>()

// ---------------------------------------------------------------------------
// Janela principal
// ---------------------------------------------------------------------------

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f1117',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  const isDev = !app.isPackaged
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../out/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ---------------------------------------------------------------------------
// Enumeração de certificados do repositório do sistema
// ---------------------------------------------------------------------------

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

async function listarCertificadosSistema(): Promise<CertInfo[]> {
  if (process.platform === 'win32')  return listarCertsWindows()
  if (process.platform === 'darwin') return listarCertsMac()
  throw new Error('Listagem automática disponível apenas no Windows e macOS.')
}

// --- Windows (PowerShell) ---

async function listarCertsWindows(): Promise<CertInfo[]> {
  const ps = `
    $certs = Get-ChildItem Cert:\\CurrentUser\\My |
      Where-Object { $_.HasPrivateKey } |
      Select-Object Subject, Thumbprint, NotAfter, Issuer, FriendlyName
    if ($certs -eq $null) { Write-Output '[]'; exit }
    $certs | ConvertTo-Json -Compress
  `.trim()

  const { stdout } = await execFileAsync('powershell', [
    '-NonInteractive', '-NoProfile', '-Command', ps,
  ])

  const raw = JSON.parse(stdout.trim() || '[]')
  const arr = Array.isArray(raw) ? raw : [raw]
  return arr.map((c: Record<string, string>) => parseCertWindows(c))
}

function parseCertWindows(c: Record<string, string>): CertInfo {
  const subject    = c.Subject    ?? ''
  const thumbprint = (c.Thumbprint ?? '').toUpperCase()
  const emissor    = c.Issuer     ?? ''
  const validade   = c.NotAfter   ?? ''
  const cn         = extrairCampo(subject, 'CN')
  const cnpj       = extrairCNPJ(subject)
  const nome       = cn || subject
  const expirado   = validade ? new Date(validade) < new Date() : false
  return { thumbprint, subject, cnpj, nome, emissor, validade, expirado, origem: 'store' }
}

// --- macOS (security + openssl) ---

async function listarCertsMac(): Promise<CertInfo[]> {
  const { stdout } = await execAsync(
    'security find-identity -v -p ssl-client login.keychain'
  )
  const regex = /\d+\)\s+([0-9A-F]{40})\s+"(.+?)"/gi
  const certs: CertInfo[] = []
  let m
  while ((m = regex.exec(stdout)) !== null) {
    const thumbprint = m[1].toUpperCase()
    const nome       = m[2]
    try {
      const d = await detalhesCertMac(thumbprint)
      certs.push({ thumbprint, subject: nome, cnpj: extrairCNPJ(nome), nome, ...d, origem: 'store' })
    } catch {
      certs.push({ thumbprint, subject: nome, cnpj: extrairCNPJ(nome), nome, emissor: '', validade: '', expirado: false, origem: 'store' })
    }
  }
  return certs
}

async function detalhesCertMac(thumbprint: string): Promise<{ emissor: string; validade: string; expirado: boolean }> {
  const { stdout } = await execAsync(
    `security find-certificate -c "${thumbprint}" -p login.keychain | openssl x509 -noout -issuer -enddate`
  )
  const emissor  = stdout.match(/issuer=(.+)/)?.[1]  ?? ''
  const validade = stdout.match(/notAfter=(.+)/)?.[1] ?? ''
  const expirado = validade ? new Date(validade) < new Date() : false
  return { emissor, validade, expirado }
}

// --- Helpers ---

function extrairCampo(subject: string, campo: string): string {
  const m = subject.match(new RegExp(`(?:^|,\\s*)${campo}=([^,]+)`, 'i'))
  return m?.[1]?.trim() ?? ''
}

function extrairCNPJ(texto: string): string {
  const m = texto.match(/\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\.\s]?\/?\d{4}[\-\.]?\d{2}/)
  return m ? m[0].replace(/[.\s\/\-]/g, '') : ''
}

// ---------------------------------------------------------------------------
// Exportação do cert do store para .pfx temporário (para mTLS)
// ---------------------------------------------------------------------------

async function exportarCertWindows(thumbprint: string, senha: string): Promise<string> {
  const tmpPath = path.join(os.tmpdir(), `nfce_${thumbprint.substring(0, 8)}.pfx`)
  const senhaSafe = senha.replace(/`/g, '``').replace(/"/g, '`"').replace(/\$/g, '`$')

  const ps = `
    $cert = Get-Item "Cert:\\CurrentUser\\My\\${thumbprint}" -ErrorAction Stop
    $pwd  = ConvertTo-SecureString -String "${senhaSafe}" -Force -AsPlainText
    Export-PfxCertificate -Cert $cert -FilePath "${tmpPath.replace(/\\/g, '\\\\')}" -Password $pwd -Force | Out-Null
    Write-Output "ok"
  `.trim()

  const { stdout, stderr } = await execFileAsync('powershell', [
    '-NonInteractive', '-NoProfile', '-Command', ps,
  ])

  if (!stdout.trim().includes('ok')) {
    throw new Error(
      stderr?.trim() ||
      'Falha ao exportar. Verifique se o certificado é marcado como exportável.'
    )
  }
  return tmpPath
}

function limparPfxTemp(pfxPath: string) {
  try {
    if (pfxPath.includes(os.tmpdir()) && fs.existsSync(pfxPath)) fs.unlinkSync(pfxPath)
  } catch { /* ignora */ }
}

// ---------------------------------------------------------------------------
// Utilitário: resolve pfxPath — exporta do store se necessário
// ---------------------------------------------------------------------------

async function resolverPfx(config: ConfigCert & { thumbprint?: string }): Promise<{ pfxPath: string; tmpCriado: boolean }> {
  if (config.thumbprint && process.platform === 'win32') {
    const pfxPath = await exportarCertWindows(config.thumbprint, config.senha)
    return { pfxPath, tmpCriado: true }
  }
  return { pfxPath: config.pfxPath, tmpCriado: false }
}

// ---------------------------------------------------------------------------
// IPC — Enumeração e teste do certificado do sistema
// ---------------------------------------------------------------------------

ipcMain.handle('cert:listar-sistema', async () => {
  try {
    const certs = await listarCertificadosSistema()
    return { ok: true, certs }
  } catch (err: unknown) {
    return { ok: false, erro: err instanceof Error ? err.message : 'Erro ao listar certificados.' }
  }
})

ipcMain.handle('cert:testar-store', async (_e, thumbprint: string, senha: string) => {
  let tmpPath: string | null = null
  try {
    if (process.platform === 'win32') {
      tmpPath = await exportarCertWindows(thumbprint, senha)
      const stat = fs.statSync(tmpPath)
      if (stat.size < 100) throw new Error('Arquivo exportado parece inválido.')
    }
    return { ok: true, mensagem: 'Certificado validado com sucesso.' }
  } catch (err: unknown) {
    return { ok: false, mensagem: err instanceof Error ? err.message : 'Erro ao exportar.' }
  } finally {
    if (tmpPath) limparPfxTemp(tmpPath)
  }
})

// ---------------------------------------------------------------------------
// IPC — Configuração manual (.pfx)
// ---------------------------------------------------------------------------

ipcMain.handle('cert:selecionar-arquivo', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Selecionar certificado digital (.pfx / .p12)',
    filters: [
      { name: 'Certificado Digital', extensions: ['pfx', 'p12'] },
      { name: 'Todos os arquivos', extensions: ['*'] },
    ],
    properties: ['openFile'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('cert:salvar-config', async (_e, config: StoreSchema['cert']) => {
  store.set('cert', config)
  return true
})

ipcMain.handle('cert:carregar-config', async () => {
  return store.get('cert') ?? null
})

ipcMain.handle('cert:testar', async (_e, pfxPath: string, senha: string) => {
  try {
    const pfxBuffer = fs.readFileSync(pfxPath)
    if (!pfxBuffer || pfxBuffer.length < 100) throw new Error('Arquivo vazio ou inválido.')
    return { ok: true, mensagem: 'Arquivo lido. Credenciais validadas na primeira consulta.' }
  } catch (err: unknown) {
    return { ok: false, mensagem: err instanceof Error ? err.message : 'Erro desconhecido.' }
  }
})

// ---------------------------------------------------------------------------
// IPC — NFCeListagemChaves
// ---------------------------------------------------------------------------

ipcMain.handle(
  'sefaz:listar-chaves',
  async (_e, config: ConfigCert & { thumbprint?: string }, dataInicial: string, dataFinal: string | undefined, paginacaoAuto: boolean) => {
    const { pfxPath, tmpCriado } = await resolverPfx(config).catch(err => { throw err })
    const cfg = { ...config, pfxPath }
    try {
      if (paginacaoAuto) {
        const chaves = await listarTodasChaves(cfg, dataInicial, dataFinal, (parcial) => {
          mainWindow?.webContents.send('sefaz:progresso-listagem', parcial)
        })
        return { ok: true, chaves, total: chaves.length }
      } else {
        const resultado: ResultadoListagem = await listarChaves(cfg, dataInicial, dataFinal)
        return { ok: true, ...resultado }
      }
    } catch (err: unknown) {
      if (err instanceof SefazError) return { ok: false, cStat: err.cStat, xMotivo: err.xMotivo }
      return { ok: false, xMotivo: err instanceof Error ? err.message : 'Erro desconhecido.' }
    } finally {
      if (tmpCriado) limparPfxTemp(pfxPath)
    }
  }
)

// ---------------------------------------------------------------------------
// IPC — NFCeDownloadXML
// ---------------------------------------------------------------------------

ipcMain.handle('sefaz:download-xml', async (_e, config: ConfigCert & { thumbprint?: string }, chave: string) => {
  const { pfxPath, tmpCriado } = await resolverPfx(config).catch(err => { throw err })
  const cfg = { ...config, pfxPath }
  try {
    const resultado: ResultadoDownload = await downloadXml(cfg, chave)
    return { ok: true, ...resultado }
  } catch (err: unknown) {
    if (err instanceof SefazError) return { ok: false, cStat: err.cStat, xMotivo: err.xMotivo }
    return { ok: false, xMotivo: err instanceof Error ? err.message : 'Erro desconhecido.' }
  } finally {
    if (tmpCriado) limparPfxTemp(pfxPath)
  }
})

// ---------------------------------------------------------------------------
// IPC — Download em lote
// ---------------------------------------------------------------------------

ipcMain.handle('sefaz:download-lote', async (_e, config: ConfigCert & { thumbprint?: string }, chaves: string[], pastaSaida: string) => {
  const { pfxPath, tmpCriado } = await resolverPfx(config)
  const cfg = { ...config, pfxPath }
  const resultados: { chave: string; ok: boolean; erro?: string }[] = []

  try {
    for (let i = 0; i < chaves.length; i++) {
      const chave = chaves[i]
      try {
        const resultado = await downloadXml(cfg, chave)
        if (resultado.nfeProc?.nfeXml) {
          fs.writeFileSync(path.join(pastaSaida, `${resultado.nfeProc.nProt}_nfce.xml`), resultado.nfeProc.nfeXml, 'utf-8')
        }
        for (const ev of resultado.eventos) {
          if (ev.eventoXml) fs.writeFileSync(path.join(pastaSaida, `${ev.nProt}_evento.xml`), ev.eventoXml, 'utf-8')
        }
        resultados.push({ chave, ok: true })
      } catch (err: unknown) {
        resultados.push({ chave, ok: false, erro: err instanceof Error ? err.message : 'Erro' })
      }
      mainWindow?.webContents.send('sefaz:progresso-lote', { atual: i + 1, total: chaves.length, chave })
    }
  } finally {
    if (tmpCriado) limparPfxTemp(pfxPath)
  }

  return resultados
})

// ---------------------------------------------------------------------------
// IPC — Utilitários de arquivo
// ---------------------------------------------------------------------------

ipcMain.handle('fs:selecionar-pasta', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Selecionar pasta de destino',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('fs:salvar-xml', async (_e, conteudo: string, nomeArquivo: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Salvar XML',
    defaultPath: nomeArquivo,
    filters: [{ name: 'XML', extensions: ['xml'] }],
  })
  if (result.canceled || !result.filePath) return false
  fs.writeFileSync(result.filePath, conteudo, 'utf-8')
  shell.showItemInFolder(result.filePath)
  return true
})

ipcMain.handle('fs:abrir-pasta', async (_e, caminho: string) => {
  shell.openPath(caminho)
})
