import { useEffect, useState } from 'react'
import { loadConfig, supabase } from './lib/supabase'
import { DashboardScreen } from './screens/Dashboard'
import { LoginScreen } from './screens/Login'
import { OrdersScreen } from './screens/Orders'
import { ReportsScreen } from './screens/Reports'

type Screen = 'dashboard' | 'orders' | 'reports'

const NAV: Array<{ id: Screen; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'orders', label: 'All Orders' },
  { id: 'reports', label: 'Reports' }
]

export default function App() {
  const [session, setSession] = useState<'loading' | 'out' | 'in'>('loading')
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [email, setEmail] = useState<string>('')
  const recovering = location.hash.includes('type=recovery') || location.hash.startsWith('#reset')

  useEffect(() => {
    if (!loadConfig()) {
      setSession('out')
      return
    }
    const sb = supabase()
    void sb.auth.getSession().then(({ data }) => {
      setSession(data.session ? 'in' : 'out')
      setEmail(data.session?.user.email ?? '')
    })
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => {
      setSession(s ? 'in' : 'out')
      setEmail(s?.user.email ?? '')
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (session === 'loading') return null
  if (session === 'out' || recovering) return <LoginScreen initialMode={recovering ? 'reset' : 'login'} onSignedIn={() => { history.replaceState(null, '', location.pathname); setSession('in') }} />

  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      <aside className="bg-white border-b md:border-b-0 md:border-r border-gray-200 md:min-h-screen">
        <div className="flex items-center gap-2 px-4 h-14 border-b border-gray-100">
          <span className="w-6 h-6 rounded-md bg-red inline-block" />
          <span className="text-xl font-extrabold text-red tracking-tight">Hickey</span>
        </div>
        <nav className="flex md:flex-col overflow-x-auto">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setScreen(n.id)}
              className={`text-left px-4 py-3 text-sm whitespace-nowrap border-l-4 ${screen === n.id ? 'border-l-pill bg-blue-50 text-pill font-medium' : 'border-l-transparent text-gray-700'}`}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <div className="hidden md:block mt-auto px-4 py-3 text-xs text-gray-500 border-t border-gray-100">
          <div className="truncate">{email}</div>
          <button onClick={() => void supabase().auth.signOut()} className="text-pill mt-1">
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0">
        <div className="md:hidden flex items-center justify-between px-4 py-2 text-xs text-gray-500 bg-white border-b border-gray-100">
          <span className="truncate">{email}</span>
          <button onClick={() => void supabase().auth.signOut()} className="text-pill">
            Sign out
          </button>
        </div>
        {screen === 'dashboard' && <DashboardScreen />}
        {screen === 'orders' && <OrdersScreen />}
        {screen === 'reports' && <ReportsScreen />}
      </main>
    </div>
  )
}
