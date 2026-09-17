import { schema, verifyPin } from '@hickey/db'
import { appSettingsSchema, defaultAppSettings, nowIso, type AppSettings } from '@hickey/shared'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { writeFileSync } from 'node:fs'
import { db } from '../db'
import { dataDir } from '../paths'
import * as adminSvc from '../services/admin'
import * as menuAdmin from '../services/menu-admin'
import * as ordersSvc from '../services/orders'
import { reportToCsv, runReport } from '../services/reports'
import { reportHtml } from '../services/report-print'
import { backupNow, listBackups } from '../services/backup'
import { enqueueAllRows, getSyncStatus, kickSync, restoreFromCloud, syncNow, testSync } from '../services/sync'
import { printHtml, testPrint } from '../services/printer'
import { billHtml, kotHtml } from '../services/receipts'
import type { IpcChannel, IpcReq, IpcRes, MenuSnapshot, OrderActionResult, SessionUser } from './contract'

/** Who is logged in at the counter (set by auth:login). Used for created_by and audit rows. */
let currentUser: SessionUser | null = null

type Handler<C extends IpcChannel> = (req: IpcReq<C>) => IpcRes<C> | Promise<IpcRes<C>>

function handle<C extends IpcChannel>(channel: C, fn: Handler<C>): void {
  ipcMain.handle(channel, async (_event, req: IpcReq<C>) => {
    try {
      return await fn(req)
    } catch (err) {
      // Surface a readable message to the renderer; keep the stack in the main log.
      console.error(`[ipc] ${channel} failed`, err)
      throw new Error(err instanceof Error ? err.message : String(err))
    }
  })
}

const { users, settings, categories, items, itemVariants, addonGroups, addons, diningTables, itemNotes } = schema

export function loadSettings(): AppSettings {
  const row = db().select().from(settings).where(eq(settings.key, 'app')).get()
  const parsed = appSettingsSchema.safeParse(row?.value ?? {})
  return parsed.success ? parsed.data : defaultAppSettings()
}

function ctx() {
  const s = loadSettings()
  return { settings: s, userId: currentUser?.id ?? null, deviceId: s.sync.deviceId || 'pos' }
}

/** Print KOT (if enabled) and bill for a just-billed order; never throws — the sale is already saved. */
async function printAfterBill(
  order: ordersSvc.OrderDto,
  kot: ordersSvc.KotTicket | null,
  opts: { bill: boolean; kot: boolean }
): Promise<string | undefined> {
  const s = loadSettings()
  const errors: string[] = []
  if (opts.kot && kot && s.receipt.printKot) {
    try {
      await printHtml({ html: kotHtml(order, kot, s), copies: s.receipt.kotCopies }, s)
    } catch (err) {
      errors.push(`KOT: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  if (opts.bill) {
    try {
      await printHtml({ html: billHtml(order, s, { cashierName: currentUser?.name }), copies: s.receipt.billCopies }, s)
    } catch (err) {
      errors.push(`Bill: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return errors.length ? errors.join(' | ') : undefined
}

export function registerIpcHandlers(): void {
  handle('app:info', () => ({
    version: app.getVersion(),
    dataDir: dataDir(),
    deviceId: loadSettings().sync.deviceId,
    isPackaged: app.isPackaged
  }))

  handle('auth:users', () =>
    db()
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(and(eq(users.isActive, true), isNull(users.deletedAt)))
      .orderBy(asc(users.role), asc(users.name))
      .all()
  )

  handle('auth:login', ({ userId, pin }) => {
    const u = db().select().from(users).where(eq(users.id, userId)).get()
    if (!u || !u.isActive || u.deletedAt || !verifyPin(pin, u.pinHash)) return null
    const session: SessionUser = { id: u.id, name: u.name, role: u.role }
    currentUser = session
    return session
  })

  handle('auth:logout', () => {
    currentUser = null
  })

  handle('app:businessDate', () => ordersSvc.currentBusinessDate(loadSettings()))

  handle('auth:verifyAdminPin', ({ pin }) => {
    const admins = db()
      .select({ pinHash: users.pinHash })
      .from(users)
      .where(and(eq(users.role, 'admin'), eq(users.isActive, true), isNull(users.deletedAt)))
      .all()
    return admins.some((a) => verifyPin(pin, a.pinHash))
  })

  handle('settings:get', () => loadSettings())

  handle('settings:set', (next) => {
    const value = appSettingsSchema.parse(next)
    const prev = loadSettings().sync
    db()
      .insert(settings)
      .values({ key: 'app', value, updatedAt: nowIso() })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: nowIso() } })
      .run()
    // First enable, or a different project/device: the cloud needs everything, not just future changes.
    const n = value.sync
    if (n.enabled && n.deviceToken && (!prev.enabled || prev.deviceToken !== n.deviceToken || prev.supabaseUrl !== n.supabaseUrl)) {
      enqueueAllRows()
      kickSync()
    }
    return value
  })

  handle('menu:snapshot', (): MenuSnapshot => {
    const d = db()
    return {
      categories: d
        .select({ id: categories.id, name: categories.name, sortOrder: categories.sortOrder, isActive: categories.isActive })
        .from(categories)
        .where(isNull(categories.deletedAt))
        .orderBy(asc(categories.sortOrder), asc(categories.name))
        .all(),
      items: d
        .select({
          id: items.id,
          categoryId: items.categoryId,
          name: items.name,
          shortCode: items.shortCode,
          price: items.price,
          foodType: items.foodType,
          isActive: items.isActive,
          sortOrder: items.sortOrder,
          addonGroupIds: items.addonGroupIds
        })
        .from(items)
        .where(isNull(items.deletedAt))
        .orderBy(asc(items.sortOrder), asc(items.name))
        .all(),
      variants: d
        .select({
          id: itemVariants.id,
          itemId: itemVariants.itemId,
          name: itemVariants.name,
          price: itemVariants.price,
          sortOrder: itemVariants.sortOrder,
          isActive: itemVariants.isActive
        })
        .from(itemVariants)
        .where(isNull(itemVariants.deletedAt))
        .orderBy(asc(itemVariants.sortOrder))
        .all(),
      addonGroups: d
        .select({
          id: addonGroups.id,
          name: addonGroups.name,
          minSelect: addonGroups.minSelect,
          maxSelect: addonGroups.maxSelect,
          sortOrder: addonGroups.sortOrder
        })
        .from(addonGroups)
        .where(isNull(addonGroups.deletedAt))
        .orderBy(asc(addonGroups.sortOrder))
        .all(),
      addons: d
        .select({ id: addons.id, groupId: addons.groupId, name: addons.name, price: addons.price, isActive: addons.isActive })
        .from(addons)
        .where(isNull(addons.deletedAt))
        .all(),
      tables: d
        .select({
          id: diningTables.id,
          name: diningTables.name,
          area: diningTables.area,
          seats: diningTables.seats,
          sortOrder: diningTables.sortOrder
        })
        .from(diningTables)
        .where(and(eq(diningTables.isActive, true), isNull(diningTables.deletedAt)))
        .orderBy(asc(diningTables.area), asc(diningTables.sortOrder))
        .all(),
      itemNotes: d
        .select({ text: itemNotes.text })
        .from(itemNotes)
        .where(and(eq(itemNotes.isActive, true), isNull(itemNotes.deletedAt)))
        .orderBy(asc(itemNotes.sortOrder))
        .all()
        .map((n) => n.text)
    }
  })

  // ----- orders -----

  handle('orders:save', ({ input, hold }) => ordersSvc.saveOrder(input, ctx(), hold ? 'held' : 'running'))

  handle('orders:kot', async ({ input }): Promise<OrderActionResult> => {
    const { order, kot } = ordersSvc.saveWithKot(input, ctx())
    const printError = await printAfterBill(order, kot, { bill: false, kot: true })
    return { order, printError }
  })

  handle('orders:saveAndPrint', async ({ input, payments, print = true }): Promise<OrderActionResult> => {
    const { order, kot } = ordersSvc.saveAndBill(input, payments, ctx())
    kickSync()
    const printError = print ? await printAfterBill(order, kot, { bill: true, kot: true }) : undefined
    return { order, printError }
  })

  handle('orders:settle', async ({ orderId, payments, print = true }): Promise<OrderActionResult> => {
    const order = ordersSvc.settleOrder(orderId, payments, ctx())
    kickSync()
    const printError = print ? await printAfterBill(order, ordersSvc.latestKot(orderId), { bill: true, kot: false }) : undefined
    return { order, printError }
  })

  handle('orders:cancel', ({ orderId, reason }) => {
    const o = ordersSvc.cancelOrder(orderId, reason, ctx())
    kickSync()
    return o
  })
  handle('orders:markReady', ({ orderId }) => ordersSvc.markReady(orderId, ctx()))

  handle('orders:reprint', async ({ orderId, what }) => {
    const s = loadSettings()
    const order = ordersSvc.getOrder(orderId, s)
    if (!order) return { ok: false, error: 'Order not found' }
    try {
      if (what === 'bill') {
        await printHtml({ html: billHtml(order, s, { cashierName: currentUser?.name, duplicate: true }) }, s)
      } else {
        const kot = ordersSvc.latestKot(orderId)
        if (!kot) return { ok: false, error: 'No KOT for this order' }
        await printHtml({ html: kotHtml(order, kot, s, { duplicate: true }) }, s)
      }
      ordersSvc.recordReprint(orderId, what, ctx())
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  handle('orders:receiptHtml', ({ orderId, what }) => {
    const s = loadSettings()
    const order = ordersSvc.getOrder(orderId, s)
    if (!order) return null
    if (what === 'bill') return billHtml(order, s, { cashierName: currentUser?.name })
    const kot = ordersSvc.latestKot(orderId)
    return kot ? kotHtml(order, kot, s) : null
  })

  handle('orders:list', (filter) => ordersSvc.listOrders(filter, loadSettings()))
  handle('orders:get', ({ orderId }) => ordersSvc.getOrder(orderId, loadSettings()))
  handle('live:summary', ({ businessDate }) => {
    const s = loadSettings()
    return ordersSvc.liveSummary(businessDate ?? ordersSvc.currentBusinessDate(s), s)
  })

  // ----- reports -----

  handle('reports:run', (req) => runReport(req, loadSettings()))

  handle('reports:export', async (req) => {
    const result = runReport(req, loadSettings())
    const win = BrowserWindow.getAllWindows()[0]
    const { canceled, filePath } = await dialog.showSaveDialog(win!, {
      title: 'Export report to Excel (CSV)',
      defaultPath: `${result.title.replace(/[^A-Za-z0-9]+/g, '-')}-${req.from}-to-${req.to}.csv`,
      filters: [{ name: 'CSV (Excel)', extensions: ['csv'] }]
    })
    if (canceled || !filePath) return { ok: false }
    try {
      writeFileSync(filePath, reportToCsv(result), 'utf8')
      return { ok: true, path: filePath }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  handle('reports:print', async (req) => {
    const s = loadSettings()
    try {
      await printHtml({ html: reportHtml(runReport(req, s), s) }, s)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ----- users / cash / menu on-off -----

  handle('users:list', () => adminSvc.listUsers())
  handle('users:save', (input) => {
    if (currentUser?.role !== 'admin') throw new Error('Only an admin can manage users')
    const c = ctx()
    return adminSvc.saveUser(input, c.userId, c.deviceId)
  })

  handle('cash:summary', ({ businessDate }) => {
    const s = loadSettings()
    return adminSvc.cashFlowSummary(businessDate ?? ordersSvc.currentBusinessDate(s), s)
  })
  handle('cash:add', (input) => {
    const c = ctx()
    return adminSvc.addCashMovement(input, c.userId, c.deviceId, c.settings)
  })
  handle('cash:delete', ({ id }) => {
    if (currentUser?.role !== 'admin') throw new Error('Only an admin can delete cash entries')
    const c = ctx()
    adminSvc.deleteCashMovement(id, c.deviceId, c.userId)
  })

  handle('menu:setItemActive', ({ itemId, isActive }) => adminSvc.setItemActive(itemId, isActive))

  // ----- sync & backups -----

  handle('sync:status', () => getSyncStatus())
  handle('sync:now', () => syncNow({ force: true }))
  handle('sync:resyncAll', async () => {
    if (currentUser?.role !== 'admin') throw new Error('Only an admin can re-upload')
    enqueueAllRows()
    return syncNow({ force: true })
  })
  handle('sync:test', (sync) => testSync(sync))
  handle('sync:restore', async () => {
    if (currentUser?.role !== 'admin') throw new Error('Only an admin can restore')
    return restoreFromCloud()
  })
  handle('backup:list', () => listBackups())
  handle('backup:now', () => backupNow())

  const adminOnly = () => {
    if (currentUser?.role !== 'admin') throw new Error('Only an admin can edit the menu')
    const c = ctx()
    return { userId: c.userId, deviceId: c.deviceId }
  }
  handle('menu:saveCategory', (input) => menuAdmin.saveCategory(input, adminOnly()))
  handle('menu:deleteCategory', ({ id }) => menuAdmin.deleteCategory(id, adminOnly()))
  handle('menu:saveItem', (input) => menuAdmin.saveItem(input, adminOnly()))
  handle('menu:deleteItem', ({ id }) => menuAdmin.deleteItem(id, adminOnly()))
  handle('menu:saveAddon', (input) => menuAdmin.saveAddon(input, adminOnly()))
  handle('menu:deleteAddon', ({ id }) => menuAdmin.deleteAddon(id, adminOnly()))

  handle('update:check', async () => {
    if (!app.isPackaged) return { ok: false, message: 'Updates only work in the installed app' }
    try {
      const r = await autoUpdater.checkForUpdates()
      const v = r?.updateInfo.version
      return v && v !== app.getVersion() ? { ok: true, message: `Version ${v} is downloading; it installs when the app closes.` } : { ok: true, message: `You have the latest version (${app.getVersion()})` }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  })
  handle('update:install', () => autoUpdater.quitAndInstall())

  handle('printers:list', async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return []
    const list = await win.webContents.getPrintersAsync()
    return list.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: (p.options as Record<string, string>)['is-default'] === 'true' }))
  })

  handle('printers:test', async ({ printerName }) => {
    try {
      await testPrint({ ...loadSettings(), printer: { ...loadSettings().printer, windowsPrinterName: printerName } })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
