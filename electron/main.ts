import { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } from 'electron'
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
  criarAgente,
  SefazError,
  SefazNetworkError,
  SefazParseError,
  type ConfigCert,
  type ResultadoListagem,
  type ResultadoDownload,
} from './sefaz'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

// ---------------------------------------------------------------------------
// Config store
// ---------------------------------------------------------------------------

type ThemePreference = 'light' | 'dark' | 'system'

interface CertStorePayload {
  pfxPath: string
  thumbprint?: string
  origemStore: boolean
  ambiente: 'homologacao' | 'producao'
}

interface StoreSchema {
  cert?: CertStorePayload
  ui?: {
    theme?: ThemePreference
  }
}

const store = new Store<StoreSchema>()

function readTheme(): ThemePreference {
  const ui = store.get('ui') as { theme?: ThemePreference } | undefined
  const t = ui?.theme
  if (t === 'light' || t === 'dark' || t === 'system') return t
  return 'system'
}

function applyNativeThemeSource(t: ThemePreference) {
  nativeTheme.themeSource = t
}

function windowBackgroundHex(): string {
  const t = readTheme()
  if (t === 'light') return '#f2f4f8'
  if (t === 'dark') return '#0f1117'
  return nativeTheme.shouldUseDarkColors ? '#0f1117' : '#f2f4f8'
}

function updateMainWindowBackground() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  try {
    mainWindow.setBackgroundColor(windowBackgroundHex())
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Janela principal
// ---------------------------------------------------------------------------

let mainWindow: BrowserWindow | null = null
let appEstaOcupada = false
let ignorarConfirmacaoFechamento = false

type RelatorioModo = 'agora' | 'depois' | 'nenhum'

function escapeCsvCell(value: unknown): string {
  const s = value == null ? '' : String(value)
  // Mantém Excel feliz: aspas e separadores
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function gerarComparativoCsv(
  linhas: Array<{ chave: string; dhEmi?: string; nNF?: string; vNF?: string }>
): string {
  const headers = ['Número do documento', 'Data de emissão', 'Valor do cupom']
  const rows = linhas.map((l) => [
    escapeCsvCell(l.nNF ?? ''),
    escapeCsvCell(l.dhEmi ?? ''),
    escapeCsvCell(l.vNF ?? ''),
  ])
  // "sep=;" força o Excel a usar ponto-e-vírgula como delimitador
  // BOM UTF-8 evita caracteres acentuados corrompidos no Windows/Excel.
  return `\uFEFFsep=;\n${[headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n')}`
}

/** Ícone da janela / taskbar: empacotado usa extraResources; em dev usa public/. */
function resolveWindowIcon(): string | undefined {
  if (process.platform === 'darwin') {
    return undefined
  }

  if (app.isPackaged) {
    const res = process.resourcesPath
    if (process.platform === 'win32') {
      const ico = path.join(res, 'icon.ico')
      return fs.existsSync(ico) ? ico : undefined
    }
    const png = path.join(res, 'icon.png')
    return fs.existsSync(png) ? png : undefined
  }

  const root = path.join(__dirname, '..')
  if (process.platform === 'win32') {
    const ico = path.join(root, 'public', 'icon.ico')
    return fs.existsSync(ico) ? ico : undefined
  }
  const png = path.join(root, 'public', 'icon.png')
  return fs.existsSync(png) ? png : undefined
}

function createWindow(): void {
  const icon = resolveWindowIcon()
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: windowBackgroundHex(),
    titleBarStyle: 'hiddenInset',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  const isDev = !app.isPackaged
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000').catch((err) => {
      console.error('[Electron] Falha ao carregar localhost:3000:', err)
    })
    mainWindow.webContents.openDevTools()
  } else {
    const indexPath = path.join(__dirname, '../out/index.html')
    mainWindow.loadFile(indexPath).catch((err) => {
      console.error('[Electron] Falha ao carregar o arquivo principal:', err)
    })
  }

  mainWindow.on('close', (event) => {
    if (!appEstaOcupada || ignorarConfirmacaoFechamento) return

    event.preventDefault()
    const win = mainWindow
    if (!win) return

    const escolha = dialog.showMessageBoxSync(win, {
      type: 'warning',
      title: 'Processo em andamento',
      message: 'Existe uma operação em andamento.',
      detail:
        'Se fechar agora, a busca/download será interrompida e o progresso atual será perdido.\n\nDeseja realmente fechar?',
      buttons: ['Cancelar', 'Fechar mesmo assim'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    })

    if (escolha === 1) {
      ignorarConfirmacaoFechamento = true
      mainWindow?.close()
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })

  // Log erros de render não capturados
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[Electron] Processo de render encerrado:', details)
  })
}

app.whenReady().then(() => {
  applyNativeThemeSource(readTheme())
  nativeTheme.on('updated', () => updateMainWindowBackground())

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Versão do app (package.json) — instalador e electron-builder usam o mesmo campo
ipcMain.handle('app:get-version', () => app.getVersion())
ipcMain.on('app:set-busy', (_e, busy: boolean) => {
  appEstaOcupada = Boolean(busy)
})

ipcMain.handle('ui:get-theme', () => readTheme())

ipcMain.handle('ui:set-theme', (_e, t: ThemePreference) => {
  if (t !== 'light' && t !== 'dark' && t !== 'system') return false
  const existingUi = store.get('ui') as Record<string, unknown> | undefined
  store.set('ui', { ...(existingUi ?? {}), theme: t })
  applyNativeThemeSource(t)
  updateMainWindowBackground()
  return true
})

// Captura exceções não tratadas no processo principal
process.on('uncaughtException', (err) => {
  console.error('[Main] Exceção não capturada:', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[Main] Promise rejeitada não tratada:', reason)
})

// ---------------------------------------------------------------------------
// Helper: janela segura (evita non-null assertion)
// ---------------------------------------------------------------------------

function getWindow(): BrowserWindow {
  if (!mainWindow) throw new Error('Janela principal não está disponível.')
  return mainWindow
}

// ---------------------------------------------------------------------------
// Helper: mensagem de erro amigável
// ---------------------------------------------------------------------------

function mensagemErro(err: unknown): string {
  if (err instanceof SefazError) return `[${err.cStat}] ${err.xMotivo}`
  if (err instanceof SefazNetworkError) return err.message
  if (err instanceof SefazParseError) return `Erro de parse: ${err.message}`
  if (err instanceof Error) return err.message
  return 'Erro desconhecido. Tente novamente.'
}

function respostaErro(err: unknown): Record<string, unknown> {
  if (err instanceof SefazError) return { ok: false, cStat: err.cStat, xMotivo: err.xMotivo }
  return { ok: false, xMotivo: mensagemErro(err) }
}

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

/** Valida que o thumbprint é hex puro — previne injeção de comando */
function validarThumbprint(thumbprint: string): void {
  if (!/^[0-9A-Fa-f]{40}$/.test(thumbprint)) {
    throw new Error(`Thumbprint inválido: "${thumbprint}". Esperado 40 caracteres hexadecimais.`)
  }
}

async function listarCertificadosSistema(): Promise<CertInfo[]> {
  if (process.platform === 'win32') return listarCertsWindows()
  if (process.platform === 'darwin') return listarCertsMac()
  throw new Error('Listagem automática de certificados disponível apenas no Windows e macOS.')
}

// --- Windows (PowerShell) ---

async function listarCertsWindows(): Promise<CertInfo[]> {
  const ps = `
    $certs = Get-ChildItem Cert:\\CurrentUser\\My |
      Where-Object { $_.HasPrivateKey } |
      Select-Object Subject, Thumbprint, NotAfter, Issuer, FriendlyName
    if ($null -eq $certs) { Write-Output '[]'; exit 0 }
    $result = $certs | ConvertTo-Json -Compress
    Write-Output $result
  `.trim()

  let stdout: string
  try {
    const result = await execFileAsync('powershell', [
      '-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps,
    ], { timeout: 15_000 })
    stdout = result.stdout
  } catch (err) {
    throw new Error(
      `Falha ao executar PowerShell para listar certificados. ` +
      `Verifique as permissões de execução do sistema. ` +
      (err instanceof Error ? err.message : '')
    )
  }

  // Extrai apenas o JSON da saída — ignora linhas de aviso do PowerShell
  const jsonMatch = stdout.match(/(\[[\s\S]*\]|\{[\s\S]*\})/)
  if (!jsonMatch) {
    // Nenhum certificado encontrado (stdout vazio ou apenas avisos)
    return []
  }

  let raw: unknown
  try {
    raw = JSON.parse(jsonMatch[0])
  } catch {
    return [] // Se não parsear, retorna vazio em vez de lançar
  }

  const arr = Array.isArray(raw) ? raw : [raw]
  return arr
    .filter((c): c is Record<string, string> => c !== null && typeof c === 'object')
    .map(parseCertWindows)
}

function parseCertWindows(c: Record<string, string>): CertInfo {
  const subject = c.Subject ?? ''
  const thumbprint = (c.Thumbprint ?? '').toUpperCase().replace(/\s/g, '')
  const emissor = c.Issuer ?? ''
  const validade = c.NotAfter ?? ''
  const cn = extrairCampo(subject, 'CN')
  const cnpj = extrairCNPJ(subject)
  const nome = cn || subject

  let expirado = false
  if (validade) {
    try { expirado = new Date(validade) < new Date() } catch { /* mantém false */ }
  }

  return { thumbprint, subject, cnpj, nome, emissor, validade, expirado, origem: 'store' }
}

// --- macOS (security + openssl) ---

async function listarCertsMac(): Promise<CertInfo[]> {
  let stdout: string
  try {
    const result = await execAsync(
      'security find-identity -v -p ssl-client login.keychain',
      { timeout: 10_000 }
    )
    stdout = result.stdout
  } catch {
    return [] // Keychain vazio ou sem permissão — retorna vazio
  }

  const regex = /\d+\)\s+([0-9A-F]{40})\s+"(.+?)"/gi
  const certs: CertInfo[] = []
  let m: RegExpExecArray | null

  while ((m = regex.exec(stdout)) !== null) {
    const thumbprint = m[1].toUpperCase()
    const nome = m[2]
    try {
      const d = await detalhesCertMac(thumbprint)
      certs.push({ thumbprint, subject: nome, cnpj: extrairCNPJ(nome), nome, ...d, origem: 'store' })
    } catch {
      // Detalhe indisponível — inclui o cert com dados parciais
      certs.push({ thumbprint, subject: nome, cnpj: extrairCNPJ(nome), nome, emissor: '', validade: '', expirado: false, origem: 'store' })
    }
  }

  return certs
}

async function detalhesCertMac(
  thumbprint: string
): Promise<{ emissor: string; validade: string; expirado: boolean }> {
  // thumbprint já é hex validado, mas escapamos para segurança
  const safe = thumbprint.replace(/[^0-9A-Fa-f]/g, '')
  const { stdout } = await execAsync(
    `security find-certificate -c "${safe}" -p login.keychain | openssl x509 -noout -issuer -enddate`,
    { timeout: 8_000 }
  )
  const emissor = stdout.match(/issuer=(.+)/)?.[1] ?? ''
  const validade = stdout.match(/notAfter=(.+)/)?.[1] ?? ''
  let expirado = false
  if (validade) {
    try { expirado = new Date(validade) < new Date() } catch { /* mantém false */ }
  }
  return { emissor, validade, expirado }
}

// --- Helpers ---

function extrairCampo(subject: string, campo: string): string {
  const m = subject.match(new RegExp(`(?:^|,\\s*)${campo}=([^,]+)`, 'i'))
  return m?.[1]?.trim() ?? ''
}

function extrairCNPJ(texto: string): string {
  // Formato OID em Subject: OID.2.16.76.1.3.3=12345678000195
  const oidMatch = texto.match(/OID[.\d]+\s*=\s*(\d{14})/i)
  if (oidMatch) return oidMatch[1]

  // Formato formatado: 12.345.678/0001-95
  const formMatch = texto.match(/\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\.\s]?\/?\d{4}[\-\.]?\d{2}/)
  if (formMatch) return formMatch[0].replace(/[.\s/\-]/g, '')

  // CNPJ puro sem formatação (14 dígitos seguidos)
  const rawMatch = texto.match(/\d{14}/)
  if (rawMatch) return rawMatch[0]

  return ''
}

// ---------------------------------------------------------------------------
// Exportação do cert do store para .pfx temporário (para mTLS)
// ---------------------------------------------------------------------------

async function exportarCertWindows(thumbprint: string, senha: string): Promise<string> {
  validarThumbprint(thumbprint)

  const sufixo = Math.random().toString(36).substring(2, 8)
  const tmpPath = path.join(os.tmpdir(), `nfce_${thumbprint.substring(0, 8)}_${sufixo}.pfx`)
  const tmpPathPs = tmpPath.replace(/\\/g, '\\\\')

  // ─── A senha vai por variável de ambiente, nunca embutida no script ───────
  // Isso garante que ela não apareça em logs, stack traces ou mensagens de erro.
  const ps = `
    $ErrorActionPreference = 'Stop'
    try {
      $cert = Get-Item "Cert:\\CurrentUser\\My\\${thumbprint}" -ErrorAction Stop
      $pwd  = ConvertTo-SecureString -String $env:CERT_PASS -Force -AsPlainText
      Export-PfxCertificate -Cert $cert -FilePath "${tmpPathPs}" -Password $pwd -Force -ChainOption BuildChain | Out-Null
      Write-Output "ok"
    } catch {
      # Tenta sem BuildChain (compatibilidade com Windows Server/Home)
      try {
        Export-PfxCertificate -Cert $cert -FilePath "${tmpPathPs}" -Password $pwd -Force | Out-Null
        Write-Output "ok"
      } catch {
        Write-Output "erro: $($_.Exception.Message)"
        exit 1
      }
    }
  `.trim()

  let stdout = ''
  let stderr = ''
  try {
    const result = await execFileAsync(
      'powershell',
      ['-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      {
        timeout: 20_000,
        env: { ...process.env, CERT_PASS: senha }, // senha isolada do script
      }
    )
    stdout = result.stdout ?? ''
    stderr = result.stderr ?? ''
  } catch (err: unknown) {
    // execFileAsync rejeita com exit code != 0
    // err.message contém o comando — NÃO repassamos ele diretamente
    // Em vez disso, extraímos a mensagem limpa que o PS escreveu no stdout
    const saida = (err as { stdout?: string; stderr?: string })
    const msgPS = (saida?.stdout ?? '').match(/^erro:\s*(.+)/mi)?.[1]?.trim()
      ?? (saida?.stderr ?? '').trim()

    // Classifica erros conhecidos em mensagens amigáveis
    const msgFinal = traduzirErroCert(msgPS || '')
    throw new Error(msgFinal)
  }

  // PS retornou exit 0 mas sem "ok" — extrai mensagem se houver
  if (!stdout.trim().startsWith('ok')) {
    const msgPS = stdout.match(/^erro:\s*(.+)/mi)?.[1]?.trim() ?? stderr.trim()
    throw new Error(traduzirErroCert(msgPS || 'Falha desconhecida ao exportar certificado.'))
  }

  try {
    const stat = fs.statSync(tmpPath)
    if (stat.size < 100) throw new Error('Arquivo .pfx exportado parece vazio ou corrompido.')
  } catch (err) {
    if (err instanceof Error && err.message.includes('vazio')) throw err
    throw new Error('Certificado exportado mas não foi possível verificar o arquivo gerado.')
  }

  return tmpPath
}

/**
 * Traduz mensagens de erro do PowerShell/Windows para português amigável,
 * sem expor detalhes técnicos ou a senha do usuário.
 */
function traduzirErroCert(msg: string): string {
  const m = msg.toLowerCase()

  if (m.includes('não exportável') || m.includes('not exportable') || m.includes('exportable')) {
    return (
      'O certificado não pode ser exportado.\n' +
      'Ao instalar o e-CNPJ, a opção "Marcar esta chave como exportável" não foi marcada.\n' +
      'Reinstale o certificado com essa opção ativada, ou use o modo "Arquivo .pfx".'
    )
  }
  if (m.includes('senha') || m.includes('password') || m.includes('mac') || m.includes('incorrect')) {
    return 'Senha do certificado incorreta. Verifique e tente novamente.'
  }
  if (m.includes('não encontrado') || m.includes('not found') || m.includes('cannot find')) {
    return 'Certificado não encontrado no repositório. Selecione novamente na lista.'
  }
  if (m.includes('acesso negado') || m.includes('access denied') || m.includes('unauthorized')) {
    return 'Acesso negado ao certificado. Execute o app como o mesmo usuário que instalou o e-CNPJ.'
  }
  if (m.includes('timeout') || m.includes('timed out')) {
    return 'Tempo limite excedido ao exportar o certificado. Tente novamente.'
  }

  // Mensagem técnica sem informações sensíveis
  return 'Falha ao exportar o certificado. Verifique se o e-CNPJ está instalado corretamente e tente novamente.'
}

function limparPfxTemp(pfxPath: string): void {
  if (!pfxPath) return
  try {
    // Só apaga arquivos que estejam na pasta temp — evita apagar coisas erradas
    const tempDir = os.tmpdir()
    if (pfxPath.startsWith(tempDir) && fs.existsSync(pfxPath)) {
      fs.unlinkSync(pfxPath)
    }
  } catch (err) {
    console.warn('[Main] Falha ao apagar .pfx temporário:', err)
  }
}

/**
 * Valida a senha do .pfx tentando abrir com o módulo crypto nativo do Node.
 * Lança erro com mensagem clara se a senha estiver errada.
 */
function validarSenhaPfx(pfxPath: string, senha: string): void {
  const { createPrivateKey } = require('crypto') as typeof import('crypto')
  const pfxBuffer = fs.readFileSync(pfxPath)
  try {
    // createPrivateKey com PFX valida a senha imediatamente
    createPrivateKey({ key: pfxBuffer, format: 'der', type: 'pkcs8', passphrase: senha })
  } catch {
    // Tenta com pkcs12 via outro método — o Node não tem API direta para pkcs12,
    // então usamos https.Agent que valida no constructor
    try {
      const https = require('https') as typeof import('https')
      new https.Agent({ pfx: pfxBuffer, passphrase: senha })
    } catch (err2: unknown) {
      const msg = err2 instanceof Error ? err2.message.toLowerCase() : ''
      if (msg.includes('mac') || msg.includes('password') || msg.includes('decrypt') || msg.includes('bad')) {
        throw new Error('Senha incorreta. Verifique a senha do certificado e tente novamente.')
      }
      throw new Error(`Não foi possível validar o certificado: ${err2 instanceof Error ? err2.message : 'erro desconhecido'}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Utilitário: resolve pfxPath — exporta do store se necessário
// ---------------------------------------------------------------------------

async function resolverPfx(
  config: ConfigCert & { thumbprint?: string }
): Promise<{ pfxPath: string; tmpCriado: boolean; senha: string }> {
  if (config.thumbprint && process.platform === 'win32') {
    // No modo store, a senha não vem do usuário — criamos um placeholder
    const senhaExport = config.senha || `nfce_tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const pfxPath = await exportarCertWindows(config.thumbprint, senhaExport)
    return { pfxPath, tmpCriado: true, senha: senhaExport }
  }

  if (!config.pfxPath) {
    throw new Error('Nenhum certificado configurado. Configure um e-CNPJ na aba Certificado.')
  }

  if (!fs.existsSync(config.pfxPath)) {
    throw new Error(`Arquivo de certificado não encontrado: "${config.pfxPath}". Reconfigure o certificado.`)
  }

  return { pfxPath: config.pfxPath, tmpCriado: false, senha: config.senha }
}


// ---------------------------------------------------------------------------
// Utilitário: extrai CNPJ do certificado para distinguir filiais na UI
// ---------------------------------------------------------------------------

async function obterCNPJDoCertificado(
  config: { thumbprint?: string; pfxPath?: string; origemStore?: boolean }
): Promise<string> {
  try {
    if (config.thumbprint && config.origemStore) {
      const certs = await listarCertificadosSistema()
      const cert = certs.find(c =>
        c.thumbprint.toUpperCase() === (config.thumbprint ?? '').toUpperCase()
      )
      return cert?.cnpj ?? ''
    }
    if (config.pfxPath) {
      // Tenta extrair via OpenSSL se disponível
      try {
        const passFile = path.join(os.tmpdir(), `nfce_cnpj_${Date.now()}.txt`)
        const pfxEsc = config.pfxPath.replace(/\\/g, '/')
        const passEsc = passFile.replace(/\\/g, '/')
        // Usa senha vazia se não disponível (modo store)
        fs.writeFileSync(passFile, '', { mode: 0o600 })
        try {
          const cmd = process.platform === 'win32'
            ? `openssl pkcs12 -in "${pfxEsc}" -clcerts -nokeys -passin file:"${passEsc}" 2>nul | openssl x509 -noout -subject`
            : `openssl pkcs12 -in "${pfxEsc}" -clcerts -nokeys -passin file:"${passEsc}" 2>/dev/null | openssl x509 -noout -subject`
          const { stdout } = await execAsync(cmd, { timeout: 8_000 })
          return extrairCNPJ(stdout || '')
        } finally {
          try { fs.unlinkSync(passFile) } catch { /* ignora */ }
        }
      } catch {
        // OpenSSL não disponível ou falhou — retorna vazio
        return ''
      }
    }
    return ''
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------------------
// IPC — Enumeração e teste do certificado do sistema
// ---------------------------------------------------------------------------

ipcMain.handle('cert:listar-sistema', async () => {
  try {
    const certs = await listarCertificadosSistema()
    return { ok: true, certs }
  } catch (err: unknown) {
    return { ok: false, erro: mensagemErro(err) }
  }
})

ipcMain.handle('cert:testar-store', async (_e, thumbprint: string, senha: string) => {
  let tmpPath: string | null = null
  try {
    validarThumbprint(thumbprint)
    // No modo repositório, a senha não é necessária — o certificado é acessado pelo Windows.
    // Usamos senha placeholder para exportar o .pfx temporário (exigência do formato).
    const senhaExport = senha || `nfce_tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`

    if (process.platform === 'win32') {
      tmpPath = await exportarCertWindows(thumbprint, senhaExport)
      // Valida que o .pfx exportado abre corretamente
      validarSenhaPfx(tmpPath, senhaExport)
    }
    return { ok: true, mensagem: 'Certificado validado com sucesso.' }
  } catch (err: unknown) {
    return { ok: false, mensagem: mensagemErro(err) }
  } finally {
    if (tmpPath) limparPfxTemp(tmpPath)
  }
})

// ---------------------------------------------------------------------------
// IPC — Configuração manual (.pfx)
// ---------------------------------------------------------------------------

ipcMain.handle('cert:selecionar-arquivo', async () => {
  try {
    const win = getWindow()
    const result = await dialog.showOpenDialog(win, {
      title: 'Selecionar certificado digital (.pfx / .p12)',
      filters: [
        { name: 'Certificado Digital', extensions: ['pfx', 'p12'] },
        { name: 'Todos os arquivos', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  } catch {
    return null
  }
})

ipcMain.handle('cert:salvar-config', async (_e, config: CertStorePayload) => {
  try {
    store.set('cert', config)
    return true
  } catch (err) {
    console.error('[Main] Falha ao salvar configuração:', err)
    return false
  }
})

ipcMain.handle('cert:carregar-config', async () => {
  try {
    return store.has("cert") ? store.get("cert") : null
  } catch {
    return null
  }
})

ipcMain.handle('cert:testar', async (_e, pfxPath: string, senha: string) => {
  try {
    if (!pfxPath) throw new Error('Nenhum arquivo selecionado.')
    if (!fs.existsSync(pfxPath)) throw new Error(`Arquivo não encontrado: "${pfxPath}"`)
    const pfxBuffer = fs.readFileSync(pfxPath)
    if (!pfxBuffer || pfxBuffer.length < 100) throw new Error('Arquivo vazio ou inválido.')
    if (!senha) throw new Error('Informe a senha do certificado.')
    // Valida a senha de verdade tentando abrir o PFX com crypto
    validarSenhaPfx(pfxPath, senha)
    return { ok: true, mensagem: 'Certificado e senha validados com sucesso.' }
  } catch (err: unknown) {
    return { ok: false, mensagem: mensagemErro(err) }
  }
})

// ---------------------------------------------------------------------------
// IPC — NFCeListagemChaves
// ---------------------------------------------------------------------------

ipcMain.handle(
  'sefaz:listar-chaves',
  async (
    _e,
    config: ConfigCert & { thumbprint?: string },
    dataInicial: string,
    dataFinal: string | undefined,
    paginacaoAuto: boolean
  ) => {
    let pfxPath = ''
    let tmpCriado = false

    try {
      // Resolve o certificado — lança erro explícito se não configurado
      const resolved = await resolverPfx(config)
      pfxPath = resolved.pfxPath
      tmpCriado = resolved.tmpCriado

      const cfg = { ...config, pfxPath, senha: resolved.senha }

      // CNPJ da matriz (do certificado) — necessário para o filtro de filiais na UI
      const cnpj = await obterCNPJDoCertificado(config)

      if (paginacaoAuto) {
        const chaves = await listarTodasChaves(cfg, dataInicial, dataFinal, (parcial) => {
          mainWindow?.webContents.send('sefaz:progresso-listagem', parcial)
        })
        return { ok: true, chaves, total: chaves.length, cnpj }
      } else {
        const resultado: ResultadoListagem = await listarChaves(cfg, dataInicial, dataFinal)
        return { ok: true, ...resultado, cnpj }
      }
    } catch (err: unknown) {
      return respostaErro(err)
    } finally {
      if (tmpCriado && pfxPath) limparPfxTemp(pfxPath)
    }
  }
)

// ---------------------------------------------------------------------------
// IPC — NFCeDownloadXML
// ---------------------------------------------------------------------------

ipcMain.handle(
  'sefaz:download-xml',
  async (_e, config: ConfigCert & { thumbprint?: string }, chave: string) => {
    let pfxPath = ''
    let tmpCriado = false

    try {
      const resolved = await resolverPfx(config)
      pfxPath = resolved.pfxPath
      tmpCriado = resolved.tmpCriado

      const resultado: ResultadoDownload = await downloadXml({ ...config, pfxPath, senha: resolved.senha }, chave)
      return { ok: true, ...resultado }
    } catch (err: unknown) {
      return respostaErro(err)
    } finally {
      if (tmpCriado && pfxPath) limparPfxTemp(pfxPath)
    }
  }
)

// ---------------------------------------------------------------------------
// IPC — Download em lote
// ---------------------------------------------------------------------------

ipcMain.handle(
  'sefaz:download-lote',
  async (
    _e,
    config: ConfigCert & { thumbprint?: string },
    chaves: string[],
    pastaSaida: string,
    relatorioModo: RelatorioModo = 'nenhum'
  ) => {
    let pfxPath = ''
    let tmpCriado = false
    const resultados: { chave: string; ok: boolean; erro?: string }[] = []
    const relatorioLinhas: Array<{ chave: string; dhEmi?: string; nNF?: string; vNF?: string }> = []
    let relatorioFalhas = 0

    // Valida a pasta de saída antes de começar
    try {
      if (!pastaSaida) throw new Error('Pasta de saída não informada.')
      fs.mkdirSync(pastaSaida, { recursive: true })
    } catch (err) {
      return { ok: false, xMotivo: `Pasta de saída inválida: ${mensagemErro(err)}`, resultados: [] }
    }

    try {
      const resolved = await resolverPfx(config)
      pfxPath = resolved.pfxPath
      tmpCriado = resolved.tmpCriado

      const cfg = { ...config, pfxPath, senha: resolved.senha }

      // Cria o agente UMA vez e reutiliza em todo o lote.
      // Evita overhead de TLS handshake a cada download e mantém
      // o pool de conexões estável durante a operação inteira.
      const agente = criarAgente(cfg.pfxPath, cfg.senha)

      const MAX_TENTATIVAS = 3
      const DELAY_ENTRE_DOWNLOADS = 300   // ms — evita rate-limit da SEFAZ
      const DELAY_RETRY_BASE = 2000  // ms — backoff base no retry

      for (let i = 0; i < chaves.length; i++) {
        const chave = chaves[i]
        let tentativa = 0
        let baixado = false

        while (tentativa < MAX_TENTATIVAS && !baixado) {
          try {
            // Espera exponencial antes de cada retry (não antes do primeiro)
            if (tentativa > 0) {
              const espera = DELAY_RETRY_BASE * tentativa
              console.log(`[Lote] Retry ${tentativa}/${MAX_TENTATIVAS - 1} chave=${chave} aguardando ${espera}ms`)
              await new Promise(r => setTimeout(r, espera))
            }

            const resultado = await downloadXml(cfg, chave, agente)

            if (resultado.nfeProc?.nfeXml) {
              const nome = path.join(pastaSaida, `${resultado.nfeProc.nProt}_nfce.xml`)
              try {
                fs.writeFileSync(nome, resultado.nfeProc.nfeXml, 'utf-8')
              } catch (e) {
                throw new Error(`Falha ao salvar XML da NFC-e: ${mensagemErro(e)}`)
              }

              if (resultado.nfeProc.nNF && resultado.nfeProc.vNF) {
                relatorioLinhas.push({
                  chave,
                  dhEmi: resultado.nfeProc.dhEmi,
                  nNF: resultado.nfeProc.nNF,
                  vNF: resultado.nfeProc.vNF,
                })
              } else {
                relatorioFalhas++
              }
            }

            for (const ev of resultado.eventos) {
              if (ev.eventoXml) {
                const nome = path.join(pastaSaida, `${ev.nProt}_evento.xml`)
                try {
                  fs.writeFileSync(nome, ev.eventoXml, 'utf-8')
                } catch (e) {
                  throw new Error(`Falha ao salvar XML de evento: ${mensagemErro(e)}`)
                }
              }
            }

            resultados.push({ chave, ok: true })
            baixado = true

          } catch (err: unknown) {
            tentativa++
            const msg = mensagemErro(err)
            if (tentativa >= MAX_TENTATIVAS) {
              console.error(`[Lote] Falhou após ${MAX_TENTATIVAS} tentativas: chave=${chave} erro=${msg}`)
              resultados.push({ chave, ok: false, erro: msg })
            } else {
              console.warn(`[Lote] Tentativa ${tentativa} falhou chave=${chave}: ${msg}`)
            }
          }
        }

        mainWindow?.webContents.send('sefaz:progresso-lote', {
          atual: i + 1,
          total: chaves.length,
          chave,
          ok: baixado,
        })

        // Pequena pausa entre downloads para não sobrecarregar a SEFAZ
        if (i < chaves.length - 1) {
          await new Promise(r => setTimeout(r, DELAY_ENTRE_DOWNLOADS))
        }
      }

      const falhas = resultados.filter(r => !r.ok)
      if (falhas.length > 0) {
        console.warn(`[Lote] Concluído: ${chaves.length - falhas.length} OK, ${falhas.length} falha(s)`)
      }
      if (relatorioModo === 'agora') {
        const csv = gerarComparativoCsv(relatorioLinhas)
        const arquivo = path.join(pastaSaida, 'comparativo_nfce.csv')
        fs.writeFileSync(arquivo, csv, 'utf-8')
        return {
          ok: true,
          resultados,
          relatorio: { arquivo: 'comparativo_nfce.csv', gerados: relatorioLinhas.length, falhas: relatorioFalhas },
        }
      }

      return { ok: true, resultados }

    } catch (err: unknown) {
      return { ok: false, xMotivo: mensagemErro(err), resultados }
    } finally {
      if (tmpCriado && pfxPath) limparPfxTemp(pfxPath)
    }
  }
)

// ---------------------------------------------------------------------------
// IPC — Utilitários de arquivo
// ---------------------------------------------------------------------------

ipcMain.handle('fs:selecionar-pasta', async () => {
  try {
    const win = getWindow()
    const result = await dialog.showOpenDialog(win, {
      title: 'Selecionar pasta de destino',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  } catch {
    return null
  }
})

ipcMain.handle('fs:salvar-xml', async (_e, conteudo: string, nomeArquivo: string) => {
  try {
    const win = getWindow()
    const result = await dialog.showSaveDialog(win, {
      title: 'Salvar XML',
      defaultPath: nomeArquivo,
      filters: [{ name: 'XML', extensions: ['xml'] }],
    })
    if (result.canceled || !result.filePath) return false

    fs.writeFileSync(result.filePath, conteudo, 'utf-8')
    shell.showItemInFolder(result.filePath)
    return true
  } catch (err) {
    console.error('[Main] Falha ao salvar XML:', err)
    return false
  }
})

ipcMain.handle('fs:abrir-pasta', async (_e, caminho: string) => {
  try {
    await shell.openPath(caminho)
  } catch (err) {
    console.warn('[Main] Falha ao abrir pasta:', err)
  }
})

// ---------------------------------------------------------------------------
// IPC — Relatório interno (CSV comparativo)
// ---------------------------------------------------------------------------

function extrairRelatorioDoXml(xmlStr: string): { dhEmi?: string; nNF?: string; vNF?: string } {
  const nNF = xmlStr.match(/<nNF>([^<]+)<\/nNF>/)?.[1]?.trim()
  const vNF = xmlStr.match(/<vNF>([^<]+)<\/vNF>/)?.[1]?.trim()
  const dhEmi = xmlStr.match(/<dhEmi>([^<]+)<\/dhEmi>/)?.[1]?.trim()
  return { dhEmi, nNF, vNF }
}

ipcMain.handle('relatorio:comparativo-csv', async (_e, pastaSaida: string) => {
  try {
    if (!pastaSaida) throw new Error('Pasta de destino não informada.')
    if (!fs.existsSync(pastaSaida)) throw new Error('Pasta de destino não encontrada.')

    const entries = fs.readdirSync(pastaSaida)
    const xmlArquivos = entries.filter((f) => /_nfce\.xml$/i.test(f))

    const linhas: Array<{ chave: string; dhEmi?: string; nNF?: string; vNF?: string }> = []
    let falhas = 0

    for (const arquivo of xmlArquivos) {
      const full = path.join(pastaSaida, arquivo)
      let conteudo = ''
      try {
        conteudo = fs.readFileSync(full, 'utf-8')
      } catch {
        falhas++
        continue
      }

      const { dhEmi, nNF, vNF } = extrairRelatorioDoXml(conteudo)
      if (nNF && vNF) {
        linhas.push({ chave: arquivo.replace(/_nfce\.xml$/i, ''), dhEmi, nNF, vNF })
      } else {
        falhas++
      }
    }

    const csv = gerarComparativoCsv(linhas)
    const destino = path.join(pastaSaida, 'comparativo_nfce.csv')
    fs.writeFileSync(destino, csv, 'utf-8')

    return {
      ok: true,
      arquivo: 'comparativo_nfce.csv',
      gerados: linhas.length,
      falhas,
    }
  } catch (err: unknown) {
    return {
      ok: false,
      xMotivo: mensagemErro(err),
    }
  }
})

ipcMain.handle('relatorio:listar-xmls', async (_e, pastaSaida: string) => {
  try {
    if (!pastaSaida) throw new Error('Pasta de destino não informada.')
    if (!fs.existsSync(pastaSaida)) throw new Error('Pasta de destino não encontrada.')

    const entries = fs.readdirSync(pastaSaida)
    const xmlArquivos = entries
      .filter((f) => /_nfce\.xml$/i.test(f))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))

    return {
      ok: true,
      total: xmlArquivos.length,
      arquivos: xmlArquivos,
    }
  } catch (err: unknown) {
    return {
      ok: false,
      total: 0,
      arquivos: [] as string[],
      xMotivo: mensagemErro(err),
    }
  }
})