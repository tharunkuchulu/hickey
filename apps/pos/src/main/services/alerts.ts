/**
 * Alerts: the things a busy counter forgets. Computed in main from live data plus a little memory
 * (last print result, downloaded update) and pushed to the renderer as `event:alerts` whenever they
 * change — after any order action, on sync state changes, on print results and every minute.
 * The Hold badge count rides on the same payload.
 */
import { schema } from '@hickey/db'
import { DAY_END_WARN_MS, type AppSettings } from '@hickey/shared'
import { inArray, sql } from 'drizzle-orm'
import { BrowserWindow } from 'electron'
import { db as getDb } from '../db'
import type { AlertDto, AlertsStatusDto } from '../ipc/contract'
import * as day from './day'
import { getSyncStatus, onSyncStatus } from './sync'

const { orders, orderItems, diningTables } = schema
/** An order parked this long without billing is worth a nudge. */
const HOLD_STALE_MS = 20 * 60_000

let loadSettings: () => AppSettings = () => {
  throw new Error('alerts not initialised')
}
let lastPrint: { what: 'bill' | 'kot'; message: string; orderId: string | null; billNo: string | null; at: string } | null = null
let updateReady: { version: string; at: string } | null = null
let lastJson = ''
let pending: NodeJS.Timeout | null = null

export function initAlerts(settingsLoader: () => AppSettings): void {
  loadSettings = settingsLoader
  onSyncStatus(() => refresh())
  day.onDayChanged(() => refresh())
  setInterval(() => {
    day.tick(loadSettings())
    refresh()
  }, 60_000)
  setTimeout(() => refresh(), 2_000)
}

/** Printer outcome from any bill/KOT/test print. A success clears the failure alert. */
export function recordPrint(r: { what: 'bill' | 'kot' | 'test'; ok: boolean; message?: string; orderId?: string | null; billNo?: string | null }): void {
  if (r.ok) lastPrint = null
  else if (r.what !== 'test') lastPrint = { what: r.what, message: r.message ?? 'Print failed', orderId: r.orderId ?? null, billNo: r.billNo ?? null, at: new Date().toISOString() }
  refresh()
}

export function setUpdateReady(version: string): void {
  updateReady = { version, at: new Date().toISOString() }
  refresh()
}

/** Recompute and broadcast (debounced so a bill + its sync kick produce one event). */
export function refresh(): void {
  if (pending) clearTimeout(pending)
  pending = setTimeout(() => {
    pending = null
    try {
      const status = compute()
      const json = JSON.stringify({ ...status, at: undefined })
      if (json === lastJson) return
      lastJson = json
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send('event:alerts', status)
    } catch (err) {
      console.error('[alerts]', err)
    }
  }, 50)
}

const mins = (ms: number) => Math.floor(ms / 60_000)
const ago = (ms: number) => (ms >= 3600_000 ? `${Math.floor(ms / 3600_000)} h ${mins(ms % 3600_000)} min` : `${mins(ms)} min`)
const hhmm = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function compute(): AlertsStatusDto {
  const s = loadSettings()
  const now = Date.now()
  const dayStatus = day.dayStatus(s)
  const alerts: AlertDto[] = []
  const d = getDb()

  // Parked orders (any date) — the Hold badge and the stale-hold alerts.
  const open = d
    .select({ id: orders.id, kotNo: orders.kotNo, tableId: orders.tableId, total: orders.total, status: orders.status, createdAt: orders.createdAt, businessDate: orders.businessDate })
    .from(orders)
    .where(inArray(orders.status, ['held', 'running']))
    .all()
  const holdCount = open.length
  if (open.length) {
    const qty = new Map(
      d
        .select({ orderId: orderItems.orderId, n: sql<number>`sum(${orderItems.qty})` })
        .from(orderItems)
        .where(inArray(orderItems.orderId, open.map((o) => o.id)))
        .groupBy(orderItems.orderId)
        .all()
        .map((r) => [r.orderId, r.n] as const)
    )
    const tables = new Map(d.select({ id: diningTables.id, name: diningTables.name }).from(diningTables).all().map((t) => [t.id, t.name] as const))
    for (const o of open) {
      const age = now - new Date(o.createdAt).getTime()
      if (age < HOLD_STALE_MS) continue
      const tableName = o.tableId ? (tables.get(o.tableId) ?? null) : null
      const old = o.businessDate < dayStatus.businessDate
      const parts = [o.kotNo != null ? `KOT ${o.kotNo}` : 'No KOT', tableName ? `Table ${tableName}` : 'Pick Up', `₹${(o.total / 100).toFixed(0)}`]
      alerts.push({
        id: `hold_stale:${o.id}`,
        kind: 'hold_stale',
        severity: old || age > 2 * 3600_000 ? 'error' : 'warning',
        title: `${parts.join(' · ')} — ${old ? `held since ${o.businessDate} ${hhmm(o.createdAt)}` : `held ${ago(age)}`}`,
        detail: 'Not billed. Resume to bill it, or discard it if the customer left.',
        at: o.createdAt,
        order: { id: o.id, kotNo: o.kotNo, tableName, total: o.total, items: qty.get(o.id) ?? 0, status: o.status as 'held' | 'running', ageMinutes: mins(age), businessDate: o.businessDate }
      })
    }
  }

  const sync = getSyncStatus()
  if ((sync.state === 'offline' || sync.state === 'error') && sync.pending > 0) {
    alerts.push({
      id: 'sync_problem',
      kind: 'sync_problem',
      severity: sync.state === 'error' ? 'error' : 'warning',
      title: sync.state === 'error' ? `Cloud sync error — ${sync.pending} bills waiting` : `Offline — ${sync.pending} bills waiting to upload`,
      detail: sync.error ?? 'Bills are safe on this machine and will upload when the internet is back.',
      at: sync.lastSyncAt ?? new Date(now).toISOString(),
      sync: { state: sync.state, pending: sync.pending, error: sync.error }
    })
  }

  if (lastPrint) {
    alerts.push({
      id: 'print_failed',
      kind: 'print_failed',
      severity: 'error',
      title: `${lastPrint.what === 'kot' ? 'KOT' : 'Bill'} did not print${lastPrint.billNo ? ` (bill ${lastPrint.billNo})` : ''}`,
      detail: `${lastPrint.message}. Check the printer, then reprint from Orders or run a test print.`,
      at: lastPrint.at,
      print: { what: lastPrint.what, message: lastPrint.message, orderId: lastPrint.orderId, billNo: lastPrint.billNo }
    })
  }

  const untilEnd = new Date(dayStatus.endsAt).getTime() - now
  if (untilEnd > 0 && untilEnd <= DAY_END_WARN_MS) {
    const snoozed = dayStatus.snoozedUntil === dayStatus.endsAt
    alerts.push({
      id: `day_end:${dayStatus.endsAt}`,
      kind: 'day_end',
      severity: 'warning',
      title: `Business day ${dayStatus.businessDate} ends at ${hhmm(dayStatus.endsAt)}${dayStatus.extended ? ' (extended)' : ''}`,
      detail: 'Still open? Extend the day so later bills stay on today’s sales.',
      at: new Date(new Date(dayStatus.endsAt).getTime() - DAY_END_WARN_MS).toISOString(),
      day: { businessDate: dayStatus.businessDate, endsAt: dayStatus.endsAt, extended: dayStatus.extended, phase: 'ending', snoozed }
    })
  } else if (dayStatus.reopenable) {
    alerts.push({
      id: `day_ended:${dayStatus.reopenable.businessDate}`,
      kind: 'day_end',
      severity: 'info',
      title: `Business day ${dayStatus.reopenable.businessDate} ended at ${hhmm(dayStatus.reopenable.normalEndsAt)}`,
      detail: 'Still open? Reopen it (possible until something is billed on the new date).',
      at: dayStatus.reopenable.normalEndsAt,
      day: { businessDate: dayStatus.reopenable.businessDate, endsAt: dayStatus.reopenable.normalEndsAt, extended: false, phase: 'ended', snoozed: false }
    })
  }

  if (updateReady) {
    alerts.push({
      id: `update_ready:${updateReady.version}`,
      kind: 'update_ready',
      severity: 'info',
      title: `Hickey POS ${updateReady.version} is ready to install`,
      detail: 'Restart the app when the counter is free; it takes about a minute.',
      at: updateReady.at,
      update: { version: updateReady.version }
    })
  }

  const rank = { error: 0, warning: 1, info: 2 }
  alerts.sort((a, b) => rank[a.severity] - rank[b.severity] || a.at.localeCompare(b.at))
  return { holdCount, alerts, day: dayStatus, at: new Date(now).toISOString() }
}
