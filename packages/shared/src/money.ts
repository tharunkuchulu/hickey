/**
 * Money helpers. Every amount in Hickey is an integer number of paise
 * (₹1 = 100 paise) so there is never floating-point drift on bills.
 */

export type Paise = number

export const RUPEE = 100

export function toPaise(rupees: number | string): Paise {
  const n = typeof rupees === 'string' ? Number(rupees.replace(/[^0-9.-]/g, '')) : rupees
  if (!Number.isFinite(n)) return 0
  return Math.round(n * RUPEE)
}

export function toRupees(paise: Paise): number {
  return paise / RUPEE
}

/** "₹1,234.50" style formatting using Indian digit grouping. */
export function formatMoney(paise: Paise, opts: { symbol?: boolean; decimals?: 0 | 2 } = {}): string {
  const { symbol = true, decimals = 2 } = opts
  const negative = paise < 0
  const abs = Math.abs(paise)
  const rupees = Math.floor(abs / RUPEE)
  const rem = abs % RUPEE
  const grouped = groupIndian(rupees)
  const frac = decimals === 2 ? `.${String(rem).padStart(2, '0')}` : ''
  return `${negative ? '-' : ''}${symbol ? '₹' : ''}${grouped}${frac}`
}

function groupIndian(n: number): string {
  const s = String(n)
  if (s.length <= 3) return s
  const last3 = s.slice(-3)
  const rest = s.slice(0, -3)
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3
}

export type RoundingRule = 'none' | 'nearest_rupee' | 'nearest_50p' | 'floor_rupee' | 'ceil_rupee'

/** Returns the round-off delta (in paise) to add to `amount` for the given rule. */
export function roundOffDelta(amount: Paise, rule: RoundingRule): Paise {
  switch (rule) {
    case 'none':
      return 0
    case 'nearest_rupee':
      return Math.round(amount / RUPEE) * RUPEE - amount
    case 'nearest_50p':
      return Math.round(amount / 50) * 50 - amount
    case 'floor_rupee':
      return Math.floor(amount / RUPEE) * RUPEE - amount
    case 'ceil_rupee':
      return Math.ceil(amount / RUPEE) * RUPEE - amount
  }
}

export type DiscountType = 'percent' | 'amount'

/**
 * Discount amount in paise. `value` is 10 for 10% when type is 'percent',
 * or an amount in paise when type is 'amount'. Never exceeds the subtotal.
 */
export function discountAmount(subtotal: Paise, type: DiscountType, value: number): Paise {
  if (subtotal <= 0 || value <= 0) return 0
  const raw = type === 'percent' ? Math.round((subtotal * value) / 100) : Math.round(value)
  return Math.min(raw, subtotal)
}

export interface BillTotalsInput {
  lines: Array<{ unitPrice: Paise; qty: number; addonsTotal?: Paise }>
  discountType?: DiscountType
  discountValue?: number
  /** Extra charges (packing, service) in paise, applied after discount. */
  charges?: Paise
  /** Tax percent (e.g. 5 for 5%). 0/undefined when cafe is not GST registered. */
  taxPercent?: number
  rounding?: RoundingRule
}

export interface BillTotals {
  subtotal: Paise
  discount: Paise
  charges: Paise
  taxable: Paise
  tax: Paise
  roundOff: Paise
  total: Paise
}

/** Single source of truth for how a bill adds up. Used by POS, receipts, and reports. */
export function computeBillTotals(input: BillTotalsInput): BillTotals {
  const subtotal = input.lines.reduce(
    (sum, l) => sum + (l.unitPrice + (l.addonsTotal ?? 0)) * l.qty,
    0
  )
  const discount = discountAmount(subtotal, input.discountType ?? 'amount', input.discountValue ?? 0)
  const charges = input.charges ?? 0
  const taxable = subtotal - discount + charges
  const tax = input.taxPercent ? Math.round((taxable * input.taxPercent) / 100) : 0
  const beforeRound = taxable + tax
  const roundOff = roundOffDelta(beforeRound, input.rounding ?? 'none')
  return { subtotal, discount, charges, taxable, tax, roundOff, total: beforeRound + roundOff }
}
