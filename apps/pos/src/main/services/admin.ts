/**
 * Admin-side services: billing users (PINs), cash movements, item on/off.
 * All writes go through one transaction and queue a sync-outbox row.
 */
import { hashPin, schema, type HickeyDb } from '@hickey/db'
import { nowIso, uuidv7, type AppSettings } from '@hickey/shared'
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'
import { db as getDb } from '../db'
import type { CashFlowSummaryDto, CashMovementDto, CashMovementInput, UserDto, UserInput } from '../../types/admin'
import { currentBusinessDate } from './orders'

const { users, cashMovements, items, syncOutbox, auditLog, payments, orders } = schema

function outbox(tx: HickeyDb, tableName: string, rowId: string, payload: Record<string, unknown>) {
  tx.insert(syncOutbox).values({ tableName, rowId, op: 'upsert', payload, createdAt: nowIso() }).run()
}

// ---------- users ----------

export function listUsers(): UserDto[] {
  return getDb()
    .select({ id: users.id, name: users.name, role: users.role, isActive: users.isActive, createdAt: users.createdAt })
    .from(users)
    .where(isNull(users.deletedAt))
    .orderBy(asc(users.role), asc(users.name))
    .all()
}

export function saveUser(input: UserInput, actorId: string | null, deviceId: string): UserDto {
  const d = getDb()
  const now = nowIso()
  const name = input.name.trim()
  if (!name) throw new Error('Name is required')
  if (input.pin !== undefined && input.pin !== null && !/^\d{4,6}$/.test(input.pin)) throw new Error('PIN must be 4 to 6 digits')

  const id = d.transaction((tx) => {
    const t = tx as unknown as HickeyDb
    const existing = input.id ? t.select().from(users).where(eq(users.id, input.id)).get() : undefined
    if (!existing && !input.pin) throw new Error('PIN is required for a new user')
    const row = {
      id: existing?.id ?? uuidv7(),
      name,
      pinHash: input.pin ? hashPin(input.pin) : existing!.pinHash,
      role: input.role,
      isActive: input.isActive ?? existing?.isActive ?? true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null
    }
    if (existing) {
      // Never let the last active admin lock everyone out.
      if (existing.role === 'admin' && (row.role !== 'admin' || !row.isActive)) {
        const admins = t.select({ n: sql<number>`count(*)` }).from(users).where(and(eq(users.role, 'admin'), eq(users.isActive, true), isNull(users.deletedAt))).get()!.n
        if (admins <= 1) throw new Error('At least one active admin is required')
      }
      t.update(users).set(row).where(eq(users.id, row.id)).run()
    } else {
      t.insert(users).values(row).run()
    }
    const { pinHash: _p, ...safe } = row
    outbox(t, 'users', row.id, { ...safe, pinHash: row.pinHash })
    const aid = uuidv7()
    const audit = { id: aid, deviceId, userId: actorId, action: existing ? 'user.update' : 'user.create', entity: 'users', entityId: row.id, details: { name, role: row.role, pinChanged: !!input.pin }, createdAt: now }
    t.insert(auditLog).values(audit).run()
    outbox(t, 'audit_log', aid, audit)
    return row.id
  })
  return listUsers().find((u) => u.id === id)!
}

// ---------- cash movements ----------

export function listCashMovements(businessDate: string): CashMovementDto[] {
  const names = new Map(getDb().select({ id: users.id, name: users.name }).from(users).all().map((u) => [u.id, u.name]))
  return getDb()
    .select()
    .from(cashMovements)
    .where(and(eq(cashMovements.businessDate, businessDate), isNull(cashMovements.deletedAt)))
    .orderBy(desc(cashMovements.createdAt))
    .all()
    .map((m) => ({ id: m.id, businessDate: m.businessDate, kind: m.kind, amount: m.amount, reason: m.reason, by: m.userId ? (names.get(m.userId) ?? null) : null, createdAt: m.createdAt }))
}

export function addCashMovement(input: CashMovementInput, actorId: string | null, deviceId: string, settings: AppSettings): CashMovementDto {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error('Enter an amount')
  const now = nowIso()
  const row = {
    id: uuidv7(),
    deviceId,
    businessDate: currentBusinessDate(settings),
    kind: input.kind,
    amount: input.amount,
    reason: input.reason?.trim() || null,
    userId: actorId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  }
  getDb().transaction((tx) => {
    const t = tx as unknown as HickeyDb
    t.insert(cashMovements).values(row).run()
    outbox(t, 'cash_movements', row.id, row)
  })
  return listCashMovements(row.businessDate).find((m) => m.id === row.id)!
}

export function deleteCashMovement(id: string, deviceId: string, actorId: string | null): void {
  getDb().transaction((tx) => {
    const t = tx as unknown as HickeyDb
    const m = t.select().from(cashMovements).where(eq(cashMovements.id, id)).get()
    if (!m) return
    const patch = { deletedAt: nowIso(), updatedAt: nowIso() }
    t.update(cashMovements).set(patch).where(eq(cashMovements.id, id)).run()
    outbox(t, 'cash_movements', id, { ...m, ...patch })
    const aid = uuidv7()
    const audit = { id: aid, deviceId, userId: actorId, action: 'cash_movement.delete', entity: 'cash_movements', entityId: id, details: { kind: m.kind, amount: m.amount }, createdAt: nowIso() }
    t.insert(auditLog).values(audit).run()
    outbox(t, 'audit_log', aid, audit)
  })
}

/** Petpooja "Cash Flow" card for one business day. */
export function cashFlowSummary(businessDate: string, settings: AppSettings): CashFlowSummaryDto {
  const d = getDb()
  const cashSales =
    d
      .select({ s: sql<number>`coalesce(sum(${payments.amount}), 0)` })
      .from(payments)
      .innerJoin(orders, eq(payments.orderId, orders.id))
      .where(and(eq(orders.businessDate, businessDate), eq(payments.mode, 'cash'), sql`${orders.status} in ('printed','settled')`))
      .get()?.s ?? 0
  const moves = listCashMovements(businessDate)
  const sum = (kind: CashMovementDto['kind']) => moves.filter((m) => m.kind === kind).reduce((a, m) => a + m.amount, 0)
  const opening = settings.billing.pettyCash
  const topUp = sum('top_up')
  const expense = sum('expense')
  const withdrawal = sum('withdrawal')
  return { businessDate, opening, cashSales, topUp, expense, withdrawal, expected: opening + cashSales + topUp - expense - withdrawal, movements: moves }
}

// ---------- item on/off ----------

export function setItemFavourite(itemId: string, isFavourite: boolean): void {
  getDb().transaction((tx) => {
    const t = tx as unknown as HickeyDb
    const it = t.select().from(items).where(eq(items.id, itemId)).get()
    if (!it) throw new Error('Item not found')
    const patch = { isFavourite, updatedAt: nowIso() }
    t.update(items).set(patch).where(eq(items.id, itemId)).run()
    outbox(t, 'items', itemId, { ...it, ...patch })
  })
}

export function setItemActive(itemId: string, isActive: boolean): void {
  getDb().transaction((tx) => {
    const t = tx as unknown as HickeyDb
    const it = t.select().from(items).where(eq(items.id, itemId)).get()
    if (!it) throw new Error('Item not found')
    const patch = { isActive, updatedAt: nowIso() }
    t.update(items).set(patch).where(eq(items.id, itemId)).run()
    outbox(t, 'items', itemId, { ...it, ...patch })
  })
}
