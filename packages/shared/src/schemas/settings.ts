import { z } from 'zod'

/** Everything the cafe can configure. Stored as one JSON blob under key 'app' in the settings table. */
export const appSettingsSchema = z.object({
  cafe: z.object({
    name: z.string().default('Hickey Cafe'),
    addressLine1: z.string().default(''),
    addressLine2: z.string().default(''),
    phone: z.string().default(''),
    gstin: z.string().default(''), // blank = not registered
    fssai: z.string().default('')
  }),
  receipt: z.object({
    paperWidthMm: z.union([z.literal(58), z.literal(80)]).default(80),
    headerNote: z.string().default(''),
    footerNote: z.string().default('Thank you, visit again!'),
    showCustomerOnBill: z.boolean().default(true),
    billCopies: z.number().int().min(1).max(3).default(1),
    printKot: z.boolean().default(true), // Petpooja: "Print KOT on Print Bill" — the KOT slip doubles as the pickup token
    kotCopies: z.number().int().min(1).max(3).default(1)
  }),
  printer: z.object({
    driver: z.enum(['windows', 'escpos_lan', 'escpos_usb_spool']).default('windows'),
    windowsPrinterName: z.string().default(''),
    lanHost: z.string().default(''),
    lanPort: z.number().int().default(9100),
    openDrawerOnCash: z.boolean().default(false)
  }),
  billing: z.object({
    billPrefix: z.string().default(''),
    billNumberReset: z.enum(['never', 'daily', 'monthly', 'yearly']).default('never'),
    /** First bill number to issue when the counter is empty (continue Petpooja's sequence, e.g. 22032). */
    billNumberStart: z.number().int().min(1).default(1),
    /** Petpooja shows only the last N digits on the counter ("BILL: ..033"). 0 = full number. */
    billNoDisplayDigits: z.number().int().min(0).max(6).default(3),
    kotNumberReset: z.enum(['never', 'daily']).default('daily'),
    rounding: z
      .enum(['none', 'nearest_rupee', 'nearest_50p', 'floor_rupee', 'ceil_rupee'])
      .default('nearest_rupee'),
    taxPercent: z.number().nonnegative().default(0),
    /** Business day boundary in minutes after midnight. Petpooja default 03:30 = 210. */
    dayStartMinutes: z.number().int().min(0).max(12 * 60).default(210),
    defaultOrderType: z.enum(['dine_in', 'pick_up', 'delivery']).default('pick_up'),
    defaultPaymentMode: z.enum(['cash', 'card', 'upi', 'other', 'due', 'not_paid']).default('cash'),
    /** Payment options shown inline (Petpooja: Cash, Card, Due, Not Paid); the rest sit under "More". */
    visiblePaymentOptions: z.array(z.enum(['cash', 'card', 'due', 'not_paid', 'upi', 'part', 'other'])).default(['cash', 'card', 'due', 'not_paid']),
    quickQuantities: z.array(z.number().int().positive()).default([1, 2, 3, 5, 10]),
    /** Opening float in the drawer each day (Petpooja "Default Petty Cash Amount" = ₹2000). */
    pettyCash: z.number().int().nonnegative().default(200000),
    requireAdminPinForDiscount: z.boolean().default(false),
    requireAdminPinForCancel: z.boolean().default(true)
  }),
  sync: z.object({
    enabled: z.boolean().default(false),
    supabaseUrl: z.string().default(''),
    supabaseAnonKey: z.string().default(''),
    /** Per-device secret returned by register_device() in Supabase; validated by every sync RPC. */
    deviceToken: z.string().default(''),
    orgId: z.string().default(''),
    deviceId: z.string().default(''),
    deviceLabel: z.string().default('Counter 1')
  })
})
export type AppSettings = z.infer<typeof appSettingsSchema>

export const defaultAppSettings = (): AppSettings =>
  appSettingsSchema.parse({ cafe: {}, receipt: {}, printer: {}, billing: {}, sync: {} })
