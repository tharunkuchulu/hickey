import type { AppSettings } from '@hickey/shared/schemas/settings'
import { useEffect, useState } from 'react'
import type { AppInfo, BackupInfoDto, PrinterInfo, SyncStatusDto } from '../../../main/ipc/contract'
import { invoke } from '../lib/api'
import { useSession } from '../store/session'
import { toast } from '../store/toast'

type Tab = 'outlet' | 'billing' | 'printer' | 'sync' | 'backup' | 'about'

/** Settings grouped like Petpooja's Outlet Configuration tiles. Admin only for billing/printer. */
export function SettingsScreen() {
  const user = useSession((s) => s.user)
  const [tab, setTab] = useState<Tab>('outlet')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [dirty, setDirty] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatusDto | null>(null)
  const [backups, setBackups] = useState<BackupInfoDto[]>([])
  const [working, setWorking] = useState(false)

  useEffect(() => {
    void invoke('settings:get').then(setSettings)
    void invoke('printers:list').then(setPrinters)
    void invoke('app:info').then(setInfo)
    void invoke('sync:status').then(setSyncStatus)
    void invoke('backup:list').then(setBackups)
  }, [])

  if (!settings) return null
  const isAdmin = user?.role === 'admin'

  const patch = <K extends keyof AppSettings>(section: K, values: Partial<AppSettings[K]>) => {
    setSettings({ ...settings, [section]: { ...settings[section], ...values } })
    setDirty(true)
  }

  async function save() {
    if (!settings) return
    try {
      const saved = await invoke('settings:set', settings)
      setSettings(saved)
      setDirty(false)
      toast.success('Settings saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function test() {
    if (!settings) return
    toast.info('Printing test page…')
    const r = await invoke('printers:test', { printerName: settings.printer.windowsPrinterName })
    r.ok ? toast.success('Test page sent') : toast.error(`Print failed: ${r.error}`)
  }

  const TABS: Array<{ id: Tab; label: string; admin?: boolean }> = [
    { id: 'outlet', label: 'Outlet Details' },
    { id: 'billing', label: 'Billing & Calculations', admin: true },
    { id: 'printer', label: 'Print', admin: true },
    { id: 'sync', label: 'Cloud Sync', admin: true },
    { id: 'backup', label: 'Backup & Restore', admin: true },
    { id: 'about', label: 'About' }
  ]

  return (
    <div className="h-full flex">
      <aside className="w-56 bg-white border-r border-gray-200 py-2">
        {TABS.filter((t) => !t.admin || isAdmin).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`w-full text-left px-4 py-3 text-sm font-medium border-l-4 ${tab === t.id ? 'border-l-brand-600 bg-brand-50 text-brand-700' : 'border-l-transparent'}`}>
            {t.label}
          </button>
        ))}
      </aside>
      <div className="flex-1 overflow-y-auto p-6 max-w-3xl">
        {tab === 'outlet' && (
          <Section title="Outlet Details" hint="Printed at the top of every bill.">
            <Field label="Outlet name" value={settings.cafe.name} onChange={(v) => patch('cafe', { name: v })} />
            <Field label="Address line 1" value={settings.cafe.addressLine1} onChange={(v) => patch('cafe', { addressLine1: v })} />
            <Field label="Address line 2" value={settings.cafe.addressLine2} onChange={(v) => patch('cafe', { addressLine2: v })} />
            <Field label="Phone" value={settings.cafe.phone} onChange={(v) => patch('cafe', { phone: v })} />
            <Field label="GSTIN (blank if not registered)" value={settings.cafe.gstin} onChange={(v) => patch('cafe', { gstin: v })} />
            <Field label="FSSAI licence no." value={settings.cafe.fssai} onChange={(v) => patch('cafe', { fssai: v })} />
            <Field label="Bill header note" value={settings.receipt.headerNote} onChange={(v) => patch('receipt', { headerNote: v })} />
            <Field label="Bill footer note" value={settings.receipt.footerNote} onChange={(v) => patch('receipt', { footerNote: v })} />
          </Section>
        )}

        {tab === 'billing' && (
          <>
            <Section title="Invoice Sequence">
              <Field label="Bill number prefix" value={settings.billing.billPrefix} onChange={(v) => patch('billing', { billPrefix: v })} />
              <Select
                label="Bill number resets"
                value={settings.billing.billNumberReset}
                options={[
                  ['never', 'Never (continuous, like Petpooja)'],
                  ['daily', 'Every day'],
                  ['monthly', 'Every month'],
                  ['yearly', 'Every year']
                ]}
                onChange={(v) => patch('billing', { billNumberReset: v as AppSettings['billing']['billNumberReset'] })}
              />
              <NumberField
                label="Start bill numbers from (used only before the first bill)"
                value={settings.billing.billNumberStart}
                onChange={(v) => patch('billing', { billNumberStart: Math.max(1, v) })}
              />
              <NumberField label="Digits shown on order cards (0 = full number)" value={settings.billing.billNoDisplayDigits} onChange={(v) => patch('billing', { billNoDisplayDigits: Math.min(6, Math.max(0, v)) })} />
              <Select label="KOT number resets" value={settings.billing.kotNumberReset} options={[['daily', 'Every day'], ['never', 'Never']]} onChange={(v) => patch('billing', { kotNumberReset: v as 'daily' | 'never' })} />
            </Section>
            <Section title="Calculations">
              <Select
                label="Round off grand total"
                value={settings.billing.rounding}
                options={[
                  ['nearest_rupee', 'Nearest rupee'],
                  ['nearest_50p', 'Nearest 50 paise'],
                  ['floor_rupee', 'Round down'],
                  ['ceil_rupee', 'Round up'],
                  ['none', 'No rounding']
                ]}
                onChange={(v) => patch('billing', { rounding: v as AppSettings['billing']['rounding'] })}
              />
              <NumberField label="Tax % on bills (0 = no tax)" value={settings.billing.taxPercent} onChange={(v) => patch('billing', { taxPercent: Math.max(0, v) })} />
              <NumberField label="Business day starts at (minutes after midnight, 210 = 03:30)" value={settings.billing.dayStartMinutes} onChange={(v) => patch('billing', { dayStartMinutes: Math.min(720, Math.max(0, v)) })} />
            </Section>
            <Section title="Billing Screen">
              <Select label="Default order type" value={settings.billing.defaultOrderType} options={[['pick_up', 'Pick Up'], ['dine_in', 'Dine In'], ['delivery', 'Delivery']]} onChange={(v) => patch('billing', { defaultOrderType: v as AppSettings['billing']['defaultOrderType'] })} />
              <Select label="Default payment mode" value={settings.billing.defaultPaymentMode} options={[['cash', 'Cash (Petpooja default)'], ['card', 'Card'], ['upi', 'UPI'], ['due', 'Due'], ['not_paid', 'Not Paid'], ['other', 'Other']]} onChange={(v) => patch('billing', { defaultPaymentMode: v as AppSettings['billing']['defaultPaymentMode'] })} />
              <Toggle label="Cashier needs admin PIN to cancel a bill" checked={settings.billing.requireAdminPinForCancel} onChange={(v) => patch('billing', { requireAdminPinForCancel: v })} />
              <Toggle label="Cashier needs admin PIN to give a discount" checked={settings.billing.requireAdminPinForDiscount} onChange={(v) => patch('billing', { requireAdminPinForDiscount: v })} />
            </Section>
          </>
        )}

        {tab === 'printer' && (
          <Section title="Print" hint="Bill and KOT print through the Windows printer driver. Set the driver's paper size to the roll width.">
            <Select
              label="Windows printer"
              value={settings.printer.windowsPrinterName}
              options={[['', '(System default)'], ...printers.map((p) => [p.name, `${p.displayName}${p.isDefault ? ' (default)' : ''}`] as [string, string])]}
              onChange={(v) => patch('printer', { windowsPrinterName: v })}
            />
            <Select label="Paper width" value={String(settings.receipt.paperWidthMm)} options={[['80', '80 mm'], ['58', '58 mm']]} onChange={(v) => patch('receipt', { paperWidthMm: Number(v) as 58 | 80 })} />
            <NumberField label="Bill copies" value={settings.receipt.billCopies} onChange={(v) => patch('receipt', { billCopies: Math.min(3, Math.max(1, v)) })} />
            <Toggle label="Print KOT ticket (off = KOT number only, no paper)" checked={settings.receipt.printKot} onChange={(v) => patch('receipt', { printKot: v })} />
            {settings.receipt.printKot && <NumberField label="KOT copies" value={settings.receipt.kotCopies} onChange={(v) => patch('receipt', { kotCopies: Math.min(3, Math.max(1, v)) })} />}
            <Toggle label="Show customer name on bill" checked={settings.receipt.showCustomerOnBill} onChange={(v) => patch('receipt', { showCustomerOnBill: v })} />
            <div className="pt-2">
              <button onClick={() => void test()} className="px-4 rounded border border-gray-300 bg-white font-medium">
                Print test page
              </button>
            </div>
          </Section>
        )}

        {tab === 'sync' && (
          <Section title="Cloud Sync (Supabase)" hint="The counter keeps working offline; every bill is mirrored to the cloud when internet is available. Setup steps: docs/setup-cloud.md.">
            <Toggle label="Enable cloud sync" checked={settings.sync.enabled} onChange={(v) => patch('sync', { enabled: v })} />
            <Field label="Supabase project URL (https://xxxx.supabase.co)" value={settings.sync.supabaseUrl} onChange={(v) => patch('sync', { supabaseUrl: v.trim() })} />
            <Field label="Supabase anon key" value={settings.sync.supabaseAnonKey} onChange={(v) => patch('sync', { supabaseAnonKey: v.trim() })} />
            <Field label="Device token (from register_device in Supabase)" value={settings.sync.deviceToken} onChange={(v) => patch('sync', { deviceToken: v.trim() })} />
            <Field label="Device label" value={settings.sync.deviceLabel} onChange={(v) => patch('sync', { deviceLabel: v })} />
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button
                disabled={working}
                onClick={async () => {
                  setWorking(true)
                  const r = await invoke('sync:test', settings.sync)
                  setWorking(false)
                  r.ok ? toast.success(r.message) : toast.error(r.message)
                }}
                className="px-4 rounded border border-gray-300 bg-white font-medium"
              >
                Test connection
              </button>
              <button
                disabled={working || dirty}
                title={dirty ? 'Save settings first' : ''}
                onClick={async () => {
                  setWorking(true)
                  const st = await invoke('sync:now')
                  setSyncStatus(st)
                  setWorking(false)
                  st.state === 'synced' ? toast.success('Everything is synced') : toast.error(st.error ?? `Sync ${st.state}`)
                }}
                className="px-4 rounded bg-pill text-white font-semibold disabled:opacity-50"
              >
                Sync now
              </button>
              {syncStatus && (
                <span className="text-sm text-gray-600">
                  Status: <b className="capitalize">{syncStatus.state}</b> · {syncStatus.pending} pending
                  {syncStatus.lastSyncAt ? ` · last ${new Date(syncStatus.lastSyncAt).toLocaleString('en-IN')}` : ''}
                  {syncStatus.error ? ` · ${syncStatus.error}` : ''}
                </span>
              )}
            </div>
          </Section>
        )}

        {tab === 'backup' && (
          <>
            <Section title="Local snapshots" hint="A copy of the database is taken every night into the backups folder (last 30 kept). Copy that folder to a pen drive now and then.">
              <div className="flex items-center gap-3">
                <button
                  disabled={working}
                  onClick={async () => {
                    setWorking(true)
                    try {
                      const b = await invoke('backup:now')
                      toast.success(`Snapshot saved: ${b.file}`)
                      setBackups(await invoke('backup:list'))
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : String(e))
                    } finally {
                      setWorking(false)
                    }
                  }}
                  className="px-4 rounded bg-pill text-white font-semibold"
                >
                  Backup now
                </button>
                <span className="text-sm text-gray-500">{info?.dataDir}\\backups</span>
              </div>
              <table className="w-full text-sm mt-2">
                <tbody>
                  {backups.slice(0, 10).map((b) => (
                    <tr key={b.file} className="border-t border-gray-100">
                      <td className="py-1">{b.file}</td>
                      <td className="py-1 text-right text-gray-500">{(b.sizeBytes / 1024).toFixed(0)} KB</td>
                    </tr>
                  ))}
                  {backups.length === 0 && (
                    <tr>
                      <td className="py-2 text-gray-400">No snapshots yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Section>
            <Section title="Restore from cloud" hint="On a new machine: enter the same cloud settings, then pull all data. Existing local rows are never overwritten.">
              <button
                disabled={working || !settings.sync.enabled}
                onClick={async () => {
                  if (!confirm('Pull all data from the cloud into this machine?')) return
                  setWorking(true)
                  try {
                    const counts = await invoke('sync:restore')
                    const n = Object.values(counts).reduce((a, b) => a + b, 0)
                    toast.success(`Restored ${n} rows (${counts.orders ?? 0} orders)`)
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : String(e))
                  } finally {
                    setWorking(false)
                  }
                }}
                className="px-4 rounded border border-gray-300 bg-white font-medium disabled:opacity-50"
              >
                Restore from cloud
              </button>
            </Section>
          </>
        )}

        {tab === 'about' && info && (
          <Section title="About Hickey POS">
            <div className="text-sm text-gray-700 space-y-1">
              <div>Version {info.version}</div>
              <div>Device ID: {info.deviceId}</div>
              <div>Data folder: {info.dataDir}</div>
              <div>Logged in as {user?.name} ({user?.role})</div>
            </div>
          </Section>
        )}

        {tab !== 'about' && (
          <div className="sticky bottom-0 bg-gray-100/90 py-3 flex items-center gap-3">
            <button onClick={() => void save()} disabled={!dirty} className="px-6 rounded bg-brand-600 text-white font-semibold disabled:opacity-50">
              Save settings
            </button>
            {dirty && <span className="text-sm text-gray-600">Unsaved changes</span>}
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-lg border border-gray-200 p-4 space-y-3 mb-4">
      <div>
        <h2 className="font-semibold text-lg">{title}</h2>
        {hint && <p className="text-sm text-gray-500">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-sm text-gray-600">
      {label}
      <input className="mt-1 w-full rounded border border-gray-300 px-3" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block text-sm text-gray-600">
      {label}
      <input type="number" className="mt-1 w-48 rounded border border-gray-300 px-3" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </label>
  )
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (v: string) => void }) {
  return (
    <label className="block text-sm text-gray-600">
      {label}
      <select className="mt-1 w-full rounded border border-gray-300 px-2" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 text-sm text-gray-700 min-h-11">
      <input type="checkbox" className="min-h-0 w-5 h-5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}
