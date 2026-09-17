import { formatMoney, toPaise } from '@hickey/shared/money'
import { useCallback, useEffect, useState } from 'react'
import type { CashFlowSummaryDto, CashMovementKind } from '../../../types/admin'
import { Modal, PrimaryButton, SecondaryButton } from '../components/Modal'
import { NumPad } from '../components/NumPad'
import { invoke, onEvent } from '../lib/api'
import { useSession } from '../store/session'
import { toast } from '../store/toast'

const KIND_LABEL: Record<CashMovementKind, string> = { expense: 'Expense', withdrawal: 'Withdrawal', top_up: 'Cash Top-Up' }

/** Petpooja "Cash Flow" + the Expense / Withdrawal / Cash Top-Up tiles, on one screen. */
export function CashFlowScreen({ initialKind }: { initialKind?: CashMovementKind }) {
  const me = useSession((s) => s.user)
  const [s, setS] = useState<CashFlowSummaryDto | null>(null)
  const [adding, setAdding] = useState<CashMovementKind | null>(initialKind ?? null)

  const load = useCallback(() => void invoke('cash:summary', {}).then(setS), [])
  useEffect(() => {
    load()
    return onEvent('event:day', load) // the business day rolled or was extended
  }, [load])

  async function remove(id: string) {
    try {
      await invoke('cash:delete', { id })
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  if (!s) return null
  const card = (label: string, value: number, tone = 'text-gray-900') => (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-bold ${tone}`}>{formatMoney(value)}</div>
    </div>
  )

  return (
    <div className="h-full overflow-y-auto p-5 space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Cash Flow</h1>
        <span className="text-sm text-gray-500">Business day {s.businessDate}</span>
        <div className="flex-1" />
        {(['expense', 'withdrawal', 'top_up'] as CashMovementKind[]).map((k) => (
          <button key={k} onClick={() => setAdding(k)} className="min-h-0 h-10 px-4 rounded bg-pill text-white text-sm font-semibold">
            + {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-6 gap-3">
        {card('Petty cash (opening)', s.opening)}
        {card('Cash sales', s.cashSales, 'text-green-700')}
        {card('Top-ups', s.topUp, 'text-green-700')}
        {card('Expenses', s.expense, 'text-red')}
        {card('Withdrawals', s.withdrawal, 'text-red')}
        {card('Expected in drawer', s.expected, 'text-pill')}
      </div>

      <table className="w-full bg-white border border-gray-200 text-sm">
        <thead className="bg-[#eef2f7] text-gray-700">
          <tr>
            <th className="text-left px-3 py-2 font-semibold">Time</th>
            <th className="text-left px-3 py-2 font-semibold">Type</th>
            <th className="text-left px-3 py-2 font-semibold">Reason</th>
            <th className="text-left px-3 py-2 font-semibold">By</th>
            <th className="text-right px-3 py-2 font-semibold">Amount</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {s.movements.map((m) => (
            <tr key={m.id} className="border-t border-gray-100">
              <td className="px-3 py-2">{new Date(m.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
              <td className="px-3 py-2">{KIND_LABEL[m.kind]}</td>
              <td className="px-3 py-2">{m.reason ?? '—'}</td>
              <td className="px-3 py-2">{m.by ?? '—'}</td>
              <td className={`px-3 py-2 text-right font-semibold ${m.kind === 'top_up' ? 'text-green-700' : 'text-red'}`}>
                {m.kind === 'top_up' ? '+' : '−'} {formatMoney(m.amount)}
              </td>
              <td className="px-3 py-2 text-right">
                {me?.role === 'admin' && (
                  <button onClick={() => void remove(m.id)} className="min-h-0 h-8 px-3 rounded border border-gray-300 bg-white text-xs text-red">
                    Delete
                  </button>
                )}
              </td>
            </tr>
          ))}
          {s.movements.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-8 text-center text-gray-400">
                No cash entries today
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {adding && (
        <MovementDialog
          kind={adding}
          onClose={() => setAdding(null)}
          onSaved={() => {
            setAdding(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function MovementDialog({ kind, onClose, onSaved }: { kind: CashMovementKind; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    try {
      await invoke('cash:add', { kind, amount: toPaise(amount), reason })
      toast.success(`${KIND_LABEL[kind]} of ₹${amount} recorded`)
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title={KIND_LABEL[kind]}
      onClose={onClose}
      width="w-[520px]"
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={() => void save()} disabled={busy || !Number(amount)}>
            Save
          </PrimaryButton>
        </>
      }
    >
      <div className="flex gap-5">
        <div className="flex-1">
          <div className="h-12 rounded border border-gray-300 flex items-center justify-end px-3 text-2xl mb-2">₹ {amount || '0'}</div>
          <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder={kind === 'expense' ? 'What was bought (milk, gas…)' : 'Reason'} className="w-full rounded border border-gray-300 px-3" />
        </div>
        <NumPad onDigit={(d) => setAmount((v) => (v + d).slice(0, 7))} onBackspace={() => setAmount((v) => v.slice(0, -1))} onClear={() => setAmount('')} />
      </div>
    </Modal>
  )
}
