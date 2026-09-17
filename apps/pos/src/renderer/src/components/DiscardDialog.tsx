import { formatMoney } from '@hickey/shared/money'
import { useState } from 'react'
import { invoke } from '../lib/api'
import { toast } from '../store/toast'
import { Modal, PrimaryButton, SecondaryButton } from './Modal'

/**
 * Throw away a held / running order that was never billed. No admin PIN: the order has no bill number
 * and no payment, so nothing is lost — the audit trail still records who discarded it.
 */
export function DiscardDialog({ order, onClose, onDone }: { order: { id: string; kotNo: number | null; total: number; items: number; billNoDisplay?: string }; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    try {
      await invoke('orders:cancel', { orderId: order.id, reason: reason.trim() ? `Discarded: ${reason.trim()}` : 'Discarded' })
      toast.success('Order discarded')
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Discard this order?"
      onClose={onClose}
      width="w-[420px]"
      footer={
        <>
          <SecondaryButton onClick={onClose}>Keep</SecondaryButton>
          <PrimaryButton className="bg-red-600" onClick={() => void confirm()} disabled={busy} data-testid="discard-confirm">
            Discard
          </PrimaryButton>
        </>
      }
    >
      <p className="text-sm text-gray-700 mb-3">
        {order.items} item{order.items === 1 ? '' : 's'} · {formatMoney(order.total)}
        {order.kotNo != null ? ` · KOT ${order.kotNo}` : ''} — not billed. Nothing is printed or counted as a sale.
      </p>
      <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional), e.g. customer left" className="w-full rounded border border-gray-300 px-3" />
    </Modal>
  )
}
