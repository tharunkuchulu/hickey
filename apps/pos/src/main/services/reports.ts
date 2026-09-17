/**
 * Report queries. Each report returns a generic table (columns + rows + summary) so the
 * renderer, CSV export and thermal print all share one shape. Business-date based, billed
 * orders only (status printed/settled) unless the report is about cancellations.
 */
import { schema } from '@hickey/db'
import { PAYMENT_MODE_LABELS, type AppSettings } from '@hickey/shared'
import { and, asc, between, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { db as getDb } from '../db'
import { REPORTS, type DailySales, type ReportColumn, type ReportRequest, type ReportResult } from '../../types/reports'

const { orders, orderItems, payments, auditLog, users, cashMovements, items, categories } = schema

const BILLED = ['printed', 'settled'] as const
const title = (id: ReportRequest['report']) => REPORTS.find((r) => r.id === id)?.title ?? id

type Row = Record<string, string | number | null>

/** One Total row. (Petpooja also shows Min/Max/Avg; staff found those confusing, so they are gone.) */
function numericSummary(rows: Row[], keys: string[]): Row[] {
  if (rows.length === 0) return []
  const total: Row = { _label: 'Total' }
  for (const k of keys) total[k] = rows.reduce((a, r) => a + Number(r[k] ?? 0), 0)
  return [total]
}

const PAY_ORDER = ['cash', 'card', 'upi', 'other', 'due', 'not_paid'] as const
const PAY_LABEL: Record<string, string> = { cash: 'Cash', card: 'Card', upi: 'UPI', other: 'Other', due: 'Due Payment', not_paid: 'Not Paid' }
const TYPE_LABEL: Record<string, string> = { pick_up: 'Pick Up', dine_in: 'Dine In', delivery: 'Delivery' }

/** The counter's "Daily Sales" page: Petpooja's Sales Summary plus every bill with its payment mode and time. */
export function dailySales(from: string, to: string): DailySales {
  const d = getDb()
  const all = d.select().from(orders).where(between(orders.businessDate, from, to)).orderBy(desc(orders.createdAt)).all()
  const billed = all.filter((o) => (BILLED as readonly string[]).includes(o.status))
  const pays = paymentsFor(all.map((o) => o.id))
  const qtyByOrder = new Map<string, number>()
  if (all.length) {
    const rows = d
      .select({ orderId: orderItems.orderId, n: sql<number>`sum(${orderItems.qty})` })
      .from(orderItems)
      .where(and(inArray(orderItems.orderId, all.map((o) => o.id)), eq(orderItems.isCancelled, false)))
      .groupBy(orderItems.orderId)
      .all()
    for (const r of rows) qtyByOrder.set(r.orderId, r.n)
  }
  const userNames = new Map(d.select({ id: users.id, name: users.name }).from(users).all().map((u) => [u.id, u.name] as const))

  const byPay = new Map<string, { orders: number; amount: number }>()
  const byType = new Map<string, { orders: number; amount: number }>()
  const bump = (m: Map<string, { orders: number; amount: number }>, k: string, amount: number) => {
    const v = m.get(k) ?? { orders: 0, amount: 0 }
    v.orders++
    v.amount += amount
    m.set(k, v)
  }
  for (const o of billed) {
    bump(byType, o.orderType, o.total)
    const legs = pays.filter((p) => p.orderId === o.id)
    if (legs.length === 0) bump(byPay, 'not_paid', o.total)
    for (const p of legs) bump(byPay, p.mode, p.amount)
  }
  const cancelledList = all.filter((o) => o.status === 'cancelled')
  const unbilledList = all.filter((o) => o.status === 'running' || o.status === 'held')
  const net = billed.reduce((a, o) => a + o.total, 0)
  const paymentText = (o: (typeof all)[number]) => {
    if (o.status === 'cancelled') return 'Cancelled'
    if (o.status === 'running' || o.status === 'held') return 'Not billed'
    const legs = pays.filter((p) => p.orderId === o.id)
    if (legs.length === 0) return 'Not Paid'
    return legs.map((p) => (legs.length > 1 ? `${PAY_LABEL[p.mode] ?? p.mode} ${Math.round(p.amount / 100)}` : PAY_LABEL[p.mode] ?? p.mode)).join(' + ')
  }
  return {
    from,
    to,
    sales: {
      orders: billed.length,
      gross: billed.reduce((a, o) => a + o.subtotal, 0),
      discount: billed.reduce((a, o) => a + o.discount, 0),
      net,
      avgBill: billed.length ? Math.round(net / billed.length) : 0,
      items: billed.reduce((a, o) => a + (qtyByOrder.get(o.id) ?? 0), 0)
    },
    byPayment: PAY_ORDER.map((m) => ({ mode: m, label: PAY_LABEL[m]!, ...(byPay.get(m) ?? { orders: 0, amount: 0 }) })),
    byType: ['pick_up', 'dine_in', 'delivery'].map((t) => ({ type: t, label: TYPE_LABEL[t]!, ...(byType.get(t) ?? { orders: 0, amount: 0 }) })),
    cancelled: { orders: cancelledList.length, amount: cancelledList.reduce((a, o) => a + o.total, 0) },
    unbilled: { orders: unbilledList.length, amount: unbilledList.reduce((a, o) => a + o.total, 0) },
    bills: all.map((o) => ({
      id: o.id,
      billNo: o.billNo ?? '',
      billNoDisplay: o.billNo ? `..${o.billNo.slice(-3)}` : '—',
      kotNo: o.kotNo,
      time: o.printedAt ?? o.createdAt,
      paidAt: o.settledAt,
      type: TYPE_LABEL[o.orderType] ?? o.orderType,
      items: qtyByOrder.get(o.id) ?? 0,
      total: o.total,
      payment: paymentText(o),
      biller: (o.createdBy && userNames.get(o.createdBy)) || '',
      status: o.status
    }))
  }
}

export function runReport(req: ReportRequest, settings: AppSettings): ReportResult {
  const base = { report: req.report, title: title(req.report), from: req.from, to: req.to }
  switch (req.report) {
    case 'daily':
    case 'sales_summary':
      return { ...base, ...salesSummary(req) }
    case 'payment_wise':
      return { ...base, ...paymentWise(req) }
    case 'hourly':
      return { ...base, ...hourly(req) }
    case 'user_wise':
      return { ...base, ...userWise(req) }
    case 'item_wise':
      return { ...base, ...itemWise(req, false) }
    case 'variant_wise':
      return { ...base, ...itemWise(req, true) }
    case 'category_wise':
      return { ...base, ...categoryWise(req) }
    case 'cancelled':
      return { ...base, ...cancelled(req) }
    case 'discounted':
      return { ...base, ...discounted(req) }
    case 'reprints':
      return { ...base, ...reprints(req) }
    case 'cash_flow':
      return { ...base, ...cashFlow(req, settings) }
  }
}

function billedOrders(req: ReportRequest) {
  return getDb()
    .select()
    .from(orders)
    .where(and(between(orders.businessDate, req.from, req.to), inArray(orders.status, [...BILLED])))
    .orderBy(asc(orders.businessDate), asc(orders.createdAt))
    .all()
}

function paymentsFor(orderIds: string[]) {
  if (orderIds.length === 0) return []
  return getDb().select().from(payments).where(inArray(payments.orderId, orderIds)).all()
}

function salesSummary(req: ReportRequest) {
  const list = billedOrders(req)
  const pays = paymentsFor(list.map((o) => o.id))
  const cancelledRows = getDb()
    .select({ businessDate: orders.businessDate, n: sql<number>`count(*)`, amount: sql<number>`coalesce(sum(${orders.total}), 0)` })
    .from(orders)
    .where(and(between(orders.businessDate, req.from, req.to), eq(orders.status, 'cancelled')))
    .groupBy(orders.businessDate)
    .all()
  const byDay = new Map<string, Row>()
  for (const o of list) {
    const r =
      byDay.get(o.businessDate) ??
      { date: o.businessDate, orders: 0, gross: 0, discount: 0, net: 0, cash: 0, card: 0, upi: 0, other: 0, unpaid: 0, cancelled: 0, cancelledAmount: 0 }
    r.orders = Number(r.orders) + 1
    r.gross = Number(r.gross) + o.subtotal
    r.discount = Number(r.discount) + o.discount
    r.net = Number(r.net) + o.total
    const oPays = pays.filter((p) => p.orderId === o.id)
    if (oPays.length === 0) r.unpaid = Number(r.unpaid) + o.total
    for (const p of oPays) {
      const k = p.mode === 'due' ? 'unpaid' : p.mode
      r[k] = Number(r[k] ?? 0) + p.amount
    }
    byDay.set(o.businessDate, r)
  }
  for (const c of cancelledRows) {
    const r = byDay.get(c.businessDate) ?? { date: c.businessDate, orders: 0, gross: 0, discount: 0, net: 0, cash: 0, card: 0, upi: 0, other: 0, unpaid: 0, cancelled: 0, cancelledAmount: 0 }
    r.cancelled = c.n
    r.cancelledAmount = c.amount
    byDay.set(c.businessDate, r)
  }
  const rows = [...byDay.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const columns: ReportColumn[] = [
    { key: 'date', label: 'Date' },
    { key: 'orders', label: 'Orders', align: 'right' },
    { key: 'gross', label: 'Gross (₹)', align: 'right', money: true },
    { key: 'discount', label: 'Discount (₹)', align: 'right', money: true },
    { key: 'net', label: 'Net Sales (₹)', align: 'right', money: true },
    { key: 'cash', label: 'Cash', align: 'right', money: true },
    { key: 'card', label: 'Card', align: 'right', money: true },
    { key: 'upi', label: 'UPI', align: 'right', money: true },
    { key: 'other', label: 'Other', align: 'right', money: true },
    { key: 'unpaid', label: 'Due / Not Paid', align: 'right', money: true },
    { key: 'cancelled', label: 'Cancelled', align: 'right' },
    { key: 'cancelledAmount', label: 'Cancelled (₹)', align: 'right', money: true }
  ]
  return { columns, rows, summary: numericSummary(rows, ['orders', 'gross', 'discount', 'net', 'cash', 'card', 'upi', 'other', 'unpaid', 'cancelled', 'cancelledAmount']) }
}

function paymentWise(req: ReportRequest) {
  const list = billedOrders(req)
  const pays = paymentsFor(list.map((o) => o.id))
  const agg = new Map<string, { orders: Set<string>; amount: number }>()
  for (const p of pays) {
    const a = agg.get(p.mode) ?? { orders: new Set<string>(), amount: 0 }
    a.orders.add(p.orderId)
    a.amount += p.amount
    agg.set(p.mode, a)
  }
  const unpaid = list.filter((o) => !pays.some((p) => p.orderId === o.id))
  if (unpaid.length) agg.set('not_paid', { orders: new Set(unpaid.map((o) => o.id)), amount: unpaid.reduce((a, o) => a + o.total, 0) })
  const total = [...agg.values()].reduce((a, v) => a + v.amount, 0)
  const rows: Row[] = [...agg.entries()].map(([mode, v]) => ({
    mode: mode === 'not_paid' ? 'Not Paid' : (PAYMENT_MODE_LABELS[mode as keyof typeof PAYMENT_MODE_LABELS] ?? mode),
    orders: v.orders.size,
    amount: v.amount,
    share: total ? `${((v.amount / total) * 100).toFixed(1)}%` : '0%'
  }))
  rows.sort((a, b) => Number(b.amount) - Number(a.amount))
  const columns: ReportColumn[] = [
    { key: 'mode', label: 'Payment Type' },
    { key: 'orders', label: 'Orders', align: 'right' },
    { key: 'amount', label: 'Amount (₹)', align: 'right', money: true },
    { key: 'share', label: 'Share', align: 'right' }
  ]
  return { columns, rows, summary: [{ _label: 'Total', orders: list.length, amount: total, share: '100%' }] }
}

function hourly(req: ReportRequest) {
  const list = billedOrders(req)
  const byHour = new Map<number, { orders: number; amount: number; qty: number }>()
  const lines = list.length ? getDb().select().from(orderItems).where(inArray(orderItems.orderId, list.map((o) => o.id))).all() : []
  for (const o of list) {
    const h = new Date(o.printedAt ?? o.createdAt).getHours()
    const v = byHour.get(h) ?? { orders: 0, amount: 0, qty: 0 }
    v.orders++
    v.amount += o.total
    v.qty += lines.filter((l) => l.orderId === o.id && !l.isCancelled).reduce((a, l) => a + l.qty, 0)
    byHour.set(h, v)
  }
  const rows: Row[] = [...byHour.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([h, v]) => ({ hour: `${String(h).padStart(2, '0')}:00 – ${String(h).padStart(2, '0')}:59`, orders: v.orders, qty: v.qty, amount: v.amount }))
  const columns: ReportColumn[] = [
    { key: 'hour', label: 'Hour' },
    { key: 'orders', label: 'Orders', align: 'right' },
    { key: 'qty', label: 'Items', align: 'right' },
    { key: 'amount', label: 'Sales (₹)', align: 'right', money: true }
  ]
  return { columns, rows, summary: numericSummary(rows, ['orders', 'qty', 'amount']) }
}

function userWise(req: ReportRequest) {
  const list = billedOrders(req)
  const names = new Map(getDb().select({ id: users.id, name: users.name }).from(users).all().map((u) => [u.id, u.name]))
  const agg = new Map<string, { orders: number; amount: number }>()
  for (const o of list) {
    const k = o.createdBy ? (names.get(o.createdBy) ?? 'Unknown') : 'Unknown'
    const v = agg.get(k) ?? { orders: 0, amount: 0 }
    v.orders++
    v.amount += o.total
    agg.set(k, v)
  }
  const rows: Row[] = [...agg.entries()].map(([biller, v]) => ({ biller, orders: v.orders, amount: v.amount, avg: Math.round(v.amount / v.orders) }))
  const columns: ReportColumn[] = [
    { key: 'biller', label: 'Biller' },
    { key: 'orders', label: 'Orders', align: 'right' },
    { key: 'amount', label: 'Sales (₹)', align: 'right', money: true },
    { key: 'avg', label: 'Avg. bill (₹)', align: 'right', money: true }
  ]
  return { columns, rows, summary: numericSummary(rows, ['orders', 'amount']) }
}

function itemWise(req: ReportRequest, byVariant: boolean) {
  const list = billedOrders(req)
  if (list.length === 0) return { columns: itemColumns(byVariant), rows: [], summary: [] }
  const lines = getDb().select().from(orderItems).where(inArray(orderItems.orderId, list.map((o) => o.id))).all()
  const catByItem = new Map(
    getDb()
      .select({ id: items.id, code: items.shortCode, category: categories.name })
      .from(items)
      .leftJoin(categories, eq(items.categoryId, categories.id))
      .all()
      .map((r) => [r.id, r])
  )
  const agg = new Map<string, Row>()
  for (const l of lines) {
    if (l.isCancelled) continue
    const meta = l.itemId ? catByItem.get(l.itemId) : undefined
    const key = byVariant ? `${l.variantName ?? '—'}|${l.name}` : `${l.name}|${l.variantName ?? ''}`
    const r = agg.get(key) ?? {
      category: meta?.category ?? '—',
      variant: l.variantName ?? '—',
      item: byVariant ? l.name : l.variantName ? `${l.name} (${l.variantName})` : l.name,
      code: meta?.code ?? '',
      qty: 0,
      amount: 0
    }
    r.qty = Number(r.qty) + l.qty
    r.amount = Number(r.amount) + l.lineTotal
    agg.set(key, r)
  }
  const rows = [...agg.values()].sort((a, b) =>
    byVariant
      ? String(a.variant).localeCompare(String(b.variant)) || Number(b.amount) - Number(a.amount)
      : String(a.category).localeCompare(String(b.category)) || Number(b.amount) - Number(a.amount)
  )
  return { columns: itemColumns(byVariant), rows, summary: numericSummary(rows, ['qty', 'amount']) }
}

function itemColumns(byVariant: boolean): ReportColumn[] {
  return byVariant
    ? [
        { key: 'variant', label: 'Variation' },
        { key: 'item', label: 'Item' },
        { key: 'qty', label: 'Qty.', align: 'right' },
        { key: 'amount', label: 'Total (₹)', align: 'right', money: true }
      ]
    : [
        { key: 'category', label: 'Category' },
        { key: 'item', label: 'Item' },
        { key: 'code', label: 'Code' },
        { key: 'qty', label: 'Qty.', align: 'right' },
        { key: 'amount', label: 'Total (₹)', align: 'right', money: true }
      ]
}

function categoryWise(req: ReportRequest) {
  const { rows } = itemWise(req, false)
  const agg = new Map<string, Row>()
  for (const r of rows) {
    const c: Row = agg.get(String(r.category)) ?? { category: r.category ?? '—', items: 0, qty: 0, amount: 0 }
    c.items = Number(c.items) + 1
    c.qty = Number(c.qty) + Number(r.qty)
    c.amount = Number(c.amount) + Number(r.amount)
    agg.set(String(r.category), c)
  }
  const out = [...agg.values()].sort((a, b) => Number(b.amount) - Number(a.amount))
  const total = out.reduce((a, r) => a + Number(r.amount), 0)
  for (const r of out) r.share = total ? `${((Number(r.amount) / total) * 100).toFixed(1)}%` : '0%'
  const columns: ReportColumn[] = [
    { key: 'category', label: 'Category' },
    { key: 'items', label: 'Items', align: 'right' },
    { key: 'qty', label: 'Qty.', align: 'right' },
    { key: 'amount', label: 'Total (₹)', align: 'right', money: true },
    { key: 'share', label: 'Share', align: 'right' }
  ]
  return { columns, rows: out, summary: numericSummary(out, ['items', 'qty', 'amount']) }
}

function cancelled(req: ReportRequest) {
  const list = getDb()
    .select()
    .from(orders)
    // Cancelled *bills* only — discarded holds never had a bill number and are not lost sales.
    .where(and(between(orders.businessDate, req.from, req.to), eq(orders.status, 'cancelled'), isNotNull(orders.billNo)))
    .orderBy(desc(orders.updatedAt))
    .all()
  const names = new Map(getDb().select({ id: users.id, name: users.name }).from(users).all().map((u) => [u.id, u.name]))
  const audits = list.length
    ? getDb().select().from(auditLog).where(and(eq(auditLog.action, 'order.cancel'), inArray(auditLog.entityId, list.map((o) => o.id)))).all()
    : []
  const rows: Row[] = list.map((o) => ({
    date: o.businessDate,
    billNo: o.billNo ?? '—',
    kotNo: o.kotNo ?? '—',
    time: new Date(o.updatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    amount: o.total,
    reason: o.cancelReason ?? '',
    by: names.get(audits.find((a) => a.entityId === o.id)?.userId ?? '') ?? '—'
  }))
  const columns: ReportColumn[] = [
    { key: 'date', label: 'Date' },
    { key: 'billNo', label: 'Bill No' },
    { key: 'kotNo', label: 'KOT' },
    { key: 'time', label: 'Time' },
    { key: 'amount', label: 'Amount (₹)', align: 'right', money: true },
    { key: 'reason', label: 'Reason' },
    { key: 'by', label: 'Cancelled by' }
  ]
  return { columns, rows, summary: rows.length ? [{ _label: 'Total', amount: rows.reduce((a, r) => a + Number(r.amount), 0) }] : [] }
}

function discounted(req: ReportRequest) {
  const list = billedOrders(req).filter((o) => o.discount > 0)
  const rows: Row[] = list.map((o) => ({
    date: o.businessDate,
    billNo: o.billNo ?? '—',
    subtotal: o.subtotal,
    discount: o.discount,
    kind: o.discountType === 'percent' ? `${o.discountValue}%` : 'Fixed',
    total: o.total,
    reason: o.discountReason ?? ''
  }))
  const columns: ReportColumn[] = [
    { key: 'date', label: 'Date' },
    { key: 'billNo', label: 'Bill No' },
    { key: 'subtotal', label: 'Sub Total (₹)', align: 'right', money: true },
    { key: 'kind', label: 'Type' },
    { key: 'discount', label: 'Discount (₹)', align: 'right', money: true },
    { key: 'total', label: 'Net (₹)', align: 'right', money: true },
    { key: 'reason', label: 'Reason' }
  ]
  return { columns, rows, summary: numericSummary(rows, ['subtotal', 'discount', 'total']) }
}

function reprints(req: ReportRequest) {
  const list = getDb()
    .select()
    .from(orders)
    .where(and(between(orders.businessDate, req.from, req.to), sql`${orders.printCount} > 1`))
    .orderBy(desc(orders.printCount))
    .all()
  const rows: Row[] = list.map((o) => ({ date: o.businessDate, billNo: o.billNo ?? '—', prints: o.printCount, total: o.total, status: o.status }))
  const columns: ReportColumn[] = [
    { key: 'date', label: 'Date' },
    { key: 'billNo', label: 'Bill No' },
    { key: 'prints', label: 'Print count', align: 'right' },
    { key: 'total', label: 'Amount (₹)', align: 'right', money: true },
    { key: 'status', label: 'Status' }
  ]
  return { columns, rows, summary: [] }
}

function cashFlow(req: ReportRequest, settings: AppSettings) {
  const list = billedOrders(req)
  const pays = paymentsFor(list.map((o) => o.id))
  const moves = getDb().select().from(cashMovements).where(and(between(cashMovements.businessDate, req.from, req.to), sql`${cashMovements.deletedAt} IS NULL`)).all()
  const dates = [...new Set([...list.map((o) => o.businessDate), ...moves.map((m) => m.businessDate)])].sort()
  const rows: Row[] = dates.map((d) => {
    const cashSales = pays.filter((p) => p.mode === 'cash' && list.find((o) => o.id === p.orderId)?.businessDate === d).reduce((a, p) => a + p.amount, 0)
    const sum = (kind: string) => moves.filter((m) => m.businessDate === d && m.kind === kind).reduce((a, m) => a + m.amount, 0)
    const opening = settings.billing.pettyCash
    const topUp = sum('top_up')
    const expense = sum('expense')
    const withdrawal = sum('withdrawal')
    return { date: d, opening, cashSales, topUp, expense, withdrawal, closing: opening + cashSales + topUp - expense - withdrawal }
  })
  const columns: ReportColumn[] = [
    { key: 'date', label: 'Date' },
    { key: 'opening', label: 'Petty cash (₹)', align: 'right', money: true },
    { key: 'cashSales', label: 'Cash sales (₹)', align: 'right', money: true },
    { key: 'topUp', label: 'Top-up (₹)', align: 'right', money: true },
    { key: 'expense', label: 'Expenses (₹)', align: 'right', money: true },
    { key: 'withdrawal', label: 'Withdrawals (₹)', align: 'right', money: true },
    { key: 'closing', label: 'Expected in drawer (₹)', align: 'right', money: true }
  ]
  return { columns, rows, summary: numericSummary(rows, ['cashSales', 'topUp', 'expense', 'withdrawal']) }
}

/** CSV with a UTF-8 BOM so Excel opens it with ₹ and commas intact. */
export function reportToCsv(r: ReportResult): string {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const money = (c: ReportColumn, v: unknown) => (c.money && typeof v === 'number' ? (v / 100).toFixed(2) : v)
  const lines = [
    [`${r.title}`, `${r.from} to ${r.to}`].map(esc).join(','),
    r.columns.map((c) => esc(c.label)).join(','),
    ...r.rows.map((row) => r.columns.map((c) => esc(money(c, row[c.key]))).join(',')),
    ...(r.summary ?? []).map((row) => r.columns.map((c, i) => esc(i === 0 ? row._label : money(c, row[c.key]))).join(','))
  ]
  return '﻿' + lines.join('\r\n')
}
