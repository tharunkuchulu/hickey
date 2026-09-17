import { useEffect, useState } from 'react'
import type { UserDto, UserInput } from '../../../types/admin'
import { Modal, PrimaryButton, SecondaryButton } from '../components/Modal'
import { NumPad } from '../components/NumPad'
import { invoke } from '../lib/api'
import { useSession } from '../store/session'
import { toast } from '../store/toast'

/** Petpooja "Billing User Profile" / Biller App: list of billers with status toggle, create and edit. */
export function UsersScreen() {
  const me = useSession((s) => s.user)
  const [users, setUsers] = useState<UserDto[]>([])
  const [editing, setEditing] = useState<UserInput | null>(null)

  const load = () => void invoke('users:list').then(setUsers)
  useEffect(load, [])

  async function toggle(u: UserDto) {
    try {
      await invoke('users:save', { id: u.id, name: u.name, role: u.role, isActive: !u.isActive })
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  if (me?.role !== 'admin') return <div className="h-full flex items-center justify-center text-gray-500">Only an admin can manage billers.</div>

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="flex items-center mb-4">
        <h1 className="text-xl font-semibold">Biller</h1>
        <div className="flex-1" />
        <button onClick={() => setEditing({ name: '', role: 'cashier', pin: '' })} className="min-h-0 h-10 px-4 rounded bg-pill text-white font-semibold text-sm">
          + Create
        </button>
      </div>
      <table className="w-full bg-white border border-gray-200 text-sm">
        <thead className="bg-[#eef2f7] text-gray-700">
          <tr>
            <th className="text-left px-3 py-2 font-semibold">Biller Name</th>
            <th className="text-left px-3 py-2 font-semibold">Role</th>
            <th className="text-left px-3 py-2 font-semibold">Status</th>
            <th className="text-left px-3 py-2 font-semibold">Action</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t border-gray-100">
              <td className="px-3 py-2">{u.name}</td>
              <td className="px-3 py-2 capitalize">{u.role}</td>
              <td className="px-3 py-2">
                <button
                  onClick={() => void toggle(u)}
                  className={`min-h-0 h-6 w-11 rounded-full relative transition ${u.isActive ? 'bg-pill' : 'bg-gray-300'}`}
                  aria-label={u.isActive ? 'Deactivate' : 'Activate'}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${u.isActive ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </td>
              <td className="px-3 py-2">
                <button onClick={() => setEditing({ id: u.id, name: u.name, role: u.role, pin: '' })} className="min-h-0 h-8 px-3 rounded border border-gray-300 bg-white text-xs">
                  Edit / Change PIN
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <UserDialog
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function UserDialog({ initial, onClose, onSaved }: { initial: UserInput; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<UserInput>(initial)
  const [busy, setBusy] = useState(false)
  const isNew = !initial.id

  async function save() {
    setBusy(true)
    try {
      await invoke('users:save', { ...form, pin: form.pin || null })
      toast.success(isNew ? 'Biller created' : 'Biller updated')
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={isNew ? 'Create biller' : `Edit ${initial.name}`}
      onClose={onClose}
      width="w-[560px]"
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={() => void save()} disabled={busy || !form.name.trim() || (isNew && (form.pin ?? '').length < 4)}>
            Save
          </PrimaryButton>
        </>
      }
    >
      <div className="flex gap-5">
        <div className="flex-1 space-y-3">
          <label className="block text-sm text-gray-600">
            Name
            <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded border border-gray-300 px-3" />
          </label>
          <label className="block text-sm text-gray-600">
            Role
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'cashier' })} className="mt-1 w-full rounded border border-gray-300 px-2">
              <option value="cashier">Biller (cashier)</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <div className="text-sm text-gray-600">
            {isNew ? 'PIN (4–6 digits)' : 'New PIN (leave blank to keep)'}
            <div className="mt-1 h-11 rounded border border-gray-300 flex items-center px-3 text-2xl tracking-[0.4em]">{(form.pin ?? '').replace(/./g, '●')}</div>
          </div>
        </div>
        <NumPad
          onDigit={(d) => setForm((f) => ({ ...f, pin: ((f.pin ?? '') + d).slice(0, 6) }))}
          onBackspace={() => setForm((f) => ({ ...f, pin: (f.pin ?? '').slice(0, -1) }))}
          onClear={() => setForm((f) => ({ ...f, pin: '' }))}
        />
      </div>
    </Modal>
  )
}
