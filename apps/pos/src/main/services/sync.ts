/**
 * Cloud mirror: drains the local sync_outbox to Supabase through the token-gated `sync_push` RPC.
 * The POS is the master; the cloud only receives. Runs every 30 s and right after billing actions.
 * Never blocks billing — failures are recorded on the outbox row and retried with backoff.
 */
import { schema, type HickeyDb } from '@hickey/db'
import { nowIso, type AppSettings } from '@hickey/shared'
import { asc, eq, inArray, sql } from 'drizzle-orm'
import { BrowserWindow } from 'electron'
import { db as getDb } from '../db'

const { syncOutbox, syncState, SYNCED_TABLES } = schema

export interface SyncStatus {
  state: 'disabled' | 'offline' | 'syncing' | 'synced' | 'error'
  pending: number
  lastSyncAt: string | null
  error: string | null
}

let status: SyncStatus = { state: 'disabled', pending: 0, lastSyncAt: null, error: null }
let timer: NodeJS.Timeout | null = null
let running = false
let backoffUntil = 0
let backoffMs = 5_000
let loadSettings: () => AppSettings = () => {
  throw new Error('sync not initialised')
}

const BATCH = 200

function snake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())
}

/** Drizzle rows are camelCase; the Postgres mirror is snake_case with the same names. */
export function toCloudRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue
    out[snake(k)] = v
  }
  return out
}

async function rpc<T>(s: AppSettings['sync'], fn: string, body: Record<string, unknown>, timeoutMs = 20_000): Promise<T> {
  const url = `${s.supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/${fn}`
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: s.supabaseAnonKey, Authorization: `Bearer ${s.supabaseAnonKey}` },
      body: JSON.stringify(body),
      signal: ctrl.signal
    })
    const text = await res.text()
    if (!res.ok) {
      let msg = text
      try {
        msg = (JSON.parse(text) as { message?: string }).message ?? text
      } catch {}
      throw new Error(`${fn}: ${res.status} ${msg}`.slice(0, 300))
    }
    return (text ? JSON.parse(text) : null) as T
  } finally {
    clearTimeout(t)
  }
}

function broadcast() {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('event:sync', status)
}

function pendingCount(): number {
  return getDb().select({ n: sql<number>`count(*)` }).from(syncOutbox).get()?.n ?? 0
}

function setState(patch: Partial<SyncStatus>) {
  status = { ...status, pending: pendingCount(), ...patch }
  broadcast()
}

export function getSyncStatus(): SyncStatus {
  return { ...status, pending: pendingCount() }
}

export function initSync(settingsLoader: () => AppSettings): void {
  loadSettings = settingsLoader
  const last = getDb().select().from(syncState).where(eq(syncState.key, 'lastSyncAt')).get()
  status = { ...status, lastSyncAt: last?.value ?? null }
  const s = loadSettings().sync
  setState({ state: s.enabled && s.supabaseUrl && s.deviceToken ? 'offline' : 'disabled' })
  if (timer) clearInterval(timer)
  timer = setInterval(() => void syncNow(), 30_000)
  setTimeout(() => void syncNow(), 3_000)
}

/** Push everything pending. Safe to call often; concurrent calls coalesce. */
export async function syncNow(opts: { force?: boolean } = {}): Promise<SyncStatus> {
  const s = loadSettings().sync
  if (!s.enabled || !s.supabaseUrl || !s.supabaseAnonKey || !s.deviceToken) {
    setState({ state: 'disabled', error: null })
    return getSyncStatus()
  }
  if (running) return getSyncStatus()
  if (!opts.force && Date.now() < backoffUntil) return getSyncStatus()
  running = true
  setState({ state: 'syncing', error: null })
  try {
    // Drain in batches until empty.
    for (;;) {
      const rows = getDb().select().from(syncOutbox).orderBy(asc(syncOutbox.seq)).limit(BATCH).all()
      if (rows.length === 0) break
      // Dependency order, last write per row id wins.
      for (const table of SYNCED_TABLES) {
        const mine = rows.filter((r) => r.tableName === table)
        if (mine.length === 0) continue
        const latest = new Map<string, (typeof mine)[number]>()
        for (const r of mine) latest.set(r.rowId, r)
        const payload = [...latest.values()].map((r) => toCloudRow(r.payload))
        await rpc<number>(s, 'sync_push', { p_token: s.deviceToken, p_table: table, p_rows: payload })
        getDb()
          .delete(syncOutbox)
          .where(inArray(syncOutbox.seq, mine.map((r) => r.seq)))
          .run()
      }
      // Anything with an unknown table name would loop forever — drop it loudly.
      const unknown = rows.filter((r) => !(SYNCED_TABLES as readonly string[]).includes(r.tableName))
      if (unknown.length) {
        console.error('[sync] dropping rows for unknown tables', unknown.map((u) => u.tableName))
        getDb().delete(syncOutbox).where(inArray(syncOutbox.seq, unknown.map((r) => r.seq))).run()
      }
    }
    const at = nowIso()
    getDb().insert(syncState).values({ key: 'lastSyncAt', value: at }).onConflictDoUpdate({ target: syncState.key, set: { value: at } }).run()
    backoffMs = 5_000
    backoffUntil = 0
    setState({ state: 'synced', lastSyncAt: at, error: null })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const offline = /fetch failed|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|abort/i.test(msg)
    getDb()
      .update(syncOutbox)
      .set({ attempts: sql`${syncOutbox.attempts} + 1`, lastError: msg })
      .where(sql`${syncOutbox.seq} in (select seq from sync_outbox order by seq limit ${BATCH})`)
      .run()
    backoffUntil = Date.now() + backoffMs
    backoffMs = Math.min(backoffMs * 2, 5 * 60_000)
    setState({ state: offline ? 'offline' : 'error', error: offline ? null : msg })
  } finally {
    running = false
  }
  return getSyncStatus()
}

/** Called after billing actions so a sale reaches the cloud within seconds when online. */
export function kickSync(): void {
  setTimeout(() => void syncNow(), 500)
}

/** Verify credentials without touching data. */
export async function testSync(sync: AppSettings['sync']): Promise<{ ok: boolean; message: string }> {
  try {
    const r = await rpc<{ device: string; org_id: string }>(sync, 'sync_ping', { p_token: sync.deviceToken }, 10_000)
    return { ok: true, message: `Connected as device "${r.device}"` }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Restore on a fresh machine: pull every table for this org and insert rows that are missing locally.
 * Existing local rows are kept (the POS stays master); returns per-table counts.
 */
export async function restoreFromCloud(): Promise<Record<string, number>> {
  const s = loadSettings().sync
  const data = await rpc<Record<string, Record<string, unknown>[]>>(s, 'sync_pull_all', { p_token: s.deviceToken }, 120_000)
  const d = getDb()
  const counts: Record<string, number> = {}
  const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
  const tableMap: Record<string, unknown> = {
    users: schema.users,
    categories: schema.categories,
    items: schema.items,
    item_variants: schema.itemVariants,
    addon_groups: schema.addonGroups,
    addons: schema.addons,
    dining_tables: schema.diningTables,
    orders: schema.orders,
    order_items: schema.orderItems,
    kots: schema.kots,
    payments: schema.payments,
    cash_register_sessions: schema.cashRegisterSessions,
    customers: schema.customers,
    item_notes: schema.itemNotes,
    cash_movements: schema.cashMovements,
    audit_log: schema.auditLog
  }
  d.transaction((tx) => {
    const t = tx as unknown as HickeyDb
    for (const table of SYNCED_TABLES) {
      const rows = data[table] ?? []
      const target = tableMap[table] as Parameters<HickeyDb['insert']>[0]
      let n = 0
      for (const r of rows) {
        const local: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(r)) local[camel(k)] = v
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = t.insert(target).values(local as any).onConflictDoNothing().run()
        n += res.changes
      }
      counts[table] = n
    }
  })
  return counts
}
