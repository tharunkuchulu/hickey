import { useEffect, type ReactNode } from 'react'
import { useToast } from '../store/toast'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  width?: string
  footer?: ReactNode
}

/** Centered dialog; Esc closes. Petpooja uses plain white cards with a bold title row. */
export function Modal({ title, onClose, children, width = 'w-[520px]', footer }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center" onMouseDown={onClose}>
      <div className={`bg-white rounded-lg shadow-xl ${width} max-w-[95vw] max-h-[90vh] flex flex-col`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="font-semibold text-lg">{title}</div>
          <button onClick={onClose} className="min-h-0 h-9 w-9 rounded text-gray-500 hover:bg-gray-100 text-xl leading-none">
            ×
          </button>
        </div>
        <div className="p-4 overflow-y-auto">{children}</div>
        {footer && <div className="px-4 py-3 border-t border-gray-200 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}

export function Toasts() {
  const toasts = useToast((s) => s.toasts)
  const dismiss = useToast((s) => s.dismiss)
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`toast min-h-0 px-4 py-2 rounded-md shadow-lg text-white text-sm font-medium ${
            t.kind === 'error' ? 'bg-red-600' : t.kind === 'success' ? 'bg-green-600' : 'bg-gray-800'
          }`}
        >
          {t.text}
        </button>
      ))}
    </div>
  )
}

export function PrimaryButton({ children, className = '', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} className={`px-4 rounded bg-pill text-white font-semibold disabled:opacity-50 ${className}`}>
      {children}
    </button>
  )
}

export function SecondaryButton({ children, className = '', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} className={`px-4 rounded border border-gray-300 bg-white font-medium disabled:opacity-50 ${className}`}>
      {children}
    </button>
  )
}
