/**
 * Menu management writes: categories, items (+ variants), add-ons. Soft deletes only, so old bills
 * keep their snapshots and the cloud mirror follows. Every write queues sync-outbox rows.
 */
import { schema, type HickeyDb } from '@hickey/db'
import { nowIso, uuidv7 } from '@hickey/shared'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { db as getDb } from '../db'
import type { AddonInput, CategoryInput, ItemInput } from '../../types/menu-admin'

const { categories, items, itemVariants, addons, addonGroups, syncOutbox, auditLog } = schema

function outbox(tx: HickeyDb, tableName: string, rowId: string, payload: Record<string, unknown>) {
  tx.insert(syncOutbox).values({ tableName, rowId, op: 'upsert', payload, createdAt: nowIso() }).run()
}

function audit(tx: HickeyDb, actor: { userId: string | null; deviceId: string }, action: string, entity: string, entityId: string, details: Record<string, unknown>) {
  const id = uuidv7()
  const row = { id, deviceId: actor.deviceId, userId: actor.userId, action, entity, entityId, details, createdAt: nowIso() }
  tx.insert(auditLog).values(row).run()
  outbox(tx, 'audit_log', id, row)
}

type Actor = { userId: string | null; deviceId: string }

export function saveCategory(input: CategoryInput, actor: Actor): string {
  const name = input.name.trim()
  if (!name) throw new Error('Category name is required')
  return getDb().transaction((tx) => {
    const t = tx as unknown as HickeyDb
    const now = nowIso()
    const existing = input.id ? t.select().from(categories).where(eq(categories.id, input.id)).get() : undefined
    const maxSort = t.select({ m: sql<number>`coalesce(max(${categories.sortOrder}), -1)` }).from(categories).get()?.m ?? -1
    const row = {
      id: existing?.id ?? uuidv7(),
      name,
      sortOrder: input.sortOrder ?? existing?.sortOrder ?? maxSort + 1,
      isActive: input.isActive ?? existing?.isActive ?? true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null
    }
    if (existing) t.update(categories).set(row).where(eq(categories.id, row.id)).run()
    else t.insert(categories).values(row).run()
    outbox(t, 'categories', row.id, row)
    audit(t, actor, existing ? 'category.update' : 'category.create', 'categories', row.id, { name })
    return row.id
  })
}

export function deleteCategory(id: string, actor: Actor): void {
  getDb().transaction((tx) => {
    const t = tx as unknown as HickeyDb
    const live = t.select({ n: sql<number>`count(*)` }).from(items).where(and(eq(items.categoryId, id), isNull(items.deletedAt))).get()?.n ?? 0
    if (live > 0) throw new Error(`Move or delete the ${live} item(s) in this category first`)
    const c = t.select().from(categories).where(eq(categories.id, id)).get()
    if (!c) return
    const patch = { deletedAt: nowIso(), updatedAt: nowIso(), isActive: false }
    t.update(categories).set(patch).where(eq(categories.id, id)).run()
    outbox(t, 'categories', id, { ...c, ...patch })
    audit(t, actor, 'category.delete', 'categories', id, { name: c.name })
  })
}

export function saveItem(input: ItemInput, actor: Actor): string {
  const name = input.name.trim()
  if (!name) throw new Error('Item name is required')
  if (!input.categoryId) throw new Error('Choose a category')
  const variants = input.variants.filter((v) => v.name.trim())
  if (variants.length === 0 && (!Number.isInteger(input.price) || input.price < 0)) throw new Error('Enter a price')
  for (const v of variants) if (!Number.isInteger(v.price) || v.price < 0) throw new Error(`Enter a price for ${v.name}`)

  return getDb().transaction((tx) => {
    const t = tx as unknown as HickeyDb
    const now = nowIso()
    const existing = input.id ? t.select().from(items).where(eq(items.id, input.id)).get() : undefined
    const code = input.shortCode?.trim() || null
    if (code) {
      const clash = t.select({ id: items.id }).from(items).where(and(sql`lower(${items.shortCode}) = lower(${code})`, isNull(items.deletedAt))).get()
      if (clash && clash.id !== existing?.id) throw new Error(`Short code ${code} is already used`)
    }
    const maxSort = t.select({ m: sql<number>`coalesce(max(${items.sortOrder}), -1)` }).from(items).get()?.m ?? -1
    const row = {
      id: existing?.id ?? uuidv7(),
      categoryId: input.categoryId,
      name,
      shortCode: code,
      price: variants.length ? 0 : input.price,
      foodType: input.foodType,
      isActive: input.isActive ?? existing?.isActive ?? true,
      // Every column travels with the row: a key missing from the outbox payload reached the cloud as NULL
      // and stalled sync for hours on 18 Sep 2026 (items.is_favourite NOT NULL).
      isFavourite: existing?.isFavourite ?? false,
      sortOrder: existing?.sortOrder ?? maxSort + 1,
      addonGroupIds: input.addonGroupIds,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null
    }
    if (existing) t.update(items).set(row).where(eq(items.id, row.id)).run()
    else t.insert(items).values(row).run()
    outbox(t, 'items', row.id, row)
    if (existing && existing.price !== row.price) audit(t, actor, 'item.price_change', 'items', row.id, { name, from: existing.price, to: row.price })
    else audit(t, actor, existing ? 'item.update' : 'item.create', 'items', row.id, { name })

    // Variants: replace set, soft-delete the ones that were removed.
    const current = t.select().from(itemVariants).where(and(eq(itemVariants.itemId, row.id), isNull(itemVariants.deletedAt))).all()
    const keep = new Set<string>()
    variants.forEach((v, i) => {
      const prev = v.id ? current.find((c) => c.id === v.id) : undefined
      const vr = {
        id: prev?.id ?? uuidv7(),
        itemId: row.id,
        name: v.name.trim(),
        price: v.price,
        sortOrder: i,
        isActive: v.isActive ?? true,
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null
      }
      keep.add(vr.id)
      if (prev) t.update(itemVariants).set(vr).where(eq(itemVariants.id, vr.id)).run()
      else t.insert(itemVariants).values(vr).run()
      outbox(t, 'item_variants', vr.id, vr)
      if (prev && prev.price !== vr.price) audit(t, actor, 'item.price_change', 'item_variants', vr.id, { name: `${name} (${vr.name})`, from: prev.price, to: vr.price })
    })
    for (const c of current) {
      if (keep.has(c.id)) continue
      const patch = { deletedAt: now, updatedAt: now, isActive: false }
      t.update(itemVariants).set(patch).where(eq(itemVariants.id, c.id)).run()
      outbox(t, 'item_variants', c.id, { ...c, ...patch })
    }
    return row.id
  })
}

export function deleteItem(id: string, actor: Actor): void {
  getDb().transaction((tx) => {
    const t = tx as unknown as HickeyDb
    const it = t.select().from(items).where(eq(items.id, id)).get()
    if (!it) return
    const now = nowIso()
    const patch = { deletedAt: now, updatedAt: now, isActive: false }
    t.update(items).set(patch).where(eq(items.id, id)).run()
    outbox(t, 'items', id, { ...it, ...patch })
    for (const v of t.select().from(itemVariants).where(and(eq(itemVariants.itemId, id), isNull(itemVariants.deletedAt))).all()) {
      t.update(itemVariants).set(patch).where(eq(itemVariants.id, v.id)).run()
      outbox(t, 'item_variants', v.id, { ...v, ...patch })
    }
    audit(t, actor, 'item.delete', 'items', id, { name: it.name })
  })
}

export function saveAddon(input: AddonInput, actor: Actor): string {
  const name = input.name.trim()
  if (!name) throw new Error('Add-on name is required')
  if (!Number.isInteger(input.price) || input.price < 0) throw new Error('Enter a price')
  return getDb().transaction((tx) => {
    const t = tx as unknown as HickeyDb
    const now = nowIso()
    if (!t.select({ id: addonGroups.id }).from(addonGroups).where(eq(addonGroups.id, input.groupId)).get()) throw new Error('Add-on group not found')
    const existing = input.id ? t.select().from(addons).where(eq(addons.id, input.id)).get() : undefined
    const row = {
      id: existing?.id ?? uuidv7(),
      groupId: input.groupId,
      name,
      price: input.price,
      isActive: input.isActive ?? existing?.isActive ?? true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null
    }
    if (existing) t.update(addons).set(row).where(eq(addons.id, row.id)).run()
    else t.insert(addons).values(row).run()
    outbox(t, 'addons', row.id, row)
    audit(t, actor, existing ? 'addon.update' : 'addon.create', 'addons', row.id, { name, price: input.price })
    return row.id
  })
}

export function deleteAddon(id: string, actor: Actor): void {
  getDb().transaction((tx) => {
    const t = tx as unknown as HickeyDb
    const a = t.select().from(addons).where(eq(addons.id, id)).get()
    if (!a) return
    const patch = { deletedAt: nowIso(), updatedAt: nowIso(), isActive: false }
    t.update(addons).set(patch).where(eq(addons.id, id)).run()
    outbox(t, 'addons', id, { ...a, ...patch })
    audit(t, actor, 'addon.delete', 'addons', id, { name: a.name })
  })
}
