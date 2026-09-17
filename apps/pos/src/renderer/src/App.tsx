import { useEffect, useState } from 'react'
import type { AppInfo, SyncStatusDto } from '../../main/ipc/contract'
import { Icon } from './components/icons'
import { Toasts } from './components/Modal'
import { invoke, onEvent } from './lib/api'
import { BillingScreen } from './screens/Billing'
import { CashFlowScreen } from './screens/CashFlow'
import { ItemOnOffScreen } from './screens/ItemOnOff'
import { MenuScreen } from './screens/Menu'
import { ReportsScreen } from './screens/Reports'
import { UsersScreen } from './screens/Users'
import { LiveViewScreen } from './screens/LiveView'
import { LoginScreen } from './screens/Login'
import { OperationsScreen } from './screens/Operations'
import { OrdersScreen } from './screens/Orders'
import { SettingsScreen } from './screens/Settings'
import { useCart } from './store/cart'
import { useMenu } from './store/menu'
import { useSession, type Screen } from './store/session'
import { toast } from './store/toast'

/** Top-bar quick actions, in Petpooja's order (Item On/Off · Store · Live View · Orders · Recent · Hold · Alerts · Logout). */
const QUICK: Array<{ id: string; label: string; icon: (p: { size?: number }) => React.ReactNode; screen?: Screen; soon?: boolean }> = [
  { id: 'itemonoff', label: 'Item On/Off', icon: Icon.Power, screen: 'itemonoff' },
  { id: 'store', label: 'Store', icon: Icon.Store, soon: true },
  { id: 'live', label: 'Live View', icon: Icon.Live, screen: 'live' },
  { id: 'orders', label: 'Orders', icon: Icon.Orders, screen: 'orders' },
  { id: 'recent', label: 'Recent', icon: Icon.Recent, screen: 'orders' },
  { id: 'hold', label: 'Hold', icon: Icon.Hold, screen: 'hold' },
  { id: 'alerts', label: 'Alerts', icon: Icon.Bell, soon: true }
]

const SIDE: Array<{ id: Screen | 'updates' | 'logout'; label: string }> = [
  { id: 'billing', label: 'Billing' },
  { id: 'operations', label: 'Operations' },
  { id: 'reports', label: 'Reports' },
  { id: 'live', label: 'Live View' },
  { id: 'settings', label: 'Settings' },
  { id: 'updates', label: 'Check Updates' },
  { id: 'logout', label: 'Logout' }
]

export default function App() {
  const { user, screen, go, logout, menuOpen, setMenuOpen, cashKind } = useSession()
  const loadMenu = useMenu((m) => m.load)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [billQ, setBillQ] = useState('')
  const [kotQ, setKotQ] = useState('')
  const [sync, setSync] = useState<SyncStatusDto | null>(null)

  useEffect(() => {
    void invoke('app:info').then(setInfo)
    void invoke('sync:status').then(setSync)
    return onEvent('event:sync', (p) => setSync(p as SyncStatusDto))
  }, [])
  useEffect(() => {
    if (user) void loadMenu()
  }, [user, loadMenu])

  if (!user) {
    return (
      <>
        <LoginScreen />
        <Toasts />
      </>
    )
  }

  const newOrder = () => {
    useCart.getState().clear()
    go('billing')
  }
  const search = (q: string) => {
    if (!q.trim()) return
    go('orders', { ordersQuery: q.trim() })
    setBillQ('')
    setKotQ('')
  }

  return (
    <div className="h-full flex flex-col bg-[#f3f3f3]">
      {/* Petpooja top bar: white, red New Order, search boxes, grey icon row, pink help box */}
      <header className="h-[52px] shrink-0 bg-white border-b border-gray-200 flex items-center pl-1 pr-2 gap-2 select-none">
        <button onClick={() => setMenuOpen(true)} className="min-h-0 h-10 w-10 rounded flex items-center justify-center text-dark hover:bg-gray-100" aria-label="Menu">
          <Icon.Menu size={24} />
        </button>
        <div className="flex items-center gap-1 px-1 text-red font-extrabold text-[22px] tracking-tight leading-none">
          <span className="inline-block w-6 h-6 rounded-md bg-red" />
          Hickey
        </div>
        <button onClick={newOrder} className="min-h-0 h-9 px-4 ml-1 rounded bg-brand-600 text-white font-semibold text-[13px]">
          New Order
        </button>
        <div className="relative">
          <Icon.Search size={16} className="absolute left-2.5 top-2.5 text-gray-400" />
          <input
            value={billQ}
            onChange={(e) => setBillQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search(billQ)}
            placeholder="Bill No"
            className="min-h-0 h-9 w-32 rounded border border-gray-300 bg-white pl-8 pr-2 text-[13px]"
          />
        </div>
        <div className="relative">
          <Icon.Search size={16} className="absolute left-2.5 top-2.5 text-gray-400" />
          <input
            value={kotQ}
            onChange={(e) => setKotQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search(kotQ)}
            placeholder="KOT No"
            className="min-h-0 h-9 w-32 rounded border border-gray-300 bg-white pl-8 pr-2 text-[13px]"
          />
        </div>
        <div className="flex-1" />
        {QUICK.map((q) => (
          <button
            key={q.id}
            onClick={() => (q.screen ? go(q.screen) : toast.info(`${q.label} arrives in the next phase`))}
            className={`min-h-0 h-11 w-[62px] rounded flex flex-col items-center justify-center text-dark hover:bg-gray-100 ${
              q.screen && screen === q.screen ? 'bg-gray-100' : ''
            } ${q.soon ? 'opacity-60' : ''}`}
          >
            <q.icon size={20} />
            <span className="text-[9px] mt-0.5 leading-none">{q.label}</span>
          </button>
        ))}
        <button onClick={() => void logout()} className="min-h-0 h-11 w-[62px] rounded flex flex-col items-center justify-center text-dark hover:bg-gray-100">
          <Icon.Logout size={20} />
          <span className="text-[9px] mt-0.5 leading-none">Logout</span>
        </button>
        <div className="ml-1 h-10 px-3 rounded bg-help text-brand-700 text-[11px] leading-tight flex flex-col justify-center">
          <span className="flex items-center gap-1">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                sync?.state === 'synced' ? 'bg-green-500' : sync?.state === 'syncing' ? 'bg-yellow-400' : sync?.state === 'disabled' ? 'bg-gray-400' : 'bg-red'
              }`}
            />
            {sync?.state === 'disabled' ? 'Local only' : sync?.state === 'synced' ? 'Synced' : sync?.state === 'syncing' ? 'Syncing…' : sync?.state === 'offline' ? 'Offline' : 'Sync error'}
            {sync && sync.pending > 0 ? ` · ${sync.pending} pending` : ''}
          </span>
          <span className="font-semibold">Biller: {user.name}</span>
        </div>
      </header>

      <main className="flex-1 min-h-0">
        {screen === 'billing' && <BillingScreen />}
        {screen === 'operations' && <OperationsScreen version={info?.version ?? ''} />}
        {screen === 'orders' && <OrdersScreen key="orders" />}
        {screen === 'hold' && <OrdersScreen key="hold" mode="hold" />}
        {screen === 'live' && <LiveViewScreen />}
        {screen === 'settings' && <SettingsScreen />}
        {screen === 'reports' && <ReportsScreen />}
        {screen === 'users' && <UsersScreen />}
        {screen === 'cash' && <CashFlowScreen key={cashKind ?? 'none'} initialKind={cashKind ?? undefined} />}
        {screen === 'itemonoff' && <ItemOnOffScreen />}
        {screen === 'menu' && <MenuScreen />}
      </main>

      {menuOpen && (
        <div className="fixed inset-0 z-30 flex" onMouseDown={() => setMenuOpen(false)}>
          <nav className="w-[300px] h-full bg-navy-800 text-white flex flex-col shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 h-[52px]">
              <span className="font-semibold text-[17px]">Settings</span>
              <button onClick={() => setMenuOpen(false)} className="min-h-0 h-9 w-9 rounded hover:bg-white/10 flex items-center justify-center">
                <Icon.ArrowLeft size={20} />
              </button>
            </div>
            {SIDE.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  if (s.id === 'logout') void logout()
                  else if (s.id === 'updates') void invoke('update:check').then((r) => (r.ok ? toast.success(r.message) : toast.error(r.message)))
                  else go(s.id)
                }}
                className={`text-left px-6 py-3.5 text-[15px] hover:bg-white/10 ${screen === s.id ? 'bg-white/15' : ''}`}
              >
                {s.label}
              </button>
            ))}
            <div className="mt-auto px-5 py-3 border-t border-white/10 text-[12px]">
              <div className="flex justify-between">
                <span>Ref ID : {info?.deviceId}</span>
                <span>Version : {info?.version}</span>
              </div>
              <div className="mt-1 pt-1 border-t border-white/10 text-center">Biller Name : {user.name}</div>
            </div>
          </nav>
          <div className="flex-1 bg-black/30" />
        </div>
      )}
      <Toasts />
    </div>
  )
}
