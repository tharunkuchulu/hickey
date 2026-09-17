/**
 * Local SQLite schema (Drizzle). This is the POS machine's source of truth.
 * The Supabase/Postgres mirror uses the same table and column names
 * (see /supabase/migrations) so sync is a straight row copy.
 *
 * Conventions:
 *  - ids are UUID v7 strings generated on the POS
 *  - money columns are integer paise
 *  - timestamps are ISO-8601 UTC strings
 *  - master data is soft-deleted via deleted_at so the cloud mirror can follow
 */
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const id = () => text('id').primaryKey()
const createdAt = () => text('created_at').notNull()
const updatedAt = () => text('updated_at').notNull()
const deletedAt = () => text('deleted_at')
const bool = (name: string) => integer(name, { mode: 'boolean' })

// ---------- configuration ----------

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: updatedAt()
})

export const users = sqliteTable('users', {
  id: id(),
  name: text('name').notNull(),
  pinHash: text('pin_hash').notNull(),
  role: text('role', { enum: ['admin', 'cashier'] }).notNull(),
  isActive: bool('is_active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: deletedAt()
})

// ---------- menu ----------

export const categories = sqliteTable('categories', {
  id: id(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: bool('is_active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: deletedAt()
})

export const items = sqliteTable(
  'items',
  {
    id: id(),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id),
    name: text('name').notNull(),
    shortCode: text('short_code'),
    price: integer('price').notNull().default(0),
    foodType: text('food_type', { enum: ['veg', 'nonveg', 'egg'] }).notNull().default('veg'),
    isActive: bool('is_active').notNull().default(true),
    /** Pinned to the "Favourites" rail at the top of the billing screen (regular / best sellers). */
    isFavourite: bool('is_favourite').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    addonGroupIds: text('addon_group_ids', { mode: 'json' }).$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt()
  },
  (t) => [index('items_category_idx').on(t.categoryId), index('items_short_code_idx').on(t.shortCode)]
)

export const itemVariants = sqliteTable(
  'item_variants',
  {
    id: id(),
    itemId: text('item_id')
      .notNull()
      .references(() => items.id),
    name: text('name').notNull(),
    price: integer('price').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: bool('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt()
  },
  (t) => [index('item_variants_item_idx').on(t.itemId)]
)

export const addonGroups = sqliteTable('addon_groups', {
  id: id(),
  name: text('name').notNull(),
  minSelect: integer('min_select').notNull().default(0),
  maxSelect: integer('max_select').notNull().default(10),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: deletedAt()
})

export const addons = sqliteTable(
  'addons',
  {
    id: id(),
    groupId: text('group_id')
      .notNull()
      .references(() => addonGroups.id),
    name: text('name').notNull(),
    price: integer('price').notNull().default(0),
    isActive: bool('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt()
  },
  (t) => [index('addons_group_idx').on(t.groupId)]
)

export const diningTables = sqliteTable('dining_tables', {
  id: id(),
  name: text('name').notNull(),
  area: text('area').notNull().default('Main'),
  seats: integer('seats').notNull().default(4),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: bool('is_active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: deletedAt()
})

// ---------- transactions ----------

export const orders = sqliteTable(
  'orders',
  {
    id: id(),
    deviceId: text('device_id').notNull(),
    billNo: text('bill_no'),
    businessDate: text('business_date').notNull(),
    orderType: text('order_type', { enum: ['dine_in', 'pick_up', 'delivery'] }).notNull(),
    tableId: text('table_id').references(() => diningTables.id),
    status: text('status', { enum: ['running', 'held', 'printed', 'settled', 'cancelled'] }).notNull(),
    kotNo: integer('kot_no'),
    customerName: text('customer_name'),
    customerPhone: text('customer_phone'),
    customerId: text('customer_id'),
    notes: text('notes'),
    discountType: text('discount_type', { enum: ['percent', 'amount'] }),
    discountValue: integer('discount_value').notNull().default(0),
    discountReason: text('discount_reason'),
    charges: integer('charges').notNull().default(0),
    taxPercent: integer('tax_percent').notNull().default(0),
    subtotal: integer('subtotal').notNull().default(0),
    discount: integer('discount').notNull().default(0),
    tax: integer('tax').notNull().default(0),
    roundOff: integer('round_off').notNull().default(0),
    total: integer('total').notNull().default(0),
    cancelReason: text('cancel_reason'),
    printCount: integer('print_count').notNull().default(0),
    createdBy: text('created_by').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    printedAt: text('printed_at'),
    settledAt: text('settled_at'),
    readyAt: text('ready_at')
  },
  (t) => [
    index('orders_business_date_idx').on(t.businessDate),
    index('orders_status_idx').on(t.status),
    index('orders_table_idx').on(t.tableId),
    uniqueIndex('orders_bill_no_uidx').on(t.deviceId, t.billNo)
  ]
)

export type OrderLineAddon = { id: string | null; name: string; price: number }

export const orderItems = sqliteTable(
  'order_items',
  {
    id: id(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    itemId: text('item_id'), // nullable: item may be deleted later; name/price are snapshotted
    name: text('name').notNull(),
    variantName: text('variant_name'),
    unitPrice: integer('unit_price').notNull(),
    qty: integer('qty').notNull(),
    addons: text('addons', { mode: 'json' }).$type<OrderLineAddon[]>().notNull().default([]),
    addonsTotal: integer('addons_total').notNull().default(0),
    lineTotal: integer('line_total').notNull(),
    notes: text('notes'),
    kotNo: integer('kot_no'),
    isCancelled: bool('is_cancelled').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [index('order_items_order_idx').on(t.orderId), index('order_items_item_idx').on(t.itemId)]
)

export type KotLine = {
  name: string
  variantName: string | null
  qty: number
  notes: string | null
  addons: string[]
}

export const kots = sqliteTable(
  'kots',
  {
    id: id(),
    deviceId: text('device_id').notNull(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    kotNo: integer('kot_no').notNull(),
    businessDate: text('business_date').notNull(),
    // snapshot of the lines on this ticket so reprint is exact
    lines: text('lines', { mode: 'json' }).$type<KotLine[]>().notNull(),
    createdAt: createdAt(),
    printedAt: text('printed_at')
  },
  (t) => [index('kots_order_idx').on(t.orderId), index('kots_business_date_idx').on(t.businessDate)]
)

export const payments = sqliteTable(
  'payments',
  {
    id: id(),
    deviceId: text('device_id').notNull(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    mode: text('mode', { enum: ['cash', 'card', 'upi', 'other', 'due'] }).notNull(),
    amount: integer('amount').notNull(),
    tendered: integer('tendered'),
    reference: text('reference'),
    createdAt: createdAt()
  },
  (t) => [index('payments_order_idx').on(t.orderId)]
)

export const cashRegisterSessions = sqliteTable(
  'cash_register_sessions',
  {
    id: id(),
    deviceId: text('device_id').notNull(),
    businessDate: text('business_date').notNull(),
    openedBy: text('opened_by').references(() => users.id),
    openedAt: text('opened_at').notNull(),
    openingCash: integer('opening_cash').notNull().default(0),
    closedBy: text('closed_by').references(() => users.id),
    closedAt: text('closed_at'),
    closingCash: integer('closing_cash'),
    expectedCash: integer('expected_cash'),
    difference: integer('difference'),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (t) => [index('cash_sessions_business_date_idx').on(t.businessDate)]
)

/** Bill / KOT sequence counters, e.g. key 'bill:2026-09-17' -> 42. */
export const counters = sqliteTable('counters', {
  key: text('key').primaryKey(),
  value: integer('value').notNull().default(0)
})

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: id(),
    deviceId: text('device_id').notNull(),
    userId: text('user_id'),
    action: text('action').notNull(), // e.g. order.cancel, order.discount, bill.reprint, item.price_change
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    details: text('details', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: createdAt()
  },
  (t) => [index('audit_log_created_idx').on(t.createdAt)]
)

export const customers = sqliteTable(
  'customers',
  {
    id: id(),
    name: text('name').notNull(),
    phone: text('phone'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt()
  },
  (t) => [index('customers_phone_idx').on(t.phone)]
)

/** Preset quick notes shown when adding a note to a cart line (Petpooja "Item Notes"). */
export const itemNotes = sqliteTable('item_notes', {
  id: id(),
  text: text('text').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: bool('is_active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: deletedAt()
})

/** Cash drawer movements outside sales: Expense / Withdrawal / Cash Top-Up (Petpooja "Payments & Finance"). */
export const cashMovements = sqliteTable(
  'cash_movements',
  {
    id: id(),
    deviceId: text('device_id').notNull(),
    businessDate: text('business_date').notNull(),
    kind: text('kind', { enum: ['expense', 'withdrawal', 'top_up'] }).notNull(),
    amount: integer('amount').notNull(),
    reason: text('reason'),
    userId: text('user_id').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt()
  },
  (t) => [index('cash_movements_business_date_idx').on(t.businessDate)]
)

// ---------- sync (local only, never mirrored) ----------

export const syncOutbox = sqliteTable('sync_outbox', {
  seq: integer('seq').primaryKey({ autoIncrement: true }),
  tableName: text('table_name').notNull(),
  rowId: text('row_id').notNull(),
  op: text('op', { enum: ['upsert', 'delete'] }).notNull(),
  payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  createdAt: createdAt()
})

export const syncState = sqliteTable('sync_state', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})

/** Tables that get mirrored to the cloud, in dependency order. */
export const SYNCED_TABLES = [
  'users',
  'categories',
  'items',
  'item_variants',
  'addon_groups',
  'addons',
  'dining_tables',
  'orders',
  'order_items',
  'kots',
  'payments',
  'cash_register_sessions',
  'customers',
  'item_notes',
  'cash_movements',
  'audit_log'
] as const
export type SyncedTable = (typeof SYNCED_TABLES)[number]
