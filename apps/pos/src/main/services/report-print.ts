/** A report printed on the thermal roll: title, range, then one line per row with the money column. */
import { formatMoney, formatReceiptDateTime, type AppSettings } from '@hickey/shared'
import type { ReportColumn, ReportResult } from '../../types/reports'
import { escapeHtml as e } from './printer'
import { receiptDocument } from './receipt-html'

export function reportHtml(r: ReportResult, s: AppSettings): string {
  const labelCol = r.columns[0]!
  const moneyCol = [...r.columns].reverse().find((c) => c.money) ?? r.columns[r.columns.length - 1]!
  const qtyCol = r.columns.find((c) => c.key === 'qty' || c.key === 'orders')
  const fmt = (c: ReportColumn, v: unknown) => (c.money && typeof v === 'number' ? formatMoney(v, { symbol: false }) : v == null ? '' : String(v))
  const secondCol = r.columns[1] && r.columns[1] !== moneyCol && r.columns[1] !== qtyCol ? r.columns[1] : null

  const line = (row: Record<string, unknown>, bold = false) =>
    `<div class="row${bold ? ' bold' : ''}"><span>${e(bold ? String(row._label ?? '') : fmt(labelCol, row[labelCol.key]))}${
      !bold && secondCol ? ` ${e(fmt(secondCol, row[secondCol.key]))}` : ''
    }</span>${qtyCol ? `<span>${e(fmt(qtyCol, row[qtyCol.key]))}</span>` : ''}<span>${e(fmt(moneyCol, row[moneyCol.key]))}</span></div>`

  const body = `
    <div class="center bold lg">${e(s.cafe.name)}</div>
    <div class="center bold">${e(r.title)}</div>
    <div class="center">${e(r.from)}${r.from !== r.to ? ` to ${e(r.to)}` : ''}</div>
    <div class="center sub">Printed ${e(formatReceiptDateTime(new Date()))}</div>
    <div class="rule"></div>
    <div class="row bold"><span>${e(labelCol.label)}</span>${qtyCol ? `<span>${e(qtyCol.label)}</span>` : ''}<span>${e(moneyCol.label)}</span></div>
    <div class="rule"></div>
    ${r.rows.map((row) => line(row)).join('') || '<div class="center">No data</div>'}
    <div class="rule"></div>
    ${(r.summary ?? []).map((row) => line(row, true)).join('')}`
  return receiptDocument(body, s.receipt.paperWidthMm)
}
