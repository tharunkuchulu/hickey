/**
 * Auto-update with a visible state. Until v0.3.1 the counter only ever saw "Version X is downloading; it
 * installs when the app closes" — whether the download was running, finished or failing — and the
 * install-on-quit hook only existed after a *complete* download in the *same* run, so every relaunch by the
 * staff restarted the 114 MB download from zero. Now:
 *   - every updater event is logged to hickey.log and mirrored to the renderer as `event:update`;
 *   - "Restart to update" installs silently (`/S --force-run`) and the app comes back by itself;
 *   - a downloaded update installs on its own at the first quiet moment (no touch, no bill for a while and an
 *     empty cart — the renderer confirms the cart), so nobody at the cafe has to know what an update is;
 *   - install-on-quit stays as the fallback.
 */
import { app, BrowserWindow, powerMonitor } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import type { UpdateStatusDto } from '../ipc/contract'
import * as alerts from './alerts'
import { log, updaterLogger } from './log'
import { noteAppState } from './sync'

const FIRST_CHECK_MS = 15_000
const CHECK_EVERY_MS = 6 * 60 * 60_000
const RETRY_AFTER_ERROR_MS = 10 * 60_000
/** Quiet moment = this long without any keyboard/mouse input and without a bill. */
const IDLE_INSTALL_MS = 10 * 60_000
const PROBE_EVERY_MS = 60_000

let status: UpdateStatusDto = { state: 'idle', current: '0.0.0', at: new Date().toISOString(), lastCheckedAt: null, message: '' }
let lastBroadcast = 0
let retryTimer: NodeJS.Timeout | null = null
let lastOrderAt: () => number = () => 0
let enabled = false

function describe(s: UpdateStatusDto): string {
  switch (s.state) {
    case 'idle':
      return enabled ? `Version ${s.current}` : 'Updates only work in the installed app'
    case 'checking':
      return 'Checking for updates…'
    case 'up_to_date':
      return `You have the latest version (${s.current})`
    case 'downloading': {
      const mb = s.total ? ` of ${Math.round(s.total / 1048576)} MB` : ''
      return `Downloading ${s.version} — ${s.percent}%${mb}. Keep the app open; it installs by itself when the counter is quiet.`
    }
    case 'downloaded':
      return `${s.version} is downloaded — it installs when the counter is quiet, or tap Restart to update.`
    case 'error':
      return `Update download failed: ${s.error}. Retries in 10 minutes; tap Check Updates to retry now.`
  }
}

/** Four words for the cloud/dashboard: "up to date", "downloading 43%", "0.3.4 ready", "error: no internet". */
function shortState(s: UpdateStatusDto): string {
  switch (s.state) {
    case 'downloading':
      return `downloading ${s.percent}%`
    case 'downloaded':
      return `${s.version} ready`
    case 'error':
      return `error: ${s.error}`
    case 'checking':
      return 'checking'
    case 'up_to_date':
      return 'up to date'
    default:
      return enabled ? 'idle' : 'dev build'
  }
}

/** Plain words for the errors electron-updater throws. */
function friendly(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err)
  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|net::ERR|socket hang up|fetch failed/i.test(m)) return 'no internet / GitHub unreachable'
  if (/404|Cannot find|HttpError: 404/i.test(m)) return 'no release found on GitHub'
  if (/sha512|checksum|corrupt/i.test(m)) return 'downloaded file was corrupted (will download again)'
  if (/EPERM|EACCES|EBUSY/i.test(m)) return 'Windows blocked writing the update file'
  return m.slice(0, 160)
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
type StatePatch = DistributiveOmit<UpdateStatusDto, 'current' | 'at' | 'message' | 'lastCheckedAt'> & { lastCheckedAt?: string | null }

function set(next: StatePatch, force = true): void {
  const merged = { ...next, current: app.getVersion(), at: new Date().toISOString(), lastCheckedAt: next.lastCheckedAt ?? status.lastCheckedAt } as UpdateStatusDto
  status = { ...merged, message: describe(merged) }
  // The owner dashboard shows this, so a rollout that is stuck is visible without going to the cafe.
  noteAppState({ version: app.getVersion(), updateState: shortState(status) })
  const now = Date.now()
  if (!force && now - lastBroadcast < 500) return
  lastBroadcast = now
  broadcast()
}

function broadcast(extra: Record<string, unknown> = {}): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('event:update', { ...status, ...extra })
}

export function getUpdateStatus(): UpdateStatusDto {
  return { ...status, current: app.getVersion(), message: describe(status) }
}

export function initUpdater(opts: { lastOrderAt: () => number }): void {
  lastOrderAt = opts.lastOrderAt
  enabled = app.isPackaged
  set({ state: 'idle' })
  if (!enabled) return

  autoUpdater.logger = updaterLogger()
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    if (status.state === 'downloading' || status.state === 'downloaded') return
    set({ state: 'checking' })
  })
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    log.info('updater', `found ${info.version} (running ${app.getVersion()})`)
    alerts.clearUpdate()
    set({ state: 'downloading', version: info.version, percent: 0, transferred: 0, total: info.files?.[0]?.size ?? null, bps: 0, lastCheckedAt: new Date().toISOString() })
  })
  autoUpdater.on('update-not-available', () => {
    alerts.clearUpdate()
    set({ state: 'up_to_date', lastCheckedAt: new Date().toISOString() })
  })
  let lastLoggedPct = -10
  autoUpdater.on('download-progress', (p) => {
    const pct = Math.floor(p.percent)
    if (pct >= lastLoggedPct + 10) {
      lastLoggedPct = pct
      log.info('updater', `download ${pct}% (${Math.round(p.transferred / 1048576)} / ${Math.round(p.total / 1048576)} MB)`)
    }
    const version = status.state === 'downloading' ? status.version : (status as { version?: string }).version ?? '?'
    set({ state: 'downloading', version, percent: pct, transferred: p.transferred, total: p.total, bps: p.bytesPerSecond }, pct !== (status as { percent?: number }).percent)
  })
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    log.info('updater', `downloaded ${info.version}; installs when quiet or on quit`)
    lastLoggedPct = -10
    set({ state: 'downloaded', version: info.version })
    alerts.setUpdateReady(info.version)
  })
  autoUpdater.on('error', (err) => {
    const msg = friendly(err)
    log.error('updater', `error: ${msg}`, err)
    const version = (status as { version?: string }).version
    set({ state: 'error', version, error: msg, lastCheckedAt: new Date().toISOString() })
    alerts.setUpdateFailed(msg)
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = setTimeout(() => void checkNow(), RETRY_AFTER_ERROR_MS)
  })
  app.on('before-quit', () => {
    if (status.state === 'downloading') log.warn('updater', `quitting at ${status.percent}% — the download restarts on the next launch`)
  })

  setTimeout(() => void checkNow(), FIRST_CHECK_MS)
  setInterval(() => void checkNow(), CHECK_EVERY_MS)
  setInterval(probeIdle, PROBE_EVERY_MS)
}

/** Never throws: returns the status the screen should show. */
export async function checkNow(): Promise<UpdateStatusDto> {
  if (!enabled) return getUpdateStatus()
  if (status.state === 'downloading' || status.state === 'downloaded' || status.state === 'checking') return getUpdateStatus()
  try {
    const r = await autoUpdater.checkForUpdates()
    if (r?.downloadPromise) {
      // A complete installer already in the cache is re-validated without downloading: give it a moment
      // so the answer is "downloaded", not "downloading 0%".
      await Promise.race([r.downloadPromise.catch(() => undefined), new Promise((res) => setTimeout(res, 2_500))])
    }
  } catch (err) {
    // The 'error' listener has already recorded it.
    log.warn('updater', 'checkForUpdates threw', err)
  }
  return getUpdateStatus()
}

/** Silent install + relaunch. Only when a download has finished. */
export function installNow(reason: 'tap' | 'idle'): { ok: boolean; message: string } {
  if (status.state !== 'downloaded') return { ok: false, message: status.state === 'downloading' ? 'Still downloading — wait for it to finish.' : 'No update is ready to install.' }
  log.info('updater', `installing ${status.version} (${reason}); app restarts by itself`)
  setTimeout(() => autoUpdater.quitAndInstall(true, true), 300)
  return { ok: true, message: `Installing ${status.version}… the app restarts in about a minute.` }
}

/**
 * Quiet-moment check, once a minute while an update is downloaded: no input for 10 min, no bill for 10 min.
 * The renderer gets the final say (an unsent cart vetoes) and calls update:install itself.
 */
function probeIdle(): void {
  if (status.state !== 'downloaded') return
  const idleMs = powerMonitor.getSystemIdleTime() * 1000
  const sinceOrder = Date.now() - lastOrderAt()
  if (idleMs < IDLE_INSTALL_MS || sinceOrder < IDLE_INSTALL_MS) return
  log.info('updater', `counter quiet (idle ${Math.round(idleMs / 60_000)} min, last bill ${Math.round(sinceOrder / 60_000)} min ago) — asking the screen to install`)
  broadcast({ autoInstall: true })
}
