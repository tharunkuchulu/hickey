/**
 * Local snapshots: a consistent copy of the SQLite file (better-sqlite3 online backup API) into
 * %APPDATA%\hickey-pos\backups\hickey-YYYY-MM-DD.db, taken once per day shortly after the business
 * day rolls over and on demand from Settings. Keeps the last 30.
 */
import { backupDatabase } from '@hickey/db'
import { businessDate } from '@hickey/shared'
import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { sqlite } from '../db'
import { backupsDir } from '../paths'

const KEEP = 30

export interface BackupInfo {
  file: string
  path: string
  sizeBytes: number
  createdAt: string
}

export function listBackups(): BackupInfo[] {
  const dir = backupsDir()
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.db'))
    .map((f) => {
      const p = join(dir, f)
      const st = statSync(p)
      return { file: f, path: p, sizeBytes: st.size, createdAt: st.mtime.toISOString() }
    })
    .sort((a, b) => b.file.localeCompare(a.file))
}

export async function backupNow(label?: string): Promise<BackupInfo> {
  const stamp = label ?? new Date().toISOString().replace(/[:.]/g, '-')
  const path = join(backupsDir(), `hickey-${stamp}.db`)
  await backupDatabase(sqlite(), path)
  prune()
  const st = statSync(path)
  return { file: `hickey-${stamp}.db`, path, sizeBytes: st.size, createdAt: st.mtime.toISOString() }
}

function prune(): void {
  const all = listBackups()
  for (const b of all.slice(KEEP)) {
    try {
      unlinkSync(b.path)
    } catch {}
  }
}

/** Ensure a snapshot exists for the previous business day; runs at start and every hour. */
export function scheduleDailyBackup(dayStartMinutes: () => number): void {
  const tick = async () => {
    try {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const bd = businessDate(yesterday, dayStartMinutes())
      if (!listBackups().some((b) => b.file === `hickey-${bd}.db`)) await backupNow(bd)
    } catch (err) {
      console.error('[backup] failed', err)
    }
  }
  setTimeout(() => void tick(), 20_000)
  setInterval(() => void tick(), 60 * 60_000)
}
