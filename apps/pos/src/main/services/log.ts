/**
 * Plain-file log for the counter: `%APPDATA%\hickey-pos\logs\hickey.log`. A packaged Windows app has no
 * console, so until v0.3.1 an updater or sync failure left no trace anywhere. Synchronous appends, one
 * rotation (hickey.log.1) above 2 MB, never throws — logging must not be able to break billing.
 */
import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const MAX_BYTES = 2 * 1024 * 1024
let dir: string | null = null

export function logDir(): string {
  if (!dir) dir = join(app.getPath('userData'), 'logs')
  return dir
}

export function logFile(): string {
  return join(logDir(), 'hickey.log')
}

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function write(level: 'INFO' | 'WARN' | 'ERROR', tag: string, msg: string, err?: unknown): void {
  try {
    const file = logFile()
    if (!existsSync(logDir())) mkdirSync(logDir(), { recursive: true })
    try {
      if (existsSync(file) && statSync(file).size > MAX_BYTES) renameSync(file, `${file}.1`)
    } catch {}
    let line = `${stamp()} ${level.padEnd(5)} [${tag}] ${msg}`
    if (err !== undefined) line += ` — ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`
    appendFileSync(file, line + '\n')
  } catch (e) {
    // The data folder is unwritable for some reason: keep the line somewhere rather than nowhere.
    try {
      appendFileSync(join(tmpdir(), 'hickey-pos-fallback.log'), `${stamp()} ${level} [${tag}] ${msg} [primary log failed: ${e instanceof Error ? e.message : String(e)}]\n`)
    } catch {}
  }
  if (!app.isPackaged) (level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log)(`[${tag}] ${msg}`, err ?? '')
}

export const log = {
  info: (tag: string, msg: string) => write('INFO', tag, msg),
  warn: (tag: string, msg: string, err?: unknown) => write('WARN', tag, msg, err),
  error: (tag: string, msg: string, err?: unknown) => write('ERROR', tag, msg, err)
}

/** electron-updater's `logger` shape. */
export function updaterLogger() {
  const fmt = (args: unknown[]) => args.map((a) => (a instanceof Error ? (a.stack ?? a.message) : typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
  return {
    info: (...a: unknown[]) => log.info('updater', fmt(a)),
    warn: (...a: unknown[]) => log.warn('updater', fmt(a)),
    error: (...a: unknown[]) => log.error('updater', fmt(a)),
    debug: (...a: unknown[]) => log.info('updater', fmt(a))
  }
}

/** Crashes in main used to vanish with the console; keep them. */
export function installProcessLogging(): void {
  process.on('uncaughtException', (err) => log.error('main', 'uncaughtException', err))
  process.on('unhandledRejection', (err) => log.error('main', 'unhandledRejection', err))
}
