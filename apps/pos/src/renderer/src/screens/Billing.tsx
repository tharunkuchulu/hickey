import { formatMoney, toPaise } from '@hickey/shared/money'
import type { MenuItem } from '@hickey/shared/schemas/menu'
import { ORDER_TYPES, ORDER_TYPE_LABELS, type PaymentMode } from '@hickey/shared/schemas/order'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PaymentInput } from '../../../types/orders'
import { Icon } from '../components/icons'
import { ItemPicker, NotesPicker } from '../components/ItemPicker'
import { Modal, PrimaryButton, SecondaryButton } from '../components/Modal'
import { NumPad } from '../components/NumPad'
import { invoke } from '../lib/api'
import { PAY_LABELS, selectTotals, useCart, type CartLine, type PayChoice } from '../store/cart'
import { useMenu } from '../store/menu'
import { toast } from '../store/toast'

/**
 * Billing screen laid out like Petpooja's touch layout (menu on the left):
 *   row 2: [menu selector · Search Item · Short Code]            [Dine In | Delivery | Pick Up]
 *   body : dark category rail | item tiles                        | cart (toolbar, customer, items, total, payment, buttons)
 */
export function BillingScreen() {
  const menu = useMenu()
  const cart = useCart()
  const totals = useMemo(
    () => selectTotals(cart),
    [cart.lines, cart.discountType, cart.discountValue, cart.charges, cart.rounding, cart.taxPercent]
  )
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [code, setCode] = useState('')
  const [picking, setPicking] = useState<MenuItem | null>(null)
  const [noting, setNoting] = useState<CartLine | null>(null)
  const [discounting, setDiscounting] = useState(false)
  const [showCustomer, setShowCustomer] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [visiblePays, setVisiblePays] = useState<PayChoice[]>(['cash', 'card', 'due', 'not_paid'])
  const [busy, setBusy] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void invoke('settings:get').then((s) => {
      cart.configure({
        rounding: s.billing.rounding,
        taxPercent: s.billing.taxPercent,
        defaultOrderType: s.billing.defaultOrderType,
        defaultPaymentMode: s.billing.defaultPaymentMode
      })
      setVisiblePays(s.billing.visiblePaymentOptions)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeItems = useMemo(() => menu.items.filter((i) => i.isActive), [menu.items])
  const firstCategoryId = menu.categories.find((c) => c.isActive)?.id
  const currentCategoryId = categoryId ?? firstCategoryId
  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? activeItems.filter((i) => i.name.toLowerCase().includes(q)) : activeItems.filter((i) => i.categoryId === currentCategoryId)
    // Petpooja setting "Item Sorting: A-Z"
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [activeItems, currentCategoryId, query])

  const variantsFor = (itemId: string) => menu.variants.filter((v) => v.itemId === itemId && v.isActive)
  const addonGroupsFor = (item: MenuItem) => menu.addonGroups.filter((g) => item.addonGroupIds.includes(g.id))

  function tapItem(item: MenuItem) {
    if (variantsFor(item.id).length || addonGroupsFor(item).length) {
      setPicking(item)
    } else {
      cart.addItem({ itemId: item.id, name: item.name, variantName: null, unitPrice: item.price, qty: 1, addons: [], notes: null })
    }
    setQuery('')
    setCode('')
  }

  /** Short Code box: Enter adds the exact code (the keyboard fast path). */
  function onCodeEnter() {
    const c = code.trim().toLowerCase()
    if (!c) return
    const exact = activeItems.find((i) => (i.shortCode ?? '').toLowerCase() === c)
    if (exact) tapItem(exact)
    else toast.error(`No item with short code ${code}`)
    setCode('')
    codeRef.current?.focus()
  }

  function buildPayments(): PaymentInput[] | string {
    const total = totals.total
    if (cart.payChoice === 'not_paid') return []
    if (cart.payChoice === 'part') {
      const second = Math.min(Math.max(cart.partAmount, 0), total)
      const first = total - second
      if (second <= 0 || first <= 0) return 'Enter the part amount'
      return [
        { mode: 'card', amount: first },
        { mode: cart.partMode, amount: second }
      ]
    }
    const mode = cart.payChoice as PaymentMode
    return [{ mode, amount: total, tendered: mode === 'cash' ? cart.cashTendered : null }]
  }

  async function run(label: string, fn: () => Promise<void>): Promise<void> {
    if (busy) return
    if (cart.lines.length === 0) {
      toast.error('Add at least one item')
      return
    }
    if (cart.orderType === 'dine_in' && !cart.tableId && menu.tables.length > 0) {
      toast.error('Select a table for Dine In')
      return
    }
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      toast.error(`${label} failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const doSave = () =>
    run('Save', async () => {
      const o = await invoke('orders:save', { input: cart.toInput() })
      toast.success(`Order saved${o.tableName ? ` on ${o.tableName}` : ''}`)
      cart.clear()
    })
  const doHold = () =>
    run('Hold', async () => {
      await invoke('orders:save', { input: cart.toInput(), hold: true })
      toast.success('Order put on hold')
      cart.clear()
    })
  const doKot = (print: boolean) =>
    run('KOT', async () => {
      const r = await invoke('orders:kot', { input: cart.toInput() })
      if (print && r.printError) toast.error(r.printError)
      toast.success(`KOT ${r.order.kotNo} sent`)
      if (r.order.orderType === 'dine_in') cart.loadOrder(r.order)
      else cart.clear()
    })
  const doSaveAndPrint = () =>
    run('Save & Print', async () => {
      const payments = buildPayments()
      if (typeof payments === 'string') {
        toast.error(payments)
        return
      }
      const r = await invoke('orders:saveAndPrint', { input: cart.toInput(), payments })
      if (r.printError) toast.error(`Saved as bill ${r.order.billNo}, but printing failed: ${r.printError}`)
      else toast.success(`Bill ${r.order.billNo} · Token ${r.order.kotNo} printed · ${formatMoney(r.order.total)}`)
      cart.clear()
      codeRef.current?.focus()
    })

  const change = cart.payChoice === 'cash' && cart.cashTendered ? cart.cashTendered - totals.total : null
  const lineUnit = (l: CartLine) => l.unitPrice + l.addons.reduce((a, b) => a + b.price, 0)
  const payOptions: PayChoice[] = showMore ? ['cash', 'card', 'due', 'not_paid', 'upi', 'part', 'other'] : visiblePays

  return (
    <div className="h-full flex flex-col">
      {/* Row 2: menu selector + search boxes | order-type tabs over the cart */}
      <div className="h-11 shrink-0 grid grid-cols-[1fr_400px] border-b border-gray-300 bg-white">
        <div className="flex items-center gap-2 px-2">
          <div className="h-8 px-3 rounded-sm bg-red text-white text-[12px] font-semibold uppercase flex items-center gap-1">
            Menu <Icon.ChevronDown size={14} />
          </div>
          <div className="relative flex-1">
            <Icon.Search size={15} className="absolute left-2 top-2.5 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Item"
              className="min-h-0 h-8 w-full rounded-sm border border-gray-300 pl-7 pr-2 text-[13px]"
            />
          </div>
          <input
            ref={codeRef}
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onCodeEnter()}
            placeholder="Short Code"
            className="min-h-0 h-8 w-40 rounded-sm border border-gray-300 px-2 text-[13px]"
          />
        </div>
        <div className="grid grid-cols-3 border-l border-gray-300">
          {ORDER_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => cart.setOrderType(t)}
              className={`min-h-0 h-full text-[13px] font-semibold uppercase tracking-wide border-r border-gray-300 last:border-r-0 ${
                cart.orderType === t ? 'bg-red text-white' : 'bg-[#f7f7f7] text-gray-700'
              }`}
            >
              {ORDER_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[150px_1fr_400px]">
        {/* Category rail */}
        <aside className="bg-rail overflow-y-auto text-white">
          {menu.categories
            .filter((c) => c.isActive)
            .map((c) => {
              const active = !query && currentCategoryId === c.id
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setCategoryId(c.id)
                    setQuery('')
                  }}
                  className={`w-full text-left px-3 py-3 text-[12px] font-medium border-b border-black/20 ${active ? 'bg-red' : 'hover:bg-rail-hover'}`}
                >
                  {c.name}
                </button>
              )
            })}
        </aside>

        {/* Item tiles */}
        <section className="overflow-y-auto p-2 bg-white">
          <div className="grid grid-cols-4 xl:grid-cols-5 gap-2 content-start">
            {visibleItems.map((item) => {
              const variants = variantsFor(item.id)
              const mark = item.foodType === 'veg' ? 'border-l-veg' : item.foodType === 'egg' ? 'border-l-egg' : 'border-l-nonveg'
              return (
                <button
                  key={item.id}
                  onClick={() => tapItem(item)}
                  className={`h-[72px] rounded-sm bg-white border border-gray-300 border-l-[5px] ${mark} shadow-sm px-2 py-1.5 text-left flex flex-col justify-between active:bg-brand-50`}
                >
                  <span className="text-[12.5px] font-medium leading-tight line-clamp-2 text-gray-800">{item.name}</span>
                  <span className="flex justify-between text-[11px] text-gray-500">
                    <span>{item.shortCode}</span>
                    <span className="font-semibold text-gray-700">{variants.length ? `${variants.length} sizes` : formatMoney(item.price, { decimals: 0 })}</span>
                  </span>
                </button>
              )
            })}
            {visibleItems.length === 0 && <div className="col-span-full text-gray-400 p-6 text-center">No items</div>}
          </div>
        </section>

        {/* Cart */}
        <aside className="bg-white border-l border-gray-300 flex flex-col min-h-0">
          {/* toolbar */}
          <div className="h-11 shrink-0 flex items-center border-b border-gray-300">
            {[
              { icon: Icon.Table, label: cart.tableId ? (menu.tables.find((t) => t.id === cart.tableId)?.name ?? 'Table') : 'Table', on: () => cart.orderType === 'dine_in' && setShowCustomer((v) => !v) },
              { icon: Icon.User, label: 'Customer', on: () => setShowCustomer((v) => !v), active: showCustomer || !!cart.customerName },
              { icon: Icon.Percent, label: 'Discount', on: () => setDiscounting(true), active: totals.discount > 0 },
              { icon: Icon.Note, label: 'Note', on: () => setShowCustomer(true), active: !!cart.notes }
            ].map((b) => (
              <button
                key={b.label}
                onClick={b.on}
                className={`min-h-0 h-full flex-1 flex flex-col items-center justify-center border-r border-gray-200 text-gray-700 hover:bg-gray-50 ${b.active ? 'text-red' : ''}`}
              >
                <b.icon size={18} />
                <span className="text-[9px] leading-none mt-0.5">{b.label}</span>
              </button>
            ))}
            <div className="px-2 text-[11px] text-gray-600 min-w-[88px] text-right">
              {cart.orderId ? (
                <button onClick={cart.clear} className="min-h-0 h-7 px-2 rounded bg-cardblue text-navy-800 text-[11px] font-medium">
                  Editing · Discard
                </button>
              ) : (
                <>
                  Bill No
                  <div className="font-semibold text-gray-800">New</div>
                </>
              )}
            </div>
          </div>

          {showCustomer && (
            <div className="shrink-0 border-b border-gray-300 p-2 grid grid-cols-2 gap-1.5 bg-[#fafafa]">
              {cart.orderType === 'dine_in' && (
                <select value={cart.tableId ?? ''} onChange={(e) => cart.setTable(e.target.value || null)} className="min-h-0 h-8 col-span-2 rounded-sm border border-gray-300 px-2 text-[13px]">
                  <option value="">Select table</option>
                  {menu.tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {t.area}
                    </option>
                  ))}
                </select>
              )}
              <input
                value={cart.customerPhone}
                onChange={(e) => cart.setCustomer({ customerPhone: e.target.value.replace(/[^\d+]/g, '') })}
                placeholder="Mobile"
                inputMode="tel"
                className="min-h-0 h-8 rounded-sm border border-gray-300 px-2 text-[13px]"
              />
              <input value={cart.customerName} onChange={(e) => cart.setCustomer({ customerName: e.target.value })} placeholder="Name" className="min-h-0 h-8 rounded-sm border border-gray-300 px-2 text-[13px]" />
              <input value={cart.notes} onChange={(e) => cart.setCustomer({ notes: e.target.value })} placeholder="Order note" className="min-h-0 h-8 col-span-2 rounded-sm border border-gray-300 px-2 text-[13px]" />
            </div>
          )}

          {/* items table */}
          <div className="grid grid-cols-[28px_1fr_96px_84px] px-1 py-1.5 text-[10px] uppercase tracking-wide text-gray-500 border-b border-gray-300 bg-[#fafafa]">
            <span />
            <span>Items</span>
            <span className="text-center">Qty</span>
            <span className="text-right pr-1">Price</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {cart.lines.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                <Icon.Plate size={56} className="text-gray-300" />
                <div className="text-[15px] font-medium text-gray-500">No Item Selected</div>
                <div className="text-[12px]">Please select item from left menu</div>
              </div>
            )}
            {cart.lines.map((l) => (
              <div key={l.id} className="grid grid-cols-[28px_1fr_96px_84px] items-center px-1 py-1.5 border-b border-gray-100">
                <button onClick={() => cart.remove(l.id)} className="min-h-0 h-7 w-7 flex items-center justify-center text-red" aria-label="Remove">
                  <Icon.XCircle size={18} />
                </button>
                <button onClick={() => setNoting(l)} className="min-h-0 text-left min-w-0">
                  <div className="text-[13px] text-gray-800 truncate">
                    {l.name}
                    {l.variantName && <span className="text-gray-500"> ({l.variantName})</span>}
                    {l.kotNo != null && <span className="ml-1 text-[9px] px-1 rounded bg-gray-200 text-gray-700">KOT {l.kotNo}</span>}
                  </div>
                  {l.addons.length > 0 && <div className="text-[11px] text-gray-500 truncate">+ {l.addons.map((a) => a.name).join(', ')}</div>}
                  {l.notes && <div className="text-[11px] text-red truncate">* {l.notes}</div>}
                </button>
                <div className="flex items-center justify-center gap-0.5">
                  <button onClick={() => cart.setQty(l.id, l.qty - 1)} className="min-h-0 h-7 w-7 rounded-sm border border-gray-300 text-base leading-none">
                    −
                  </button>
                  <span className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded-sm text-[13px]">{l.qty}</span>
                  <button onClick={() => cart.setQty(l.id, l.qty + 1)} className="min-h-0 h-7 w-7 rounded-sm border border-gray-300 text-base leading-none">
                    +
                  </button>
                </div>
                <div className="text-right pr-1">
                  <div className="text-[13px] text-gray-800">{formatMoney(lineUnit(l) * l.qty, { symbol: false })}</div>
                  <div className="text-[10px] text-gray-400">{formatMoney(lineUnit(l), { symbol: false })}</div>
                </div>
              </div>
            ))}
          </div>

          {/* totals */}
          <div className="shrink-0 border-t border-gray-300 px-2 py-1.5 text-[12px]">
            <div className="flex items-center gap-3 text-gray-600">
              <span>Sub Total</span>
              <span className="ml-auto">{formatMoney(totals.subtotal, { symbol: false })}</span>
            </div>
            {totals.discount > 0 && (
              <div className="flex items-center gap-3 text-gray-600">
                <span>Discount{cart.discountType === 'percent' ? ` (${cart.discountValue}%)` : ''}</span>
                <span className="ml-auto">- {formatMoney(totals.discount, { symbol: false })}</span>
              </div>
            )}
            {totals.roundOff !== 0 && (
              <div className="flex items-center gap-3 text-gray-600">
                <span>Round Off</span>
                <span className="ml-auto">{formatMoney(totals.roundOff, { symbol: false })}</span>
              </div>
            )}
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-[14px] font-semibold text-gray-800">Total</span>
              <label className="flex items-center gap-1 text-[11px] text-gray-600">
                <input type="checkbox" className="min-h-0 w-3.5 h-3.5" checked={cart.complimentary} onChange={(e) => cart.setComplimentary(e.target.checked)} />
                Complimentary
              </label>
              <span className="ml-auto text-[18px] font-bold text-red">{formatMoney(totals.total, { symbol: false })}</span>
            </div>
          </div>

          {/* payment radios */}
          <div className="shrink-0 border-t border-gray-300 px-2 py-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
              {payOptions.map((p) => (
                <label key={p} className="flex items-center gap-1.5 cursor-pointer min-h-8">
                  <input type="radio" name="pay" className="min-h-0 w-4 h-4 accent-red" checked={cart.payChoice === p} onChange={() => cart.setPay({ payChoice: p })} />
                  {PAY_LABELS[p]}
                </label>
              ))}
              {!showMore && (
                <button onClick={() => setShowMore(true)} className="min-h-0 h-8 px-2 text-[12px] text-pill font-medium">
                  More ▾
                </button>
              )}
            </div>
            {cart.payChoice === 'cash' && (
              <div className="mt-1 flex items-center gap-2 text-[12px]">
                <span className="text-gray-600">Cash received</span>
                <input
                  inputMode="numeric"
                  value={cart.cashTendered != null ? cart.cashTendered / 100 : ''}
                  onChange={(e) => cart.setPay({ cashTendered: e.target.value ? toPaise(e.target.value) : null })}
                  className="min-h-0 h-8 w-20 rounded-sm border border-gray-300 px-2 text-right"
                />
                {[100, 200, 500].map((n) => (
                  <button key={n} onClick={() => cart.setPay({ cashTendered: n * 100 })} className="min-h-0 h-8 px-2 rounded-sm border border-gray-300 bg-white text-[11px]">
                    ₹{n}
                  </button>
                ))}
                <span className={`ml-auto font-semibold ${change != null && change < 0 ? 'text-red' : 'text-gray-700'}`}>{change != null ? `Return ${formatMoney(change)}` : ''}</span>
              </div>
            )}
            {cart.payChoice === 'part' && (
              <div className="mt-1 flex items-center gap-2 text-[12px]">
                <span className="text-gray-600">Card +</span>
                <select value={cart.partMode} onChange={(e) => cart.setPay({ partMode: e.target.value as PaymentMode })} className="min-h-0 h-8 rounded-sm border border-gray-300 px-2">
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="other">Other</option>
                </select>
                <input
                  inputMode="numeric"
                  value={cart.partAmount ? cart.partAmount / 100 : ''}
                  onChange={(e) => cart.setPay({ partAmount: e.target.value ? toPaise(e.target.value) : 0 })}
                  placeholder="amount"
                  className="min-h-0 h-8 w-20 rounded-sm border border-gray-300 px-2 text-right"
                />
                <span className="ml-auto text-gray-600">Card {formatMoney(Math.max(totals.total - cart.partAmount, 0))}</span>
              </div>
            )}
          </div>

          {/* Petpooja button row: Save · Save & Print · Save & eBill · KOT · KOT & Print · Hold */}
          <div className="shrink-0 p-1.5 grid grid-cols-6 gap-1 border-t border-gray-300 bg-[#fafafa]">
            <button onClick={doSave} disabled={busy} className="h-11 rounded-sm bg-red text-white text-[11px] font-semibold disabled:opacity-60">
              Save
            </button>
            <button onClick={doSaveAndPrint} disabled={busy} className="h-11 rounded-sm bg-red text-white text-[11px] font-semibold leading-tight disabled:opacity-60">
              Save &amp; Print
            </button>
            <button disabled title="e-Bill via WhatsApp is not part of v1" className="h-11 rounded-sm bg-red/50 text-white text-[11px] font-semibold leading-tight">
              Save &amp; eBill
            </button>
            <button onClick={() => doKot(false)} disabled={busy} className="h-11 rounded-sm bg-dark text-white text-[11px] font-semibold disabled:opacity-60">
              KOT
            </button>
            <button onClick={() => doKot(true)} disabled={busy} className="h-11 rounded-sm bg-dark text-white text-[11px] font-semibold leading-tight disabled:opacity-60">
              KOT &amp; Print
            </button>
            <button onClick={doHold} disabled={busy} className="h-11 rounded-sm bg-white border border-gray-400 text-gray-800 text-[11px] font-semibold disabled:opacity-60">
              Hold
            </button>
          </div>
        </aside>
      </div>

      {picking && (
        <ItemPicker
          item={picking}
          variants={variantsFor(picking.id)}
          addonGroups={addonGroupsFor(picking)}
          addons={menu.addons}
          onAdd={(line) => cart.addItem(line)}
          onClose={() => {
            setPicking(null)
            codeRef.current?.focus()
          }}
        />
      )}
      {noting && (
        <NotesPicker initial={noting.notes} presets={menu.itemNotes} onSave={(n) => cart.setLineNotes(noting.id, n)} onClose={() => setNoting(null)} />
      )}
      {discounting && <DiscountDialog onClose={() => setDiscounting(false)} />}
    </div>
  )
}

export function FoodMark({ type }: { type: 'veg' | 'nonveg' | 'egg' }) {
  const color = type === 'veg' ? 'border-veg' : type === 'egg' ? 'border-egg' : 'border-nonveg'
  const dot = type === 'veg' ? 'bg-veg' : type === 'egg' ? 'bg-egg' : 'bg-nonveg'
  return (
    <span className={`mt-0.5 shrink-0 inline-flex items-center justify-center w-3 h-3 border ${color} bg-white`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
    </span>
  )
}

/** Petpooja labels this "Coupon Code" with an "Apply" button and a "Leave as it is (No Discount)" option. */
function DiscountDialog({ onClose }: { onClose: () => void }) {
  const cart = useCart()
  const [type, setType] = useState<'percent' | 'amount'>(cart.discountType ?? 'percent')
  const [value, setValue] = useState(cart.discountType === 'amount' ? String(cart.discountValue / 100) : String(cart.discountValue || ''))
  const [reason, setReason] = useState(cart.discountReason)
  const apply = () => {
    const n = Number(value)
    if (!n || n < 0) cart.setDiscount(null, 0, '')
    else cart.setDiscount(type, type === 'amount' ? toPaise(n) : n, reason)
    onClose()
  }
  return (
    <Modal
      title="Coupon Code / Discount"
      onClose={onClose}
      width="w-[460px]"
      footer={
        <>
          <SecondaryButton
            onClick={() => {
              cart.setDiscount(null, 0, '')
              onClose()
            }}
          >
            Leave as it is (No Discount)
          </SecondaryButton>
          <PrimaryButton onClick={apply}>Apply</PrimaryButton>
        </>
      }
    >
      <div className="flex gap-2 mb-3">
        {(['percent', 'amount'] as const).map((t) => (
          <button key={t} onClick={() => setType(t)} className={`flex-1 rounded border font-medium ${type === t ? 'bg-red border-red text-white' : 'border-gray-300'}`}>
            {t === 'percent' ? 'Percentage (%)' : 'Fixed (₹)'}
          </button>
        ))}
      </div>
      <div className="flex gap-4">
        <div className="flex-1">
          <div className="h-12 rounded border border-gray-300 flex items-center justify-end px-3 text-2xl mb-2">{value || '0'}</div>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="w-full rounded border border-gray-300 px-3" />
        </div>
        <NumPad onDigit={(d) => setValue((v) => (v + d).slice(0, 6))} onBackspace={() => setValue((v) => v.slice(0, -1))} onClear={() => setValue('')} />
      </div>
    </Modal>
  )
}
