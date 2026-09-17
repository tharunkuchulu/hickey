import { formatMoney } from '@hickey/shared/money'
import type { Addon, AddonGroup, ItemVariant, MenuItem } from '@hickey/shared/schemas/menu'
import { useEffect, useState } from 'react'
import type { OrderLineInput } from '../../../types/orders'
import { Modal, PrimaryButton, SecondaryButton } from './Modal'

interface Props {
  item: MenuItem
  variants: ItemVariant[]
  addonGroups: AddonGroup[]
  addons: Addon[]
  onAdd: (line: Omit<OrderLineInput, 'id'>) => void
  onClose: () => void
}

/**
 * Variant / add-on chooser shown when an item has sizes (chota / sip) or add-on groups.
 * Petpooja pops the same kind of dialog; tapping a size adds the line immediately when there are no add-ons.
 */
export function ItemPicker({ item, variants, addonGroups, addons, onAdd, onClose }: Props) {
  const [variant, setVariant] = useState<ItemVariant | null>(variants.length === 1 ? variants[0]! : null)
  const [picked, setPicked] = useState<Addon[]>([])
  const [qty, setQty] = useState(1)

  // Enter adds (keyboard fast path), matching how staff confirm the Petpooja popup.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (variants.length === 0 || variant)) {
        e.preventDefault()
        commit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const unitPrice = variant ? variant.price : item.price
  const addonsTotal = picked.reduce((a, b) => a + b.price, 0)

  function commit(v = variant) {
    if (variants.length && !v) return
    onAdd({
      itemId: item.id,
      name: item.name,
      variantName: v?.name ?? null,
      unitPrice: v ? v.price : item.price,
      qty,
      addons: picked.map((a) => ({ id: a.id, name: a.name, price: a.price })),
      notes: null
    })
    onClose()
  }

  const toggle = (a: Addon) => setPicked((p) => (p.some((x) => x.id === a.id) ? p.filter((x) => x.id !== a.id) : [...p, a]))

  return (
    <Modal
      title={item.name}
      onClose={onClose}
      footer={
        <>
          <div className="flex items-center gap-1 mr-auto">
            {[1, 2, 3, 5, 10].map((n) => (
              <button key={n} onClick={() => setQty(n)} className={`min-h-0 h-10 w-10 rounded border text-sm font-semibold ${qty === n ? 'bg-red border-red text-white' : 'border-gray-300 bg-white'}`}>
                {n}
              </button>
            ))}
          </div>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={() => commit()} disabled={variants.length > 0 && !variant}>
            Add {formatMoney((unitPrice + addonsTotal) * qty)}
          </PrimaryButton>
        </>
      }
    >
      {variants.length > 0 && (
        <div className="mb-4">
          <div className="text-sm text-gray-500 mb-2">Portion size</div>
          <div className="grid grid-cols-3 gap-2">
            {variants.map((v) => (
              <button
                key={v.id}
                onClick={() => {
                  setVariant(v)
                  if (addonGroups.length === 0) commit(v)
                }}
                className={`h-16 rounded-md border-2 font-medium ${
                  variant?.id === v.id ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-gray-300 bg-white'
                }`}
              >
                <div className="capitalize">{v.name}</div>
                <div className={`text-sm ${v.price ? 'text-gray-600' : 'text-red-600'}`}>{v.price ? formatMoney(v.price, { decimals: 0 }) : 'price not set'}</div>
              </button>
            ))}
          </div>
        </div>
      )}
      {addonGroups.map((g) => (
        <div key={g.id} className="mb-3">
          <div className="text-sm text-gray-500 mb-2">{g.name}</div>
          <div className="grid grid-cols-3 gap-2">
            {addons
              .filter((a) => a.groupId === g.id && a.isActive)
              .map((a) => (
                <button
                  key={a.id}
                  onClick={() => toggle(a)}
                  className={`h-14 rounded-md border-2 text-sm font-medium ${
                    picked.some((x) => x.id === a.id) ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-gray-300 bg-white'
                  }`}
                >
                  <div>{a.name}</div>
                  <div className="text-xs text-gray-600">+{formatMoney(a.price, { decimals: 0 })}</div>
                </button>
              ))}
          </div>
        </div>
      ))}
    </Modal>
  )
}

interface NotesProps {
  initial: string | null
  presets: string[]
  onSave: (notes: string | null) => void
  onClose: () => void
}

export function NotesPicker({ initial, presets, onSave, onClose }: NotesProps) {
  const [text, setText] = useState(initial ?? '')
  return (
    <Modal
      title="Item note"
      onClose={onClose}
      width="w-[420px]"
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton
            onClick={() => {
              onSave(text.trim() || null)
              onClose()
            }}
          >
            Save note
          </PrimaryButton>
        </>
      }
    >
      <div className="flex flex-wrap gap-2 mb-3">
        {presets.map((p) => (
          <button key={p} onClick={() => setText((t) => (t ? `${t}, ${p}` : p))} className="min-h-0 h-10 px-3 rounded-full border border-gray-300 bg-white text-sm">
            {p}
          </button>
        ))}
      </div>
      <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. less sugar" className="w-full rounded border border-gray-300 px-3" />
    </Modal>
  )
}
