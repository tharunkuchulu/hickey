import type { AnalyticsLine, AnalyticsOrder, AnalyticsPayment } from '@hickey/shared/analytics'
import { supabase } from './supabase'

/** Business day boundary used by the POS (03:30). Mirrors settings.billing.dayStartMinutes. */
export const DAY_START_MINUTES = 210

function computedToday(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - DAY_START_MINUTES)
  return ymd(d)
}

let resolved: { date: string; at: number } | null = null

/** Today's business date; once resolveTodayBusinessDate() has run it reflects a night-time extension at the counter. */
export function todayBusinessDate(): string {
  return resolved && Date.now() - resolved.at < 5 * 60_000 ? resolved.date : computedToday()
}

/**
 * The counter can extend its business day past 03:30 (v0.3.0) and no settings sync to the cloud, so infer it:
 * if the newest bill was made in the last 3 hours and still carries the earlier date, that day is still open.
 */
export async function resolveTodayBusinessDate(): Promise<string> {
  const computed = computedToday()
  let date = computed
  try {
    const { data } = await supabase().from('orders').select('business_date,created_at').order('created_at', { ascending: false }).limit(1)
    const o = data?.[0] as { business_date: string; created_at: string } | undefined
    if (o && o.business_date < computed && Date.now() - new Date(o.created_at).getTime() < 3 * 3600_000) date = o.business_date
  } catch {}
  resolved = { date, at: Date.now() }
  return date
}
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function addDays(s: string, n: number): string {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number]
  return ymd(new Date(y, m - 1, d + n))
}

export interface OrderRow extends AnalyticsOrder {
  bill_no: string | null
  kot_no: number | null
  customer_name: string | null
  customer_phone: string | null
  round_off: number
  cancel_reason: string | null
  print_count: number
}

export interface RangeData {
  orders: OrderRow[]
  payments: AnalyticsPayment[]
  lines: AnalyticsLine[]
}

/** Orders in a business-date range with their payments and lines (paged; PostgREST caps at 1000 rows). */
export async function fetchRange(from: string, to: string): Promise<RangeData> {
  const orders: OrderRow[] = []
  for (let off = 0; ; off += 1000) {
    const { data, error } = await supabase()
      .from('orders')
      .select('*')
      .gte('business_date', from)
      .lte('business_date', to)
      .order('created_at', { ascending: false })
      .range(off, off + 999)
    if (error) throw new Error(error.message)
    orders.push(...((data ?? []) as OrderRow[]))
    if (!data || data.length < 1000) break
  }
  const ids = orders.map((o) => o.id)
  const payments: AnalyticsPayment[] = []
  const lines: AnalyticsLine[] = []
  for (let i = 0; i < ids.length; i += 300) {
    const chunk = ids.slice(i, i + 300)
    const [p, l] = await Promise.all([
      supabase().from('payments').select('order_id,mode,amount').in('order_id', chunk),
      supabase().from('order_items').select('order_id,item_id,name,variant_name,qty,line_total,is_cancelled').in('order_id', chunk)
    ])
    if (p.error) throw new Error(p.error.message)
    if (l.error) throw new Error(l.error.message)
    payments.push(...((p.data ?? []) as AnalyticsPayment[]))
    lines.push(...((l.data ?? []) as AnalyticsLine[]))
  }
  return { orders, payments, lines }
}

export interface CashMovementRow {
  business_date: string
  kind: 'expense' | 'withdrawal' | 'top_up'
  amount: number
  reason: string | null
  created_at: string
}

export async function fetchCashMovements(from: string, to: string): Promise<CashMovementRow[]> {
  const { data, error } = await supabase()
    .from('cash_movements')
    .select('business_date,kind,amount,reason,created_at')
    .gte('business_date', from)
    .lte('business_date', to)
    .is('deleted_at', null)
  if (error) throw new Error(error.message)
  return (data ?? []) as CashMovementRow[]
}

export async function fetchDevices(): Promise<Array<{ label: string; last_seen_at: string | null }>> {
  const { data, error } = await supabase().from('devices').select('label,last_seen_at')
  if (error) throw new Error(error.message)
  return (data ?? []) as Array<{ label: string; last_seen_at: string | null }>
}
