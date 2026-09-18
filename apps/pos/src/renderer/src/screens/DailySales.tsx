import { formatMoney } from '@hickey/shared/money'
import { useCallback, useEffect, useState } from 'react'
import type { DailySales, PaymentInput } from '../../../main/ipc/contract'
import { PaymentDialog } from '../components/PaymentDialog'
import { invoke } from '../lib/api'
import { toast } from '../store/toast'

const money = (p: number) => formatMoney(p, { symbol: false })
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '')

/**
 * "Daily Sales" — the page the staff open at day end. Same shape as Petpooja's Sales Summary:
 * totals → Success Orders split by payment type → order types → cancelled → then every bill of the day
 * with its payment mode, time and biller. Payment of any billed order can be corrected from here.
 */
export function DailySalesView({ from, to }: { from: string; to: string }) {
  const [d, setD] = useState<DailySales | null>(null)
  const [paying, setPaying] = useState<DailySales['bills'][number] | null>(null)

  const load = useCallback(() => invoke('reports:daily', { from, to }).then(setD).catch((e) => toast.error(e instanceof Error ? e.message : String(e))), [from, to])
  useEffect(() => {
    void load()
  }, [load])

  async function changePayment(bill: DailySales['bills'][number], pays: PaymentInput[]) {
    try {
      const o = await invoke('orders:updatePayment', { orderId: bill.id, payments: pays })
      toast.success(`Bill ${o.billNoDisplay} payment: ${o.paymentSummary}`)
      setPaying(null)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  if (!d) return <div className="text-gray-400 text-sm">Loading…</div>
  const oneDay = d.from === d.to
  const card = 'bg-white border border-gray-200 rounded-md'
  const th = 'px-3 py-2 text-left font-semibold text-gray-700'
  const num = 'px-3 py-2 text-right'

  return (
    <div className="space-y-4">
      {d.unbilled.orders > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <b>{d.unbilled.orders} order{d.unbilled.orders > 1 ? 's' : ''} saved but not billed</b> ({formatMoney(d.unbilled.amount)}) — not counted in sales. Open <b>Hold</b> in the top bar and use Save &amp; Print or cancel them.
        </div>
      )}

      <div className="grid grid-cols-5 gap-3">
        <Stat label="Total sales" value={formatMoney(d.sales.net)} big />
        <Stat label="Bills" value={String(d.sales.orders)} big />
        <Stat label="Items sold" value={String(d.sales.items)} />
        <Stat label="Average bill" value={formatMoney(d.sales.avgBill)} />
        <Stat label="Cancelled" value={`${d.cancelled.orders} · ${formatMoney(d.cancelled.amount)}`} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className={card}>
          <div className="px-3 py-2 border-b border-gray-200 font-semibold">Success Orders ({d.sales.orders}) — by payment type</div>
          <table className="w-full text-[13px]">
            <thead className="bg-[#eef2f7]">
              <tr>
                <th className={th}>Payment Type</th>
                <th className={`${th} text-right`}>Orders</th>
                <th className={`${th} text-right`}>Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              {d.byPayment.map((p) => (
                <tr key={p.mode} className="border-t border-gray-100">
                  <td className="px-3 py-1.5">{p.label}</td>
                  <td className={num}>{p.orders}</td>
                  <td className={`${num} font-medium`}>{money(p.amount)}</td>
                </tr>
              ))}
              <tr className="border-t border-gray-300 bg-[#fbf7e6] font-bold">
                <td className="px-3 py-2">Total</td>
                <td className={num}>{d.sales.orders}</td>
                <td className={num}>{money(d.sales.net)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="space-y-3">
          <div className={card}>
            <div className="px-3 py-2 border-b border-gray-200 font-semibold">Sales</div>
            <table className="w-full text-[13px]">
              <tbody>
                <Row k="Gross (items)" v={money(d.sales.gross)} />
                <Row k="Discount" v={`- ${money(d.sales.discount)}`} />
                <Row k="Net sales" v={money(d.sales.net)} bold />
                <Row k="Cancelled orders" v={`${d.cancelled.orders} · ${money(d.cancelled.amount)}`} />
              </tbody>
            </table>
          </div>
          <div className={card}>
            <div className="px-3 py-2 border-b border-gray-200 font-semibold">Order types</div>
            <table className="w-full text-[13px]">
              <tbody>
                {d.byType.map((t) => (
                  <Row key={t.type} k={t.label} v={`${t.orders} orders · ${money(t.amount)}`} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className={card}>
        <div className="px-3 py-2 border-b border-gray-200 font-semibold">
          {oneDay ? 'Bills of the day' : 'Bills'} ({d.bills.length}) <span className="font-normal text-gray-500 text-xs ml-2">tap a payment to correct it</span>
        </div>
        <table className="w-full text-[13px]">
          <thead className="bg-[#eef2f7]">
            <tr>
              <th className={th}>Bill</th>
              <th className={th}>KOT</th>
              <th className={th}>Time</th>
              {!oneDay && <th className={th}>Date</th>}
              <th className={th}>Type</th>
              <th className={th}>Items</th>
              <th className={`${th} text-right`}>Amount (₹)</th>
              <th className={th}>Payment</th>
              <th className={th}>Paid at</th>
              <th className={th}>Biller</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {d.bills.map((b, i) => {
              const billed = b.status === 'printed' || b.status === 'settled'
              return (
                <tr key={b.id} className={`border-t border-gray-100 ${b.status === 'cancelled' ? 'text-gray-400 line-through' : i % 2 ? 'bg-gray-50' : ''}`}>
                  <td className="px-3 py-1.5 font-semibold">{b.billNoDisplay}</td>
                  <td className="px-3 py-1.5">{b.kotNo ?? '—'}</td>
                  <td className="px-3 py-1.5">{time(b.time)}</td>
                  {!oneDay && <td className="px-3 py-1.5">{new Date(b.time).toLocaleDateString('en-IN')}</td>}
                  <td className="px-3 py-1.5">{b.type}</td>
                  <td className="px-3 py-1.5 max-w-[360px]" title={b.itemsText}>
                    <span className="line-clamp-2">{b.itemsText || '—'}</span>
                    {b.items > 0 && <span className="text-gray-400 text-xs"> ({b.items})</span>}
                  </td>
                  <td className={`${num} font-medium`}>{money(b.total)}</td>
                  <td className="px-3 py-1.5">
                    {billed ? (
                      <button onClick={() => setPaying(b)} className={`min-h-0 h-7 px-2 rounded text-xs font-medium underline decoration-dotted ${b.payment === 'Not Paid' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                        {b.payment}
                      </button>
                    ) : (
                      b.payment
                    )}
                  </td>
                  <td className="px-3 py-1.5">{time(b.paidAt)}</td>
                  <td className="px-3 py-1.5">{b.biller}</td>
                  <td className="px-3 py-1.5 capitalize">{b.status === 'settled' ? 'saved' : b.status}</td>
                </tr>
              )
            })}
            {d.bills.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-10 text-center text-gray-400">
                  No bills in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {paying && (
        <PaymentDialog
          title={`Payment for bill ${paying.billNoDisplay} · ${formatMoney(paying.total)}`}
          total={paying.total}
          confirmLabel="Update payment"
          onConfirm={(pays) => changePayment(paying, pays)}
          onClose={() => setPaying(null)}
        />
      )}
    </div>
  )
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="bg-white border border-gray-200 rounded-md px-3 py-2">
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
