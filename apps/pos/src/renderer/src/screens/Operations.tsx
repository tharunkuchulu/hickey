import { invoke } from '../lib/api'
import { useSession, type Screen } from '../store/session'
import { toast } from '../store/toast'

interface Tile {
  label: string
  screen?: Screen
  soon?: boolean
  cashKind?: 'expense' | 'withdrawal' | 'top_up'
  action?: () => void
}

/** Petpooja "Operations" hub — same groups and tile order; tiles outside v1 scope are greyed out. */
const GROUPS: Array<{ title: string; tiles: Tile[] }> = [
  {
    title: 'Orders & Billing',
    tiles: [
      { label: 'Orders', screen: 'orders' },
      { label: 'KOTs', screen: 'orders' },
      { label: 'Billing Screen', screen: 'billing' },
      { label: 'Live View', screen: 'live' },
      { label: 'Bill / KOT Print', screen: 'orders' },
      { label: 'Hold Orders', screen: 'hold' },
      { label: 'Table', soon: true },
      { label: 'Custom Order Status', screen: 'orders' }
    ]
  },
  {
    title: 'Payments & Finance',
    tiles: [
      { label: 'Cash Flow', screen: 'cash' },
      { label: 'Expense', screen: 'cash', cashKind: 'expense' },
      { label: 'Withdrawal', screen: 'cash', cashKind: 'withdrawal' },
      { label: 'Cash Top-Up', screen: 'cash', cashKind: 'top_up' }
    ]
  },
  {
    title: 'Menu & Inventory',
    tiles: [
      { label: 'Menu', screen: 'menu' },
      { label: 'Menu Item On Off', screen: 'itemonoff' },
      { label: 'Tax', screen: 'settings' },
      { label: 'Discount', soon: true },
      { label: 'Customers', soon: true }
    ]
  },
  {
    title: 'System Settings',
    tiles: [
      { label: 'Billing User Profile', screen: 'users' },
      {
        label: 'Manual Sync',
        action: () => {
          toast.info('Syncing…')
          void invoke('sync:now').then((st) => (st.state === 'synced' ? toast.success('Everything is synced') : toast.error(st.error ?? `Sync ${st.state}`)))
        }
      },
      { label: 'Alerts', soon: true },
      { label: 'Settings', screen: 'settings' },
      { label: 'Help', soon: true }
    ]
  }
]

export function OperationsScreen({ version }: { version: string }) {
  const go = useSession((s) => s.go)
  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="flex items-baseline gap-3 mb-4">
        <h1 className="text-xl font-semibold">Operations</h1>
        <span className="text-sm text-gray-500">Version: {version}</span>
      </div>
      {GROUPS.map((g) => (
        <section key={g.title} className="mb-6">
          <h2 className="font-semibold mb-2">{g.title}</h2>
          <div className="grid grid-cols-4 gap-3">
            {g.tiles.map((t) => (
              <button
                key={t.label}
                onClick={() => (t.action ? t.action() : t.screen ? go(t.screen, t.cashKind ? { cashKind: t.cashKind } : undefined) : toast.info(`${t.label} arrives in the next phase`))}
                className={`h-16 rounded-lg border bg-white text-left px-4 font-medium ${t.soon ? 'border-gray-200 text-gray-400' : 'border-gray-300 hover:border-brand-500'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
