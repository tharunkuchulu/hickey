import { defaultAppSettings, nowIso, uuidv7 } from '@hickey/shared'
import { eq } from 'drizzle-orm'
import type { HickeyDb } from './index'
import { hashPin } from './pin'
import { addonGroups, addons, categories, diningTables, itemNotes, items, itemVariants, settings, users } from './schema/index'
import { SEED_ADDON_GROUPS, SEED_CATEGORIES, SEED_ITEM_NOTES, SEED_ITEMS } from './seed/menu-data'

/**
 * First-run seed: default settings, an admin user (PIN 1234 — must be changed in Settings), a cashier,
 * 8 tables, and the real HICKEY NALSAR menu transcribed from Petpooja.
 * Idempotent: does nothing if a user already exists.
 */
export function seedIfEmpty(db: HickeyDb, opts: { deviceId: string; menu?: boolean } = { deviceId: 'dev' }): boolean {
  const existing = db.select({ id: users.id }).from(users).limit(1).all()
  if (existing.length > 0) return false

  const now = nowIso()
  const appSettings = defaultAppSettings()
  appSettings.cafe.name = 'HICKEY NALSAR'
  appSettings.cafe.addressLine1 = 'Justice City, Shamirpet'
  appSettings.cafe.addressLine2 = 'Hyderabad, Telangana 500101'
  appSettings.sync.deviceId = opts.deviceId

  db.transaction((tx) => {
    tx.insert(settings).values({ key: 'app', value: appSettings, updatedAt: now }).run()

    tx.insert(users)
      .values([
        { id: uuidv7(), name: 'Admin', pinHash: hashPin('1234'), role: 'admin', isActive: true, createdAt: now, updatedAt: now },
        { id: uuidv7(), name: 'biller', pinHash: hashPin('1111'), role: 'cashier', isActive: true, createdAt: now, updatedAt: now }
      ])
      .run()

    tx.insert(diningTables)
      .values(
        Array.from({ length: 8 }, (_, i) => ({
          id: uuidv7(),
          name: `T${i + 1}`,
          area: 'Main',
          seats: 4,
          sortOrder: i,
          isActive: true,
          createdAt: now,
          updatedAt: now
        }))
      )
      .run()

    if (opts.menu ?? true) seedMenu(tx as unknown as HickeyDb, now)
  })
  return true
}

/** Loads the transcribed Petpooja menu. Safe to call on an empty menu only. */
export function seedMenu(db: HickeyDb, now = nowIso()): void {
  const categoryIds = new Map<string, string>()
  SEED_CATEGORIES.forEach((name, i) => {
    const id = uuidv7()
    categoryIds.set(name, id)
    db.insert(categories).values({ id, name, sortOrder: i, isActive: true, createdAt: now, updatedAt: now }).run()
  })

  const addonGroupIds: string[] = []
  SEED_ADDON_GROUPS.forEach((g, i) => {
    const id = uuidv7()
    addonGroupIds.push(id)
    db.insert(addonGroups).values({ id, name: g.name, minSelect: 0, maxSelect: 10, sortOrder: i, createdAt: now, updatedAt: now }).run()
    g.addons.forEach((a) =>
      db.insert(addons).values({ id: uuidv7(), groupId: id, name: a.name, price: a.price, isActive: true, createdAt: now, updatedAt: now }).run()
    )
  })

  SEED_ITEMS.forEach((it, i) => {
    let categoryId = categoryIds.get(it.category)
    if (!categoryId) {
      categoryId = uuidv7()
      categoryIds.set(it.category, categoryId)
      db.insert(categories)
        .values({ id: categoryId, name: it.category, sortOrder: categoryIds.size, isActive: true, createdAt: now, updatedAt: now })
        .run()
    }
    const itemId = uuidv7()
    db.insert(items)
      .values({
        id: itemId,
        categoryId,
        name: it.name,
        shortCode: it.shortCode || null,
        price: it.price,
        foodType: it.foodType,
        isActive: true,
        sortOrder: i,
        addonGroupIds: it.addons === false ? [] : addonGroupIds,
        createdAt: now,
        updatedAt: now
      })
      .run()
    it.variants?.forEach((v, vi) =>
      db.insert(itemVariants)
        .values({ id: uuidv7(), itemId, name: v.name, price: v.price, sortOrder: vi, isActive: true, createdAt: now, updatedAt: now })
        .run()
    )
  })

  SEED_ITEM_NOTES.forEach((text, i) =>
    db.insert(itemNotes).values({ id: uuidv7(), text, sortOrder: i, isActive: true, createdAt: now, updatedAt: now }).run()
  )
}

export function getAppSettings(db: HickeyDb) {
  const row = db.select().from(settings).where(eq(settings.key, 'app')).get()
  return row?.value ?? null
}
