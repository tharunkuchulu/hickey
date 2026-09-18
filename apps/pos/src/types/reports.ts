/** Report DTOs shared by main and renderer. Pure types only. */

export type ReportId =
  | 'daily'
  | 'sales_summary'
  | 'item_wise'
  | 'category_wise'
  | 'payment_wise'
  | 'hourly'
  | 'variant_wise'
  | 'cancelled'
  | 'discounted'
  | 'reprints'
  | 'user_wise'
  | 'cash_flow'

export interface ReportColumn {
  key: string
  label: string
  align?: 'left' | 'right'
  /** integer paise → formatted as money */
  money?: boolean
}

export interface ReportRequest {
  report: ReportId
  /** Business dates, inclusive, YYYY-MM-DD. */
  from: string
  to: string
}

export interface ReportResult {
  report: ReportId
  title: string
  from: string
  to: string
  columns: ReportColumn[]
  rows: Array<Record<string, string | number | null>>
  /** Optional footer rows (a single Total row). */
  summary?: Array<Record<string, string | number | null>>
}

/** Petpooja "Sales Summary" for one day or a range: totals, payment-type split and every bill with its payment. */
export interface DailySales {
  from: string
  to: string
  sales: { orders: number; gross: number; discount: number; net: number; avgBill: number; items: number }
  byPayment: Array<{ mode: string; label: string; orders: number; amount: number }>
  byType: Array<{ type: string; label: string; orders: number; amount: number }>
  cancelled: { orders: number; amount: number }
  unbilled: { orders: number; amount: number }
  bills: Array<{
    id: string
    billNo: string
    billNoDisplay: string
    kotNo: number | null
    time: string
    paidAt: string | null
    type: string
    /** Quantity of items on the bill. */
    items: number
    /** "2× Cappuccino (sip), Samosa" — what was sold, the way staff and the owner read a bill. */
    itemsText: string
    total: number
    payment: string
    biller: string
    status: string
  }>
}

export const REPORTS: Array<{ id: ReportId; title: string; group: string; description: string }> = [
  { id: 'daily', title: 'Daily Sales', group: 'Sales', description: 'Today at a glance: sales, payment types and every bill' },
  { id: 'sales_summary', title: 'Sales Summary: Day Wise', group: 'Sales', description: 'Orders, sales and payment split per day' },
  { id: 'payment_wise', title: 'Order Report: Payment Wise', group: 'Sales', description: 'Collection by Cash / Card / UPI / Other' },
  { id: 'hourly', title: 'Sales Report: Hourly', group: 'Sales', description: 'Sales in each hour of the day' },
  { id: 'user_wise', title: 'Sales Report: Biller Wise', group: 'Sales', description: 'Sales made by each biller' },
  { id: 'item_wise', title: 'Item Wise: Sales Report', group: 'Items', description: 'Quantity and sales of each item' },
  { id: 'category_wise', title: 'Sales Report: Category Wise', group: 'Items', description: 'Sales per category' },
  { id: 'variant_wise', title: 'Variation Report', group: 'Items', description: 'Items grouped by portion size' },
  { id: 'cancelled', title: 'Cancel Order Report', group: 'Audit', description: 'Cancelled bills with reason' },
  { id: 'discounted', title: 'Discounted Orders (With Reason)', group: 'Audit', description: 'Bills with a discount applied' },
  { id: 'reprints', title: 'Order Print Count Report', group: 'Audit', description: 'Bills and KOTs printed more than once' },
  { id: 'cash_flow', title: 'Cash Flow', group: 'Finance', description: 'Cash sales, expenses, withdrawals and top-ups' }
]
