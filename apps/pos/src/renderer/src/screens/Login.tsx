import { useEffect, useState } from 'react'
import type { SessionUser } from '../../../main/ipc/contract'
import { NumPad } from '../components/NumPad'
import { invoke } from '../lib/api'
import { useSession } from '../store/session'

export function LoginScreen() {
  const [users, setUsers] = useState<SessionUser[]>([])
  const [selected, setSelected] = useState<SessionUser | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const login = useSession((s) => s.login)

  useEffect(() => {
    void invoke('auth:users').then((list) => {
      setUsers(list)
      if (list.length === 1) setSelected(list[0]!)
    })
  }, [])

  async function submit() {
    if (!selected || pin.length < 4) return
    const user = await invoke('auth:login', { userId: selected.id, pin })
    if (user) {
      login(user)
    } else {
      setError('Wrong PIN')
      setPin('')
    }
  }

  useEffect(() => {
    // Physical keyboard support at the counter.
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) setPin((p) => (p.length < 6 ? p + e.key : p))
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1))
      else if (e.key === 'Enter') void submit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="h-full flex flex-col items-center justify-center gap-8 bg-gray-100">
      <div className="text-center">
        <div className="text-4xl font-bold text-brand-600 tracking-tight">Hickey POS</div>
        <div className="text-gray-500 mt-1">Select your name and enter PIN</div>
      </div>

      <div className="flex gap-10 items-start">
        <div className="grid grid-cols-2 gap-3 w-80">
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => {
                setSelected(u)
                setPin('')
                setError(null)
              }}
              className={`h-16 rounded-lg border-2 text-lg font-medium shadow-sm ${
                selected?.id === u.id ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-gray-300 bg-white'
              }`}
            >
              <div>{u.name}</div>
              <div className="text-xs uppercase text-gray-400">{u.role}</div>
            </button>
          ))}
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-64 rounded-md bg-white border border-gray-300 flex items-center justify-center text-2xl tracking-[0.5em]">
            {pin.replace(/./g, '●')}
            {pin.length === 0 && <span className="text-gray-300 text-base tracking-normal">PIN</span>}
          </div>
          <NumPad
            onDigit={(d) => setPin((p) => (p.length < 6 ? p + d : p))}
            onBackspace={() => setPin((p) => p.slice(0, -1))}
            onClear={() => setPin('')}
            onEnter={() => void submit()}
            enterLabel="Login"
          />
          <div className="h-5 text-sm text-red-600">{error}</div>
        </div>
      </div>
    </div>
  )
}
