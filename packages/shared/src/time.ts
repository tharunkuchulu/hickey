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
