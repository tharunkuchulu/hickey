import { useState } from 'react'
import type { AlertDto } from '../../../main/ipc/contract'
import { DiscardDialog } from '../components/DiscardDialog'
import { invoke } from '../lib/api'
import { useAlerts } from '../store/alerts'
import { useCart } from '../store/cart'
import { useSession } from '../store/session'
import { toast } from '../store/toast'

const ICON: Record<AlertDto['kind'], string> = { hold_stale: '⏸', sync_problem: '☁', print_failed: '🖨', day_end: '🌙', update_ready: '⬆' }
const TONE: Record<AlertDto['severity'], string> = {
  error: 'border-l-red-500 bg-red-50',
  warning: 'border-l-amber-400 bg-amber-50',
  info: 'border-l-blue-400 bg-blue-50'
}

/** Everything the counter tends to forget, each with the button that fixes it. Badge count = rows here. */
export function AlertsScreen() {
  const status = useAlerts((s) => s.status)
  const openPrompt = useAlerts((s) => s.openPrompt)
  const go = useSession((s) => s.go)
  const [discarding, setDiscarding] = useState<AlertDto['order'] | null>(null)
  const alerts = status?.alerts ?? []

  async function resume(orderId: string) {
    const o = await invoke('orders:get', { orderId })
    if (!o) return toast.error('Order not found')
    useCart.getState().loadOrder(o)
    go('billing')
  }
  async function syncNow() {
    const st = await invoke('sync:now')
    st.state === 'synced' ? toast.success('Everything is synced') : toast.error(st.error ?? `Sync ${st.state}`)
  }
  async function testPrinter() {
    const s = await invoke('settings:get')
    const r = await invoke('printers:test', { printerName: s.printer.windowsPrinterName })
    r.ok ? toast.success('Test page printed') : toast.error(r.error ?? 'Print failed')
  }

  const btn = 'min-h-0 h-9 px-3 rounded text-sm font-semibold'
  const actions = (a: AlertDto) => {
    switch (a.kind) {
      case 'hold_stale':
        return (
          <>
            <button onClick={() => a.order && void resume(a.order.id)} className={`${btn} bg-brand-600 text-white`}>
              Resume
            </button>
            <button onClick={() => a.order && setDiscarding(a.order)} className={`${btn} border border-red-300 text-red-700 bg-white`}>
              Discard
            </button>
          </>
        )
      case 'sync_problem':
        return (
          <>
            <button onClick={() => void syncNow()} className={`${btn} bg-pill text-white`}>
              Sync now
            </button>
            <button onClick={() => go('settings')} className={`${btn} border border-gray-300 bg-white`}>
              Settings
            </button>
          </>
        )
      case 'print_failed':
        return (
          <>
            <button onClick={() => go('orders', { ordersQuery: a.print?.billNo ?? '' })} className={`${btn} bg-pill text-white`}>
              Open Orders
            </button>
            <button onClick={() => void testPrinter()} className={`${btn} border border-gray-300 bg-white`}>
              Test printer
            </button>
          </>
        )
      case 'day_end':
        return (
          <button onClick={() => openPrompt(a.day?.phase === 'ended' ? 'reopen' : 'manual')} className={`${btn} bg-brand-600 text-white`}>
            {a.day?.phase === 'ended' ? 'Reopen…' : 'Extend…'}
          </button>
        )
      case 'update_ready':
        return (
          <button onClick={() => void invoke('update:install')} className={`${btn} bg-pill text-white`}>
            Restart to update
          </button>
        )
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="h-14 shrink-0 bg-white border-b border-gray-200 flex items-center gap-3 px-4">
        <div className="font-semibold">Alerts | {alerts.length}</div>
        {status?.day && (
          <div className="text-sm text-gray-500">
            Business day {status.day.businessDate} · ends {new Date(status.day.endsAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            {status.day.extended ? ' (extended)' : ''}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {alerts.length === 0 && (
          <div className="text-center text-gray-400 py-20">
            <div className="text-4xl mb-2">✓</div>
            No alerts — nothing is waiting.
          </div>
        )}
        {alerts.map((a) => (
          <div key={a.id} className={`rounded-md border border-gray-200 border-l-4 ${TONE[a.severity]} px-4 py-3 flex items-center gap-4`}>
            <span className="text-xl w-7 text-center">{ICON[a.kind]}</span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900">{a.title}</div>
              <div className="text-sm text-gray-600">{a.detail}</div>
            </div>
            <div className="flex gap-2 shrink-0">{actions(a)}</div>
          </div>
        ))}
      </div>
      {discarding && <DiscardDialog order={discarding} onClose={() => setDiscarding(null)} onDone={() => setDiscarding(null)} />}
    </div>
  )
}
