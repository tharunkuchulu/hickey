/**
 * Smoke test: drives the running POS through the Chrome DevTools Protocol.
 * Start the app with `--remote-debugging-port=9222`, then `pnpm smoke`.
 * Logs in, bills two orders through the real IPC (Save & Print with printing disabled),
 * checks numbering + totals, exercises the Orders screen, and saves screenshots to scripts/out/.
 *
 * Usage: node scripts/smoke.mjs [port]
 */
import fs, { mkdirSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'

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

// --- login as Admin (skip if a previous run left us logged in; log out first if someone else is)
if (await evaluate(`!!document.querySelector('header') && !document.querySelector('header').textContent.includes('Biller: Admin')`)) {
  await clickQuick('Logout')
  await waitFor(`!document.querySelector('header')`, 'logged out stale session')
}
if (!(await evaluate(`!!document.querySelector('header')`))) {
  await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.startsWith('Admin'))`, 'admin tile')
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

// v0.3.0: the billing row is exactly KOT · Save & Print · Save · Hold
const row = await evaluate(`[...document.querySelectorAll('[data-testid="bill-actions"] button')].map(b => b.textContent.trim())`)
assert(JSON.stringify(row) === JSON.stringify(['KOT', 'Save & Print', 'Save', 'Hold']), `button row wrong: ${JSON.stringify(row)}`)

// v0.3.0: alerts status + hold badge reflect every parked order (any date)
await evaluate(`window.__ev = []; window.hickey.on('event:alerts', (p) => window.__ev.push(p)); true`)
const held2 = await ipc('orders:save', { input: mk([{ itemId: null, name: 'Badge Tea', variantName: null, unitPrice: 2000, qty: 1, addons: [], notes: null }], []).input, hold: true })
await waitFor(`window.__ev.length > 0`, 'event:alerts after hold')
const alertsSt = await ipc('alerts:status')
const openNow = await ipc('orders:list', { status: ['held', 'running'], limit: 5000 })
assert(alertsSt.holdCount === openNow.length && alertsSt.holdCount >= 2, `holdCount ${alertsSt.holdCount} vs list ${openNow.length}`)
assert(Array.isArray(alertsSt.alerts) && alertsSt.alerts.every((a) => ['hold_stale', 'sync_problem', 'print_failed', 'day_end', 'update_ready'].includes(a.kind) && a.id && a.title && a.at), 'alerts shape wrong')
assert(alertsSt.day.businessDate === bd && typeof alertsSt.day.endsAt === 'string' && alertsSt.day.extended === false, `day status wrong: ${JSON.stringify(alertsSt.day)}`)
const lastEv = await evaluate(`window.__ev[window.__ev.length - 1].holdCount`)
assert(lastEv === alertsSt.holdCount, 'event payload holdCount differs')
await waitFor(`document.querySelector('[data-testid="badge-hold"]')?.textContent === '${alertsSt.holdCount}'`, 'hold badge count')
console.log('alerts ok: holdCount', alertsSt.holdCount, '| alerts', alertsSt.alerts.map((a) => a.kind).join(',') || 'none')

// v0.3.0: business-day extension round-trip (all through main; today's date must stay in force)
await ipc('day:extend', { endsAt: null }).catch(() => undefined)
const d0 = await ipc('day:status')
assert(d0.businessDate === bd && d0.extended === false && d0.endsAt === d0.normalEndsAt, `day:status wrong: ${JSON.stringify(d0)}`)
const plus1h = new Date(new Date(d0.endsAt).getTime() + 3600_000).toISOString()
const d1 = await ipc('day:extend', { endsAt: plus1h })
assert(d1.extended === true && d1.endsAt === plus1h && d1.businessDate === bd, `extend wrong: ${JSON.stringify(d1)}`)
assert((await ipc('app:businessDate')) === bd, 'business date changed after extension')
const afterExt = await ipc('orders:save', { input: mk([{ itemId: null, name: 'Late Tea', variantName: null, unitPrice: 1000, qty: 1, addons: [], notes: null }], []).input, hold: true })
assert(afterExt.businessDate === bd, 'order stamped with the wrong date during extension')
assert((await ipc('alerts:status')).day.extended === true, 'alerts day status not extended')
for (const [label, req] of [
  ['not after normal end', { endsAt: d0.endsAt }],
  ['in the past', { endsAt: new Date(Date.now() - 60_000).toISOString() }],
  ['over 12 h', { endsAt: new Date(new Date(d0.endsAt).getTime() + 13 * 3600_000).toISOString() }],
  ['closed date', { endsAt: plus1h, businessDate: '2020-01-01' }]
]) {
  let rejectedExt = false
  try { await ipc('day:extend', req) } catch { rejectedExt = true }
  assert(rejectedExt, `day:extend should reject: ${label}`)
}
const snoozed = await ipc('day:snooze', { endsAt: d1.endsAt })
assert(snoozed.snoozedUntil === d1.endsAt, 'snooze not recorded')
const d2 = await ipc('day:extend', { endsAt: null })
assert(d2.extended === false && d2.endsAt === d0.endsAt, 'revert failed')
await ipc('orders:cancel', { orderId: afterExt.id, reason: 'Discarded' })
console.log('day extension ok:', d0.endsAt, '→', plus1h, '→ reverted')

// "Save" = bill without printing (Petpooja semantics): counted as a sale, status SAVED (settled), no print
const r3 = await ipc('orders:saveAndPrint', { ...mk(
  [{ itemId: null, name: 'Zebra Mocha', variantName: 'sip', unitPrice: 16900, qty: 1, addons: [], notes: null }],
  [{ mode: 'upi', amount: 16900 }]
), saveOnly: true })
assert(r3.order.status === 'settled' && r3.order.printCount === 0 && r3.order.billNo && r3.order.settledAt, `save-without-print wrong: ${JSON.stringify(r3.order)}`)

// part payment: two legs
const r4 = await ipc('orders:saveAndPrint', mk(
  [{ itemId: null, name: 'Brownie Blend Frappe', variantName: null, unitPrice: 10900, qty: 1, addons: [], notes: null }],
  [{ mode: 'cash', amount: 5000 }, { mode: 'card', amount: 5900 }]
))
assert(r4.order.payments.length === 2 && r4.order.paymentSummary === 'Cash + Card', `part payment wrong: ${r4.order.paymentSummary}`)

// live summary (2 printed + 1 saved + 1 part-paid = 4 bills)
const live = await ipc('live:summary', { businessDate: bd })
assert(
  live.totalOrders === base.totalOrders + 4 &&
    live.totalSales === base.totalSales + 19900 + 16900 + 10900 &&
    live.byPayment.card.amount === (base.byPayment.card?.amount ?? 0) + 13900 + 5900 &&
    live.byPayment.cash.amount === (base.byPayment.cash?.amount ?? 0) + 6000 + 5000 &&
    live.runningAmount >= 9900,
  `live wrong: ${JSON.stringify(live)}`
)
console.log('live:', live.totalOrders, 'orders', live.totalSales, 'paise; running', live.running, 'unbilled', live.runningAmount)

// correct the payment of a billed order (wrong button at the counter): card → cash, legs replaced, cloud deletes queued
const fixed = await ipc('orders:updatePayment', { orderId: r1.order.id, payments: [{ mode: 'cash', amount: 13900 }] })
assert(fixed.paymentSummary === 'Cash' && fixed.payments.length === 1, `payment update wrong: ${fixed.paymentSummary}`)
const liveFixed = await ipc('live:summary', { businessDate: bd })
assert(liveFixed.byPayment.card.amount === live.byPayment.card.amount - 13900 && liveFixed.byPayment.cash.amount === live.byPayment.cash.amount + 13900, 'payment change not reflected in live summary')
let badFix = false
try { await ipc('orders:updatePayment', { orderId: held.id, payments: [{ mode: 'cash', amount: 9900 }] }) } catch { badFix = true }
assert(badFix, 'payment change on an unbilled order must be rejected')
console.log('payment corrected:', fixed.billNo, fixed.paymentSummary)

// daily sales page data
const daily = await ipc('reports:daily', { from: bd, to: bd })
assert(daily.sales.orders === liveFixed.totalOrders && daily.sales.net === liveFixed.totalSales, `daily sales mismatch: ${JSON.stringify(daily.sales)}`)
assert(daily.byPayment.find((p) => p.mode === 'cash').amount === liveFixed.byPayment.cash.amount, 'daily cash split wrong')
assert(daily.unbilled.orders >= 1 && daily.bills.some((b) => b.payment === 'Cash 50 + Card 59'), `daily bills wrong: ${JSON.stringify(daily.bills.slice(0, 3))}`)
// v0.3.1: the bills table names what was sold ("2× Cappuccino (sip), Samosa"), not just a count
assert(daily.bills.every((b) => typeof b.itemsText === 'string') && daily.bills.some((b) => b.itemsText === 'Cappuccino (chota), Simple Blend Frappe'), `itemsText missing: ${JSON.stringify(daily.bills.slice(0, 4).map((b) => [b.items, b.itemsText]))}`)
console.log('daily sales ok:', daily.sales.orders, 'bills,', daily.byPayment.map((p) => `${p.label} ${p.amount}`).join(', '), '| first bill:', daily.bills[0]?.itemsText)

// favourites: the small star on a tile pins it to the Favourites rail (and unpins it again)
await clickQuick('New Order')
await waitFor(`document.body.innerText.includes('Favourites')`, 'favourites rail')
const favBefore = await evaluate(`Number(([...document.querySelectorAll('aside button')].find(b => b.textContent.includes('Favourites'))?.textContent.match(/\d+/) ?? ['0'])[0])`)
await evaluate(`document.querySelector('section button[title="Add to Favourites"]').click(); true`)
await waitFor(`document.body.innerText.includes('Favourites (${favBefore + 1})')`, 'favourite count up')
await clickText('★ Favourites')
await sleep(200)
const favTiles = await evaluate(`document.querySelectorAll('section button[title="Remove from Favourites"]').length`)
assert(favTiles === favBefore + 1, `favourites rail should show ${favBefore + 1} starred items, got ${favTiles}`)
await shot('04b-favourites')
await evaluate(`document.querySelector('section button[title="Remove from Favourites"]').click(); true`)
await waitFor(`document.body.innerText.includes('Favourites (${favBefore})')`, 'favourite count back')
const snapFav = await ipc('menu:snapshot')
assert(snapFav.items.filter((i) => i.isFavourite).length === favBefore, 'favourite flag not persisted correctly')
console.log('favourites ok')

// cancel with reason (admin session)
const cancelled = await ipc('orders:cancel', { orderId: r2.order.id, reason: 'smoke test' })
assert(cancelled.status === 'cancelled', 'cancel failed')
const live2 = await ipc('live:summary', { businessDate: bd })
assert(live2.totalOrders === base.totalOrders + 3 && live2.cancelled === base.cancelled + 1, 'cancel not reflected in live summary')
// discarding an unbilled hold must not count as a cancelled bill
const held3 = await ipc('orders:save', { input: mk([{ itemId: null, name: 'Discard Me', variantName: null, unitPrice: 5000, qty: 1, addons: [], notes: null }], []).input, hold: true })
await ipc('orders:cancel', { orderId: held3.id, reason: 'Discarded: smoke' })
const live3 = await ipc('live:summary', { businessDate: bd })
assert(live3.cancelled === live2.cancelled, 'discarded hold counted as a cancelled bill')

// --- Orders screen renders the cards
await clickQuick('Orders')
await waitFor(`document.body.innerText.includes('Total Orders')`, 'orders screen')
await sleep(300)
const cards = await evaluate(`[...document.querySelectorAll('main .bg-cardblue')].length`)
assert(cards >= 5, `expected at least 5 order cards (4 billed + 1 held), got ${cards}`)
await shot('05-orders')

// Food Is Ready
await clickText('Food Is Ready')
await sleep(200)
assert(await evaluate(`document.body.innerText.includes('Ready')`), 'ready state not shown')

// --- Hold screen shows the held order with Resume
await clickQuick('Hold')
await waitFor(`document.body.innerText.includes('Held / running')`, 'hold screen')
await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Resume')`, 'hold cards loaded')
await clickText('Resume')
await waitFor(`document.body.innerText.includes('Editing')`, 'resume into billing')
await shot('06-resumed-hold')
await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Editing · Cancel edit').click(); true`)

// v0.3.0: a cashier (not admin) discards a held order without any PIN, and can open the Menu screen
const cashier = await ipc('users:save', { name: 'Smoke Cashier', role: 'cashier', pin: '3333' })
await clickQuick('Logout')
await waitFor(`!document.querySelector('header')`, 'logged out')
await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.startsWith('Smoke Cashier'))`, 'cashier tile')
await clickText('Smoke Cashier')
for (const d of '3333') await clickText(d, true)
await clickText('Login')
await waitFor(`document.querySelector('header')?.textContent.includes('Smoke Cashier')`, 'cashier login')
const holdBefore = (await ipc('alerts:status')).holdCount
await clickQuick('Hold')
await waitFor(`!!document.querySelector('[data-testid="discard"]')`, 'discard button on hold card')
const discardId = held2.id
await evaluate(`(() => { const card = [...document.querySelectorAll('main .bg-cardblue')].map(h => h.parentElement).find(c => c.textContent.includes('Badge Tea')); card.querySelector('[data-testid="discard"]').click(); return true })()`)
await waitFor(`!!document.querySelector('[data-testid="discard-confirm"]')`, 'discard dialog')
assert(!(await evaluate(`!!document.querySelector('input[placeholder="Admin PIN"]')`)), 'discard dialog must not ask for the admin PIN')
await evaluate(`document.querySelector('[data-testid="discard-confirm"]').click(); true`)
await waitFor(`!document.querySelector('[data-testid="discard-confirm"]')`, 'discard done')
const discarded = await ipc('orders:get', { orderId: discardId })
assert(discarded.status === 'cancelled' && discarded.cancelReason.startsWith('Discarded'), `discard wrong: ${discarded.status} ${discarded.cancelReason}`)
await waitFor(`document.querySelector('[data-testid="badge-hold"]')?.textContent === '${holdBefore - 1}'`, 'hold badge after discard')
await evaluate(`[...document.querySelectorAll('header button')].find(b => b.getAttribute('aria-label') === 'Menu').click(); true`)
await clickText('Operations', true)
await waitFor(`document.body.innerText.includes('Operations')`, 'operations screen')
await clickText('Menu', true)
await waitFor(`document.body.innerText.includes('Add Items')`, 'menu screen for cashier')
assert(!(await evaluate(`document.body.innerText.includes('Only an admin can edit the menu')`)), 'menu still gated for cashier')
await clickQuick('Alerts')
await waitFor(`document.body.innerText.includes('Alerts |')`, 'alerts screen')
await shot('06b-alerts')
await clickQuick('Logout')
await waitFor(`!document.querySelector('header')`, 'logged out 2')
await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.startsWith('Admin'))`, 'admin tile')
await clickText('Admin')
for (const d of '1234') await clickText(d, true)
await clickText('Login')
await waitFor(`document.querySelector('header')?.textContent.includes('Admin')`, 'admin login again')
await ipc('users:save', { id: cashier.id, name: 'Smoke Cashier', role: 'cashier', isActive: false })
console.log('cashier discard + menu + alerts screen ok')

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

// v0.3.1 updater: a real state machine instead of a guessed toast; dev build reports idle
const upd = await ipc('update:status')
assert(upd.state === 'idle' && upd.current === (await ipc('app:info')).version && typeof upd.message === 'string', `update:status wrong: ${JSON.stringify(upd)}`)
assert((await ipc('update:check')).state === 'idle', 'update:check in dev must stay idle')
const inst = await ipc('update:install', { reason: 'tap' })
assert(inst.ok === false && /No update/.test(inst.message), `update:install must refuse without a download: ${JSON.stringify(inst)}`)
const appInfo = await ipc('app:info')
assert(appInfo.logDir.endsWith('logs') && fs.existsSync(path.join(appInfo.logDir, 'hickey.log')) && fs.readFileSync(path.join(appInfo.logDir, 'hickey.log'), 'utf8').includes('[app] start'), 'hickey.log missing or without the start line')
console.log('updater ok:', upd.state, upd.message, '| log:', path.join(appInfo.logDir, 'hickey.log'))

// sync is disabled until configured; a local snapshot can be taken on demand
const syncSt = await ipc('sync:status')
assert(syncSt.state === 'disabled' && syncSt.pending >= 1, `sync status wrong: ${JSON.stringify(syncSt)}`)
const bad = await ipc('sync:test', { enabled: true, supabaseUrl: 'https://invalid.example.invalid', supabaseAnonKey: 'x', deviceToken: 'y', orgId: '', deviceId: 'd', deviceLabel: 'l' })
assert(bad.ok === false, 'sync test should fail against an invalid host')
const bk = await ipc('backup:now')
assert(bk.sizeBytes > 10000 && (await ipc('backup:list')).some((b) => b.file === bk.file), 'backup failed')
console.log('sync disabled with', syncSt.pending, 'pending; backup', bk.file, bk.sizeBytes, 'bytes')

// v0.3.1: a row the cloud refuses (data error) is parked and the bills behind it still upload.
// Fake Supabase on localhost: refuses any items row named 'Poison Item' with a 400 until told otherwise.
{
  const seen = { items: [], orders: [], deletes: 0, pings: 0 }
  const poisonName = `Poison ${Date.now()}` // unique per run: earlier runs' soft-deleted rows are re-queued by enqueueAllRows
  let poison = true
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const fn = req.url.split('/').pop()
      const b = body ? JSON.parse(body) : {}
      const reply = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)) }
      if (fn === 'sync_ping') { seen.pings++; return reply(200, { device: 'fake', org_id: 'x' }) }
      if (fn === 'sync_delete') { seen.deletes += b.p_ids.length; return reply(200, b.p_ids.length) }
      if (fn !== 'sync_push') return reply(404, { message: 'no such rpc' })
      if (b.p_table === 'items' && poison && b.p_rows.some((r) => r.name === poisonName)) return reply(400, { message: 'null value in column "is_favourite" of relation "items" violates not-null constraint' })
      if (b.p_table === 'items') seen.items.push(...b.p_rows.map((r) => r.name))
      if (b.p_table === 'orders') seen.orders.push(...b.p_rows.map((r) => r.id))
      return reply(200, b.p_rows.length)
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const settings0 = await ipc('settings:get')
  assert(settings0.sync.enabled === false, 'smoke must not run with real Cloud Sync enabled on this machine')
  await ipc('settings:set', { ...settings0, sync: { ...settings0.sync, enabled: true, supabaseUrl: `http://127.0.0.1:${port}`, supabaseAnonKey: 'fake', deviceToken: 'fake-token' } })
  const st0 = await ipc('sync:now')
  assert(st0.state === 'synced' && st0.pending === 0 && st0.parked === 0, `fake cloud initial drain failed: ${JSON.stringify(st0)}`)
  const poisonCat = await ipc('menu:saveCategory', { name: 'Poison Cat' })
  const poisonId = await ipc('menu:saveItem', { categoryId: poisonCat, name: poisonName, shortCode: null, price: 100, foodType: 'veg', variants: [], addonGroupIds: [] })
  const behind = await ipc('orders:saveAndPrint', mk([{ itemId: null, name: 'Behind Poison', variantName: null, unitPrice: 1000, qty: 1, addons: [], notes: null }], [{ mode: 'cash', amount: 1000 }]))
  const st1 = await ipc('sync:now')
  assert(st1.state === 'synced' && st1.pending === 0 && st1.parked >= 1 && /not-null/.test(st1.parkedError ?? ''), `poison row not parked: ${JSON.stringify(st1)}`)
  assert(seen.orders.includes(behind.order.id), 'the bill behind the refused row did not upload')
  assert(!seen.items.includes(poisonName), 'refused row must not count as uploaded')
  const parkedAlert = (await ipc('alerts:status')).alerts.find((a) => a.id === 'sync_parked')
  assert(parkedAlert && parkedAlert.kind === 'sync_problem' && parkedAlert.sync.parked === st1.parked, `sync_parked alert missing: ${JSON.stringify((await ipc('alerts:status')).alerts.map((a) => a.id))}`)
  await waitFor(`document.body.innerText.includes('refused')`, 'header shows refused count')
  // cloud fixed → Sync now retries the parked rows and they go through
  poison = false
  const st2 = await ipc('sync:now')
  assert(st2.state === 'synced' && st2.parked === 0 && st2.pending === 0 && seen.items.includes(poisonName), `parked rows not retried: ${JSON.stringify(st2)}`)
  assert(!(await ipc('alerts:status')).alerts.some((a) => a.id === 'sync_parked'), 'sync_parked alert should clear')
  await ipc('menu:deleteItem', { id: poisonId })
  await ipc('menu:deleteCategory', { id: poisonCat })
  await ipc('sync:now')
  await ipc('settings:set', settings0)
  assert((await ipc('sync:status')).state === 'disabled', 'sync must be disabled again after the fake-cloud test')
  server.close()
  console.log('parked sync ok: refused row parked, bill behind it uploaded, retry after fix cleared it; deletes seen', seen.deletes)
}

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
  return h
}
await renderReceipt(await ipc('orders:receiptHtml', { orderId: r1.order.id, what: 'bill' }), '08-receipt-bill')
const kotH = await renderReceipt(await ipc('orders:receiptHtml', { orderId: r2.order.id, what: 'kot' }), '09-receipt-kot')
assert(kotH < 120, `KOT slip should be compact, got ${kotH}px`)

console.log('SMOKE OK')
ws.close()
process.exit(0)
