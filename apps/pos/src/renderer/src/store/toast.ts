import { create } from 'zustand'

export interface Toast {
  id: number
  kind: 'success' | 'error' | 'info'
  text: string
}

interface ToastState {
  toasts: Toast[]
  push: (kind: Toast['kind'], text: string, ms?: number) => void
  dismiss: (id: number) => void
}

let seq = 0
export const useToast = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, text, ms = kind === 'error' ? 6000 : 2500) => {
    const id = ++seq
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))

export const toast = {
  success: (t: string) => useToast.getState().push('success', t),
  error: (t: string) => useToast.getState().push('error', t),
  info: (t: string) => useToast.getState().push('info', t)
}
