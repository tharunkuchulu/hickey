import { useState } from 'react'
import { loadConfig, resetClient, saveConfig, supabase } from '../lib/supabase'

type Mode = 'login' | 'forgot' | 'reset' | 'configure'

/**
 * Email + password sign-in with Supabase Auth. "Forgot password" sends Supabase's recovery mail;
 * the link brings the owner back here in `reset` mode to choose a new password.
 */
export function LoginScreen({ onSignedIn, initialMode = 'login' }: { onSignedIn: () => void; initialMode?: Mode }) {
  const configured = !!loadConfig()
  const [mode, setMode] = useState<Mode>(configured ? initialMode : 'configure')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [url, setUrl] = useState('')
  const [anonKey, setAnonKey] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<string | void>) {
    setBusy(true)
    setMsg(null)
    try {
      const m = await fn()
      if (m) setMsg(m)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const login = () =>
    run(async () => {
      const { error } = await supabase().auth.signInWithPassword({ email, password })
      if (error) throw error
      onSignedIn()
    })
  const forgot = () =>
    run(async () => {
      const { error } = await supabase().auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/#reset` })
      if (error) throw error
      return 'Check your inbox for the reset link.'
    })
  const reset = () =>
    run(async () => {
      const { error } = await supabase().auth.updateUser({ password })
      if (error) throw error
      onSignedIn()
    })
  const configure = () =>
    run(async () => {
      if (!/^https:\/\/.+\.supabase\.co\/?$/.test(url.trim())) throw new Error('Enter the project URL, e.g. https://abcd.supabase.co')
      if (anonKey.trim().length < 20) throw new Error('Enter the anon public key')
      saveConfig({ url: url.trim().replace(/\/$/, ''), anonKey: anonKey.trim() })
      resetClient()
      setMode('login')
    })

  const input = 'mt-1 w-full h-11 rounded-md border border-gray-300 px-3 text-base'
  const primary = 'w-full h-11 rounded-md bg-brand-600 text-white font-semibold disabled:opacity-50'

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-5">
          <span className="w-7 h-7 rounded-md bg-red inline-block" />
          <span className="text-2xl font-extrabold text-red tracking-tight">Hickey</span>
          <span className="text-gray-500 ml-1">Owner dashboard</span>
        </div>

        {mode === 'configure' && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void configure()
            }}
            className="space-y-3"
          >
            <p className="text-sm text-gray-600">One-time setup on this device: paste the Supabase project URL and anon key from docs/setup-cloud.md.</p>
            <label className="block text-sm text-gray-600">
              Project URL
              <input className={input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" />
            </label>
            <label className="block text-sm text-gray-600">
              Anon key
              <input className={input} value={anonKey} onChange={(e) => setAnonKey(e.target.value)} />
            </label>
            <button className={primary} disabled={busy}>
              Save & continue
            </button>
          </form>
        )}

        {mode === 'login' && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void login()
            }}
            className="space-y-3"
          >
            <label className="block text-sm text-gray-600">
              Email
              <input className={input} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="block text-sm text-gray-600">
              Password
              <input className={input} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <button className={primary} disabled={busy}>
              Sign in
            </button>
            <div className="flex justify-between text-sm">
              <button type="button" onClick={() => setMode('forgot')} className="text-pill">
                Forgot password?
              </button>
              <button type="button" onClick={() => setMode('configure')} className="text-gray-400">
                Change project
              </button>
            </div>
          </form>
        )}

        {mode === 'forgot' && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void forgot()
            }}
            className="space-y-3"
          >
            <label className="block text-sm text-gray-600">
              Email
              <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button className={primary} disabled={busy}>
              Send reset link
            </button>
            <button type="button" onClick={() => setMode('login')} className="text-sm text-pill">
              Back to sign in
            </button>
          </form>
        )}

        {mode === 'reset' && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void reset()
            }}
            className="space-y-3"
          >
            <p className="text-sm text-gray-600">Choose the password you will use to sign in (at least 8 characters).</p>
            <label className="block text-sm text-gray-600">
              New password
              <input className={input} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <button className={primary} disabled={busy || password.length < 8}>
              Set password
            </button>
          </form>
        )}

        {msg && <div className="mt-3 text-sm text-red">{msg}</div>}
      </div>
    </div>
  )
}
