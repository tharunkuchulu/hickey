import { create } from 'zustand'
import type { UpdateStatusDto } from '../../../main/ipc/contract'
import { invoke, onEvent } from '../lib/api'
import { useCart } from './cart'
import { toast } from './toast'

/**
 * Updater state mirrored from main (`event:update`). Drives the header pill, the confirm modal and the
 * hands-off install: when main says the counter is quiet (`autoInstall: true`) and the cart is empty, the
 * screen asks main to install — staff never have to do anything.
 */
interface UpdateState {
  status: UpdateStatusDto | null
  confirmOpen: boolean
  bind: () => () => void
  check: () => Promise<void>
  openConfirm: () => void
  closeConfirm: () => void
  install: (reason?: 'tap' | 'idle') => Promise<void>
}

export const useUpdate = create<UpdateState>((set, get) => ({
  status: null,
  confirmOpen: false,
  bind: () => {
    void invoke('update:status').then((status) => set({ status }))
    return onEvent('event:update', (p) => {
      const status = p as UpdateStatusDto & { autoInstall?: boolean }
      set({ status })
      if (status.autoInstall && status.state === 'downloaded' && useCart.getState().lines.length === 0 && !get().confirmOpen) {
        void get().install('idle')
      }
    })
  },
  check: async () => {
    const st = await invoke('update:check')
    set({ status: st })
    if (st.state === 'downloaded') set({ confirmOpen: true })
    else if (st.state === 'error') toast.error(st.message)
    else if (st.state === 'downloading') toast.info(st.message)
    else toast.success(st.message)
  },
  openConfirm: () => set({ confirmOpen: true }),
  closeConfirm: () => set({ confirmOpen: false }),
  install: async (reason = 'tap') => {
    const r = await invoke('update:install', { reason })
    set({ confirmOpen: false })
    r.ok ? toast.info(r.message) : toast.error(r.message)
  }
}))
