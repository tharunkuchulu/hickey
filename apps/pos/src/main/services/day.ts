/**
 * Business-day service: which date is "today" for billing, and the per-day extension ("we're still open
 * past 03:30 — keep today's date until 05:30"). The extension lives as one row in the key/value
 * `settings` table (key `day_extension`), so no schema change was needed and nothing syncs; the decision
 * itself is the pure `resolveBusinessDay` in @hickey/shared. Every "today" in main goes through
 * `currentBusinessDate()` here, so orders, KOT/bill numbers, cash entries and summaries follow the extension.
 */
import { schema } from '@hickey/db'
import { uuidv7 } from '@hickey/shared/ids'
import { DAY_EXTENSION_MAX_MS, dayExtensionSchema, nowIso, resolveBusinessDay, type AppSettings, type DayExtension, type ResolvedDay } from '@hickey/shared'
import { eq, sql } from 'drizzle-orm'
import { db as getDb } from '../db'

const { settings, auditLog, syncOutbox, orders } = schema
const KEY = 'day_extension'

let cache: DayExtension | null | undefined
let snoozedUntil: string | null = null
let lastKey = ''
const listeners = new Set<(d: ResolvedDay) => void>()

export interface DayStatus extends ResolvedDay {
  snoozedUntil: string | null
}

function readExtension(): DayExtension | null {
  if (cache !== undefined) return cache
  const row = getDb().select().from(settings).where(eq(settings.key, KEY)).get()
  const parsed = dayExtensionSchema.safeParse(row?.value ?? null)
  cache = parsed.success ? parsed.data : null
  return cache
}

export function resolve(s: AppSettings, now = new Date()): ResolvedDay {
  return resolveBusinessDay(now, s.billing.dayStartMinutes, readExtension())
}

export function currentBusinessDate(s: AppSettings): string {
  return resolve(s).businessDate
}

export function dayStatus(s: AppSettings): DayStatus {
  const r = resolve(s)
  // Reopening is only offered while nothing has been billed on the new date (numbering would fork).
  if (r.reopenable) {
    const n = getDb().select({ n: sql<number>`count(*)` }).from(orders).where(eq(orders.businessDate, r.businessDate)).get()?.n ?? 0
    if (n > 0) r.reopenable = null
  }
  return { ...r, snoozedUntil }
}

export function onDayChanged(fn: (d: ResolvedDay) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Fire listeners when the effective date or end moved (called by writers and the minute tick). */
export function notifyChanged(s: AppSettings): void {
  const r = resolve(s)
  const key = `${r.businessDate}|${r.endsAt}`
  if (key === lastKey) return
  lastKey = key
  if (snoozedUntil && new Date(snoozedUntil).getTime() < Date.now()) snoozedUntil = null
  for (const l of listeners) l(r)
}

const hhmm = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Extend (or reopen) a business day. `endsAt: null` removes the extension. Any logged-in user may do this;
 * the change is written to the audit trail with the user's id.
 */
export function extendDay(req: { endsAt: string | null; businessDate?: string }, actor: { userId: string | null; deviceId: string }, s: AppSettings): DayStatus {
  const now = new Date()
  const cur = dayStatus(s)
  const d = getDb()
  const write = (value: DayExtension | null, details: Record<string, unknown>) => {
    d.transaction((tx) => {
      if (value) {
        tx.insert(settings)
          .values({ key: KEY, value: value as unknown as Record<string, unknown>, updatedAt: nowIso() })
          .onConflictDoUpdate({ target: settings.key, set: { value: value as unknown as Record<string, unknown>, updatedAt: nowIso() } })
          .run()
      } else {
        tx.delete(settings).where(eq(settings.key, KEY)).run()
      }
      const id = uuidv7()
      const row = { id, deviceId: actor.deviceId, userId: actor.userId, action: 'day.extend', entity: 'settings', entityId: KEY, details, createdAt: nowIso() }
      tx.insert(auditLog).values(row).run()
      tx.insert(syncOutbox).values({ tableName: 'audit_log', rowId: id, op: 'upsert', payload: row, createdAt: nowIso() }).run()
    })
    cache = value
    snoozedUntil = null
    notifyChanged(s)
  }

  if (req.endsAt === null) {
    write(null, { businessDate: cur.businessDate, from: cur.endsAt, to: null })
    return dayStatus(s)
  }
  const target = req.businessDate ?? cur.businessDate
  let normalEnd: string
  let reopened = false
  if (target === cur.businessDate) normalEnd = cur.normalEndsAt
  else if (cur.reopenable?.businessDate === target) {
    normalEnd = cur.reopenable.normalEndsAt
    reopened = true
  } else throw new Error(`Business day ${target} is closed`)

  const E = new Date(req.endsAt)
  if (Number.isNaN(E.getTime())) throw new Error('Invalid end time')
  const nEnd = new Date(normalEnd)
  if (E <= nEnd) throw new Error(`End time must be after ${hhmm(normalEnd)}`)
  if (E <= now) throw new Error('End time must be in the future')
  if (E.getTime() > nEnd.getTime() + DAY_EXTENSION_MAX_MS) throw new Error(`A day can be extended by at most 12 hours (until ${hhmm(new Date(nEnd.getTime() + DAY_EXTENSION_MAX_MS).toISOString())})`)

  write({ businessDate: target, endsAt: E.toISOString(), setBy: actor.userId, setAt: nowIso() }, { businessDate: target, from: cur.endsAt, to: E.toISOString(), reopened })
  return dayStatus(s)
}

/** "No, end at 03:30" on the prompt: stay quiet for this boundary; the alert remains listed. */
export function snoozeDayEnd(endsAt: string, s: AppSettings): DayStatus {
  snoozedUntil = endsAt
  return dayStatus(s)
}

/** Minute tick: drop an extension that no longer applies and announce the roll-over. */
export function tick(s: AppSettings): void {
  const r = resolve(s)
  if (r.extensionStale && readExtension()) {
    getDb().delete(settings).where(eq(settings.key, KEY)).run()
    cache = null
  }
  notifyChanged(s)
}
