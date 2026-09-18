import { hourlySales, itemPerformance, salesByDay, salesStats, sumBy } from '@hickey/shared/analytics'
import { formatMoney } from '@hickey/shared/money'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Freshness } from '../components/Freshness'
import { addDays, fetchRange, resolveTodayBusinessDate, todayBusinessDate, type RangeData } from '../lib/data'
import { useLiveData } from '../lib/useLiveData'
import { DailySales } from './DailySales'

type ReportId = 'daily' | 'day_wise' | 'item_wise' | 'payment_wise' | 'hourly' | 'cancelled'
const LIST: Array<{ id: ReportId; title: string }> = [
  { id: 'daily', title: 'Daily Sales' },
  { id: 'day_wise', title: 'All Restaurant Report: Day Wise' },
  { id: 'item_wise', title: 'Item Wise: Sales Report' },
  { id: 'payment_wise', title: 'Order Report: Payment Wise' },
  { id: 'hourly', title: 'Sales Report: Hourly' },
  { id: 'cancelled', title: 'Cancel Order Report' }
]
const PAY_LABEL: Record<string, string> = { cash: 'Cash', card: 'Card', upi: 'UPI', other: 'Other', due: 'Due', not_paid: 'Not Paid' }

interface Table {
  columns: Array<{ key: string; label: string; money?: boolean; right?: boolean }>
  rows: Array<Record<string, string | number>>
}

/** Computed in the browser from the synced rows, so numbers match the counter exactly. */
export function ReportsScreen() {
  const [id, setId] = useState<ReportId>('daily')
  const [from, setFrom] = useState(todayBusinessDate())
  const [to, setTo] = useState(todayBusinessDate())
  const touched = useRef(false)
  useEffect(() => {
    void resolveTodayBusinessDate().then((d) => {
      if (!touched.current) {
        setFrom(d)
        setTo(d)
      }
    })
  }, [])
  const live = useLiveData(() => fetchRange(from, to), [from, to])
  const data: RangeData | null = live.data
  const err = live.err

  const table = useMemo<Table | null>(() => {
    if (!data) return null
    switch (id) {
      case 'daily':
        return null
      case 'day_wise':
        return {
          columns: [
            { key: 'date', label: 'Date' },
            { key: 'orders', label: 'Orders', right: true },
            { key: 'total', label: 'Sales (₹)', money: true, right: true }
          ],
          rows: salesByDay(data.orders)
        }
      case 'item_wise':
        return {
          columns: [
            { key: 'name', label: 'Item' },
            { key: 'qty', label: 'Qty.', right: true },
            { key: 'amount', label: 'Total (₹)', money: true, right: true }
          ],
          rows: itemPerformance(data.orders, data.lines)
        }
      case 'payment_wise': {
        const s = salesStats(data.orders, data.payments)
        return {
          columns: [
            { key: 'mode', label: 'Payment Type' },
            { key: 'orders', label: 'Orders', right: true },
            { key: 'amount', label: 'Amount (₹)', money: true, right: true },
            { key: 'share', label: 'Share', right: true }
          ],
          rows: s.byPayment.map((p) => ({ mode: PAY_LABEL[p.key] ?? p.key, orders: p.count, amount: p.total, share: s.total ? `${((p.total / s.total) * 100).toFixed(1)}%` : '0%' }))
        }
      }
      case 'hourly':
        return {
          columns: [
            { key: 'hour', label: 'Hour' },
            { key: 'orders', label: 'Orders', right: true },
            { key: 'total', label: 'Sales (₹)', money: true, right: true }
          ],
          rows: hourlySales(data.orders).map((h) => ({ hour: `${String(h.hour).padStart(2, '0')}:00`, orders: h.orders, total: h.total }))
        }
      case 'cancelled':
        return {
          columns: [
            { key: 'date', label: 'Date' },
            { key: 'bill', label: 'Bill No' },
            { key: 'total', label: 'Amount (₹)', money: true, right: true },
            { key: 'reason', label: 'Reason' }
          ],
          rows: data.orders.filter((o) => o.status === 'cancelled').map((o) => ({ date: o.business_date, bill: o.bill_no ?? '—', total: o.total, reason: o.cancel_reason ?? '' }))
        }
    }
  }, [data, id])

  const totals = useMemo(() => {
    if (!table) return null
    const t: Record<string, string | number> = {}
    for (const c of table.columns) if (typeof table.rows[0]?.[c.key] === 'number' && c.key !== 'hour') t[c.key] = table.rows.reduce((a, r) => a + Number(r[c.key]), 0)
    return t
  }, [table])

  const fmt = (c: Table['columns'][number], v: unknown) => (c.money && typeof v === 'number' ? formatMoney(v, { symbol: false }) : String(v ?? ''))
  void sumBy

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto grid md:grid-cols-[240px_1fr] gap-4">
      <aside className="bg-white rounded-xl border border-gray-200 overflow-hidden self-start">
        {LIST.map((r) => (
          <button key={r.id} onClick={() => setId(r.id)} className={`w-full text-left px-4 py-3 text-sm border-l-4 ${id === r.id ? 'border-l-pill bg-blue-50 text-pill font-medium' : 'border-l-transparent'}`}>
            {r.title}
          </button>
        ))}
      </aside>
      <div className="space-y-3 min-w-0">
        <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap items-end gap-3">
          <Freshness at={live.at} busy={live.busy} onRefresh={live.refresh} />
          <label className="text-xs text-gray-600">
            From
            <input type="date" value={from} onChange={(e) => { touched.current = true; setFrom(e.target.value) }} className="block h-9 rounded-md border border-gray-300 px-2 text-sm" />
          </label>
          <label className="text-xs text-gray-600">
            To
            <input type="date" value={to} onChange={(e) => { touched.current = true; setTo(e.target.value) }} className="block h-9 rounded-md border border-gray-300 px-2 text-sm" />
          </label>
          {[
            ['Today', 0],
            ['7 days', 6],
            ['This month', new Date().getDate() - 1]
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
        {err && <div className="text-red text-sm">{err}</div>}
        {id === 'daily' && data && <DailySales data={data} from={from} to={to} />}
        {table && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#eef2f7] text-gray-700 text-xs">
                <tr>
                  {table.columns.map((c) => (
                    <th key={c.key} className={`px-3 py-2 font-semibold ${c.right ? 'text-right' : 'text-left'}`}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {totals && table.rows.length > 0 && (
                  <tr className="bg-[#fbf7e6] font-semibold">
                    {table.columns.map((c, i) => (
                      <td key={c.key} className={`px-3 py-1.5 ${c.right ? 'text-right' : ''}`}>
                        {i === 0 ? 'Total' : c.key in totals ? fmt(c, totals[c.key]) : ''}
                      </td>
                    ))}
                  </tr>
                )}
                {table.rows.map((r, i) => (
                  <tr key={i} className={i % 2 ? 'bg-gray-50' : ''}>
                    {table.columns.map((c) => (
                      <td key={c.key} className={`px-3 py-1.5 ${c.right ? 'text-right' : ''}`}>
                        {fmt(c, r[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
                {table.rows.length === 0 && (
                  <tr>
                    <td colSpan={table.columns.length} className="px-3 py-10 text-center text-gray-400">
                      No Results Found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
