/**
 * Receipt bodies for the thermal printer. Layout follows the standard Petpooja bill:
 * outlet header → bill meta → item table → totals → payment → footer. Money is printed
 * without the ₹ symbol (many thermal fonts lack the glyph); "Rs." is used where needed.
 */
import { formatMoney, formatReceiptDateTime, type AppSettings } from '@hickey/shared'
import type { KotTicket, OrderDto } from '../../types/orders'
import { escapeHtml as e } from './printer'
import { receiptDocument } from './receipt-html'

const TYPE_LABEL: Record<OrderDto['orderType'], string> = { dine_in: 'Dine In', pick_up: 'Pick Up', delivery: 'Delivery' }

const money = (paise: number) => formatMoney(paise, { symbol: false })

export function billHtml(o: OrderDto, s: AppSettings, opts: { cashierName?: string | null; duplicate?: boolean } = {}): string {
  const { cafe, receipt } = s
  const lines = o.lines.filter((l) => !l.isCancelled)
  const header = `
    <div class="center bold xl">${e(cafe.name)}</div>
    ${cafe.addressLine1 ? `<div class="center">${e(cafe.addressLine1)}</div>` : ''}
    ${cafe.addressLine2 ? `<div class="center">${e(cafe.addressLine2)}</div>` : ''}
    ${cafe.phone ? `<div class="center">Ph: ${e(cafe.phone)}</div>` : ''}
    ${cafe.gstin ? `<div class="center">GSTIN: ${e(cafe.gstin)}</div>` : ''}
    ${cafe.fssai ? `<div class="center">FSSAI: ${e(cafe.fssai)}</div>` : ''}
    ${receipt.headerNote ? `<div class="center">${e(receipt.headerNote)}</div>` : ''}
    ${opts.duplicate ? `<div class="center bold">** DUPLICATE **</div>` : ''}
    <div class="rule"></div>`

  const meta = `
    <div class="row meta"><span>${e(formatReceiptDateTime(o.printedAt ?? o.createdAt))}</span><span>${e(TYPE_LABEL[o.orderType])}</span></div>
    <div class="row meta"><span class="bold">Bill No: ${e(o.billNo ?? '-')}</span><span class="bold">Token No: ${o.kotNo ?? '-'}</span></div>
    ${o.tableName ? `<div>Table: ${e(o.tableName)}</div>` : ''}
    ${opts.cashierName ? `<div>Cashier: ${e(opts.cashierName)}</div>` : ''}
    ${receipt.showCustomerOnBill && o.customerName ? `<div>Customer: ${e(o.customerName)}${o.customerPhone ? ` (${e(o.customerPhone)})` : ''}</div>` : ''}
    <div class="rule"></div>`

  const itemRows = lines
    .map((l) => {
      const name = l.variantName ? `${l.name} (${l.variantName})` : l.name
      const addons = l.addons.length ? `<div class="sub">+ ${e(l.addons.map((a) => a.name).join(', '))}</div>` : ''
      const note = l.notes ? `<div class="sub">* ${e(l.notes)}</div>` : ''
      return `<tr><td>${e(name)}${addons}${note}</td><td class="num">${l.qty}</td><td class="num">${money(l.unitPrice + l.addonsTotal)}</td><td class="num">${money(l.lineTotal)}</td></tr>`
    })
    .join('')
  const table = `
    <table>
      <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amt</th></tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div class="rule"></div>`

  const qty = lines.reduce((a, l) => a + l.qty, 0)
  const totals = `
    <div class="row"><span>Items: ${lines.length} &nbsp; Qty: ${qty}</span></div>
    <div class="row"><span>Sub Total</span><span>${money(o.subtotal)}</span></div>
    ${o.discount ? `<div class="row"><span>Discount${o.discountType === 'percent' ? ` (${o.discountValue}%)` : ''}</span><span>-${money(o.discount)}</span></div>` : ''}
    ${o.charges ? `<div class="row"><span>Charges</span><span>${money(o.charges)}</span></div>` : ''}
    ${o.tax ? `<div class="row"><span>Tax (${o.taxPercent}%)</span><span>${money(o.tax)}</span></div>` : ''}
    ${o.roundOff ? `<div class="row"><span>Round Off</span><span>${o.roundOff > 0 ? '+' : '-'}${money(Math.abs(o.roundOff))}</span></div>` : ''}
    <div class="row bold lg"><span>Grand Total</span><span>Rs. ${money(o.total)}</span></div>
    <div class="rule"></div>`

  const pay = o.payments.length
    ? `<div>Paid by: ${e(o.payments.map((p) => `${p.mode.toUpperCase()}${o.payments.length > 1 ? ` ${money(p.amount)}` : ''}`).join(', '))}</div>` +
      (o.payments[0]?.mode === 'cash' && o.payments[0].tendered
        ? `<div class="row"><span>Cash</span><span>${money(o.payments[0].tendered)}</span></div><div class="row"><span>Change</span><span>${money(o.payments[0].tendered - o.payments[0].amount)}</span></div>`
        : '')
    : o.status === 'printed' && !o.settledAt
      ? `<div class="bold">NOT PAID</div>`
      : ''

  const footer = `
    ${pay ? `${pay}<div class="rule"></div>` : ''}
    ${receipt.footerNote ? `<div class="center">${e(receipt.footerNote)}</div>` : ''}
    <div class="center sub">Powered by Hickey</div>`

  return receiptDocument(header + meta + table + totals + footer, receipt.paperWidthMm)
}

/**
 * KOT slip in the compact Petpooja shape the kitchen is used to (a few centimetres of paper):
 *   16/09/26 00:35        KOT - 120
 *   Pick Up
 *   - - - - - - - - - - - - - - - -
 *   Item                      Qty.
 *   Spanish Latte                1
 *   - - - - - - - - - - - - - - - -
 * No outlet name, no token line, normal font size.
 */
export function kotHtml(o: OrderDto, kot: KotTicket, s: AppSettings, opts: { duplicate?: boolean } = {}): string {
  const d = new Date()
  const stamp = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const rows = kot.lines
    .map((l) => {
      const name = l.variantName ? `${l.name} (${l.variantName})` : l.name
      const extras = [...l.addons.map((a) => `+ ${a}`), l.notes ? `* ${l.notes}` : ''].filter(Boolean)
      return `<tr><td class="bold">${e(name)}${extras.length ? `<div class="sub">${e(extras.join(' | '))}</div>` : ''}</td><td class="num bold">${l.qty}</td></tr>`
    })
    .join('')
  const body = `
    <div class="row meta"><span>${e(stamp)}</span><span class="bold">KOT - ${kot.kotNo}${opts.duplicate ? ' (DUP)' : ''}</span></div>
    <div class="bold">${e(TYPE_LABEL[o.orderType])}${o.tableName ? ` · ${e(o.tableName)}` : ''}${o.customerName ? ` · ${e(o.customerName)}` : ''}</div>
    <div class="rule"></div>
    <table class="kot"><thead><tr><th>Item</th><th class="num">Qty.</th></tr></thead><tbody>${rows}</tbody></table>
    ${o.notes ? `<div class="bold">Note: ${e(o.notes)}</div>` : ''}
    <div class="rule"></div>`
  return receiptDocument(body, s.receipt.paperWidthMm, { compact: true })
}
