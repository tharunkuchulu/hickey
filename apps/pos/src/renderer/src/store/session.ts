import { create } from 'zustand'
import type { SessionUser } from '../../../main/ipc/contract'
import { invoke } from '../lib/api'

export type Screen = 'billing' | 'operations' | 'orders' | 'live' | 'reports' | 'menu' | 'settings' | 'hold' | 'users' | 'cash' | 'itemonoff'

interface SessionState {
  user: SessionUser | null
  screen: Screen
  menuOpen: boolean
  /** Pre-filter for the Orders screen when opened from the top-bar search boxes. */
  ordersQuery: string
  /** Which cash dialog to open when the Cash Flow screen is entered from an Operations tile. */
  cashKind: 'expense' | 'withdrawal' | 'top_up' | null
  login: (user: SessionUser) => void
  logout: () => Promise<void>
  go: (screen: Screen, opts?: { ordersQuery?: string; cashKind?: 'expense' | 'withdrawal' | 'top_up' }) => void
  setMenuOpen: (open: boolean) => void
}

export const useSession = create<SessionState>((set) => ({
  user: null,
  screen: 'billing',
  menuOpen: false,
  ordersQuery: '',
  cashKind: null,
  login: (user) => set({ user, screen: 'billing', menuOpen: false }),
  logout: async () => {
    await invoke('auth:logout')
    set({ user: null, menuOpen: false })
  },
  go: (screen, opts) => set({ screen, menuOpen: false, ordersQuery: opts?.ordersQuery ?? '', cashKind: opts?.cashKind ?? null }),
  setMenuOpen: (menuOpen) => set({ menuOpen })
}))
