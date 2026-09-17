import { formatMoney } from '@hickey/shared/money'
import { useEffect, useState } from 'react'
import { REPORTS, type ReportId, type ReportResult } from '../../../types/reports'
import { DailySalesView } from './DailySales'
import { invoke } from '../lib/api'
import { toast } from '../store/toast'

/**
 * Reports in Petpooja's shape: a left list grouped by area, date filters on top, Excel / Print
 * buttons, then a striped table with a single Total row at the bottom. "Daily Sales" is a custom page.
 */
export function ReportsScreen() {
  const [id, setId] = useState<ReportId>('daily')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [result, setResult] = useState<ReportResult | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void invoke('app:businessDate').then((bd) => {
      setFrom(bd)
      setTo(bd)
    })
  }, [])

  useEffect(() => {
    if (!from || !to || id === 'daily') return
    setBusy(true)
    invoke('reports:run', { report: id, from, to })
      .then(setResult)
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false))
  }, [id, from, to])

  const quick = (days: number) => {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - days + 1)
    setFrom(start.toISOString().slice(0, 10))
    setTo(end.toISOString().slice(0, 10))
  }

  async function exportCsv() {
    const r = await invoke('reports:export', { report: id, from, to })
    if (r.ok) toast.success(`Saved ${r.path}`)
    else if (r.error) toast.error(r.error)
  }
  async function print() {
    const r = await invoke('reports:print', { report: id, from, to })
    r.ok ? toast.success('Report sent to printer') : toast.error(r.error ?? 'Print failed')
  }

  const groups = [...new Set(REPORTS.map((r) => r.group))]
  const fmt = (c: ReportResult['columns'][number], v: unknown) => (c.money && typeof v === 'number' ? formatMoney(v, { symbol: false }) : v == null ? '' : String(v))

  return (
    <div className="h-full flex">
      <aside className="w-64 bg-white border-r border-gray-200 overflow-y-auto">
        {groups.map((g) => (
          <div key={g}>
            <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide text-gray-500">{g}</div>
            {REPORTS.filter((r) => r.group === g).map((r) => (
              <button
                key={r.id}
                onClick={() => setId(r.id)}
                className={`w-full text-left px-4 py-2.5 text-[13px] border-l-4 ${id === r.id ? 'border-l-pill bg-blue-50 text-pill font-medium' : 'border-l-transparent text-gray-800 hover:bg-gray-50'}`}
              >
                {r.title}
              </button>
            ))}
          </div>
        ))}
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="shrink-0 bg-white border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            Reports <span>›</span> <span className="text-gray-900 font-semibold">{REPORTS.find((r) => r.id === id)?.title}</span>
          </div>
          <div className="flex items-end gap-3 flex-wrap">
            <label className="text-xs text-gray-600">
              Order Date from
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="block mt-1 min-h-0 h-9 rounded border border-gray-300 px-2 text-sm" />
            </label>
            <label className="text-xs text-gray-600">
              to
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="block mt-1 min-h-0 h-9 rounded border border-gray-300 px-2 text-sm" />
            </label>
            <div className="flex gap-1">
              {[
                ['Today', 1],
                ['7 days', 7],
                ['30 days', 30]
              ].map(([l, d]) => (
                <button key={l} onClick={() => quick(Number(d))} className="min-h-0 h-9 px-3 rounded border border-gray-300 bg-white text-xs">
                  {l}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <button onClick={() => void exportCsv()} className="min-h-0 h-9 px-4 rounded bg-pill text-white text-sm font-semibold">
              Excel
            </button>
            <button onClick={() => void print()} className="min-h-0 h-9 px-4 rounded bg-gray-700 text-white text-sm font-semibold">
              Print
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {id === 'daily' && from && to && <DailySalesView from={from} to={to} />}
          {busy && <div className="text-gray-400 text-sm">Loading…</div>}
          {id !== 'daily' && result && (
            <table className="w-full text-[13px] bg-white border border-gray-200">
              <thead className="bg-[#eef2f7] text-gray-700">
                <tr>
                  {result.columns.map((c) => (
                    <th key={c.key} className={`px-3 py-2 font-semibold ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={i} className={i % 2 ? 'bg-gray-50' : ''}>
                    {result.columns.map((c) => (
                      <td key={c.key} className={`px-3 py-1.5 ${c.align === 'right' ? 'text-right' : ''}`}>
                        {fmt(c, row[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
                {result.rows.length === 0 && (
                  <tr>
                    <td colSpan={result.columns.length} className="px-3 py-10 text-center text-gray-400">
                      No Results Found. We couldn't find a match for your search.
                    </td>
                  </tr>
                )}
                {(result.summary ?? []).map((row, i) => (
                  <tr key={`s${i}`} className="bg-[#fbf7e6] font-bold border-t-2 border-gray-300">
                    {result.columns.map((c, ci) => (
                      <td key={c.key} className={`px-3 py-2 ${c.align === 'right' ? 'text-right' : ''}`}>
                        {ci === 0 ? String(row._label ?? '') : fmt(c, row[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
