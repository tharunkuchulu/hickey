/**
 * Time helpers. Timestamps are stored as ISO-8601 strings in UTC.
 * A "business day" can start after midnight (cafes that close at 1am
 * want 12:30am sales counted on the previous day).
 */

export function nowIso(): string {
  return new Date().toISOString()
}

/** Returns YYYY-MM-DD of the business day a timestamp belongs to. */
export function businessDate(ts: Date | string, dayStartMinutes = 0): string {
  const d = typeof ts === 'string' ? new Date(ts) : new Date(ts.getTime())
  d.setMinutes(d.getMinutes() - dayStartMinutes)
  return localYmd(d)
}

export function localYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** UTC ISO range [start, end) covering one local business day. */
export function businessDayRange(ymd: string, dayStartMinutes = 0): { start: string; end: string } {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number]
  const start = new Date(y, m - 1, d, 0, dayStartMinutes, 0, 0)
  const end = new Date(y, m - 1, d + 1, 0, dayStartMinutes, 0, 0)
  return { start: start.toISOString(), end: end.toISOString() }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "17 Sep 2026 12:45 PM" — fixed width so it never wraps on a 58 mm roll. */
export function formatReceiptDateTime(ts: Date | string): string {
  const d = typeof ts === 'string' ? new Date(ts) : ts
  const h = d.getHours()
  const hh = String(h % 12 || 12).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${hh}:${mm} ${h < 12 ? 'AM' : 'PM'}`
}

// ---------- business-day extension ("still open past 03:30?") ----------

/** Most a day can be stretched past its normal end. */
export const DAY_EXTENSION_MAX_MS = 12 * 3600_000
/** How long before the day end the counter is asked "still open?". */
export const DAY_END_WARN_MS = 30 * 60_000
/** After the day has rolled, how long it may still be reopened (if nothing was billed on the new date). */
export const DAY_REOPEN_GRACE_MS = 60 * 60_000

export interface DayExtension {
  businessDate: string
  /** ISO instant the extended day ends. */
  endsAt: string
  setBy: string | null
  setAt: string
}

export interface ResolvedDay {
  businessDate: string
  /** ISO: when this date would end without an extension. */
  normalEndsAt: string
  /** ISO: effective end (== normalEndsAt unless extended). */
  endsAt: string
  extended: boolean
  /** ISO: latest allowed end for this date (normal end + 12 h). */
  maxEndsAt: string
  /** The stored extension no longer applies and can be deleted. */
  extensionStale: boolean
  /** Previous day that may still be reopened (within the grace period). */
  reopenable: { businessDate: string; normalEndsAt: string; maxEndsAt: string } | null
}

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number]
  return localYmd(new Date(y, m - 1, d + n))
}

/** Local instant at which the business day `ymd` ends (= next calendar day at dayStartMinutes). */
export function businessDayEnd(ymd: string, dayStartMinutes: number): Date {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d + 1, 0, dayStartMinutes, 0, 0)
}

/**
 * Which business day is in force right now, honouring a per-day extension. Pure: all decisions are
 * made from `now`, the day boundary and the stored extension (if any).
 */
export function resolveBusinessDay(now: Date, dayStartMinutes: number, ext: DayExtension | null): ResolvedDay {
  const naive = businessDate(now, dayStartMinutes)
  const naiveEnd = businessDayEnd(naive, dayStartMinutes)
  const base: ResolvedDay = {
    businessDate: naive,
    normalEndsAt: naiveEnd.toISOString(),
    endsAt: naiveEnd.toISOString(),
    extended: false,
    maxEndsAt: new Date(naiveEnd.getTime() + DAY_EXTENSION_MAX_MS).toISOString(),
    extensionStale: false,
    reopenable: null
  }
  const withReopen = (r: ResolvedDay): ResolvedDay => {
    const prev = addDays(naive, -1)
    const prevEnd = businessDayEnd(prev, dayStartMinutes)
    const since = now.getTime() - prevEnd.getTime()
    if (since >= 0 && since < DAY_REOPEN_GRACE_MS) {
      r.reopenable = { businessDate: prev, normalEndsAt: prevEnd.toISOString(), maxEndsAt: new Date(prevEnd.getTime() + DAY_EXTENSION_MAX_MS).toISOString() }
    }
    return r
  }
  if (!ext) return withReopen(base)

  const E = new Date(ext.endsAt)
  const D = ext.businessDate
  const dEnd = businessDayEnd(D, dayStartMinutes)
  const extendedDay = (): ResolvedDay => ({
    businessDate: D,
    normalEndsAt: dEnd.toISOString(),
    endsAt: E.toISOString(),
    extended: true,
    maxEndsAt: new Date(dEnd.getTime() + DAY_EXTENSION_MAX_MS).toISOString(),
    extensionStale: false,
    reopenable: null
  })
  if (Number.isNaN(E.getTime())) return withReopen({ ...base, extensionStale: true })
  // Set before the boundary: today is still the naive day, only the end moves.
  if (D === naive) return now < E && E > dEnd ? extendedDay() : withReopen({ ...base, extensionStale: true })
  // Past the boundary but before the extended end: yesterday's date is still in force.
  if (naive === addDays(D, 1) && now < E) return extendedDay()
  // Older extension, or the clock moved back (naive < D: keep the row, it may apply again).
  return withReopen({ ...base, extensionStale: naive >= D })
}
