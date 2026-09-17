import { z } from 'zod'

export const orderTypeSchema = z.enum(['dine_in', 'pick_up', 'delivery'])
export type OrderType = z.infer<typeof orderTypeSchema>

export const orderStatusSchema = z.enum(['running', 'held', 'printed', 'settled', 'cancelled'])
export type OrderStatus = z.infer<typeof orderStatusSchema>

export const paymentModeSchema = z.enum(['cash', 'card', 'upi', 'other', 'due'])

/** Petpooja's fixed tab order on the billing screen. */
export const ORDER_TYPES: OrderType[] = ['dine_in', 'delivery', 'pick_up']

/** Labels exactly as staff know them from Petpooja. */
export const ORDER_TYPE_LABELS: Record<OrderType, string> = { dine_in: 'Dine In', pick_up: 'Pick Up', delivery: 'Delivery' }
export type PaymentMode = z.infer<typeof paymentModeSchema>
export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = { cash: 'Cash', card: 'Card', upi: 'UPI', other: 'Other', due: 'Due' }

export const discountTypeSchema = z.enum(['percent', 'amount'])

/** One line in the cart / bill. Item details are snapshotted so old bills never change when the menu does. */
export const orderLineSchema = z.object({
  id: z.uuid(),
  itemId: z.uuid().nullable(),
  name: z.string().min(1),
  variantName: z.string().nullable().default(null),
  unitPrice: z.number().int().nonnegative(),
  qty: z.number().int().positive(),
  addons: z
    .array(z.object({ id: z.uuid().nullable(), name: z.string(), price: z.number().int().nonnegative() }))
    .default([]),
  notes: z.string().max(200).nullable().default(null),
  kotNo: z.number().int().nullable().default(null),
  isCancelled: z.boolean().default(false)
})
export type OrderLine = z.infer<typeof orderLineSchema>

export const paymentSchema = z.object({
  id: z.uuid(),
  mode: paymentModeSchema,
  amount: z.number().int().positive(),
  reference: z.string().max(80).nullable().default(null), // UPI txn id, card last 4, etc.
  tendered: z.number().int().nonnegative().nullable().default(null) // cash given, for change calc
})
export type Payment = z.infer<typeof paymentSchema>

export const orderSchema = z.object({
  id: z.uuid(),
  billNo: z.string().nullable(), // assigned when printed/settled
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  orderType: orderTypeSchema,
  tableId: z.uuid().nullable(),
  status: orderStatusSchema,
  customerName: z.string().max(80).nullable().default(null),
  customerPhone: z.string().max(15).nullable().default(null),
  lines: z.array(orderLineSchema),
  discountType: discountTypeSchema.nullable().default(null),
  discountValue: z.number().nonnegative().default(0),
  discountReason: z.string().max(120).nullable().default(null),
  charges: z.number().int().nonnegative().default(0),
  taxPercent: z.number().nonnegative().default(0),
  subtotal: z.number().int(),
  discount: z.number().int(),
  tax: z.number().int(),
  roundOff: z.number().int(),
  total: z.number().int(),
  payments: z.array(paymentSchema).default([]),
  cancelReason: z.string().max(200).nullable().default(null),
  createdBy: z.uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  settledAt: z.string().nullable().default(null)
})
export type Order = z.infer<typeof orderSchema>
