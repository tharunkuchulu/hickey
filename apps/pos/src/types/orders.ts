/**
 * Order DTOs shared by main (services/orders.ts) and the renderer via the IPC contract.
 * Pure types only — this file must never import runtime code from main.
 */
import type { OrderType, PaymentMode } from '@hickey/shared/schemas/order'

export type KotLine = {
  name: string
  variantName: string | null
  qty: number
  notes: string | null
  addons: string[]
}

export interface KotTicket {
  kotNo: number
  lines: KotLine[]
}

export interface OrderLineInput {
  id?: string
  itemId: string | null
  name: string
  variantName: string | null
  unitPrice: number
  qty: number
  addons: Array<{ id: string | null; name: string; price: number }>
  notes: string | null
}

export interface OrderInput {
  id?: string
  orderType: OrderType
  tableId: string | null
  customerName: string | null
  customerPhone: string | null
  notes: string | null
  lines: OrderLineInput[]
  discountType: 'percent' | 'amount' | null
  discountValue: number
  discountReason: string | null
  charges: number
}

export interface PaymentInput {
  mode: PaymentMode
  amount: number
  tendered?: number | null
  reference?: string | null
}

export interface OrderLineDto extends Required<OrderLineInput> {
  addonsTotal: number
  lineTotal: number
  kotNo: number | null
  isCancelled: boolean
}

export interface OrderDto {
  id: string
  billNo: string | null
  billNoDisplay: string
  kotNo: number | null
  businessDate: string
  orderType: OrderType
  tableId: string | null
  tableName: string | null
  status: 'running' | 'held' | 'printed' | 'settled' | 'cancelled'
  customerName: string | null
  customerPhone: string | null
  notes: string | null
  lines: OrderLineDto[]
  discountType: 'percent' | 'amount' | null
  discountValue: number
  discountReason: string | null
  charges: number
  taxPercent: number
  subtotal: number
  discount: number
  tax: number
  roundOff: number
  total: number
  payments: Array<{ id: string; mode: PaymentMode; amount: number; tendered: number | null; reference: string | null }>
  paymentSummary: string // "Card", "Cash", "Cash + UPI", "Due"
  cancelReason: string | null
  printCount: number
  createdBy: string | null
  createdAt: string
  updatedAt: string
  printedAt: string | null
  settledAt: string | null
  readyAt: string | null
}

export interface OrderListFilter {
  businessDate?: string
  status?: OrderDto['status'][]
  query?: string // bill no / KOT no / customer phone
  limit?: number
}

export interface LiveSummary {
  businessDate: string
  totalOrders: number
  totalSales: number
  running: number
  cancelled: number
  byType: Record<string, { orders: number; amount: number }>
  byPayment: Record<string, { orders: number; amount: number }>
  byHour: Record<string, number>
  topItems: Array<{ name: string; qty: number; amount: number }>
}
