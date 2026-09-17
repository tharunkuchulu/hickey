/**
 * Smoke test: drives the running POS through the Chrome DevTools Protocol.
 * Start the app with `--remote-debugging-port=9222`, then `pnpm smoke`.
 * Logs in, bills two orders through the real IPC (Save & Print with printing disabled),
 * checks numbering + totals, exercises the Orders screen, and saves screenshots to scripts/out/.
 *
 * Usage: node scripts/smoke.mjs [port]
 */
import { mkdirSync, writeFileSync } from 'node:fs'

const port = Number(process.argv[2] ?? 9222)
const outDir = new URL('./out/', import.meta.url)
mkdirSync(outDir, { recursive: true })

async function waitForTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json())
      const page = list.find((t) => t.type === 'page' && (t.url.includes('index.html') || t.url.startsWith('http://localhost')))
      if (page) return page
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('POS window not found on debugging port ' + port)
}

const target = await waitForTarget()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = rej
})

let seq = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? rej(new Error(msg.error.message)) : res(msg.result)
  }
}
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq
    pending.set(id, { res, rej })
    ws.send(JSON.stringify({ id, method, params }))
  })

const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
  return r.result.value
}
const shot = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(new URL(name + '.png', outDir), Buffer.from(data, 'base64'))
  console.log('screenshot', name)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const clickText = (text, exact = false) =>
  evaluate(`(() => {
    const t = ${JSON.stringify(text)};
    const el = [...document.querySelectorAll('button')].find(b => ${exact ? 'b.textContent.trim() === t' : 'b.textContent.trim().startsWith(t)'});
    if (!el) throw new Error('button not found: ' + t);
    el.click(); return true;
  })()`)
const clickQuick = (label) =>
  evaluate(`(() => {
    const el = [...document.querySelectorAll('header button')].find(b => b.textContent.includes(${JSON.stringify(label)}));
    if (!el) throw new Error('quick action not found: ' + ${JSON.stringify(label)});
    el.click(); return true;
  })()`)
const waitFor = async (expression, label, timeoutMs = 5000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    if (await evaluate(expression)) return
    await sleep(100)
  }
  await shot('failed-' + label)
  throw new Error('timeout waiting for ' + label + ': ' + (await evaluate('document.body.innerText')).slice(0, 400))
}
const ipc = (channel, req) => evaluate(`window.hickey.invoke(${JSON.stringify(channel)}, ${JSON.stringify(req ?? null)})`)
const assert = (cond, msg) => {
  if (!cond) throw new Error('ASSERT: ' + msg)
}

await send('Page.enable')
await shot('01-login')

// --- login as Admin (skip if a previous run left us logged in)
if (!(await evaluate(`!!document.querySelector('header')`))) {
  await clickText('Admin')
  for (const d of '1234') await clickText(d, true)
  await clickText('Login')
  await waitFor(`document.querySelector('header')?.textContent.includes('Admin')`, 'login')
}
console.log('login ok')

// --- billing screen: real menu present, category rail, short-code entry
await clickText('New Order')
await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Hot Coffee')`, 'billing')
await clickText('Hot Coffee', true)
await sleep(100)
const hotCoffee = await evaluate(`[...document.querySelectorAll('section button')].map(b => b.textContent.trim()).filter(t => /sizes/.test(t)).length`)
assert(hotCoffee === 8, `expected 8 variant items in Hot Coffee, got ${hotCoffee}`)
await shot('02-billing-real-menu')

// Cappuccino → variant picker → chota (40)
await clickText('Cappuccino')
await waitFor(`!!document.querySelector('.fixed.inset-0')`, 'variant picker')
await shot('03-variant-picker')
await clickText('chota')
await sleep(100)
await clickText('Add ₹') // Cappuccino also carries the Add On group, so the picker stays open until Add
await sleep(150)
// Simple Blend Frappe via Short Code box: 28 + Enter (opens the add-on picker) + Add
await evaluate(`(() => { const i = document.querySelector('input[placeholder="Short Code"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(i,'28'); i.dispatchEvent(new Event('input',{bubbles:true})); return true })()`)
await sleep(100)
await evaluate(`(() => { const i = document.querySelector('input[placeholder="Short Code"]'); i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); return true })()`)
await waitFor(`!!document.querySelector('.fixed.inset-0')`, 'addon picker')
await clickText('Add ₹')
await sleep(150)
const totalRow = await evaluate(`[...document.querySelectorAll('aside div')].map(d => d.textContent).find(t => /^TotalComplimentary/.test(t))`)
console.log('cart total row:', totalRow)
assert(totalRow?.includes('139.00'), `expected 139.00 (40 + 99), got ${totalRow}`)
await shot('04-billing-cart')

// --- Save & Print through IPC with printing disabled (no printer on the dev machine)
const bd = await ipc('app:businessDate')
const base = await ipc('live:summary', { businessDate: bd })
const mk = (lines, payments) => ({
  input: { orderType: 'pick_up', tableId: null, customerName: null, customerPhone: null, notes: null, lines, discountType: null, discountValue: 0, discountReason: null, charges: 0 },
  payments,
  print: false
})
const r1 = await ipc('orders:saveAndPrint', mk(
  [{ itemId: null, name: 'Cappuccino', variantName: 'chota', unitPrice: 4000, qty: 1, addons: [], notes: null },
   { itemId: null, name: 'Simple Blend Frappe', variantName: null, unitPrice: 9900, qty: 1, addons: [], notes: null }],
  [{ mode: 'card', amount: 13900 }]
))
assert(r1.order.status === 'printed' && r1.order.total === 13900 && r1.order.kotNo >= 1 && r1.order.billNo, `order1 wrong: ${JSON.stringify(r1.order)}`)
console.log('bill 1:', r1.order.billNo, 'kot', r1.order.kotNo, 'total', r1.order.total)

const r2 = await ipc('orders:saveAndPrint', mk(
  [{ itemId: null, name: 'Americano', variantName: 'chota', unitPrice: 3000, qty: 2, addons: [], notes: 'less sugar' }],
  [{ mode: 'cash', amount: 6000, tendered: 10000 }]
))
assert(Number(r2.order.billNo) === Number(r1.order.billNo) + 1 && r2.order.kotNo === r1.order.kotNo + 1, `numbering wrong: ${r2.order.billNo}/${r2.order.kotNo}`)
console.log('bill 2:', r2.order.billNo, 'kot', r2.order.kotNo, 'paid', r2.order.paymentSummary)

// payments must equal total
let rejected = false
try { await ipc('orders:saveAndPrint', mk([{ itemId: null, name: 'Tea', variantName: null, unitPrice: 1500, qty: 1, addons: [], notes: null }], [{ mode: 'cash', amount: 1000 }])) } catch { rejected = true }
assert(rejected, 'underpayment should be rejected')

// hold + resume path
const held = await ipc('orders:save', { input: mk([{ itemId: null, name: 'Peach Chiller', variantName: null, unitPrice: 9900, qty: 1, addons: [], notes: null }], []).input, hold: true })
assert(held.status === 'held' && held.billNo === null, 'hold failed')

// live summary
const live = await ipc('live:summary', { businessDate: bd })
assert(
  live.totalOrders === base.totalOrders + 2 &&
    live.totalSales === base.totalSales + 19900 &&
    live.byPayment.card.amount === (base.byPayment.card?.amount ?? 0) + 13900 &&
    live.byPayment.cash.amount === (base.byPayment.cash?.amount ?? 0) + 6000,
  `live wrong: ${JSON.stringify(live)}`
)
console.log('live:', live.totalOrders, 'orders', live.totalSales, 'paise; running', live.running)

// cancel with reason (admin session)
const cancelled = await ipc('orders:cancel', { orderId: r2.order.id, reason: 'smoke test' })
assert(cancelled.status === 'cancelled', 'cancel failed')
const live2 = await ipc('live:summary', { businessDate: bd })
assert(live2.totalOrders === base.totalOrders + 1 && live2.cancelled === base.cancelled + 1, 'cancel not reflected in live summary')

// --- Orders screen renders the cards
await clickQuick('Orders')
await waitFor(`document.body.innerText.includes('Total Orders')`, 'orders screen')
await sleep(300)
const cards = await evaluate(`[...document.querySelectorAll('main .bg-cardblue')].length`)
assert(cards >= 3, `expected at least 3 order cards (2 billed + 1 held), got ${cards}`)
await shot('05-orders')

// Food Is Ready
await clickText('Food Is Ready')
await sleep(200)
assert(await evaluate(`document.body.innerText.includes('Ready')`), 'ready state not shown')

// --- Hold screen shows the held order with Resume
await clickQuick('Hold')
await waitFor(`document.body.innerText.includes('Held / running')`, 'hold screen')
await clickText('Resume')
await waitFor(`document.body.innerText.includes('Editing')`, 'resume into billing')
await shot('06-resumed-hold')

// --- Live view + settings
await clickQuick('Live View')
await waitFor(`document.body.innerText.includes('Total Sales')`, 'live view')
await shot('07-live')

// --- Phase 3: reports, users, cash flow, item on/off (through IPC + screens)
const rep = await ipc('reports:run', { report: 'sales_summary', from: bd, to: bd })
assert(rep.rows.length === 1 && rep.rows[0].net === live2.totalSales, `sales summary mismatch: ${JSON.stringify(rep.rows)}`)
const itemRep = await ipc('reports:run', { report: 'item_wise', from: bd, to: bd })
assert(itemRep.rows.some((r) => String(r.item).startsWith('Cappuccino')), 'item-wise report missing Cappuccino')
const payRep = await ipc('reports:run', { report: 'payment_wise', from: bd, to: bd })
assert(payRep.rows.some((r) => r.mode === 'Card'), 'payment-wise report missing Card')
const cancelRep = await ipc('reports:run', { report: 'cancelled', from: bd, to: bd })
assert(cancelRep.rows.some((r) => r.reason === 'smoke test'), 'cancel report missing the cancelled bill')
console.log('reports ok:', rep.rows[0].orders, 'orders,', itemRep.rows.length, 'item rows')

const newUser = await ipc('users:save', { name: 'Smoke Biller', role: 'cashier', pin: '2222' })
assert(newUser.id && newUser.isActive, 'user create failed')
await ipc('users:save', { id: newUser.id, name: 'Smoke Biller', role: 'cashier', isActive: false })
const usersNow = await ipc('users:list')
assert(usersNow.find((u) => u.id === newUser.id)?.isActive === false, 'user deactivate failed')
let adminLockout = false
try { await ipc('users:save', { id: usersNow.find((u) => u.role === 'admin').id, name: 'Admin', role: 'cashier' }) } catch { adminLockout = true }
assert(adminLockout, 'last admin must not be demotable')

const cashBefore = await ipc('cash:summary', {})
await ipc('cash:add', { kind: 'expense', amount: 4000, reason: 'milk' })
await ipc('cash:add', { kind: 'top_up', amount: 50000, reason: 'float' })
const cashAfter = await ipc('cash:summary', {})
assert(cashAfter.expense === cashBefore.expense + 4000 && cashAfter.topUp === cashBefore.topUp + 50000 && cashAfter.expected === cashBefore.expected + 46000, `cash flow wrong: ${JSON.stringify(cashAfter)}`)
console.log('cash flow ok: expected in drawer', cashAfter.expected)

const menuSnap = await ipc('menu:snapshot')
const tea = menuSnap.items.find((i) => i.name === 'Peach Chiller')
await ipc('menu:setItemActive', { itemId: tea.id, isActive: false })
assert((await ipc('menu:snapshot')).items.find((i) => i.id === tea.id).isActive === false, 'item off failed')
await ipc('menu:setItemActive', { itemId: tea.id, isActive: true })

// sync is disabled until configured; a local snapshot can be taken on demand
const syncSt = await ipc('sync:status')
assert(syncSt.state === 'disabled' && syncSt.pending >= 1, `sync status wrong: ${JSON.stringify(syncSt)}`)
const bad = await ipc('sync:test', { enabled: true, supabaseUrl: 'https://invalid.example.invalid', supabaseAnonKey: 'x', deviceToken: 'y', orgId: '', deviceId: 'd', deviceLabel: 'l' })
assert(bad.ok === false, 'sync test should fail against an invalid host')
const bk = await ipc('backup:now')
assert(bk.sizeBytes > 10000 && (await ipc('backup:list')).some((b) => b.file === bk.file), 'backup failed')
console.log('sync disabled with', syncSt.pending, 'pending; backup', bk.file, bk.sizeBytes, 'bytes')

// menu management: add a category + item with variants, edit price, delete (soft)
const code = `SMK${Date.now() % 100000}` // unique per run; earlier runs' rows are soft-deleted but codes must still not clash
const catId = await ipc('menu:saveCategory', { name: 'Smoke Specials' })
const itemId = await ipc('menu:saveItem', { categoryId: catId, name: 'Smoke Latte', shortCode: code, price: 0, foodType: 'veg', addonGroupIds: [], variants: [{ name: 'chota', price: 4500 }, { name: 'sip', price: 9500 }] })
let snap = await ipc('menu:snapshot')
assert(snap.variants.filter((v) => v.itemId === itemId).length === 2, 'variants not saved')
await ipc('menu:saveItem', { id: itemId, categoryId: catId, name: 'Smoke Latte', shortCode: code, price: 0, foodType: 'veg', addonGroupIds: [], variants: [{ id: snap.variants.find((v) => v.itemId === itemId && v.name === 'chota').id, name: 'chota', price: 5000 }] })
snap = await ipc('menu:snapshot')
const vs = snap.variants.filter((v) => v.itemId === itemId)
assert(vs.length === 1 && vs[0].price === 5000, `variant replace failed: ${JSON.stringify(vs)}`)
let dupCode = false
try { await ipc('menu:saveItem', { categoryId: catId, name: 'Dup', shortCode: code.toLowerCase(), price: 1000, foodType: 'veg', addonGroupIds: [], variants: [] }) } catch { dupCode = true }
assert(dupCode, 'duplicate short code must be rejected')
let catBlocked = false
try { await ipc('menu:deleteCategory', { id: catId }) } catch { catBlocked = true }
assert(catBlocked, 'category with items must not be deletable')
await ipc('menu:deleteItem', { id: itemId })
await ipc('menu:deleteCategory', { id: catId })
snap = await ipc('menu:snapshot')
assert(!snap.items.some((i) => i.id === itemId) && !snap.categories.some((c) => c.id === catId), 'soft delete not hidden from snapshot')
console.log('menu management ok')

// screens render
await clickText('☰') .catch(() => evaluate(`document.querySelector('header button[aria-label="Menu"]').click()`))
await sleep(200)
await clickText('Reports', true)
await waitFor(`document.body.innerText.includes('Sales Summary: Day Wise')`, 'reports screen')
await sleep(800)
await shot('10-reports')
await evaluate(`document.querySelector('header button[aria-label="Menu"]').click()`)
await sleep(200)
await clickText('Operations', true)
await waitFor(`document.body.innerText.includes('Payments & Finance')`, 'operations')
await shot('11-operations')
await clickText('Cash Flow', true)
await waitFor(`document.body.innerText.includes('Expected in drawer')`, 'cash flow screen')
await shot('12-cash-flow')
await evaluate(`document.querySelector('header button[aria-label="Menu"]').click()`)
await sleep(200)
await clickText('Operations', true)
await waitFor(`document.body.innerText.includes('Billing User Profile')`, 'operations again')
await clickText('Billing User Profile', true)
await waitFor(`document.body.innerText.includes('Smoke Biller')`, 'users screen')
await shot('13-users')
await clickQuick('Item On/Off')
await waitFor(`document.body.innerText.includes('Menu Item On/Off')`, 'item on/off')
await shot('14-item-onoff')

// --- receipt rendering: bill + KOT HTML rendered by Chromium at 80 mm
const renderReceipt = async (html, name) => {
  // Electron's CDP cannot create targets, so render inside the POS page in a temporary iframe and clip it.
  const h = await evaluate(`(async () => {
    const f = document.createElement('iframe');
    f.id = 'smoke-receipt'; f.style.cssText = 'position:fixed;left:0;top:0;width:320px;height:10px;border:0;background:#fff;z-index:9999';
    f.srcdoc = ${JSON.stringify(html)};
    document.body.appendChild(f);
    await new Promise(r => f.onload = r);
    const h = f.contentDocument.documentElement.scrollHeight + 8;
    f.style.height = h + 'px';
    return h;
  })()`)
  await sleep(150)
  const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 320, height: h, scale: 2 } })
  writeFileSync(new URL(name + '.png', outDir), Buffer.from(data, 'base64'))
  await evaluate(`document.getElementById('smoke-receipt').remove(); true`)
  console.log('receipt rendered', name, `${h}px tall`)
}
await renderReceipt(await ipc('orders:receiptHtml', { orderId: r1.order.id, what: 'bill' }), '08-receipt-bill')
await renderReceipt(await ipc('orders:receiptHtml', { orderId: r2.order.id, what: 'kot' }), '09-receipt-kot')

console.log('SMOKE OK')
ws.close()
process.exit(0)
