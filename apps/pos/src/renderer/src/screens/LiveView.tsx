import { formatMoney } from '@hickey/shared/money'
import { ORDER_TYPE_LABELS, PAYMENT_MODE_LABELS, type OrderType, type PaymentMode } from '@hickey/shared/schemas/order'
import { useEffect, useState } from 'react'
import type { LiveSummary } from '../../../types/orders'
import { invoke, onEvent } from '../lib/api'
import { useSession } from '../store/session'

/** Today at a glance — mirrors the owner dashboard's Sales Statistics card at the counter. */
export function LiveViewScreen() {
  const [s, setS] = useState<LiveSummary | null>(null)

  useEffect(() => {
    const load = () => void invoke('live:summary', {}).then(setS)
    load()
    const t = setInterval(load, 30_000)
    const offA = onEvent('event:alerts', load)
    const offD = onEvent('event:day', load)
    return () => {
      clearInterval(t)
      offA()
      offD()
    }
  }, [])

  if (!s) return null
  const hours = Object.keys(s.byHour).sort()
  const max = Math.max(1, ...hours.map((h) => s.byHour[h] ?? 0))

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-xl font-semibold">Live View</h1>
        <span className="text-gray-500 text-sm">Business day {s.businessDate}</span>
      </div>

      {s.running > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 flex items-center gap-3">
          <span>
            <b>{s.running} order{s.running > 1 ? 's' : ''} saved but not billed</b> ({formatMoney(s.runningAmount)}) — not counted in Total Sales until billed.
          </span>
          <button onClick={() => useSession.getState().go('hold')} className="ml-auto min-h-0 h-8 px-3 rounded bg-brand-600 text-white text-xs font-semibold">
            Open them
          </button>
        </div>
      )}
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Total Sales (billed)" value={formatMoney(s.totalSales)} big />
        <Stat label="Bills" value={String(s.totalOrders)} big />
        <Stat label="Not billed (running / held)" value={`${s.running} · ${formatMoney(s.runningAmount)}`} />
        <Stat label="Cancelled" value={String(s.cancelled)} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(['dine_in', 'pick_up', 'delivery'] as OrderType[]).map((t) => {
          const v = s.byType[t] ?? { orders: 0, amount: 0 }
          const pct = s.totalSales ? Math.round((v.amount / s.totalSales) * 100) : 0
          return (
            <div key={t} className="bg-white rounded-lg border border-gray-200 p-3">
              <div className="font-semibold">{ORDER_TYPE_LABELS[t]}</div>
              <div className="text-2xl font-bold my-1">{formatMoney(v.amount)}</div>
              <div className="h-1.5 bg-gray-200 rounded"><div className="h-1.5 bg-green-500 rounded" style={{ width: `${pct}%` }} /></div>
              <div className="text-xs text-gray-500 mt-1">{v.orders} orders · {pct}%</div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="font-semibold mb-2">Payments</div>
          {(['cash', 'card', 'upi', 'other', 'due'] as PaymentMode[]).map((m) => {
            const v = s.byPayment[m]
            if (!v) return null
            const pct = s.totalSales ? ((v.amount / s.totalSales) * 100).toFixed(1) : '0'
            return (
              <div key={m} className="flex justify-between py-1 border-b border-gray-100 text-sm">
                <span>{PAYMENT_MODE_LABELS[m]}</span>
                <span>
                  <span className="font-semibold">{formatMoney(v.amount)}</span> <span className="text-gray-500">{pct}%</span>
                </span>
              </div>
            )
          })}
          {Object.keys(s.byPayment).length === 0 && <div className="text-gray-400 text-sm">No payments yet</div>}
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="font-semibold mb-2">Sales by hour</div>
          <div className="flex items-end gap-1 h-32">
            {hours.map((h) => (
              <div key={h} className="flex-1 flex flex-col items-center justify-end h-full">
                <div className="w-full bg-green-500 rounded-t" style={{ height: `${((s.byHour[h] ?? 0) / max) * 100}%` }} title={formatMoney(s.byHour[h] ?? 0)} />
                <div className="text-[10px] text-gray-500 mt-1">{h.slice(0, 2)}</div>
              </div>
            ))}
            {hours.length === 0 && <div className="text-gray-400 text-sm">No sales yet</div>}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <div className="font-semibold mb-2">Top items</div>
        {s.topItems.map((it) => (
          <div key={it.name} className="flex justify-between py-1 border-b border-gray-100 text-sm">
            <span>
              {it.name} <span className="text-gray-500">({it.qty} sold)</span>
            </span>
            <span className="font-semibold">{formatMoney(it.amount)}</span>
          </div>
        ))}
        {s.topItems.length === 0 && <div className="text-gray-400 text-sm">Nothing sold yet</div>}
      </div>
    </div>
  )
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`font-bold ${big ? 'text-3xl' : 'text-xl'}`}>{value}</div>
    </div>
  )
}
