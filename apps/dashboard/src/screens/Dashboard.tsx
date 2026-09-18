import { FOUR_HOUR_BUCKETS, itemPerformance, salesByDay, salesByFourHours, salesStats } from '@hickey/shared/analytics'
import { formatMoney } from '@hickey/shared/money'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Freshness } from '../components/Freshness'
import { addDays, fetchCashMovements, fetchDevices, fetchRange, resolveTodayBusinessDate, todayBusinessDate, type CashMovementRow, type RangeData } from '../lib/data'
import { useLiveData } from '../lib/useLiveData'

const TYPE_LABEL: Record<string, string> = { dine_in: 'Dine In', pick_up: 'Pick Up', delivery: 'Delivery' }
const TYPE_COLOR: Record<string, string> = { dine_in: '#1e6fd9', pick_up: '#16a34a', delivery: '#f0873a' }
const PAY_LABEL: Record<string, string> = { cash: 'Cash', card: 'Card', upi: 'UPI', other: 'Other', due: 'Due', not_paid: 'Not paid' }

/** The Petpooja owner dashboard: Sales Statistics, order-type cards, 15-day trend, item performance, expenses. */
export function DashboardScreen() {
  const [date, setDate] = useState(todayBusinessDate())
  const touched = useRef(false)
  useEffect(() => {
    void resolveTodayBusinessDate().then((d) => {
      if (!touched.current) setDate(d)
    })
  }, [])
  const live = useLiveData(
    () =>
      Promise.all([fetchRange(date, date), fetchRange(addDays(date, -14), date), fetchCashMovements(date, date), fetchDevices()]).then(
        ([day, trend, cash, devices]) => ({ day, trend, cash, devices })
      ),
    [date]
  )
  const day: RangeData | null = live.data?.day ?? null
  const trend: RangeData | null = live.data?.trend ?? null
  const cash: CashMovementRow[] = live.data?.cash ?? []
  const devices: Array<{ label: string; last_seen_at: string | null }> = live.data?.devices ?? []
  const err = live.err

  const stats = useMemo(() => (day ? salesStats(day.orders, day.payments) : null), [day])
  const buckets = useMemo(() => (day ? salesByFourHours(day.orders) : []), [day])
  const days = useMemo(() => (trend ? salesByDay(trend.orders) : []), [trend])
  const items = useMemo(() => (day ? itemPerformance(day.orders, day.lines) : []), [day])
  const lastSeen = devices.map((d) => d.last_seen_at).filter(Boolean).sort().pop()

  if (err && !stats) return <div className="p-6 text-red">{err}</div>
  if (!stats) return <div className="p-6 text-gray-400">Loading…</div>

  const maxBucket = Math.max(1, ...buckets.map((b) => b.total))
  const maxDay = Math.max(1, ...days.map((d) => d.total))
  const expenses = cash.filter((c) => c.kind === 'expense').reduce((a, c) => a + c.amount, 0)
  const withdrawals = cash.filter((c) => c.kind === 'withdrawal').reduce((a, c) => a + c.amount, 0)
  const topUps = cash.filter((c) => c.kind === 'top_up').reduce((a, c) => a + c.amount, 0)

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <span className={`text-xs px-2 py-1 rounded-full border ${syncTone(lastSeen)}`} title="When the counter last uploaded to the cloud">
          ● POS synced {lastSeen ? relative(lastSeen) : 'never'}
        </span>
        <Freshness at={live.at} busy={live.busy} onRefresh={live.refresh} />
        {err && <span className="text-xs text-red">Refresh failed: {err}</span>}
        <div className="flex-1" />
        <input type="date" value={date} onChange={(e) => { touched.current = true; setDate(e.target.value) }} className="h-9 rounded-md border border-gray-300 px-2 text-sm bg-white" />
      </div>

      {/* Sales Statistics */}
      <section className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Sales Statistics</h2>
          <span className="text-sm text-gray-500">Total orders <b className="text-gray-900 text-base">{stats.orders}</b></span>
        </div>
        <div className="grid md:grid-cols-[260px_1fr] gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-sm font-medium">Total Sales</div>
            <div className="text-xs text-gray-500">{date} · {stats.orders} orders</div>
            <div className="text-3xl font-bold my-2">{formatMoney(stats.total, { decimals: 0 })}</div>
            <div className="h-1.5 rounded bg-green-500 mb-3" />
            {['cash', 'card', 'upi', 'other', 'due', 'not_paid'].map((m) => {
              const v = stats.byPayment.find((p) => p.key === m)?.total ?? 0
              if (!v && m !== 'cash' && m !== 'card') return null
              const pct = stats.total ? ((v / stats.total) * 100).toFixed(1) : '0.0'
              return (
                <div key={m} className="flex justify-between text-sm py-1 border-b border-gray-100 last:border-0">
                  <span className="text-gray-600">{PAY_LABEL[m]}</span>
                  <span>
                    <b>{formatMoney(v, { decimals: 0 })}</b> <span className="text-gray-400 text-xs">{pct}%</span>
                  </span>
                </div>
              )
            })}
          </div>
          <div>
            <div className="flex gap-2 text-xs mb-2">
              <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700">● {stats.orders} Successful</span>
              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">● {stats.complimentary} Complementary</span>
              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">● {stats.cancelled} Cancelled</span>
            </div>
            <div className="h-48 flex items-end gap-2">
              {buckets.map((b, i) => (
                <div key={b.bucket} className="flex-1 flex flex-col items-center justify-end h-full" title={formatMoney(b.total)}>
                  <div className="w-full flex flex-col-reverse" style={{ height: `${(b.total / maxBucket) * 100}%` }}>
                    {Object.entries(b.byType).map(([t, v]) => (
                      <div key={t} style={{ height: `${(v / (b.total || 1)) * 100}%`, background: TYPE_COLOR[t] ?? '#999' }} />
                    ))}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1 text-center leading-tight">{FOUR_HOUR_BUCKETS[i]?.replace(' - ', '–')}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-4 text-xs text-gray-600 mt-2">
              {Object.entries(TYPE_COLOR).map(([t, c]) => (
                <span key={t} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: c }} /> {TYPE_LABEL[t]}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4">
          {['dine_in', 'pick_up', 'delivery'].map((t) => {
            const v = stats.byType.find((x) => x.key === t)
            const pct = stats.total && v ? Math.round((v.total / stats.total) * 100) : 0
            return (
              <div key={t} className="rounded-lg border border-gray-200 p-3">
                <div className="text-sm font-medium">{TYPE_LABEL[t]}</div>
                <div className="text-xl font-bold my-1">{formatMoney(v?.total ?? 0, { decimals: 0 })}</div>
                <div className="h-1.5 rounded bg-gray-200">
                  <div className="h-1.5 rounded" style={{ width: `${pct}%`, background: TYPE_COLOR[t] }} />
                </div>
                <div className="text-xs text-gray-500 mt-1">{v?.count ?? 0} Order · {pct}%</div>
              </div>
            )
          })}
        </div>
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <section className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="font-semibold mb-3">Last 15 Days</h2>
          <div className="h-40 flex items-end gap-1">
            {days.map((d) => (
              <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full" title={`${d.date}: ${formatMoney(d.total)}`}>
                <div className="text-[9px] text-gray-500 mb-0.5">{Math.round(d.total / 100).toLocaleString('en-IN')}</div>
                <div className="w-full bg-blue-200 rounded-t" style={{ height: `${(d.total / maxDay) * 100}%` }} />
                <div className="text-[9px] text-gray-400 mt-1">{d.date.slice(8)}</div>
              </div>
            ))}
            {days.length === 0 && <div className="text-gray-400 text-sm">No sales in range</div>}
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="font-semibold mb-3">Item Performance</h2>
          {items.slice(0, 8).map((it) => (
            <div key={it.name} className="flex justify-between text-sm py-1.5 border-b border-gray-100 last:border-0">
              <span>
                {it.name} <span className="text-gray-400 text-xs">({it.qty} sold)</span>
              </span>
              <b>{formatMoney(it.amount, { decimals: 0 })}</b>
            </div>
          ))}
          {items.length === 0 && <div className="text-gray-400 text-sm">Nothing sold yet</div>}
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="font-semibold mb-1">Expenses & Withdrawals</h2>
          <div className="text-2xl font-bold">{formatMoney(expenses + withdrawals, { decimals: 0 })}</div>
          <div className="text-xs text-gray-500 mb-3">Total outflow</div>
          {[
            ['Expenses', expenses],
            ['Withdrawals', withdrawals],
            ['Cash Top up', topUps]
          ].map(([l, v]) => (
            <div key={String(l)} className="flex justify-between text-sm py-1 border-b border-gray-100 last:border-0">
              <span className="text-gray-600">{l}</span>
              <b>{formatMoney(Number(v), { decimals: 0 })}</b>
            </div>
          ))}
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="font-semibold mb-1">Revenue Leakage</h2>
          {[
            ['Cancelled bills', stats.cancelled],
            ['Re-printed bills', day?.orders.filter((o) => o.print_count > 1).length ?? 0],
            ['Discounted bills', day?.orders.filter((o) => o.discount > 0).length ?? 0]
          ].map(([l, v]) => (
            <div key={String(l)} className="flex justify-between text-sm py-1 border-b border-gray-100 last:border-0">
              <span className="text-gray-600">{l}</span>
              <b>{v}</b>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}

/** Green when the counter uploaded in the last 15 min, amber up to 2 h, red beyond — a stalled sync must be obvious. */
function syncTone(iso: string | null | undefined): string {
  if (!iso) return 'bg-red-50 border-red-300 text-red-700'
  const mins = (Date.now() - new Date(iso).getTime()) / 60000
  if (mins <= 15) return 'bg-white border-gray-200 text-gray-600'
  if (mins <= 120) return 'bg-amber-50 border-amber-300 text-amber-800'
  return 'bg-red-50 border-red-300 text-red-700'
}

function relative(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} mins ago`
  const h = Math.round(mins / 60)
  return h < 48 ? `${h} hours ago` : `${Math.round(h / 24)} days ago`
}
