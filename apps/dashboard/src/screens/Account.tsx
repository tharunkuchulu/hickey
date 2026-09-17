import { useState } from 'react'
import { friendlyAuthError, supabase } from '../lib/supabase'

/**
 * Owner account settings. Password changes happen here with no email involved (the signed-in session is
 * enough), so the owner is never blocked by mail delivery. Email changes go through Supabase's confirmation
 * mail to the new address.
 */
export function AccountScreen({ email }: { email: string }) {
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<string>) {
    setBusy(true)
    setMsg(null)
    try {
      setMsg({ ok: true, text: await fn() })
    } catch (e) {
      setMsg({ ok: false, text: friendlyAuthError(e) })
    } finally {
      setBusy(false)
    }
  }

  const changePassword = () =>
    run(async () => {
      if (password.length < 8) throw new Error('Password must be at least 8 characters')
      if (password !== password2) throw new Error('The two passwords do not match')
      const { error } = await supabase().auth.updateUser({ password })
      if (error) throw error
      setPassword('')
      setPassword2('')
      return 'Password updated. Use it from your next sign-in.'
    })

  const changeEmail = () =>
    run(async () => {
      const e = newEmail.trim().toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('Enter a valid email address')
      const { error } = await supabase().auth.updateUser({ email: e })
      if (error) throw error
      setNewEmail('')
      return `Confirmation mail sent to ${e}. The sign-in email changes after you click the link in it.`
    })

  const input = 'mt-1 w-full h-11 rounded-md border border-gray-300 px-3 text-base'
  const primary = 'h-11 px-5 rounded-md bg-brand-600 text-white font-semibold disabled:opacity-50'

  return (
    <div className="p-4 md:p-6 max-w-lg space-y-6">
      <h1 className="text-xl font-semibold text-gray-800">Account</h1>
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="text-sm text-gray-500">Signed in as</div>
        <div className="font-medium text-gray-800 break-all">{email}</div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void changePassword()
        }}
        className="bg-white rounded-xl border border-gray-200 p-5 space-y-3"
      >
        <h2 className="font-semibold text-gray-800">Change password</h2>
        <label className="block text-sm text-gray-600">
          New password
          <input className={input} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="block text-sm text-gray-600">
          Repeat new password
          <input className={input} type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
        </label>
        <button className={primary} disabled={busy}>
          Update password
        </button>
      </form>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void changeEmail()
        }}
        className="bg-white rounded-xl border border-gray-200 p-5 space-y-3"
      >
        <h2 className="font-semibold text-gray-800">Change sign-in email</h2>
        <p className="text-sm text-gray-500">Use this when handing the dashboard to a new owner. A confirmation link is mailed to the new address.</p>
        <label className="block text-sm text-gray-600">
          New email
          <input className={input} type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
        </label>
        <button className={primary} disabled={busy}>
          Send confirmation
        </button>
      </form>

      {msg && <div className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red'}`}>{msg.text}</div>}
    </div>
  )
}
