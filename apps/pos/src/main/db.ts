import { openDatabase, seedIfEmpty, type HickeyDb } from '@hickey/db'
import type Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { hostname } from 'node:os'
import { backupsDir, dataDir, databaseFile, migrationsDir } from './paths'

let handle: { db: HickeyDb; sqlite: Database.Database } | null = null

export function initDatabase(): HickeyDb {
  if (handle) return handle.db
  mkdirSync(dataDir(), { recursive: true })
  mkdirSync(backupsDir(), { recursive: true })
  handle = openDatabase({ file: databaseFile(), migrationsFolder: migrationsDir() })
  // Device id defaults to the machine name; can be changed in Settings > Sync.
  seedIfEmpty(handle.db, { deviceId: hostname().toLowerCase() })
  return handle.db
}

export function db(): HickeyDb {
  if (!handle) throw new Error('Database not initialised')
  return handle.db
}

export function sqlite(): Database.Database {
  if (!handle) throw new Error('Database not initialised')
  return handle.sqlite
}

export function closeDatabase(): void {
  handle?.sqlite.close()
  handle = null
}
