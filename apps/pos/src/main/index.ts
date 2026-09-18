import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { closeDatabase, initDatabase } from './db'
import { loadSettings, registerIpcHandlers } from './ipc/handlers'
import { scheduleDailyBackup } from './services/backup'
import { initSync } from './services/sync'
import { initAlerts } from './services/alerts'
import { currentBusinessDate } from './services/day'
import { installProcessLogging, log } from './services/log'
import { lastOrderActivityAt } from './services/orders'
import { initUpdater } from './services/updater'

// Fixed data folder (%APPDATA%\hickey-pos) so backups/restore docs never depend on the package name.
app.setPath('userData', join(app.getPath('appData'), 'hickey-pos'))

// The POS terminal has an Intel HD 4000; if the UI flickers, disable GPU compositing.
if (process.env.HICKEY_DISABLE_GPU === '1' || process.argv.includes('--disable-gpu')) app.disableHardwareAcceleration()

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f3f4f6',
    title: 'Hickey POS',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  win.once('ready-to-show', () => {
    win.show()
    if (app.isPackaged) win.maximize()
  })

  // Never navigate the POS window away; open external links in the OS browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

// Only one POS instance per machine.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.hickey.pos')
    installProcessLogging()
    log.info('app', `start ${app.getVersion()} (${app.isPackaged ? 'installed' : 'dev'})${process.argv.length > 1 ? ' args ' + process.argv.slice(1).join(' ') : ''}`)
    initDatabase()
    registerIpcHandlers()
    createWindow()
    initSync(loadSettings)
    initAlerts(loadSettings)
    scheduleDailyBackup(
      () => loadSettings().billing.dayStartMinutes,
      (bd) => currentBusinessDate(loadSettings()) === bd
    )

    // Counter PCs get the app back automatically after a reboot / power cut.
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true, name: 'Hickey POS' })
    // Updates come from GitHub Releases (electron-builder publish config): services/updater.ts.
    initUpdater({ lastOrderAt: lastOrderActivityAt })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => app.quit())
  // `will-quit` also fires on the updater's quitAndInstall, where `window-all-closed` is skipped.
  app.on('will-quit', () => {
    log.info('app', 'quitting')
    closeDatabase()
  })
}
