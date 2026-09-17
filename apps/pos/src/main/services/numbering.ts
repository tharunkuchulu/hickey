import { schema, type HickeyDb } from '@hickey/db'
import type { AppSettings } from '@hickey/shared'
import { eq, sql } from 'drizzle-orm'

const { counters } = schema

/**
 * Bill and KOT sequences live in the `counters` table and are bumped inside the caller's
 * transaction, so two rapid taps can never issue the same number.
 */
function bump(db: HickeyDb, key: string, startAt = 1): number {
  const row = db.select().from(counters).where(eq(counters.key, key)).get()
  if (!row) {
    db.insert(counters).values({ key, value: startAt }).run()
    return startAt
  }
  db.update(counters).set({ value: sql`${counters.value} + 1` }).where(eq(counters.key, key)).run()
  return row.value + 1
}

export function nextBillNo(db: HickeyDb, settings: AppSettings, businessDate: string): string {
  const { billNumberReset, billPrefix, billNumberStart } = settings.billing
  const key =
    billNumberReset === 'daily'
      ? `bill:${businessDate}`
      : billNumberReset === 'monthly'
        ? `bill:${businessDate.slice(0, 7)}`
        : billNumberReset === 'yearly'
          ? `bill:${businessDate.slice(0, 4)}`
          : 'bill'
  const n = bump(db, key, billNumberReset === 'never' ? billNumberStart : 1)
  return `${billPrefix}${n}`
}

export function nextKotNo(db: HickeyDb, settings: AppSettings, businessDate: string): number {
  const key = settings.billing.kotNumberReset === 'daily' ? `kot:${businessDate}` : 'kot'
  return bump(db, key)
}

/** "22031" -> "..031" the way the Petpooja counter shows it. */
export function displayBillNo(billNo: string | null, digits: number): string {
  if (!billNo) return '—'
  if (!digits || billNo.length <= digits) return billNo
  return `..${billNo.slice(-digits)}`
}
