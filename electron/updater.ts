import { BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'

type SendFn = (channel: string, payload: unknown) => void

function createSender(getWindow: () => BrowserWindow | null): SendFn {
  return (channel, payload) => {
    const w = getWindow()
    if (!w || w.isDestroyed()) return
    w.webContents.send(channel, payload)
  }
}

function releaseNotesToString(notes: unknown): string {
  if (notes == null) return ''
  if (typeof notes === 'string') return notes
  if (Array.isArray(notes)) {
    return notes
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'note' in item) {
          return String((item as { note?: string }).note ?? '')
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return String(notes)
}

let ipcRegistered = false
let listenersAttached = false

/**
 * IPC sempre registrado (em dev retorna `skipped` / noop) para o preload não falhar.
 */
export function registerUpdaterIpc(isPackaged: boolean): void {
  if (ipcRegistered) return
  ipcRegistered = true

  ipcMain.handle('updater:check', async () => {
    if (!isPackaged) return { ok: true as const, skipped: true as const }
    try {
      const r = await autoUpdater.checkForUpdates()
      return { ok: true as const, updateInfo: r?.updateInfo ? { version: r.updateInfo.version } : undefined }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { ok: false as const, message }
    }
  })

  ipcMain.handle('updater:download', async () => {
    if (!isPackaged) return { ok: false as const, message: 'Atualização só no app instalado.' }
    try {
      await autoUpdater.downloadUpdate()
      return { ok: true as const }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { ok: false as const, message }
    }
  })

  ipcMain.handle('updater:install', () => {
    if (!isPackaged) return false
    autoUpdater.quitAndInstall(false, true)
    return true
  })
}

/**
 * Eventos do electron-updater → renderer (somente build empacotado).
 */
export function attachUpdaterListeners(isPackaged: boolean, getWindow: () => BrowserWindow | null): void {
  if (!isPackaged || listenersAttached) return
  listenersAttached = true

  const send = createSender(getWindow)

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('update-available', (info) => {
    send('updater:update-available', {
      version: info.version,
      releaseNotes: releaseNotesToString(info.releaseNotes),
    })
  })

  autoUpdater.on('update-not-available', () => {
    send('updater:update-not-available', {})
  })

  autoUpdater.on('download-progress', (p) => {
    send('updater:download-progress', {
      percent: p.percent,
      transferred: p.transferred,
      total: p.total,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    send('updater:update-downloaded', { version: info.version })
  })

  autoUpdater.on('error', (err) => {
    send('updater:error', { message: err.message ?? String(err) })
  })
}

/** Primeira checagem após abrir o app (não bloqueia cold start). */
export function scheduleInitialUpdateCheck(isPackaged: boolean, delayMs = 5000): void {
  if (!isPackaged) return
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn('[updater] checkForUpdates:', err instanceof Error ? err.message : err)
    })
  }, delayMs)
}
