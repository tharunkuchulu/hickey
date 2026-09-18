import { isBilled, salesStats } from '@hickey/shared/analytics'
import { formatMoney } from '@hickey/shared/money'
import type { RangeData } from '../lib/data'

const PAY_LABEL: Record<string, string> = { cash: 'Cash', card: 'Card', upi: 'UPI', other: 'Other', due: 'Due Payment', not_paid: 'Not Paid' }
const PAY_ORDER = ['cash', 'card', 'upi', 'other', 'due', 'not_paid']
const TYPE_LABEL: Record<string, string> = { pick_up: 'Pick Up', dine_in: 'Dine In', delivery: 'Delivery' }
const money = (p: number) => formatMoney(p, { symbol: false })
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '')

/**
 * Owner's "Daily Sales": the same Petpooja Sales Summary the counter shows — success orders split by
 * payment type, order types, cancelled, then every bill with its payment mode and time.
 */
export function DailySales({ data, from, to }: { data: RangeData; from: string; to: string }) {
  const s = salesStats(data.orders, data.payments)
  const billed = data.orders.filter(isBilled)
  const cancelled = data.orders.filter((o) => o.status === 'cancelled')
  const unbilled = data.orders.filter((o) => o.status === 'running' || o.status === 'held')
  const byPay = new Map(s.byPayment.map((p) => [p.key, p]))
  const oneDay = from === to
  const legsOf = (id: string) => data.payments.filter((p) => p.order_id === id)
  const linesOf = new Map<string, string[]>()
  const qtyOf = new Map<string, number>()
  for (const l of data.lines) {
    if (l.is_cancelled) continue
    const n = l.variant_name ? `${l.name} (${l.variant_name})` : l.name
    const list = linesOf.get(l.order_id) ?? []
    list.push(l.qty > 1 ? `${l.qty}× ${n}` : n)
    linesOf.set(l.order_id, list)
    qtyOf.set(l.order_id, (qtyOf.get(l.order_id) ?? 0) + l.qty)
  }
  const paymentText = (o: RangeData['orders'][number]) => {
    if (o.status === 'cancelled') return 'Cancelled'
    if (!isBilled(o)) return 'Not billed'
    const legs = legsOf(o.id)
    if (legs.length === 0) return 'Not Paid'
    return legs.map((p) => (legs.length > 1 ? `${PAY_LABEL[p.mode] ?? p.mode} ${Math.round(p.amount / 100)}` : PAY_LABEL[p.mode] ?? p.mode)).join(' + ')
  }
  const card = 'bg-white rounded-xl border border-gray-200 overflow-hidden'
  const th = 'px-3 py-2 text-left font-semibold text-gray-700'

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total sales" value={formatMoney(s.total)} big />
        <Stat label="Bills" value={String(s.orders)} big />
        <Stat label="Average bill" value={formatMoney(s.orders ? Math.round(s.total / s.orders) : 0)} />
        <Stat label="Cancelled" value={`${cancelled.length} · ${formatMoney(cancelled.reduce((a, o) => a + o.total, 0))}`} />
      </div>
      {unbilled.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {unbilled.length} order{unbilled.length > 1 ? 's' : ''} at the counter saved but not billed ({formatMoney(unbilled.reduce((a, o) => a + o.total, 0))}) — not in sales yet.
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-3">
        <div className={card}>
          <div className="px-3 py-2 border-b border-gray-200 font-semibold text-sm">Success Orders ({s.orders}) — by payment type</div>
          <table className="w-full text-sm">
            <thead className="bg-[#eef2f7] text-xs">
              <tr>
                <th className={th}>Payment Type</th>
                <th className={`${th} text-right`}>Orders</th>
                <th className={`${th} text-right`}>Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              {PAY_ORDER.map((k) => {
                const p = byPay.get(k)
                return (
                  <tr key={k} className="border-t border-gray-100">
                    <td className="px-3 py-1.5">{PAY_LABEL[k]}</td>
                    <td className="px-3 py-1.5 text-right">{p?.count ?? 0}</td>
                    <td className="px-3 py-1.5 text-right font-medium">{money(p?.total ?? 0)}</td>
                  </tr>
                )
              })}
              <tr className="border-t border-gray-300 bg-[#fbf7e6] font-bold">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right">{s.orders}</td>
                <td className="px-3 py-2 text-right">{money(s.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className={card}>
          <div className="px-3 py-2 border-b border-gray-200 font-semibold text-sm">Sales &amp; order types</div>
          <table className="w-full text-sm">
            <tbody>
              <Row k="Gross (items)" v={money(billed.reduce((a, o) => a + o.subtotal, 0))} />
              <Row k="Discount" v={`- ${money(billed.reduce((a, o) => a + o.discount, 0))}`} />
              <Row k="Net sales" v={money(s.total)} bold />
              {['pick_up', 'dine_in', 'delivery'].map((t) => {
                const v = s.byType.find((x) => x.key === t)
                return <Row key={t} k={TYPE_LABEL[t]!} v={`${v?.count ?? 0} orders · ${money(v?.total ?? 0)}`} />
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className={`${card} overflow-x-auto`}>
        <div className="px-3 py-2 border-b border-gray-200 font-semibold text-sm">{oneDay ? 'Bills of the day' : 'Bills'} ({data.orders.length})</div>
        <table className="w-full text-sm">
          <thead className="bg-[#eef2f7] text-xs">
            <tr>
              <th className={th}>Bill</th>
              <th className={th}>KOT</th>
              {!oneDay && <th className={th}>Date</th>}
              <th className={th}>Time</th>
              <th className={th}>Type</th>
              <th className={th}>Items</th>
              <th className={`${th} text-right`}>Amount (₹)</th>
              <th className={th}>Payment</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.orders.map((o, i) => (
              <tr key={o.id} className={`border-t border-gray-100 ${o.status === 'cancelled' ? 'text-gray-400 line-through' : i % 2 ? 'bg-gray-50' : ''}`}>
                <td className="px-3 py-1.5 font-semibold">{o.bill_no ? `..${o.bill_no.slice(-3)}` : '—'}</td>
                <td className="px-3 py-1.5">{o.kot_no ?? '—'}</td>
                {!oneDay && <td className="px-3 py-1.5">{o.business_date}</td>}
                <td className="px-3 py-1.5">{time(o.printed_at ?? o.created_at)}</td>
                <td className="px-3 py-1.5">{TYPE_LABEL[o.order_type] ?? o.order_type}</td>
                <td className="px-3 py-1.5 max-w-[320px]" title={(linesOf.get(o.id) ?? []).join(', ')}>
                  <span className="line-clamp-2">{(linesOf.get(o.id) ?? []).join(', ') || '—'}</span>
                  {(qtyOf.get(o.id) ?? 0) > 0 && <span className="text-gray-400 text-xs"> ({qtyOf.get(o.id)})</span>}
                </td>
                <td className="px-3 py-1.5 text-right font-medium">{money(o.total)}</td>
                <td className="px-3 py-1.5">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${paymentText(o) === 'Not Paid' ? 'bg-amber-100 text-amber-800' : isBilled(o) ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                    {paymentText(o)}
                  </span>
                </td>
                <td className="px-3 py-1.5 capitalize">{o.status === 'settled' ? 'saved' : o.status}</td>
              </tr>
            ))}
            {data.orders.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-gray-400">
                  No bills in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-3 py-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`font-bold ${big ? 'text-2xl' : 'text-lg'}`}>{value}</div>
    </div>
  )
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <tr className={`border-t border-gray-100 ${bold ? 'font-bold' : ''}`}>
      <td className="px-3 py-1.5">{k}</td>
      <td className="px-3 py-1.5 text-right">{v}</td>
    </tr>
  )
}
