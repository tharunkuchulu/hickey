import { resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { hashPin, openDatabase, seedIfEmpty, verifyPin } from './index'
import { categories, items, orders, settings, users } from './schema/index'

const migrationsFolder = resolve(__dirname, '../migrations')

describe('database', () => {
  it('migrates, seeds once, and enforces foreign keys', () => {
    const { db, sqlite } = openDatabase({ file: ':memory:', migrationsFolder })

    expect(seedIfEmpty(db, { deviceId: 'test' })).toBe(true)
    expect(seedIfEmpty(db, { deviceId: 'test' })).toBe(false) // idempotent

    const admin = db.select().from(users).where(eq(users.role, 'admin')).get()
    expect(admin).toBeDefined()
    expect(verifyPin('1234', admin!.pinHash)).toBe(true)
    expect(verifyPin('0000', admin!.pinHash)).toBe(false)

    expect(db.select().from(categories).all().length).toBe(14)
    const allItems = db.select().from(items).all()
    expect(allItems.length).toBe(89)
    expect(allItems.every((i) => Number.isInteger(i.price))).toBe(true)
    expect(allItems.find((i) => i.name === 'Egg & Mayo Sandwich')?.foodType).toBe('egg')

    const app = db.select().from(settings).where(eq(settings.key, 'app')).get()
    expect((app!.value as { sync: { deviceId: string } }).sync.deviceId).toBe('test')

    // FK on: an order pointing at a missing table must fail.
    expect(() =>
      db
        .insert(orders)
        .values({
          id: 'x',
          deviceId: 'test',
          businessDate: '2026-09-17',
          orderType: 'pick_up',
          tableId: 'does-not-exist',
          status: 'running',
          createdAt: 'now',
          updatedAt: 'now'
        })
        .run()
    ).toThrow(/FOREIGN KEY/)

    expect(sqlite.pragma('journal_mode', { simple: true })).toBe('memory') // WAL is a no-op for :memory:
    sqlite.close()
  })

  it('hashes pins with a fresh salt each time', () => {
    const a = hashPin('1234')
    const b = hashPin('1234')
    expect(a).not.toBe(b)
    expect(verifyPin('1234', a) && verifyPin('1234', b)).toBe(true)
  })
})
