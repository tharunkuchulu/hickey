/**
 * Pure aggregations over plain order rows (works on SQLite rows in the POS and on Supabase rows in
 * the dashboard). Money in paise. Only billed orders (printed/settled) count as sales.
 */

export interface AnalyticsOrder {
  id: string
  business_date: string
  order_type: string
  status: string
  total: number
  subtotal: number
  discount: number
  created_at: string
  printed_at: string | null
  created_by?: string | null
}
export interface AnalyticsPayment {
  order_id: string
  mode: string
  amount: number
}
export interface AnalyticsLine {
  order_id: string
  item_id: string | null
  name: string
  variant_name: string | null
  qty: number
  line_total: number
  is_cancelled: boolean
}

export const isBilled = (o: { status: string }) => o.status === 'printed' || o.status === 'settled'

export function sumBy<T>(rows: T[], key: (r: T) => string, value: (r: T) => number): Array<{ key: string; total: number; count: number }> {
  const m = new Map<string, { key: string; total: number; count: number }>()
  for (const r of rows) {
    const k = key(r)
    const cur = m.get(k) ?? { key: k, total: 0, count: 0 }
    cur.total += value(r)
    cur.count += 1
    m.set(k, cur)
  }
  return [...m.values()]
}

export function salesStats(orders: AnalyticsOrder[], payments: AnalyticsPayment[]) {
  const billed = orders.filter(isBilled)
  const billedIds = new Set(billed.map((o) => o.id))
  const total = billed.reduce((a, o) => a + o.total, 0)
  const byPayment = sumBy(
    payments.filter((p) => billedIds.has(p.order_id)),
    (p) => p.mode,
    (p) => p.amount
  )
  const paid = byPayment.reduce((a, p) => a + p.total, 0)
  const byType = sumBy(billed, (o) => o.order_type, (o) => o.total)
  return {
    orders: billed.length,
    total,
    cancelled: orders.filter((o) => o.status === 'cancelled').length,
    complimentary: billed.filter((o) => o.discount > 0 && o.total === 0).length,
    byPayment: [...byPayment, ...(paid < total ? [{ key: 'not_paid', total: total - paid, count: billed.length - new Set(payments.map((p) => p.order_id)).size }] : [])],
    byType
  }
}

/** Petpooja's 4-hour buckets, stacked by order type. */
export const FOUR_HOUR_BUCKETS = ['04:00am - 08:00am', '08:00am - 12:00pm', '12:00pm - 04:00pm', '04:00pm - 08:00pm', '08:00pm - 12:00am', '12:00am - 04:00am']

export function salesByFourHours(orders: AnalyticsOrder[]): Array<{ bucket: string; byType: Record<string, number>; total: number }> {
  const out = FOUR_HOUR_BUCKETS.map((bucket) => ({ bucket, byType: {} as Record<string, number>, total: 0 }))
  for (const o of orders.filter(isBilled)) {
    const h = new Date(o.printed_at ?? o.created_at).getHours()
    const idx = ((Math.floor(h / 4) + 5) % 6) // 04→0, 08→1, 12→2, 16→3, 20→4, 00→5
    const b = out[idx]!
    b.byType[o.order_type] = (b.byType[o.order_type] ?? 0) + o.total
    b.total += o.total
  }
  return out
}

export function salesByDay(orders: AnalyticsOrder[]): Array<{ date: string; total: number; orders: number }> {
  return sumBy(orders.filter(isBilled), (o) => o.business_date, (o) => o.total)
    .map((r) => ({ date: r.key, total: r.total, orders: r.count }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function itemPerformance(orders: AnalyticsOrder[], lines: AnalyticsLine[]) {
  const billedIds = new Set(orders.filter(isBilled).map((o) => o.id))
  const rows = sumBy(
    lines.filter((l) => billedIds.has(l.order_id) && !l.is_cancelled),
    (l) => (l.variant_name ? `${l.name} (${l.variant_name})` : l.name),
    (l) => l.line_total
  )
  const qty = new Map<string, number>()
  for (const l of lines) {
    if (!billedIds.has(l.order_id) || l.is_cancelled) continue
    const k = l.variant_name ? `${l.name} (${l.variant_name})` : l.name
    qty.set(k, (qty.get(k) ?? 0) + l.qty)
  }
  return rows.map((r) => ({ name: r.key, amount: r.total, qty: qty.get(r.key) ?? 0 })).sort((a, b) => b.amount - a.amount)
}

export function hourlySales(orders: AnalyticsOrder[]): Array<{ hour: number; total: number; orders: number }> {
  const m = new Map<number, { hour: number; total: number; orders: number }>()
  for (const o of orders.filter(isBilled)) {
    const h = new Date(o.printed_at ?? o.created_at).getHours()
    const cur = m.get(h) ?? { hour: h, total: 0, orders: 0 }
    cur.total += o.total
    cur.orders++
    m.set(h, cur)
  }
  return [...m.values()].sort((a, b) => a.hour - b.hour)
}
