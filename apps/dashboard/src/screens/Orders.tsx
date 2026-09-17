import { formatMoney } from '@hickey/shared/money'
import { useEffect, useMemo, useState } from 'react'
import { addDays, fetchRange, todayBusinessDate, type RangeData } from '../lib/data'

const TYPE_LABEL: Record<string, string> = { dine_in: 'Dine In', pick_up: 'Pick Up', delivery: 'Delivery' }

/** Petpooja "All Orders": date range, search, the order table, Export Excel (CSV). */
export function OrdersScreen() {
  const [from, setFrom] = useState(todayBusinessDate())
  const [to, setTo] = useState(todayBusinessDate())
  const [q, setQ] = useState('')
  const [data, setData] = useState<RangeData | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setErr(null)
    fetchRange(from, to)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
  }, [from, to])

  const rows = useMemo(() => {
    if (!data) return []
    const s = q.trim().toLowerCase()
    return data.orders
      .filter((o) => !s || (o.bill_no ?? '').includes(s) || String(o.kot_no ?? '').includes(s) || (o.customer_phone ?? '').includes(s) || (o.customer_name ?? '').toLowerCase().includes(s))
      .map((o) => ({
        ...o,
        items: data.lines
          .filter((l) => l.order_id === o.id && !l.is_cancelled)
          .map((l) => `${l.qty > 1 ? `${l.qty} x ` : ''}${l.name}${l.variant_name ? ` (${l.variant_name})` : ''}`)
          .join(', '),
        payment: [...new Set(data.payments.filter((p) => p.order_id === o.id).map((p) => p.mode))].map((m) => m.toUpperCase()).join(' + ') || (o.status === 'cancelled' ? '' : 'Not Paid')
      }))
  }, [data, q])

  const grand = rows.filter((r) => r.status !== 'cancelled').reduce((a, r) => a + r.total, 0)

  function exportCsv() {
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const head = ['Order No', 'Date', 'Time', 'Type', 'Customer', 'Items', 'Sub Total', 'Discount', 'Round Off', 'Grand Total', 'Payment', 'Status', 'Token']
    const lines = rows.map((r) =>
      [r.bill_no ?? '', r.business_date, new Date(r.printed_at ?? r.created_at).toLocaleTimeString('en-IN'), TYPE_LABEL[r.order_type] ?? r.order_type, r.customer_name ?? '', r.items, r.subtotal / 100, r.discount / 100, r.round_off / 100, r.total / 100, r.payment, r.status, r.kot_no ?? '']
        .map(esc)
        .join(',')
    )
    const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `orders-${from}-to-${to}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">All Orders</h1>
        <span className="text-sm text-gray-600">
          Grand Total : <b>{formatMoney(grand)}</b>
        </span>
        <div className="flex-1" />
        <button onClick={exportCsv} className="h-9 px-3 rounded-md border border-gray-300 bg-white text-sm font-medium">
          Export Excel
        </button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap items-end gap-3">
        <label className="text-xs text-gray-600">
          Start Date
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="block h-9 rounded-md border border-gray-300 px-2 text-sm" />
        </label>
        <label className="text-xs text-gray-600">
          End Date
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="block h-9 rounded-md border border-gray-300 px-2 text-sm" />
        </label>
        <div className="flex gap-1">
          {[
            ['Today', 0],
            ['7 days', 6],
            ['30 days', 29]
          ].map(([l, d]) => (
            <button
              key={l}
              onClick={() => {
                setTo(todayBusinessDate())
                setFrom(addDays(todayBusinessDate(), -Number(d)))
              }}
              className="h-9 px-3 rounded-md border border-gray-300 bg-white text-xs"
            >
              {l}
            </button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order ID / token / phone" className="h-9 rounded-md border border-gray-300 px-3 text-sm flex-1 min-w-40" />
      </div>
      {err && <div className="text-red text-sm">{err}</div>}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-[#eef2f7] text-gray-700 text-xs">
            <tr>
              {['Order No.', 'Order Type', 'Customer', 'Items', 'Amount (₹)', 'Discount (₹)', 'Grand Total (₹)', 'Payment', 'Status', 'Created'].map((h) => (
                <th key={h} className="text-left px-3 py-2 font-semibold whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100 align-top">
                <td className="px-3 py-2 font-medium">{r.bill_no ?? '—'}</td>
                <td className="px-3 py-2">{TYPE_LABEL[r.order_type] ?? r.order_type}</td>
                <td className="px-3 py-2">{r.customer_name ?? ''}</td>
                <td className="px-3 py-2 max-w-xs">{r.items}</td>
                <td className="px-3 py-2">{formatMoney(r.subtotal, { symbol: false })}</td>
                <td className="px-3 py-2">({formatMoney(r.discount, { symbol: false })})</td>
                <td className="px-3 py-2 font-medium">{formatMoney(r.total, { symbol: false })}</td>
                <td className="px-3 py-2">{r.payment}</td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${r.status === 'cancelled' ? 'bg-red-50 text-red' : 'bg-green-50 text-green-700'}`}>{r.status === 'cancelled' ? 'Cancelled' : 'Printed'}</span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-gray-600">{new Date(r.printed_at ?? r.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-gray-400">
                  No Results Found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="px-3 py-2 text-xs text-gray-500 border-t border-gray-100">Showing {rows.length} records</div>
      </div>
    </div>
  )
}
