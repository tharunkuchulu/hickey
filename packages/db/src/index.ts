import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema/index'

export * as schema from './schema/index'
export * from './schema/index'
export * from './seed'
export * from './pin'

export type HickeyDb = BetterSQLite3Database<typeof schema>

export interface OpenDatabaseOptions {
  /** Absolute path to the .db file, or ':memory:' for tests. */
  file: string
  /** Folder containing drizzle-kit generated migrations (with meta/_journal.json). */
  migrationsFolder: string
  readonly?: boolean
}

/**
 * Opens (or creates) the POS database with production-safe pragmas and applies pending migrations.
 * WAL + synchronous=NORMAL survives power cuts without losing committed transactions.
 */
export function openDatabase(opts: OpenDatabaseOptions): { db: HickeyDb; sqlite: Database.Database } {
  const sqlite = new Database(opts.file, { readonly: opts.readonly ?? false })
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('synchronous = NORMAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')
  sqlite.pragma('temp_store = MEMORY')

  const db = drizzle(sqlite, { schema })
  if (!opts.readonly) {
    migrate(db, { migrationsFolder: opts.migrationsFolder })
  }
  return { db, sqlite }
}

/** Point-in-time copy of the database (safe while the app is running). */
export function backupDatabase(sqlite: Database.Database, destinationFile: string): Promise<void> {
  return sqlite.backup(destinationFile).then(() => undefined)
}
