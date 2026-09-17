/**
 * The typed IPC contract between renderer and main.
 * Every entry: channel name -> { req, res }. The preload exposes exactly these as window.hickey.*
 * Add a handler in ipc/handlers.ts for every channel listed here.
 */
import type { AppSettings, Category, MenuItem, ItemVariant, AddonGroup, Addon } from '@hickey/shared'
import type { LiveSummary, OrderDto, OrderInput, OrderListFilter, PaymentInput } from '../../types/orders'

export type { KotTicket, LiveSummary, OrderDto, OrderInput, OrderLineDto, OrderLineInput, OrderListFilter, PaymentInput } from '../../types/orders'
import type { DailySales, ReportRequest, ReportResult } from '../../types/reports'
import type { CashFlowSummaryDto, CashMovementDto, CashMovementInput, UserDto, UserInput } from '../../types/admin'
export type { DailySales, ReportRequest, ReportResult } from '../../types/reports'
export type { CashFlowSummaryDto, CashMovementDto, CashMovementInput, UserDto, UserInput } from '../../types/admin'
import type { AddonInput, CategoryInput, ItemInput } from '../../types/menu-admin'
export type { AddonInput, CategoryInput, ItemInput, VariantInput } from '../../types/menu-admin'

export interface SessionUser {
  id: string
  name: string
  role: 'admin' | 'cashier'
}

export interface DiningTableDto {
  id: string
  name: string
  area: string
  seats: number
  sortOrder: number
}

export interface MenuSnapshot {
  categories: Category[]
  items: MenuItem[]
  variants: ItemVariant[]
  addonGroups: AddonGroup[]
  addons: Addon[]
  tables: DiningTableDto[]
  itemNotes: string[]
}

/** Result of an action that also prints: the save always succeeds; a print failure is reported, not thrown. */
export interface OrderActionResult {
  order: OrderDto
  printError?: string
}

export interface PrinterInfo {
  name: string
  displayName: string
  isDefault: boolean
}

export interface SyncStatusDto {
  state: 'disabled' | 'offline' | 'syncing' | 'synced' | 'error'
  pending: number
  lastSyncAt: string | null
  error: string | null
}

export interface BackupInfoDto {
  file: string
  path: string
  sizeBytes: number
  createdAt: string
}

/** Which business day is in force at the counter, incl. a night-time extension (services/day.ts). */
export interface DayStatusDto {
  businessDate: string
  normalEndsAt: string
  endsAt: string
  extended: boolean
  maxEndsAt: string
  reopenable: { businessDate: string; normalEndsAt: string; maxEndsAt: string } | null
  snoozedUntil: string | null
}

export type AlertKind = 'hold_stale' | 'sync_problem' | 'print_failed' | 'day_end' | 'update_ready'
export interface AlertDto {
  id: string
  kind: AlertKind
  severity: 'info' | 'warning' | 'error'
  title: string
  detail: string
  at: string
  order?: { id: string; kotNo: number | null; tableName: string | null; total: number; items: number; status: 'held' | 'running'; ageMinutes: number; businessDate: string }
  sync?: { state: SyncStatusDto['state']; pending: number; error: string | null }
  print?: { what: 'bill' | 'kot'; message: string; orderId: string | null; billNo: string | null }
  day?: { businessDate: string; endsAt: string; extended: boolean; phase: 'ending' | 'ended'; snoozed: boolean }
  update?: { version: string }
}
/** Pushed as `event:alerts`; also the Hold badge count. */
export interface AlertsStatusDto {
  holdCount: number
  alerts: AlertDto[]
  day: DayStatusDto
  at: string
}

export interface AppInfo {
  version: string
  dataDir: string
  deviceId: string
  isPackaged: boolean
}

export interface IpcContract {
  'app:info': { req: void; res: AppInfo }
  'auth:users': { req: void; res: SessionUser[] }
  'auth:login': { req: { userId: string; pin: string }; res: SessionUser | null }
  'auth:verifyAdminPin': { req: { pin: string }; res: boolean }
  'settings:get': { req: void; res: AppSettings }
  'settings:set': { req: AppSettings; res: AppSettings }
  'menu:snapshot': { req: void; res: MenuSnapshot }
  'printers:list': { req: void; res: PrinterInfo[] }
  'printers:test': { req: { printerName: string }; res: { ok: boolean; error?: string } }
  'auth:logout': { req: void; res: void }
  'app:businessDate': { req: void; res: string }
  'orders:save': { req: { input: OrderInput; hold?: boolean }; res: OrderDto }
  'orders:kot': { req: { input: OrderInput }; res: OrderActionResult }
  /** `saveOnly` = Petpooja "Save": billed but not printed (status SAVED). `print` only controls the physical printer. */
  'orders:saveAndPrint': { req: { input: OrderInput; payments: PaymentInput[]; print?: boolean; saveOnly?: boolean }; res: OrderActionResult }
  'orders:settle': { req: { orderId: string; payments: PaymentInput[]; print?: boolean; saveOnly?: boolean }; res: OrderActionResult }
  'orders:updatePayment': { req: { orderId: string; payments: PaymentInput[] }; res: OrderDto }
  'orders:cancel': { req: { orderId: string; reason: string }; res: OrderDto }
  'orders:markReady': { req: { orderId: string }; res: OrderDto }
  'orders:reprint': { req: { orderId: string; what: 'bill' | 'kot' }; res: { ok: boolean; error?: string } }
  'orders:receiptHtml': { req: { orderId: string; what: 'bill' | 'kot' }; res: string | null }
  'orders:list': { req: OrderListFilter; res: OrderDto[] }
  'orders:get': { req: { orderId: string }; res: OrderDto | null }
  'live:summary': { req: { businessDate?: string }; res: LiveSummary }
  'reports:run': { req: ReportRequest; res: ReportResult }
  'reports:daily': { req: { from: string; to: string }; res: DailySales }
  'reports:export': { req: ReportRequest; res: { ok: boolean; path?: string; error?: string } }
  'reports:print': { req: ReportRequest; res: { ok: boolean; error?: string } }
  'users:list': { req: void; res: UserDto[] }
  'users:save': { req: UserInput; res: UserDto }
  'cash:summary': { req: { businessDate?: string }; res: CashFlowSummaryDto }
  'cash:add': { req: CashMovementInput; res: CashMovementDto }
  'cash:delete': { req: { id: string }; res: void }
  'menu:setItemFavourite': { req: { itemId: string; isFavourite: boolean }; res: void }
  'menu:setItemActive': { req: { itemId: string; isActive: boolean }; res: void }
  'sync:status': { req: void; res: SyncStatusDto }
  'sync:now': { req: void; res: SyncStatusDto }
  'sync:resyncAll': { req: void; res: SyncStatusDto }
  'sync:test': { req: AppSettings['sync']; res: { ok: boolean; message: string } }
  'sync:restore': { req: void; res: Record<string, number> }
  'backup:list': { req: void; res: BackupInfoDto[] }
  'backup:now': { req: void; res: BackupInfoDto }
  'menu:saveCategory': { req: CategoryInput; res: string }
  'menu:deleteCategory': { req: { id: string }; res: void }
  'menu:saveItem': { req: ItemInput; res: string }
  'menu:deleteItem': { req: { id: string }; res: void }
  'menu:saveAddon': { req: AddonInput; res: string }
  'menu:deleteAddon': { req: { id: string }; res: void }
  'alerts:status': { req: void; res: AlertsStatusDto }
  'day:status': { req: void; res: DayStatusDto }
  /** endsAt null = back to the normal end; businessDate only when reopening the previous day. */
  'day:extend': { req: { endsAt: string | null; businessDate?: string }; res: DayStatusDto }
  'day:snooze': { req: { endsAt: string }; res: DayStatusDto }
  'update:check': { req: void; res: { ok: boolean; message: string } }
  'update:install': { req: void; res: void }
}

export type IpcChannel = keyof IpcContract
export type IpcReq<C extends IpcChannel> = IpcContract[C]['req']
export type IpcRes<C extends IpcChannel> = IpcContract[C]['res']
