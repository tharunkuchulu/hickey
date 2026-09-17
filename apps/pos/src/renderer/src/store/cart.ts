import { uuidv7 } from '@hickey/shared/ids'
import { computeBillTotals, type DiscountType, type RoundingRule } from '@hickey/shared/money'
import type { OrderType, PaymentMode } from '@hickey/shared/schemas/order'
import { create } from 'zustand'
import type { OrderDto, OrderInput, OrderLineInput } from '../../../types/orders'

export interface CartLine extends Omit<OrderLineInput, 'id'> {
  id: string
  /** Set once the line has been sent to the kitchen; such lines are locked in the UI. */
  kotNo: number | null
}

/** Petpooja's payment row: Cash · Card · Due · Not Paid (+ More: UPI · Part · Other). */
export type PayChoice = PaymentMode | 'part' | 'not_paid'
export const PAY_LABELS: Record<PayChoice, string> = {
  cash: 'Cash',
  card: 'Card',
  due: 'Due',
  not_paid: 'Not Paid',
  upi: 'UPI',
  part: 'Part',
  other: 'Other'
}

interface CartState {
  /** Present when editing an already-saved running/held order. */
  orderId: string | null
  orderType: OrderType
  tableId: string | null
  customerName: string
  customerPhone: string
  notes: string
  lines: CartLine[]
  discountType: DiscountType | null
  discountValue: number
  discountReason: string
  charges: number
  payChoice: PayChoice
  cashTendered: number | null
  /** For "Part": second leg of the split. */
  partMode: PaymentMode
  partAmount: number
  rounding: RoundingRule
  taxPercent: number

  setOrderType: (t: OrderType) => void
  setTable: (id: string | null) => void
  setCustomer: (patch: { customerName?: string; customerPhone?: string; notes?: string }) => void
  addItem: (line: Omit<OrderLineInput, 'id'>) => void
  setQty: (lineId: string, qty: number) => void
  setLineNotes: (lineId: string, notes: string | null) => void
  remove: (lineId: string) => void
  setDiscount: (type: DiscountType | null, value: number, reason?: string) => void
  setPay: (patch: Partial<Pick<CartState, 'payChoice' | 'cashTendered' | 'partMode' | 'partAmount'>>) => void
  configure: (cfg: { rounding: RoundingRule; taxPercent: number; defaultOrderType: OrderType; defaultPaymentMode: PayChoice }) => void
  complimentary: boolean
  setComplimentary: (on: boolean) => void
  loadOrder: (o: OrderDto) => void
  clear: () => void
  toInput: () => OrderInput
}

const empty = () => ({
  orderId: null as string | null,
  tableId: null as string | null,
  customerName: '',
  customerPhone: '',
  notes: '',
  lines: [] as CartLine[],
  discountType: null as DiscountType | null,
  discountValue: 0,
  discountReason: '',
  charges: 0,
  cashTendered: null as number | null,
  partAmount: 0,
  complimentary: false
})

export const useCart = create<CartState>((set, get) => ({
  ...empty(),
  orderType: 'pick_up',
  payChoice: 'card',
  partMode: 'cash',
  rounding: 'nearest_rupee',
  taxPercent: 0,

  setOrderType: (orderType) => set({ orderType, tableId: orderType === 'dine_in' ? get().tableId : null }),
  setTable: (tableId) => set({ tableId }),
  setCustomer: (patch) => set(patch),
  addItem: (line) =>
    set((s) => {
      // Same item + same variant + no addons/notes and not yet on a KOT → bump qty instead of a new line.
      const match = s.lines.find(
        (l) =>
          l.itemId === line.itemId &&
          l.variantName === line.variantName &&
          l.addons.length === 0 &&
          line.addons.length === 0 &&
          !l.notes &&
          !line.notes &&
          l.kotNo === null
      )
      if (match) return { lines: s.lines.map((l) => (l.id === match.id ? { ...l, qty: l.qty + 1 } : l)) }
      return { lines: [...s.lines, { ...line, id: uuidv7(), qty: line.qty || 1, kotNo: null }] }
    }),
  setQty: (lineId, qty) =>
    set((s) => ({
      lines: qty <= 0 ? s.lines.filter((l) => l.id !== lineId) : s.lines.map((l) => (l.id === lineId ? { ...l, qty } : l))
    })),
  setLineNotes: (lineId, notes) => set((s) => ({ lines: s.lines.map((l) => (l.id === lineId ? { ...l, notes } : l)) })),
  remove: (lineId) => set((s) => ({ lines: s.lines.filter((l) => l.id !== lineId) })),
  setDiscount: (discountType, discountValue, discountReason = '') => set({ discountType, discountValue, discountReason, complimentary: false }),
  setComplimentary: (on) =>
    set(on ? { complimentary: true, discountType: 'percent', discountValue: 100, discountReason: 'Complimentary' } : { complimentary: false, discountType: null, discountValue: 0, discountReason: '' }),
  setPay: (patch) => set(patch),
  configure: (cfg) =>
    set((s) => ({
      rounding: cfg.rounding,
      taxPercent: cfg.taxPercent,
      orderType: s.lines.length ? s.orderType : cfg.defaultOrderType,
      payChoice: s.lines.length ? s.payChoice : cfg.defaultPaymentMode
    })),
  loadOrder: (o) =>
    set({
      ...empty(),
      orderId: o.id,
      orderType: o.orderType,
      tableId: o.tableId,
      customerName: o.customerName ?? '',
      customerPhone: o.customerPhone ?? '',
      notes: o.notes ?? '',
      lines: o.lines
        .filter((l) => !l.isCancelled)
        .map((l) => ({
          id: l.id,
          itemId: l.itemId,
          name: l.name,
          variantName: l.variantName,
          unitPrice: l.unitPrice,
          qty: l.qty,
          addons: l.addons,
          notes: l.notes,
          kotNo: l.kotNo
        })),
      discountType: o.discountType,
      discountValue: o.discountValue,
      discountReason: o.discountReason ?? '',
      charges: o.charges,
      complimentary: o.discountReason === 'Complimentary'
    }),
  clear: () => set((s) => ({ ...empty(), orderType: s.orderType })),
  toInput: () => {
    const s = get()
    return {
      id: s.orderId ?? undefined,
      orderType: s.orderType,
      tableId: s.tableId,
      customerName: s.customerName || null,
      customerPhone: s.customerPhone || null,
      notes: s.notes || null,
      lines: s.lines.map(({ kotNo: _k, ...l }) => l),
      discountType: s.discountType,
      discountValue: s.discountValue,
      discountReason: s.discountReason || null,
      charges: s.charges
    }
  }
}))

export function selectTotals(s: Pick<CartState, 'lines' | 'discountType' | 'discountValue' | 'charges' | 'rounding' | 'taxPercent'>) {
  return computeBillTotals({
    lines: s.lines.map((l) => ({ unitPrice: l.unitPrice, qty: l.qty, addonsTotal: l.addons.reduce((a, b) => a + b.price, 0) })),
    discountType: s.discountType ?? undefined,
    discountValue: s.discountValue,
    charges: s.charges,
    taxPercent: s.taxPercent,
    rounding: s.rounding
  })
}
