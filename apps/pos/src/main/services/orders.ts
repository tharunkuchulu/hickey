/**
 * Orders service — every state change of an order goes through here, inside one SQLite transaction,
 * with the sync outbox written in the same transaction (Phase 4 drains it).
 *
 * Counter flow (what the cafe actually does): New Order → items → payment mode → Save & Print:
 * assigns KOT no + bill no, records the payment, prints KOT (optional) + bill, status = printed.
 * Dine-in flow: Save / KOT keeps the order `running` on a table; Settle later assigns the bill.
 */
import { schema, type HickeyDb } from '@hickey/db'
import { businessDate as toBusinessDate, computeBillTotals, nowIso, uuidv7, type AppSettings } from '@hickey/shared'
import { and, desc, eq, inArray, like, or, sql } from 'drizzle-orm'
import { db as getDb } from '../db'
import { displayBillNo, nextBillNo, nextKotNo } from './numbering'

const { orders, orderItems, kots, payments, diningTables, auditLog, syncOutbox } = schema

import type { KotTicket, LiveSummary, OrderDto, OrderInput, OrderLineInput, OrderListFilter, PaymentInput } from '../../types/orders'
export type { KotTicket, LiveSummary, OrderDto, OrderInput, OrderLineDto, OrderLineInput, OrderListFilter, PaymentInput } from '../../types/orders'

interface Ctx {
  settings: AppSettings
  userId: string | null
  deviceId: string
}

// ---------- helpers ----------

function outbox(tx: HickeyDb, tableName: string, rowId: string, payload: Record<string, unknown>, op: 'upsert' | 'delete' = 'upsert') {
  tx.insert(syncOutbox).values({ tableName, rowId, op, payload, createdAt: nowIso() }).run()
}

function audit(tx: HickeyDb, ctx: Ctx, action: string, entity: string, entityId: string, details: Record<string, unknown> = {}) {
  const id = uuidv7()
  const row = { id, deviceId: ctx.deviceId, userId: ctx.userId, action, entity, entityId, details, createdAt: nowIso() }
  tx.insert(auditLog).values(row).run()
  outbox(tx, 'audit_log', id, row)
}

function lineTotals(l: OrderLineInput) {
  const addonsTotal = l.addons.reduce((a, b) => a + b.price, 0)
  return { addonsTotal, lineTotal: (l.unitPrice + addonsTotal) * l.qty }
}

function totalsFor(input: OrderInput, settings: AppSettings) {
  return computeBillTotals({
    lines: input.lines.map((l) => ({ unitPrice: l.unitPrice, qty: l.qty, addonsTotal: lineTotals(l).addonsTotal })),
    discountType: input.discountType ?? undefined,
    discountValue: input.discountValue,
    charges: input.charges,
    taxPercent: settings.billing.taxPercent,
    rounding: settings.billing.rounding
  })
}

export function currentBusinessDate(settings: AppSettings): string {
  return toBusinessDate(new Date(), settings.billing.dayStartMinutes)
}

// ---------- reads ----------

export function getOrder(id: string, settings: AppSettings): OrderDto | null {
  const d = getDb()
  const o = d.select().from(orders).where(eq(orders.id, id)).get()
  if (!o) return null
  return hydrate(d, [o], settings)[0] ?? null
}

export function listOrders(filter: OrderListFilter, settings: AppSettings): OrderDto[] {
  const d = getDb()
  const conds = []
  if (filter.businessDate) conds.push(eq(orders.businessDate, filter.businessDate))
  if (filter.status?.length) conds.push(inArray(orders.status, filter.status))
  if (filter.query?.trim()) {
    const q = filter.query.trim()
    const asNum = Number(q)
    conds.push(
      or(
        like(orders.billNo, `%${q}`),
        Number.isInteger(asNum) ? eq(orders.kotNo, asNum) : sql`0`,
        like(orders.customerPhone, `%${q}%`),
        like(orders.customerName, `%${q}%`)
      )
    )
  }
  const rows = d
    .select()
    .from(orders)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(filter.limit ?? 300)
    .all()
  return hydrate(d, rows, settings)
}

function hydrate(d: HickeyDb, rows: (typeof orders.$inferSelect)[], settings: AppSettings): OrderDto[] {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const lines = d.select().from(orderItems).where(inArray(orderItems.orderId, ids)).all()
  const pays = d.select().from(payments).where(inArray(payments.orderId, ids)).all()
  const tables = d.select({ id: diningTables.id, name: diningTables.name }).from(diningTables).all()
  const tableName = new Map(tables.map((t) => [t.id, t.name]))

  return rows.map((o) => {
    const oPays = pays.filter((p) => p.orderId === o.id)
    const modes = [...new Set(oPays.map((p) => p.mode))]
    const labels: Record<string, string> = { cash: 'Cash', card: 'Card', upi: 'UPI', other: 'Other', due: 'Due' }
    return {
      id: o.id,
      billNo: o.billNo,
      billNoDisplay: displayBillNo(o.billNo, settings.billing.billNoDisplayDigits),
      kotNo: o.kotNo,
      businessDate: o.businessDate,
      orderType: o.orderType,
      tableId: o.tableId,
      tableName: o.tableId ? (tableName.get(o.tableId) ?? null) : null,
      status: o.status,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      notes: o.notes,
      lines: lines
        .filter((l) => l.orderId === o.id)
        .map((l) => ({
          id: l.id,
          itemId: l.itemId,
          name: l.name,
          variantName: l.variantName,
          unitPrice: l.unitPrice,
          qty: l.qty,
          addons: l.addons,
          addonsTotal: l.addonsTotal,
          lineTotal: l.lineTotal,
          notes: l.notes,
          kotNo: l.kotNo,
          isCancelled: l.isCancelled
        })),
      discountType: o.discountType,
      discountValue: o.discountValue,
      discountReason: o.discountReason,
      charges: o.charges,
      taxPercent: o.taxPercent,
      subtotal: o.subtotal,
      discount: o.discount,
      tax: o.tax,
      roundOff: o.roundOff,
      total: o.total,
      payments: oPays.map((p) => ({ id: p.id, mode: p.mode, amount: p.amount, tendered: p.tendered, reference: p.reference })),
      paymentSummary: modes.length ? modes.map((m) => labels[m] ?? m).join(' + ') : o.status === 'printed' || o.status === 'settled' ? 'Not Paid' : '',
      cancelReason: o.cancelReason,
      printCount: o.printCount,
      createdBy: o.createdBy,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      printedAt: o.printedAt,
      settledAt: o.settledAt,
      readyAt: o.readyAt
    }
  })
}

// ---------- writes ----------

/** Insert or update the order row + lines. Returns the order id. Caller owns the transaction. */
function upsertOrder(tx: HickeyDb, input: OrderInput, ctx: Ctx, status: OrderDto['status']): string {
  const now = nowIso()
  const t = totalsFor(input, ctx.settings)
  const existing = input.id ? tx.select().from(orders).where(eq(orders.id, input.id)).get() : undefined
  if (existing && ['printed', 'settled', 'cancelled'].includes(existing.status)) {
    throw new Error(`Order ${existing.billNo ?? existing.id} is already ${existing.status}`)
  }
  const id = existing?.id ?? input.id ?? uuidv7()
  const row = {
    id,
    deviceId: ctx.deviceId,
    billNo: existing?.billNo ?? null,
    businessDate: existing?.businessDate ?? currentBusinessDate(ctx.settings),
    orderType: input.orderType,
    tableId: input.orderType === 'dine_in' ? input.tableId : null,
    status,
    kotNo: existing?.kotNo ?? null,
    customerName: input.customerName?.trim() || null,
    customerPhone: input.customerPhone?.trim() || null,
    customerId: null,
    notes: input.notes?.trim() || null,
    discountType: input.discountType,
    discountValue: input.discountValue,
    discountReason: input.discountReason,
    charges: input.charges,
    taxPercent: ctx.settings.billing.taxPercent,
    subtotal: t.subtotal,
    discount: t.discount,
    tax: t.tax,
    roundOff: t.roundOff,
    total: t.total,
    cancelReason: null,
    printCount: existing?.printCount ?? 0,
    createdBy: existing?.createdBy ?? ctx.userId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    printedAt: existing?.printedAt ?? null,
    settledAt: null,
    readyAt: existing?.readyAt ?? null
  }
  if (existing) {
    tx.update(orders).set(row).where(eq(orders.id, id)).run()
    // Lines are replaced wholesale; KOT numbers already assigned to a line are kept by id.
    const oldLines = tx.select().from(orderItems).where(eq(orderItems.orderId, id)).all()
    tx.delete(orderItems).where(eq(orderItems.orderId, id)).run()
    input.lines.forEach((l) => insertLine(tx, id, l, oldLines.find((ol) => ol.id === l.id)?.kotNo ?? null, now))
  } else {
    tx.insert(orders).values(row).run()
    input.lines.forEach((l) => insertLine(tx, id, l, null, now))
  }
  outbox(tx, 'orders', id, row)
  if (t.discount > 0 && (!existing || existing.discount !== t.discount)) {
    audit(tx, ctx, 'order.discount', 'orders', id, { type: input.discountType, value: input.discountValue, amount: t.discount, reason: input.discountReason })
  }
  return id
}

function insertLine(tx: HickeyDb, orderId: string, l: OrderLineInput, kotNo: number | null, now: string) {
  const { addonsTotal, lineTotal } = lineTotals(l)
  const row = {
    id: l.id ?? uuidv7(),
    orderId,
    itemId: l.itemId,
    name: l.name,
    variantName: l.variantName,
    unitPrice: l.unitPrice,
    qty: l.qty,
    addons: l.addons,
    addonsTotal,
    lineTotal,
    notes: l.notes?.trim() || null,
    kotNo,
    isCancelled: false,
    createdAt: now,
    updatedAt: now
  }
  tx.insert(orderItems).values(row).run()
  outbox(tx, 'order_items', row.id, row)
}

/** Assigns a KOT number to lines that don't have one yet and snapshots a ticket. Returns the ticket, or null if nothing new. */
function issueKot(tx: HickeyDb, orderId: string, ctx: Ctx): KotTicket | null {
  const o = tx.select().from(orders).where(eq(orders.id, orderId)).get()!
  const pending = tx.select().from(orderItems).where(and(eq(orderItems.orderId, orderId), sql`${orderItems.kotNo} IS NULL`)).all()
  if (pending.length === 0) return null
  const kotNo = o.kotNo ?? nextKotNo(tx, ctx.settings, o.businessDate)
  const now = nowIso()
  const lines: KotTicket['lines'] = pending.map((l) => ({
    name: l.name,
    variantName: l.variantName,
    qty: l.qty,
    notes: l.notes,
    addons: l.addons.map((a) => a.name)
  }))
  tx.update(orderItems).set({ kotNo, updatedAt: now }).where(inArray(orderItems.id, pending.map((p) => p.id))).run()
  if (o.kotNo == null) tx.update(orders).set({ kotNo, updatedAt: now }).where(eq(orders.id, orderId)).run()
  const ticket = { id: uuidv7(), deviceId: ctx.deviceId, orderId, kotNo, businessDate: o.businessDate, lines, createdAt: now, printedAt: null }
  tx.insert(kots).values(ticket).run()
  outbox(tx, 'kots', ticket.id, ticket)
  return { kotNo, lines }
}

export function saveOrder(input: OrderInput, ctx: Ctx, status: 'running' | 'held' = 'running'): OrderDto {
  const id = getDb().transaction((tx) => upsertOrder(tx as unknown as HickeyDb, input, ctx, status))
  return getOrder(id, ctx.settings)!
}

export function saveWithKot(input: OrderInput, ctx: Ctx): { order: OrderDto; kot: KotTicket | null } {
  const d = getDb()
  const res = d.transaction((tx) => {
    const t = tx as unknown as HickeyDb
    const id = upsertOrder(t, input, ctx, 'running')
    return { id, kot: issueKot(t, id, ctx) }
  })
  return { order: getOrder(res.id, ctx.settings)!, kot: res.kot }
}

/**
 * The main counter action. Saves, issues the KOT for any un-ticketed lines, assigns the bill number,
 * records payments and marks the order printed. Printing itself happens after commit (caller).
 */
/**
 * Bill a cart. `print: false` is Petpooja's "Save": the bill (number, payment, KOT) is created and counts as
 * a sale, but nothing is printed and the order shows as SAVED until "Print bill" is used.
 */
export function saveAndBill(
  input: OrderInput,
  pays: PaymentInput[],
  ctx: Ctx,
  opts: { print?: boolean } = {}
): { order: OrderDto; kot: KotTicket | null } {
  const d = getDb()
  const res = d.transaction((tx) => {
    const t = tx as unknown as HickeyDb
    const id = upsertOrder(t, input, ctx, 'running')
    const kot = issueKot(t, id, ctx)
    bill(t, id, pays, ctx, opts.print !== false)
    return { id, kot }
  })
  return { order: getOrder(res.id, ctx.settings)!, kot: res.kot }
}

/** Settle an already-saved running/held order (dine-in "Settle" or resumed hold). */
export function settleOrder(orderId: string, pays: PaymentInput[], ctx: Ctx, opts: { print?: boolean } = {}): OrderDto {
  getDb().transaction((tx) => {
    const t = tx as unknown as HickeyDb
    issueKot(t, orderId, ctx)
    bill(t, orderId, pays, ctx, opts.print !== false)
  })
  return getOrder(orderId, ctx.settings)!
}

/**
 * Correct the payment of a billed order (wrong button pressed at the counter). Replaces the payment legs;
 * the removed legs are queued as deletes so the cloud mirror matches. Cancelled orders can't be changed.
 */
export function updatePayments(orderId: string, pays: PaymentInput[], ctx: Ctx): OrderDto {
  getDb().transaction((tx) => {
    const t = tx as unknown as HickeyDb
    const o = t.select().from(orders).where(eq(orders.id, orderId)).get()
    if (!o) throw new Error('Order not found')
    if (o.status !== 'printed' && o.status !== 'settled') throw new Error(`Order is ${o.status}; bill it first`)
    const paid = pays.reduce((a, p) => a + p.amount, 0)
    if (pays.length > 0 && paid !== o.total) throw new Error(`Payments (${paid}) must equal the bill total (${o.total})`)
    const now = nowIso()
    const old = t.select().from(payments).where(eq(payments.orderId, orderId)).all()
    for (const p of old) {
      t.delete(payments).where(eq(payments.id, p.id)).run()
      outbox(t, 'payments', p.id, { id: p.id }, 'delete')
    }
    for (const p of pays) {
      const row = { id: uuidv7(), deviceId: ctx.deviceId, orderId, mode: p.mode, amount: p.amount, tendered: p.tendered ?? null, reference: p.reference ?? null, createdAt: now }
      t.insert(payments).values(row).run()
      outbox(t, 'payments', row.id, row)
    }
    const unpaid = pays.length === 0 || pays.some((p) => p.mode === 'due')
    const patch = { settledAt: unpaid ? null : (o.settledAt ?? now), updatedAt: now }
    t.update(orders).set(patch).where(eq(orders.id, orderId)).run()
    outbox(t, 'orders', orderId, { ...o, ...patch })
    audit(t, ctx, 'order.payment_changed', 'orders', orderId, {
      billNo: o.billNo,
      from: old.map((p) => `${p.mode}:${p.amount}`),
      to: pays.map((p) => `${p.mode}:${p.amount}`)
    })
  })
  return getOrder(orderId, ctx.settings)!
}

function bill(tx: HickeyDb, orderId: string, pays: PaymentInput[], ctx: Ctx, printed = true) {
  const o = tx.select().from(orders).where(eq(orders.id, orderId)).get()!
  if (o.status === 'cancelled') throw new Error('Order is cancelled')
  const lineCount = tx.select({ n: sql<number>`count(*)` }).from(orderItems).where(eq(orderItems.orderId, orderId)).get()!.n
  if (lineCount === 0) throw new Error('Add at least one item')

  // Empty payments = Petpooja's "Not Paid": the bill prints, money is collected later.
  const paid = pays.reduce((a, p) => a + p.amount, 0)
  if (pays.length > 0 && paid !== o.total) throw new Error(`Payments (${paid}) must equal the bill total (${o.total})`)

  const now = nowIso()
  const billNo = o.billNo ?? nextBillNo(tx, ctx.settings, o.businessDate)
  const unpaid = pays.length === 0 || pays.some((p) => p.mode === 'due')
  const patch = {
    billNo,
    status: printed ? ('printed' as const) : ('settled' as const),
    printedAt: printed ? now : o.printedAt,
    settledAt: unpaid ? null : now,
    printCount: printed ? o.printCount + 1 : o.printCount,
    updatedAt: now
  }
  tx.update(orders).set(patch).where(eq(orders.id, orderId)).run()
  outbox(tx, 'orders', orderId, { ...o, ...patch })

  tx.delete(payments).where(eq(payments.orderId, orderId)).run()
  pays.forEach((p) => {
    const row = {
      id: uuidv7(),
      deviceId: ctx.deviceId,
      orderId,
      mode: p.mode,
      amount: p.amount,
      tendered: p.tendered ?? null,
      reference: p.reference ?? null,
      createdAt: now
    }
    tx.insert(payments).values(row).run()
    outbox(tx, 'payments', row.id, row)
  })
}

export function cancelOrder(orderId: string, reason: string, ctx: Ctx): OrderDto {
  getDb().transaction((tx) => {
    const t = tx as unknown as HickeyDb
    const o = t.select().from(orders).where(eq(orders.id, orderId)).get()
    if (!o) throw new Error('Order not found')
    if (o.status === 'cancelled') return
    const now = nowIso()
    const patch = { status: 'cancelled' as const, cancelReason: reason.trim() || 'No reason', updatedAt: now }
    t.update(orders).set(patch).where(eq(orders.id, orderId)).run()
    outbox(t, 'orders', orderId, { ...o, ...patch })
    audit(t, ctx, 'order.cancel', 'orders', orderId, { reason, billNo: o.billNo, total: o.total, previousStatus: o.status })
  })
  return getOrder(orderId, ctx.settings)!
}

export function markReady(orderId: string, ctx: Ctx): OrderDto {
  getDb().transaction((tx) => {
    const t = tx as unknown as HickeyDb
    const o = t.select().from(orders).where(eq(orders.id, orderId)).get()
    if (!o) throw new Error('Order not found')
    const patch = { readyAt: o.readyAt ?? nowIso(), updatedAt: nowIso() }
    t.update(orders).set(patch).where(eq(orders.id, orderId)).run()
    outbox(t, 'orders', orderId, { ...o, ...patch })
  })
  return getOrder(orderId, ctx.settings)!
}

export function recordReprint(orderId: string, what: 'bill' | 'kot', ctx: Ctx): void {
  getDb().transaction((tx) => {
    const t = tx as unknown as HickeyDb
    const o = t.select().from(orders).where(eq(orders.id, orderId)).get()
    if (!o) return
    if (what === 'bill') {
      // First print of a SAVED bill promotes it to PRINTED; later prints are duplicates.
      const first = o.printCount === 0
      const patch = { printCount: o.printCount + 1, updatedAt: nowIso(), ...(first ? { status: 'printed' as const, printedAt: nowIso() } : {}) }
      t.update(orders).set(patch).where(eq(orders.id, orderId)).run()
      outbox(t, 'orders', orderId, { ...o, ...patch })
      if (first) return
    }
    audit(t, ctx, `${what}.reprint`, 'orders', orderId, { billNo: o.billNo, kotNo: o.kotNo })
  })
}

export function latestKot(orderId: string): KotTicket | null {
  const k = getDb().select().from(kots).where(eq(kots.orderId, orderId)).orderBy(desc(kots.createdAt)).get()
  return k ? { kotNo: k.kotNo, lines: k.lines } : null
}

/** Today at a glance (Live View). */
export function liveSummary(bd: string, settings: AppSettings): LiveSummary {
  const list = listOrders({ businessDate: bd, limit: 5000 }, settings)
  const billed = list.filter((o) => o.status === 'printed' || o.status === 'settled')
  const byType: Record<string, { orders: number; amount: number }> = {}
  const byPayment: Record<string, { orders: number; amount: number }> = {}
  const byHour: Record<string, number> = {}
  for (const o of billed) {
    byType[o.orderType] ??= { orders: 0, amount: 0 }
    byType[o.orderType]!.orders++
    byType[o.orderType]!.amount += o.total
    for (const p of o.payments) {
      byPayment[p.mode] ??= { orders: 0, amount: 0 }
      byPayment[p.mode]!.orders++
      byPayment[p.mode]!.amount += p.amount
    }
    const h = new Date(o.printedAt ?? o.createdAt).getHours()
    const bucket = `${String(h).padStart(2, '0')}:00`
    byHour[bucket] = (byHour[bucket] ?? 0) + o.total
  }
  const itemTotals = new Map<string, { name: string; qty: number; amount: number }>()
  for (const o of billed)
    for (const l of o.lines) {
      const key = l.variantName ? `${l.name} (${l.variantName})` : l.name
      const cur = itemTotals.get(key) ?? { name: key, qty: 0, amount: 0 }
      cur.qty += l.qty
      cur.amount += l.lineTotal
      itemTotals.set(key, cur)
    }
  return {
    businessDate: bd,
    totalOrders: billed.length,
    totalSales: billed.reduce((a, o) => a + o.total, 0),
    running: list.filter((o) => o.status === 'running' || o.status === 'held').length,
    runningAmount: list.filter((o) => o.status === 'running' || o.status === 'held').reduce((a, o) => a + o.total, 0),
    cancelled: list.filter((o) => o.status === 'cancelled').length,
    byType,
    byPayment,
    byHour,
    topItems: [...itemTotals.values()].sort((a, b) => b.amount - a.amount).slice(0, 10)
  }
}
