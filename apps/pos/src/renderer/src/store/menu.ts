import { create } from 'zustand'
import type { MenuSnapshot } from '../../../main/ipc/contract'
import { invoke } from '../lib/api'

interface MenuState extends MenuSnapshot {
  loaded: boolean
  load: () => Promise<void>
}

const empty: MenuSnapshot = { categories: [], items: [], variants: [], addonGroups: [], addons: [], tables: [], itemNotes: [] }

export const useMenu = create<MenuState>((set) => ({
  ...empty,
  loaded: false,
  load: async () => {
    const snap = await invoke('menu:snapshot')
    set({ ...snap, loaded: true })
  }
}))
