import { useMemo, useState } from 'react'
import type { DayStatusDto } from '../../../main/ipc/contract'
import { invoke } from '../lib/api'
import { useAlerts } from '../store/alerts'
import { toast } from '../store/toast'
import { Modal, PrimaryButton, SecondaryButton } from './Modal'

const hhmm = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const dayLabel = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = ['00', '15', '30', '45']

/**
 * "Business day ends at 03:30 — still open?" Shown automatically 30 min before the day end (and again
 * before an extended end), or opened from Operations / the Alerts screen. Quick +1h / +2h / +3h, or a
 * custom time; the day can be stretched by up to 12 hours. Any logged-in user may extend.
 */
export function ExtendDayModal({ day, mode, onClose }: { day: DayStatusDto; mode: 'auto' | 'manual' | 'reopen'; onClose: () => void }) {
  // A previous day that can still be reopened (nothing billed on the new date yet) takes precedence over extending the new one.
  const reopen = !!day.reopenable && mode !== 'auto'
  const target = reopen && day.reopenable ? day.reopenable : { businessDate: day.businessDate, normalEndsAt: day.normalEndsAt, maxEndsAt: day.maxEndsAt }
  const baseEnd = reopen ? new Date(target.normalEndsAt) : new Date(day.endsAt)
  const maxEnd = new Date(target.maxEndsAt)
  const [custom, setCustom] = useState<{ h: string; m: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const presets = [1, 2, 3].map((h) => new Date(baseEnd.getTime() + h * 3600_000)).filter((d) => d <= maxEnd)
  const customDate = useMemo(() => {
    if (!custom) return null
    const d = new Date(baseEnd)
    d.setHours(Number(custom.h), Number(custom.m), 0, 0)
    // The picker is on the boundary's calendar day; an earlier clock time means the following day (e.g. 01:00 after 22:00).
    if (d <= new Date(target.normalEndsAt)) d.setDate(d.getDate() + 1)
    return d
  }, [custom, baseEnd, target.normalEndsAt])
  const customError = customDate
    ? customDate <= new Date(target.normalEndsAt)
      ? `Must be after ${hhmm(target.normalEndsAt)}`
      : customDate <= new Date()
        ? 'That time has already passed'
        : customDate > maxEnd
          ? `At most 12 hours (until ${hhmm(target.maxEndsAt)})`
          : null
    : null

  async function extend(to: Date) {
    setBusy(true)
    try {
      const r = await invoke('day:extend', { endsAt: to.toISOString(), businessDate: reopen ? target.businessDate : undefined })
      toast.success(`Business day ${dayLabel(r.businessDate)} now ends at ${hhmm(r.endsAt)}`)
      useAlerts.setState({ promptedFor: null })
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  async function revert() {
    setBusy(true)
    try {
      const r = await invoke('day:extend', { endsAt: null })
      toast.success(`Business day ends at ${hhmm(r.endsAt)} again`)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  async function no() {
    if (mode === 'auto') await invoke('day:snooze', { endsAt: day.endsAt }).catch(() => undefined)
    onClose()
  }

  const title = reopen
    ? `Business day ${dayLabel(target.businessDate)} ended at ${hhmm(target.normalEndsAt)} — reopen it?`
    : `Business day ${dayLabel(day.businessDate)} ends at ${hhmm(day.endsAt)}${day.extended ? ' (extended)' : ''} — still open?`

  return (
    <Modal
      title={title}
      onClose={() => void no()}
      width="w-[560px]"
      footer={
        <>
          {day.extended && !reopen && Date.now() < new Date(day.normalEndsAt).getTime() && (
            <SecondaryButton className="mr-auto" onClick={() => void revert()} disabled={busy}>
              Revert to {hhmm(day.normalEndsAt)}
            </SecondaryButton>
          )}
          <SecondaryButton onClick={() => void no()} disabled={busy}>
            {reopen ? 'No, keep it closed' : `No, end at ${hhmm(day.endsAt)}`}
          </SecondaryButton>
          <PrimaryButton onClick={() => customDate && !customError && void extend(customDate)} disabled={busy || !customDate || !!customError} data-testid="extend-custom">
            {reopen ? 'Reopen until' : 'Extend until'} {customDate && !customError ? hhmm(customDate.toISOString()) : '…'}
          </PrimaryButton>
        </>
      }
    >
      <p className="text-sm text-gray-600 mb-3">
        Bills after {hhmm(reopen ? target.normalEndsAt : day.endsAt)} would otherwise count towards the next day. Choose how long the counter stays on{' '}
        <b>{dayLabel(target.businessDate)}</b>.
      </p>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {presets.map((d, i) => (
          <button key={i} onClick={() => void extend(d)} disabled={busy} className="min-h-0 h-16 rounded-md border-2 border-gray-300 bg-white font-semibold text-lg active:bg-brand-50" data-testid={`extend-plus-${i + 1}`}>
            +{i + 1} hour{i ? 's' : ''}
            <div className="text-xs font-normal text-gray-500">→ {hhmm(d.toISOString())}</div>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-600">Custom time</span>
        <select value={custom?.h ?? ''} onChange={(e) => setCustom({ h: e.target.value, m: custom?.m ?? '00' })} className="min-h-0 h-10 rounded border border-gray-300 px-2">
          <option value="">hh</option>
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        :
        <select value={custom?.m ?? '00'} onChange={(e) => setCustom({ h: custom?.h ?? '04', m: e.target.value })} className="min-h-0 h-10 rounded border border-gray-300 px-2">
          {MINUTES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        {customDate && <span className={customError ? 'text-red' : 'text-gray-700'}>{customError ?? `→ ${customDate.toLocaleString('en-IN', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`}</span>}
      </div>
    </Modal>
  )
}
