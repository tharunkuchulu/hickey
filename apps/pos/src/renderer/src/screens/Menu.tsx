import { formatMoney, toPaise } from '@hickey/shared/money'
import type { Addon, Category, MenuItem } from '@hickey/shared/schemas/menu'
import { useMemo, useState } from 'react'
import type { ItemInput, VariantInput } from '../../../types/menu-admin'
import { Modal, PrimaryButton, SecondaryButton } from '../components/Modal'
import { invoke } from '../lib/api'
import { useMenu } from '../store/menu'
import { toast } from '../store/toast'
import { FoodMark } from './Billing'

type Tab = 'items' | 'categories' | 'addons'

/** Petpooja "Menu Management": Items (category rail + table) · Categories · Addons. Open to billers too (v0.3.0). */
export function MenuScreen() {
  const menu = useMenu()
  const [tab, setTab] = useState<Tab>('items')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<ItemInput | null>(null)
  const [editingCategory, setEditingCategory] = useState<Partial<Category> | null>(null)
  const [editingAddon, setEditingAddon] = useState<Partial<Addon> | null>(null)

  const currentCategory = categoryId ?? menu.categories[0]?.id ?? null
  const rows = useMemo(() => menu.items.filter((i) => i.categoryId === currentCategory).sort((a, b) => a.sortOrder - b.sortOrder), [menu.items, currentCategory])


  const reload = () => void menu.load()
  const act = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn()
      reload()
      toast.success(label)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  const newItem = (): ItemInput => ({ categoryId: currentCategory ?? '', name: '', shortCode: null, price: 0, foodType: 'veg', addonGroupIds: menu.addonGroups.map((g) => g.id), variants: [] })
  const toInput = (i: MenuItem): ItemInput => ({
    id: i.id,
    categoryId: i.categoryId,
    name: i.name,
    shortCode: i.shortCode ?? null,
    price: i.price,
    foodType: i.foodType,
    isActive: i.isActive,
    addonGroupIds: i.addonGroupIds,
    variants: menu.variants.filter((v) => v.itemId === i.id && v.isActive).sort((a, b) => a.sortOrder - b.sortOrder).map((v) => ({ id: v.id, name: v.name, price: v.price }))
  })

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 bg-[#e8f0fb] border-b border-gray-200 flex text-sm">
        {(['items', 'categories', 'addons'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`min-h-0 h-10 px-6 font-medium capitalize ${tab === t ? 'bg-white border border-b-0 border-pill text-pill rounded-t' : 'text-gray-700'}`}>
            {t}
          </button>
        ))}
        <div className="flex-1" />
        <div className="px-3 self-center text-xs text-gray-500">Menu changes take effect immediately on this counter</div>
      </div>

      {tab === 'items' && (
        <div className="flex-1 min-h-0 grid grid-cols-[220px_1fr]">
          <aside className="bg-white border-r border-gray-200 overflow-y-auto">
            <div className="px-3 py-2 text-xs font-semibold text-gray-600">Categories</div>
            {menu.categories.map((c) => (
              <button key={c.id} onClick={() => setCategoryId(c.id)} className={`w-full text-left px-3 py-2.5 text-sm border-l-4 ${currentCategory === c.id ? 'border-l-pill bg-blue-50 text-pill font-medium' : 'border-l-transparent'} ${c.isActive ? '' : 'opacity-50'}`}>
                {c.name} <span className="text-xs text-gray-400">({menu.items.filter((i) => i.categoryId === c.id).length})</span>
              </button>
            ))}
          </aside>
          <div className="flex flex-col min-h-0">
            <div className="shrink-0 flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200">
              <span className="font-semibold">{menu.categories.find((c) => c.id === currentCategory)?.name ?? 'Items'}</span>
              <div className="flex-1" />
              <button onClick={() => setEditingItem(newItem())} className="min-h-0 h-9 px-4 rounded bg-pill text-white text-sm font-semibold">
                + Add Items
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full bg-white text-sm">
                <thead className="bg-[#eef2f7] text-gray-700 text-xs sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Name</th>
                    <th className="text-left px-3 py-2 font-semibold">Short Code</th>
                    <th className="text-right px-3 py-2 font-semibold">Price</th>
                    <th className="text-left px-3 py-2 font-semibold">Variations</th>
                    <th className="text-left px-3 py-2 font-semibold">Add-ons</th>
                    <th className="text-left px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((i) => {
                    const vs = menu.variants.filter((v) => v.itemId === i.id && v.isActive)
                    return (
                      <tr key={i.id} className={`border-t border-gray-100 ${i.isActive ? '' : 'text-gray-400'}`}>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-2">
                            <button
                              onClick={() => void act(i.isFavourite ? 'Removed from Favourites' : 'Added to Favourites', () => invoke('menu:setItemFavourite', { itemId: i.id, isFavourite: !i.isFavourite }))}
                              title={i.isFavourite ? 'Remove from Favourites' : 'Add to Favourites'}
                              className={`min-h-0 h-7 w-7 rounded text-base leading-none ${i.isFavourite ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'}`}
                            >
                              {i.isFavourite ? '★' : '☆'}
                            </button>
                            <FoodMark type={i.foodType} /> {i.name}
                          </span>
                        </td>
                        <td className="px-3 py-2">{i.shortCode ?? ''}</td>
                        <td className="px-3 py-2 text-right">{vs.length ? '—' : formatMoney(i.price, { decimals: 0 })}</td>
                        <td className="px-3 py-2 text-xs">{vs.map((v) => `${v.name} ${formatMoney(v.price, { decimals: 0 })}`).join(' · ')}</td>
                        <td className="px-3 py-2 text-xs">{i.addonGroupIds.length ? 'A' : ''}</td>
                        <td className="px-3 py-2 text-xs">{i.isActive ? <span className="text-green-700">Active</span> : 'Off'}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button onClick={() => setEditingItem(toInput(i))} className="min-h-0 h-8 px-3 rounded border border-gray-300 bg-white text-xs">
                            Edit
                          </button>
                          <button
                            onClick={() => confirm(`Delete "${i.name}"? Old bills keep it.`) && void act('Item deleted', () => invoke('menu:deleteItem', { id: i.id }))}
                            className="min-h-0 h-8 px-3 ml-1 rounded border border-gray-300 bg-white text-xs text-red"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-10 text-center text-gray-400">
                        No items in this category
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'categories' && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center mb-3">
            <h2 className="font-semibold">Categories</h2>
            <div className="flex-1" />
            <button onClick={() => setEditingCategory({ name: '' })} className="min-h-0 h-9 px-4 rounded bg-pill text-white text-sm font-semibold">
              + Add Category
            </button>
          </div>
          <table className="w-full bg-white border border-gray-200 text-sm">
            <thead className="bg-[#eef2f7] text-gray-700 text-xs">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Name</th>
                <th className="text-left px-3 py-2 font-semibold">Rank</th>
                <th className="text-left px-3 py-2 font-semibold">Items</th>
                <th className="text-left px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {[...menu.categories].sort((a, b) => a.sortOrder - b.sortOrder).map((c, idx, arr) => (
                <tr key={c.id} className="border-t border-gray-100">
                  <td className="px-3 py-2">{c.name}</td>
                  <td className="px-3 py-2">
                    <button disabled={idx === 0} onClick={() => void act('Moved', () => swap(arr[idx]!, arr[idx - 1]!))} className="min-h-0 h-7 w-7 rounded border border-gray-300 bg-white text-xs disabled:opacity-30">
                      ↑
                    </button>
                    <button disabled={idx === arr.length - 1} onClick={() => void act('Moved', () => swap(arr[idx]!, arr[idx + 1]!))} className="min-h-0 h-7 w-7 ml-1 rounded border border-gray-300 bg-white text-xs disabled:opacity-30">
                      ↓
                    </button>
                  </td>
                  <td className="px-3 py-2">{menu.items.filter((i) => i.categoryId === c.id).length}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => void act(c.isActive ? 'Category hidden' : 'Category shown', () => invoke('menu:saveCategory', { id: c.id, name: c.name, isActive: !c.isActive }))} className={`min-h-0 h-7 px-2 rounded text-xs ${c.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
                      {c.isActive ? 'Active' : 'Hidden'}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button onClick={() => setEditingCategory(c)} className="min-h-0 h-8 px-3 rounded border border-gray-300 bg-white text-xs">
                      Rename
                    </button>
                    <button onClick={() => confirm(`Delete category "${c.name}"?`) && void act('Category deleted', () => invoke('menu:deleteCategory', { id: c.id }))} className="min-h-0 h-8 px-3 ml-1 rounded border border-gray-300 bg-white text-xs text-red">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'addons' && (
        <div className="flex-1 overflow-y-auto p-4">
          {menu.addonGroups.map((g) => (
            <div key={g.id} className="mb-4">
              <div className="flex items-center mb-2">
                <h2 className="font-semibold">{g.name}</h2>
                <div className="flex-1" />
                <button onClick={() => setEditingAddon({ groupId: g.id, name: '', price: 0 })} className="min-h-0 h-9 px-4 rounded bg-pill text-white text-sm font-semibold">
                  + Add-on
                </button>
              </div>
              <table className="w-full bg-white border border-gray-200 text-sm">
                <tbody>
                  {menu.addons
                    .filter((a) => a.groupId === g.id)
                    .map((a) => (
                      <tr key={a.id} className={`border-t border-gray-100 ${a.isActive ? '' : 'text-gray-400'}`}>
                        <td className="px-3 py-2">{a.name}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(a.price, { decimals: 0 })}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button onClick={() => setEditingAddon(a)} className="min-h-0 h-8 px-3 rounded border border-gray-300 bg-white text-xs">
                            Edit
                          </button>
                          <button onClick={() => confirm(`Delete add-on "${a.name}"?`) && void act('Add-on deleted', () => invoke('menu:deleteAddon', { id: a.id }))} className="min-h-0 h-8 px-3 ml-1 rounded border border-gray-300 bg-white text-xs text-red">
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {editingItem && (
        <ItemDialog
          initial={editingItem}
          categories={menu.categories}
          addonGroups={menu.addonGroups}
          onClose={() => setEditingItem(null)}
          onSave={(input) =>
            act(input.id ? 'Item updated' : 'Item added', async () => {
              await invoke('menu:saveItem', input)
              setEditingItem(null)
            })
          }
        />
      )}
      {editingCategory && (
        <NameDialog
          title={editingCategory.id ? 'Rename category' : 'Add category'}
          initial={editingCategory.name ?? ''}
          onClose={() => setEditingCategory(null)}
          onSave={(name) =>
            act('Category saved', async () => {
              await invoke('menu:saveCategory', { id: editingCategory.id, name, isActive: editingCategory.isActive })
              setEditingCategory(null)
            })
          }
        />
      )}
      {editingAddon && (
        <AddonDialog
          initial={editingAddon}
          onClose={() => setEditingAddon(null)}
          onSave={(a) =>
            act('Add-on saved', async () => {
              await invoke('menu:saveAddon', { id: editingAddon.id, groupId: editingAddon.groupId!, name: a.name, price: a.price, isActive: editingAddon.isActive })
              setEditingAddon(null)
            })
          }
        />
      )}
    </div>
  )

  async function swap(a: Category, b: Category) {
    await invoke('menu:saveCategory', { id: a.id, name: a.name, sortOrder: b.sortOrder, isActive: a.isActive })
    await invoke('menu:saveCategory', { id: b.id, name: b.name, sortOrder: a.sortOrder, isActive: b.isActive })
  }
}

function ItemDialog({ initial, categories, addonGroups, onClose, onSave }: { initial: ItemInput; categories: Category[]; addonGroups: Array<{ id: string; name: string }>; onClose: () => void; onSave: (i: ItemInput) => void }) {
  const [f, setF] = useState<ItemInput>(initial)
  const [price, setPrice] = useState(initial.price ? String(initial.price / 100) : '')
  const [variants, setVariants] = useState<Array<VariantInput & { priceText: string }>>(initial.variants.map((v) => ({ ...v, priceText: String(v.price / 100) })))
  const field = 'mt-1 w-full rounded border border-gray-300 px-3 min-h-0 h-10'
  const submit = () =>
    onSave({
      ...f,
      price: toPaise(price || '0'),
      variants: variants.filter((v) => v.name.trim()).map(({ priceText, ...v }) => ({ ...v, price: toPaise(priceText || '0') }))
    })
  return (
    <Modal
      title={initial.id ? `Edit ${initial.name}` : 'Add item'}
      onClose={onClose}
      width="w-[640px]"
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={!f.name.trim()}>
            Save
          </PrimaryButton>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 text-sm text-gray-600">
        <label className="col-span-2">
          Name
          <input autoFocus className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </label>
        <label>
          Category
          <select className={field} value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Short code
          <input className={field} value={f.shortCode ?? ''} onChange={(e) => setF({ ...f, shortCode: e.target.value })} />
        </label>
        <label>
          Food type
          <select className={field} value={f.foodType} onChange={(e) => setF({ ...f, foodType: e.target.value as ItemInput['foodType'] })}>
            <option value="veg">Veg</option>
            <option value="nonveg">Non-veg</option>
            <option value="egg">Egg</option>
          </select>
        </label>
        <label className={variants.length ? 'opacity-40' : ''}>
          Price (₹){variants.length ? ' — set per variation' : ''}
          <input className={field} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} disabled={variants.length > 0} />
        </label>
        <div className="col-span-2">
          <div className="flex items-center justify-between">
            <span>Variations (chota / sip …)</span>
            <button onClick={() => setVariants((v) => [...v, { name: v.length === 0 ? 'chota' : v.length === 1 ? 'sip' : '', price: 0, priceText: '' }])} className="min-h-0 h-8 px-3 rounded border border-gray-300 bg-white text-xs">
              + Add variation
            </button>
          </div>
          {variants.map((v, i) => (
            <div key={i} className="flex gap-2 mt-2">
              <input className="flex-1 rounded border border-gray-300 px-3 min-h-0 h-10" placeholder="name" value={v.name} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <input className="w-32 rounded border border-gray-300 px-3 min-h-0 h-10" placeholder="₹" inputMode="decimal" value={v.priceText} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, priceText: e.target.value } : x)))} />
              <button onClick={() => setVariants(variants.filter((_, j) => j !== i))} className="min-h-0 h-10 w-10 rounded border border-gray-300 bg-white text-red">
                ×
              </button>
            </div>
          ))}
        </div>
        {addonGroups.map((g) => (
          <label key={g.id} className="col-span-2 flex items-center gap-2 min-h-10">
            <input type="checkbox" className="min-h-0 w-4 h-4" checked={f.addonGroupIds.includes(g.id)} onChange={(e) => setF({ ...f, addonGroupIds: e.target.checked ? [...f.addonGroupIds, g.id] : f.addonGroupIds.filter((x) => x !== g.id) })} />
            Offer add-ons from "{g.name}"
          </label>
        ))}
        <label className="col-span-2 flex items-center gap-2 min-h-10">
          <input type="checkbox" className="min-h-0 w-4 h-4" checked={f.isActive ?? true} onChange={(e) => setF({ ...f, isActive: e.target.checked })} />
          Available on the billing screen
        </label>
      </div>
    </Modal>
  )
}

function NameDialog({ title, initial, onClose, onSave }: { title: string; initial: string; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(initial)
  return (
    <Modal
      title={title}
      onClose={onClose}
      width="w-[420px]"
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={() => onSave(name)} disabled={!name.trim()}>
            Save
          </PrimaryButton>
        </>
      }
    >
      <input autoFocus className="w-full rounded border border-gray-300 px-3" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && onSave(name)} />
    </Modal>
  )
}

function AddonDialog({ initial, onClose, onSave }: { initial: Partial<Addon>; onClose: () => void; onSave: (a: { name: string; price: number }) => void }) {
  const [name, setName] = useState(initial.name ?? '')
  const [price, setPrice] = useState(initial.price ? String(initial.price / 100) : '')
  return (
    <Modal
      title={initial.id ? `Edit ${initial.name}` : 'Add add-on'}
      onClose={onClose}
      width="w-[420px]"
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={() => onSave({ name, price: toPaise(price || '0') })} disabled={!name.trim()}>
            Save
          </PrimaryButton>
        </>
      }
    >
      <label className="block text-sm text-gray-600">
        Name
        <input autoFocus className="mt-1 w-full rounded border border-gray-300 px-3" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block text-sm text-gray-600 mt-3">
        Price (₹)
        <input className="mt-1 w-full rounded border border-gray-300 px-3" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      </label>
    </Modal>
  )
}
