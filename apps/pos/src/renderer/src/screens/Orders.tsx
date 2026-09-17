import { formatMoney } from '@hickey/shared/money'
import { ORDER_TYPE_LABELS } from '@hickey/shared/schemas/order'
import { useCallback, useEffect, useState } from 'react'
import type { OrderDto, PaymentInput } from '../../../types/orders'
import { Modal, PrimaryButton, SecondaryButton } from '../components/Modal'
import { DiscardDialog } from '../components/DiscardDialog'
import { PaymentDialog } from '../components/PaymentDialog'
import { invoke, onEvent } from '../lib/api'
import { useCart } from '../store/cart'
import { useSession } from '../store/session'
import { toast } from '../store/toast'

type View = 'order' | 'kot'

/**
 * Orders screen — the Petpooja "Order View / Kot View" cards: bill no, KOT no, type, items,
 * amount, payment tag, elapsed timer and the orange "Food Is Ready" button. Held orders can be resumed.
 */
export function OrdersScreen({ mode = 'today' }: { mode?: 'today' | 'hold' }) {
  const initialQuery = useSession((s) => s.ordersQuery)
  const [view, setView] = useState<View>('order')
  const [query, setQuery] = useState(initialQuery)
  const [orders, setOrders] = useState<OrderDto[]>([])
  const [detail, setDetail] = useState<OrderDto | null>(null)
  const [cancelling, setCancelling] = useState<OrderDto | null>(null)
  const [paying, setPaying] = useState<OrderDto | null>(null)
  const [discarding, setDiscarding] = useState<OrderDto | null>(null)
  const [now, setNow] = useState(Date.now())

  const load = useCallback(async () => {
    const bd = await invoke('app:businessDate')
    const list = await invoke('orders:list', {
      // Hold shows every parked order, whatever day it was started on — a forgotten hold must not vanish at 03:30.
      businessDate: query.trim() || mode === 'hold' ? undefined : bd,
      status: mode === 'hold' ? ['held', 'running'] : undefined,
      query: query.trim() || undefined
    })
    setOrders(list)
  }, [query, mode])

  useEffect(() => {
    void load()
    const t = setInterval(() => setNow(Date.now()), 15_000)
    // Re-fetch after any order action on this machine and when the business day rolls / extends.
    const offA = onEvent('event:alerts', () => void load())
    const offD = onEvent('event:day', () => void load())
    return () => {
      clearInterval(t)
      offA()
      offD()
    }
  }, [load])

  const elapsed = (o: OrderDto) => {
    const ms = now - new Date(o.createdAt).getTime()
    const m = Math.floor(ms / 60000)
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  }

  async function ready(o: OrderDto) {
    const updated = await invoke('orders:markReady', { orderId: o.id })
    setOrders((list) => list.map((x) => (x.id === o.id ? updated : x)))
  }

  async function reprint(o: OrderDto, what: 'bill' | 'kot') {
    const r = await invoke('orders:reprint', { orderId: o.id, what })
    r.ok ? toast.success(`${what === 'bill' ? 'Bill' : 'KOT'} sent to printer`) : toast.error(r.error ?? 'Print failed')
    if (r.ok) void load()
  }

  /** Wrong payment button pressed at the counter: replace the legs after billing (all screens offer this). */
  async function changePayment(o: OrderDto, pays: PaymentInput[]) {
    try {
      const updated = await invoke('orders:updatePayment', { orderId: o.id, payments: pays })
      setOrders((list) => list.map((x) => (x.id === o.id ? updated : x)))
      if (detail?.id === o.id) setDetail(updated)
      setPaying(null)
      toast.success(`Bill ${updated.billNoDisplay} payment: ${updated.paymentSummary}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }
  const billed = (o: OrderDto) => o.status === 'printed' || o.status === 'settled'

  const resume = (o: OrderDto) => {
    useCart.getState().loadOrder(o)
    useSession.getState().go('billing')
  }

  return (
    <div className="h-full flex flex-col">
      <div className="h-14 shrink-0 bg-white border-b border-gray-200 flex items-center gap-2 px-3">
        <div className="flex rounded-full overflow-hidden border border-gray-300">
          {(['order', 'kot'] as View[]).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`min-h-0 h-10 px-5 text-sm font-semibold ${view === v ? 'bg-pill text-white' : 'bg-white text-gray-700'}`}>
              {v === 'order' ? 'Order View' : 'Kot View'}
            </button>
          ))}
        </div>
        <div className="font-semibold ml-2">{mode === 'hold' ? 'Held / running orders' : 'Total Orders'} | {orders.length}</div>
        <div className="flex-1" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Bill no, KOT no or phone"
          className="min-h-0 h-10 w-64 rounded border border-gray-300 px-3 text-sm"
        />
        <button onClick={() => void load()} className="min-h-0 h-10 px-3 rounded border border-gray-300 bg-white text-sm">
          ⟳ Refresh
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 grid grid-cols-3 gap-3 content-start">
        {orders.length === 0 && <div className="col-span-3 text-center text-gray-400 py-16">No orders</div>}
        {orders.map((o) => (
          <div key={o.id} className={`bg-white rounded-lg border shadow-sm flex flex-col ${o.status === 'cancelled' ? 'border-red-300 opacity-70' : 'border-gray-200'}`}>
            <div className="bg-cardblue rounded-t-lg px-3 py-2 flex items-start justify-between">
              <div>
                <div className="font-bold">BILL: {o.billNoDisplay}</div>
                <div className="text-xs text-gray-600">
                  {o.status === 'held' ? 'ON HOLD' : o.status === 'cancelled' ? 'CANCELLED' : o.status === 'settled' ? 'SAVED' : o.status.toUpperCase()}
                </div>
              </div>
              <button onClick={() => setDetail(o)} className="min-h-0 h-8 px-3 rounded-full bg-pill text-white text-xs font-semibold">
                View
              </button>
              <div className="text-right text-xs">
                <div className="font-semibold">KOT: {o.kotNo ?? '—'}</div>
                <div>{ORDER_TYPE_LABELS[o.orderType]}{o.tableName ? ` · ${o.tableName}` : ''}</div>
              </div>
            </div>
            <div className="px-3 py-2 text-sm flex-1">
              <div className="flex justify-between text-gray-700">
                <span>
                  Order Details ({o.lines.length} Items | {formatMoney(o.total)})
                </span>
                {o.paymentSummary && (
                  <button
                    onClick={() => billed(o) && setPaying(o)}
                    title={billed(o) ? 'Change payment mode' : ''}
                    className={`min-h-0 h-6 px-2 rounded text-xs font-medium ${o.paymentSummary === 'Not Paid' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'} ${billed(o) ? 'underline decoration-dotted' : ''}`}
                  >
                    {o.paymentSummary}
                  </button>
                )}
              </div>
              {o.customerName && <div className="text-xs text-gray-500">{o.customerName} {o.customerPhone}</div>}
              <div className="mt-1 grid grid-cols-2 gap-x-3">
                {view === 'order' &&
                  o.lines.map((l) => (
                    <div key={l.id} className="text-xs text-gray-800 truncate">
                      {l.qty} x {l.name}
                      {l.variantName ? ` (${l.variantName})` : ''}
                    </div>
                  ))}
                {view === 'kot' &&
                  o.lines.map((l) => (
                    <div key={l.id} className="text-xs text-gray-800 truncate">
                      KOT {l.kotNo ?? '—'} · {l.qty} x {l.name}
                    </div>
                  ))}
              </div>
            </div>
            <div className="px-3 py-2 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-600">
              <span className="font-mono">{elapsed(o)}</span>
              {o.readyAt && <span className="text-green-700 font-medium">Ready</span>}
              <div className="flex-1" />
              {(o.status === 'held' || o.status === 'running') && (
                <>
                  <button onClick={() => setDiscarding(o)} className="min-h-0 h-9 px-3 rounded border border-red-300 bg-white text-red-700 font-semibold" data-testid="discard">
                    Discard
                  </button>
                  <button onClick={() => resume(o)} className="min-h-0 h-9 px-3 rounded bg-brand-600 text-white font-semibold">
                    Resume
                  </button>
                </>
              )}
              {billed(o) && (
                <button onClick={() => setPaying(o)} className="min-h-0 h-9 px-2 rounded border border-gray-300 bg-white text-gray-700 font-medium">
                  Payment
                </button>
              )}
              {o.status === 'settled' && o.printCount === 0 && (
                <button onClick={() => void reprint(o, 'bill')} className="min-h-0 h-9 px-3 rounded bg-pill text-white font-semibold">
                  Print bill
                </button>
              )}
              {billed(o) ? (
                <button
                  onClick={() => void ready(o)}
                  disabled={!!o.readyAt}
                  className="min-h-0 h-9 px-3 rounded bg-ready text-white font-semibold disabled:opacity-50"
                >
                  Food Is Ready
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {detail && (
        <Modal
          title={`Bill ${detail.billNo ?? '(not billed)'} · KOT ${detail.kotNo ?? '—'}`}
          onClose={() => setDetail(null)}
          footer={
            <>
              {detail.status !== 'cancelled' && (
                <SecondaryButton
                  className="mr-auto text-red-600"
                  onClick={() => {
                    // Unbilled orders are simply discarded (no PIN); billed ones go through the cancel rules.
                    if (detail.status === 'held' || detail.status === 'running') setDiscarding(detail)
                    else setCancelling(detail)
                    setDetail(null)
                  }}
                >
                  {detail.status === 'held' || detail.status === 'running' ? 'Discard order' : 'Cancel order'}
                </SecondaryButton>
              )}
              {billed(detail) && <SecondaryButton onClick={() => setPaying(detail)}>Change payment</SecondaryButton>}
              {detail.kotNo != null && <SecondaryButton onClick={() => void reprint(detail, 'kot')}>Reprint KOT</SecondaryButton>}
              {detail.billNo && <PrimaryButton onClick={() => void reprint(detail, 'bill')}>{detail.printCount === 0 ? 'Print bill' : 'Reprint bill'}</PrimaryButton>}
            </>
          }
        >
          <OrderDetail o={detail} />
        </Modal>
      )}
      {discarding && (
        <DiscardDialog
          order={{ id: discarding.id, kotNo: discarding.kotNo, total: discarding.total, items: discarding.lines.reduce((a, l) => a + l.qty, 0) }}
          onClose={() => setDiscarding(null)}
          onDone={() => {
            setDiscarding(null)
            void load()
          }}
        />
      )}
      {paying && (
        <PaymentDialog
          title={`Payment for bill ${paying.billNoDisplay} · ${formatMoney(paying.total)}`}
          total={paying.total}
          initial={paying.payments.map((p) => ({ mode: p.mode, amount: p.amount }))}
          confirmLabel="Update payment"
          onConfirm={(pays) => changePayment(paying, pays)}
          onClose={() => setPaying(null)}
        />
      )}
      {cancelling && (
        <CancelDialog
          o={cancelling}
          onClose={() => setCancelling(null)}
          onDone={(updated) => {
            setOrders((list) => list.map((x) => (x.id === updated.id ? updated : x)))
            setCancelling(null)
          }}
        />
      )}
    </div>
  )
}

function OrderDetail({ o }: { o: OrderDto }) {
  return (
    <div className="text-sm">
      <div className="grid grid-cols-2 gap-y-1 text-gray-600 mb-3">
        <span>Type</span>
        <span className="text-gray-900">{ORDER_TYPE_LABELS[o.orderType]}{o.tableName ? ` · ${o.tableName}` : ''}</span>
        <span>Status</span>
        <span className="text-gray-900 capitalize">{o.status}{o.cancelReason ? ` — ${o.cancelReason}` : ''}</span>
        <span>Created</span>
        <span className="text-gray-900">{new Date(o.createdAt).toLocaleString('en-IN')}</span>
        {o.settledAt && (
          <>
            <span>Paid at</span>
            <span className="text-gray-900">{new Date(o.settledAt).toLocaleString('en-IN')}</span>
          </>
        )}
        {o.customerName && (
          <>
            <span>Customer</span>
            <span className="text-gray-900">{o.customerName} {o.customerPhone}</span>
          </>
        )}
        {o.paymentSummary && (
          <>
            <span>Payment</span>
            <span className="text-gray-900">{o.payments.map((p) => `${p.mode.toUpperCase()} ${formatMoney(p.amount)}`).join(', ')}</span>
          </>
        )}
        {o.printCount > 1 && (
          <>
            <span>Prints</span>
            <span className="text-gray-900">{o.printCount}</span>
          </>
        )}
      </div>
      <table className="w-full">
        <thead className="text-xs text-gray-500">
          <tr>
            <th className="text-left font-medium">Item</th>
            <th className="text-right font-medium">Qty</th>
            <th className="text-right font-medium">Price</th>
            <th className="text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {o.lines.map((l) => (
            <tr key={l.id} className="border-t border-gray-100">
              <td className="py-1">
                {l.name}
                {l.variantName ? ` (${l.variantName})` : ''}
                {l.notes && <div className="text-xs text-brand-600">* {l.notes}</div>}
              </td>
              <td className="text-right">{l.qty}</td>
              <td className="text-right">{formatMoney(l.unitPrice + l.addonsTotal, { symbol: false })}</td>
              <td className="text-right">{formatMoney(l.lineTotal, { symbol: false })}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 border-t border-gray-200 pt-2 space-y-0.5">
        <div className="flex justify-between text-gray-600"><span>Sub Total</span><span>{formatMoney(o.subtotal)}</span></div>
        {o.discount > 0 && <div className="flex justify-between text-gray-600"><span>Discount</span><span>- {formatMoney(o.discount)}</span></div>}
        {o.roundOff !== 0 && <div className="flex justify-between text-gray-600"><span>Round off</span><span>{formatMoney(o.roundOff)}</span></div>}
        <div className="flex justify-between font-bold text-base"><span>Grand Total</span><span>{formatMoney(o.total)}</span></div>
      </div>
    </div>
  )
}

function CancelDialog({ o, onClose, onDone }: { o: OrderDto; onClose: () => void; onDone: (o: OrderDto) => void }) {
  const user = useSession((s) => s.user)
  const [reason, setReason] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    try {
      const s = await invoke('settings:get')
      if (s.billing.requireAdminPinForCancel && user?.role !== 'admin') {
        const ok = await invoke('auth:verifyAdminPin', { pin })
        if (!ok) {
          toast.error('Admin PIN is wrong')
          return
        }
      }
      const updated = await invoke('orders:cancel', { orderId: o.id, reason })
      toast.success(`Order ${o.billNoDisplay} cancelled`)
      onDone(updated)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Cancel bill ${o.billNoDisplay}?`}
      onClose={onClose}
      width="w-[420px]"
      footer={
        <>
          <SecondaryButton onClick={onClose}>Keep order</SecondaryButton>
          <PrimaryButton className="bg-red-600" onClick={() => void confirm()} disabled={busy || !reason.trim()}>
            Cancel order
          </PrimaryButton>
        </>
      }
    >
      <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" className="w-full rounded border border-gray-300 px-3 mb-2" />
      {user?.role !== 'admin' && (
        <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="Admin PIN" type="password" inputMode="numeric" className="w-full rounded border border-gray-300 px-3" />
      )}
    </Modal>
  )
}
