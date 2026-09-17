import { app } from 'electron'
import { join, resolve } from 'node:path'

/** Where the live database, backups and logs live: %APPDATA%\hickey-pos on Windows. */
export function dataDir(): string {
  return app.getPath('userData')
}

export function databaseFile(): string {
  return join(dataDir(), 'hickey.db')
}

export function backupsDir(): string {
  return join(dataDir(), 'backups')
}

/** drizzle-kit migrations: shipped as an extraResource in production, read from the monorepo in dev. */
export function migrationsDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'migrations')
    : resolve(__dirname, '../../../../packages/db/migrations')
}
