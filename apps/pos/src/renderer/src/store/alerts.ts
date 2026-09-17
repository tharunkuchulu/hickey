import { create } from 'zustand'
import type { AlertsStatusDto, DayStatusDto } from '../../../main/ipc/contract'
import { invoke, onEvent } from '../lib/api'

/**
 * Live alerts + business-day status pushed from main (`event:alerts`, `event:day`). Bound once in App;
 * feeds the Hold/Alerts badges, the Alerts screen and the "extend the day?" prompt.
 */
interface AlertsState {
  status: AlertsStatusDto | null
  prompt: { open: boolean; mode: 'auto' | 'manual' | 'reopen' }
  /** Alert id already prompted for, so one boundary asks once. */
  promptedFor: string | null
  bind: () => () => void
  openPrompt: (mode: 'auto' | 'manual' | 'reopen') => void
  closePrompt: () => void
  setDay: (day: DayStatusDto) => void
}

export const useAlerts = create<AlertsState>((set, get) => ({
  status: null,
  prompt: { open: false, mode: 'manual' },
  promptedFor: null,
  bind: () => {
    void invoke('alerts:status').then((status) => set({ status }))
    const offAlerts = onEvent('event:alerts', (p) => {
      const status = p as AlertsStatusDto
      set({ status })
      // Ask "still open?" once per boundary, only when nobody snoozed it.
      const ending = status.alerts.find((a) => a.kind === 'day_end' && a.day?.phase === 'ending' && !a.day.snoozed)
      if (ending && get().promptedFor !== ending.id && !get().prompt.open) set({ promptedFor: ending.id, prompt: { open: true, mode: 'auto' } })
    })
    const offDay = onEvent('event:day', (p) => get().setDay(p as DayStatusDto))
    return () => {
      offAlerts()
      offDay()
    }
  },
  openPrompt: (mode) => set({ prompt: { open: true, mode } }),
  closePrompt: () => set({ prompt: { open: false, mode: 'manual' } }),
  setDay: (day) => set((s) => (s.status ? { status: { ...s.status, day } } : {}))
}))
