import { formatMoney } from '@hickey/shared/money'
import { useMemo, useState } from 'react'
import { invoke } from '../lib/api'
import { useMenu } from '../store/menu'
import { toast } from '../store/toast'

/** Petpooja "Menu Item On Off": mark items out of stock for the day with one tap. */
export function ItemOnOffScreen() {
  const menu = useMenu()
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return menu.items
      .filter((i) => (q ? i.name.toLowerCase().includes(q) : !categoryId || i.categoryId === categoryId))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [menu.items, query, categoryId])

  async function toggle(itemId: string, isActive: boolean) {
    try {
      await invoke('menu:setItemActive', { itemId, isActive })
      await menu.load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  const off = menu.items.filter((i) => !i.isActive).length

  return (
    <div className="h-full flex">
      <aside className="w-48 bg-white border-r border-gray-200 overflow-y-auto">
        <button onClick={() => setCategoryId(null)} className={`w-full text-left px-3 py-2.5 text-sm border-l-4 ${!categoryId ? 'border-l-pill bg-blue-50 text-pill font-medium' : 'border-l-transparent'}`}>
          All categories
        </button>
        {menu.categories.map((c) => (
          <button key={c.id} onClick={() => setCategoryId(c.id)} className={`w-full text-left px-3 py-2.5 text-sm border-l-4 ${categoryId === c.id ? 'border-l-pill bg-blue-50 text-pill font-medium' : 'border-l-transparent'}`}>
            {c.name}
          </button>
        ))}
      </aside>
      <div className="flex-1 flex flex-col min-h-0">
        <div className="shrink-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
          <h1 className="text-lg font-semibold">Menu Item On/Off</h1>
          <span className="text-sm text-gray-500">{off ? `${off} item${off > 1 ? 's' : ''} switched off` : 'All items on'}</span>
          <div className="flex-1" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search item" className="min-h-0 h-9 w-64 rounded border border-gray-300 px-3 text-sm" />
        </div>
        <div className="flex-1 overflow-y-auto p-3 grid grid-cols-3 gap-2 content-start">
          {list.map((i) => (
            <button
              key={i.id}
              onClick={() => void toggle(i.id, !i.isActive)}
              className={`h-14 rounded border px-3 flex items-center justify-between text-left ${i.isActive ? 'bg-white border-gray-300' : 'bg-gray-100 border-gray-200 text-gray-400'}`}
            >
              <span className="text-sm font-medium truncate">
                {i.name} <span className="text-xs text-gray-400">{formatMoney(i.price, { decimals: 0 })}</span>
              </span>
              <span className={`shrink-0 h-6 w-11 rounded-full relative ${i.isActive ? 'bg-green-500' : 'bg-gray-300'}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white ${i.isActive ? 'left-[22px]' : 'left-0.5'}`} />
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
