import { formatMoney } from '@hickey/shared/money'
import type { PaymentMode } from '@hickey/shared/schemas/order'
import { useState } from 'react'
import type { PaymentInput } from '../../../types/orders'
import { Modal, PrimaryButton, SecondaryButton } from './Modal'
import { NumPad } from './NumPad'

const FULL: Array<{ mode: PaymentMode | 'not_paid'; label: string }> = [
  { mode: 'cash', label: 'Cash' },
  { mode: 'card', label: 'Card' },
  { mode: 'upi', label: 'UPI' },
  { mode: 'other', label: 'Other' },
  { mode: 'due', label: 'Due' },
  { mode: 'not_paid', label: 'Not Paid' }
]
const SPLIT: PaymentMode[] = ['cash', 'card', 'upi', 'other']

interface Props {
  title: string
  total: number
  /** Existing legs, e.g. when correcting a billed order. */
  initial?: PaymentInput[]
  /** Open on the Part tab (billing screen "Part" option). */
  startSplit?: boolean
  confirmLabel?: string
  onConfirm: (pays: PaymentInput[]) => void | Promise<void>
  onClose: () => void
}

/**
 * Touch-first payment chooser. "Full" = one mode for the whole bill; "Part" = two legs, the first amount
 * typed on the number pad, the second leg gets the remainder automatically. Used for Part payment at
 * billing time and for "Change payment" on an already billed order (wrong button pressed at the counter).
 */
export function PaymentDialog({ title, total, initial = [], startSplit = false, confirmLabel = 'Confirm', onConfirm, onClose }: Props) {
  const initialFull = initial.length === 1 ? initial[0]!.mode : initial.length === 0 ? 'not_paid' : null
  const [tab, setTab] = useState<'full' | 'part'>(startSplit || initial.length > 1 ? 'part' : 'full')
  const [full, setFull] = useState<PaymentMode | 'not_paid'>(initialFull ?? 'cash')
  const [aMode, setAMode] = useState<PaymentMode>(initial[0]?.mode && SPLIT.includes(initial[0].mode) ? initial[0].mode : 'cash')
  const [bMode, setBMode] = useState<PaymentMode>(initial[1]?.mode && SPLIT.includes(initial[1].mode) ? initial[1].mode : 'card')
  const [aText, setAText] = useState(initial.length > 1 ? String(Math.round(initial[0]!.amount / 100)) : '')
  const [busy, setBusy] = useState(false)

  const aAmount = Math.round(Number(aText || 0) * 100)
  const bAmount = total - aAmount
  const splitOk = aAmount > 0 && bAmount > 0 && aMode !== bMode

  const pays: PaymentInput[] | null =
    tab === 'full'
      ? full === 'not_paid'
        ? []
        : [{ mode: full, amount: total }]
      : splitOk
        ? [
            { mode: aMode, amount: aAmount },
            { mode: bMode, amount: bAmount }
          ]
        : null

  async function confirm() {
    if (!pays) return
    setBusy(true)
    try {
      await onConfirm(pays)
    } finally {
      setBusy(false)
    }
  }

  const modeBtn = (active: boolean) =>
    `min-h-0 h-14 rounded-md border-2 text-base font-semibold ${active ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-gray-300 bg-white text-gray-800'}`

  return (
    <Modal
      title={title}
      onClose={onClose}
      width="w-[640px]"
      footer={
        <>
          <span className="mr-auto text-lg font-bold">Total {formatMoney(total)}</span>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={() => void confirm()} disabled={busy || !pays}>
            {confirmLabel}
          </PrimaryButton>
        </>
      }
    >
      <div className="flex rounded-full overflow-hidden border border-gray-300 w-fit mb-4">
        {(['full', 'part'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`min-h-0 h-10 px-6 text-sm font-semibold ${tab === t ? 'bg-pill text-white' : 'bg-white text-gray-700'}`}>
            {t === 'full' ? 'One payment' : 'Part payment (split)'}
          </button>
        ))}
      </div>

      {tab === 'full' && (
        <div className="grid grid-cols-3 gap-2">
          {FULL.map((m) => (
            <button key={m.mode} onClick={() => setFull(m.mode)} className={modeBtn(full === m.mode)}>
              {m.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'part' && (
        <div className="grid grid-cols-[1fr_auto] gap-4">
          <div className="space-y-4">
            <div>
              <div className="text-sm text-gray-600 mb-1">First payment</div>
              <div className="grid grid-cols-4 gap-1.5 mb-2">
                {SPLIT.map((m) => (
                  <button key={m} onClick={() => setAMode(m)} className={modeBtn(aMode === m)}>
                    {FULL.find((f) => f.mode === m)!.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Amount ₹</span>
                <input
                  value={aText}
                  onChange={(e) => setAText(e.target.value.replace(/[^\d.]/g, ''))}
                  inputMode="decimal"
                  autoFocus
                  className="w-32 rounded border border-gray-300 px-3 text-xl font-semibold text-right"
                />
                <button onClick={() => setAText(String(Math.floor(total / 200)))} className="min-h-0 h-10 px-3 rounded border border-gray-300 bg-white text-sm">
                  Half
                </button>
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 mb-1">Rest by</div>
              <div className="grid grid-cols-4 gap-1.5 mb-2">
                {SPLIT.map((m) => (
                  <button key={m} onClick={() => setBMode(m)} className={modeBtn(bMode === m)}>
                    {FULL.find((f) => f.mode === m)!.label}
                  </button>
                ))}
              </div>
              <div className={`text-lg font-semibold ${bAmount < 0 ? 'text-red' : 'text-gray-800'}`}>
                {FULL.find((f) => f.mode === bMode)!.label} {formatMoney(Math.max(bAmount, 0))}
                {aMode === bMode && <span className="text-sm text-red ml-2">choose two different modes</span>}
                {bAmount < 0 && <span className="text-sm text-red ml-2">more than the bill</span>}
              </div>
            </div>
          </div>
          <NumPad
            onDigit={(d) => setAText((t) => (d === '.' && t.includes('.') ? t : (t + d).slice(0, 8)))}
            onBackspace={() => setAText((t) => t.slice(0, -1))}
            onClear={() => setAText('')}
            onEnter={() => void confirm()}
            enterLabel={confirmLabel}
          />
        </div>
      )}
    </Modal>
  )
}
