# Hickey POS — Architecture & Build Plan

## Context

A cafe at NALSAR Law College, Hyderabad pays a yearly Petpooja subscription. The owner wants their own POS
("Hickey" trademark) that **looks and behaves like Petpooja** so existing staff need no retraining, with
**zero recurring cost**. Data must survive for years, be safe, and be viewable by the owner from their phone.

Confirmed facts from interview:
- Hardware: Scantech all-in-one touch POS terminal, Windows x64, Intel HD 4000 (≈2012 Ivy Bridge CPU → low-spec), touch + pen.
- Must work **offline**; internet is not guaranteed.
- Order types: Dine-in (tables) + Takeaway / counter billing. No Swiggy/Zomato, no own delivery.
- One thermal printer at the counter (bill). KOT prints on the same printer or shows on-screen (configurable).
- Modules in scope: Billing, KOT, Table management, Reports. Out of scope for v1: inventory, loyalty/khata.
- Owner wants a phone-accessible sales dashboard.
- Not GST-registered → simple bill; tax engine present but off by default.
- Maintainer (you) prefers JavaScript/TypeScript.

Still to collect in Phase 0 (does not block the plan): exact Windows version (`winver`), RAM, printer model +
connection (USB/LAN) + paper width (58/80mm), Petpooja screenshots, a photo of a current printed bill, menu
export from Petpooja.

---

## 1. Architecture (one picture)

```
┌──────────────── Cafe (Scantech POS, Windows) ────────────────┐
│  Hickey POS  (Electron app)                                  │
│  ┌──────────────┐   IPC    ┌──────────────────────────────┐  │
│  │ React UI     │ <──────> │ Main process (Node)          │  │
│  │ (Petpooja-   │          │  • services (orders, menu…)  │  │
│  │  style)      │          │  • SQLite  (source of truth) │──┼──> Thermal printer
│  └──────────────┘          │  • sync worker (outbox)      │  │   (USB/LAN)
│                            │  • backup job (nightly)      │  │
│                            └──────────────┬───────────────┘  │
└───────────────────────────────────────────┼──────────────────┘
                                 internet (when available)
                                            │
                    ┌───────────────────────▼──────────────────────┐
                    │ Supabase (free tier)                         │
                    │  • Postgres  = cloud mirror of every table   │
                    │  • Auth      = owner login + device login    │
                    │  • Storage   = nightly DB snapshots, CSV     │
                    └───────────────────────┬──────────────────────┘
                                            │
                    ┌───────────────────────▼──────────────────────┐
                    │ Owner Dashboard (React SPA, Cloudflare Pages)│
                    │  phone-friendly, read-only reports + exports │
                    └──────────────────────────────────────────────┘
```

**Key principle:** the POS machine's SQLite is the master. The cloud is a mirror + backup. Billing never
waits on the network. Single billing device → no sync conflicts on orders (cloud only receives; it never
edits orders).

---

## 2. Tech stack (all free / open source)

| Layer | Choice | Why |
|---|---|---|
| Desktop shell | **Electron** + `electron-vite` + `electron-builder` (NSIS installer) | Mature on Windows, full Node access for printing/SQLite, JS/TS only. |
| UI | **React 18 + TypeScript + Tailwind CSS + Zustand** | Flat, dense Petpooja-like UI is easy in Tailwind; Zustand is light for cart/table state. |
| Local DB | **SQLite** via `better-sqlite3` + **Drizzle ORM** (WAL mode) | Crash-safe, zero-config, ~µs queries. Drizzle gives typed schema shared with Postgres. |
| Cloud DB / Auth / Storage | **Supabase free tier** (500 MB Postgres, 1 GB storage, Auth, RLS) | Auth + REST + row-level security out of the box → least code for a solo maintainer. |
| Dashboard hosting | **Cloudflare Pages** (free, unlimited bandwidth) | Static SPA; `*.pages.dev` URL, custom domain optional. |
| Code + releases + cron | **GitHub** (repo, Releases for auto-update, Actions cron) | Free; `electron-updater` pulls updates from GitHub Releases. |
| Printing | Electron **silent HTML print** via Windows driver (primary); raw **ESC/POS** (TCP 9100 for LAN, spooler for USB) as secondary | Primary needs zero native modules and works with any printer that has a Windows driver. ESC/POS path adds cash-drawer kick / faster prints when needed. |
| Validation / shared types | `zod` in a shared package | Same schemas in POS, sync, and dashboard. |
| Monorepo | `pnpm` workspaces | apps/pos, apps/dashboard, packages/shared, packages/db |

Monthly cost: **₹0**. Optional: a domain (~₹800/yr) for the dashboard.

Free-tier caveats and mitigations:
- Supabase pauses free projects after ~7 days of inactivity → the POS syncs daily anyway; add a GitHub Actions
  cron ping (every 3 days) as insurance.
- 500 MB Postgres cap → a cafe at ~300 bills/day ≈ ~80–120 MB/year. Fine for 4+ years; a yearly "archive to CSV in
  Storage" job keeps it bounded. Local SQLite keeps everything regardless.
- Supabase may change free tier in future → data always also exists in local SQLite + nightly snapshots + CSV
  exports, so migration to another host is trivial.

---

## 3. Repository layout

```
Hickey/
  apps/
    pos/                      # Electron app
      src/main/               # Node side: db, services, printing, sync, backup, ipc handlers
      src/preload/            # typed IPC bridge
      src/renderer/           # React UI (screens mirror Petpooja)
      resources/              # icons, receipt templates, RawPrinterHelper.ps1
    dashboard/                # Vite React SPA for the owner (Supabase auth, reports)
  packages/
    shared/                   # zod schemas, money utils (paise ints), receipt data model, report queries
    db/                       # Drizzle schema (sqlite + pg dialects), migrations, seed
  supabase/                   # SQL migrations, RLS policies, storage buckets
  .github/workflows/          # build installer on tag, keep-alive ping
```

---

## 4. Data model (core tables — same shape locally and in cloud)

Every row: `id` (UUID v7, generated on POS), `created_at`, `updated_at`, `device_id`, `deleted_at` (soft delete).
Money stored as **integer paise**.

- `settings` (key/value: cafe name, address, phone, bill header/footer, paper width, printer name, bill-number
  format, rounding rule, tax on/off, KOT print on/off)
- `users` (name, PIN hash, role: admin | cashier)
- `categories`, `items` (name, short code, price, category, is_active, sort), `item_variants` (size/half-full),
  `addon_groups`, `addons`
- `dining_tables` (name, area, seats, status derived from open orders)
- `orders` (bill_no, order_type: dine_in | takeaway, table_id, status: running | printed | settled | cancelled,
  customer name/phone, subtotal, discount (type/value/amount), round_off, total, cancel_reason, created_by)
- `order_items` (item snapshot: name, price, variant, addons, qty, line total, kot_no, notes, status)
- `kots` (kot_no, order_id, items printed, time)
- `payments` (order_id, mode: cash | upi | card | other, amount, reference)
- `cash_register_sessions` (opened_by, opening_cash, closing_cash, expected, difference, timestamps)
- `audit_log` (who did what: void, discount, reprint, price change)
- `sync_outbox` (table, row_id, op, payload, attempts, last_error) — local only

---

## 5. Offline-first sync design

- **Write path:** every local mutation runs in one SQLite transaction that also inserts a `sync_outbox` row.
- **Push worker** (main process): every 30 s and immediately after settle/print, if online, batch ≤200 outbox
  rows → `supabase.from(table).upsert(rows, { onConflict: 'id' })` with a device-scoped auth session. On
  success delete outbox rows; on failure backoff (exponential, capped 5 min), keep rows.
- **Pull** (master data only: menu, settings, users) on startup and every 5 min: `updated_at > last_pull_at`,
  last-write-wins. This enables editing the menu from the dashboard later (Phase 6) without conflict risk.
- **Conflict policy:** orders/payments/kots are POS-only writers → no conflicts. If a 2nd billing device is ever
  added, bill numbers get a device prefix (`A-0001`, `B-0001`) — schema already carries `device_id`.
- **Status:** top-bar sync indicator (green = synced, yellow = N pending, red = offline) exactly like Petpooja.
- **RLS:** `org_id` on every cloud row; policy: device role may insert/upsert own org; owner role may select own org.
  No service key ever ships in the app.

---

## 6. Backups & long-term data safety (3 copies, 2 locations)

1. **Live local SQLite** (`%APPDATA%\Hickey\hickey.db`, WAL mode, `synchronous=NORMAL`) — survives power cuts.
2. **Nightly local snapshot** via `VACUUM INTO backups/hickey-YYYY-MM-DD.db` (keep 30) — survives DB corruption.
3. **Cloud mirror** in Supabase Postgres (near-real-time) + **nightly snapshot upload** (gzip, ~1–5 MB) to Supabase
   Storage (keep 60) + **monthly CSV export** (orders, items, payments) to Storage — survives disk/machine death.
4. **Restore path** (documented + tested): new machine → install Hickey → "Restore from cloud" pulls all tables
   from Supabase, or drop a snapshot file in place.

"Viewing data after ages": the dashboard queries Postgres for any date range; CSV/XLSX exports open in Excel;
if Supabase is ever abandoned, the SQLite file itself is the complete history (any SQLite viewer opens it).

---

## 7. Printing design

- `PrinterService` interface: `printBill(order)`, `printKot(kot)`, `printDayEnd(session)`, `openDrawer()`, `testPrint()`.
- **Driver A (default): Electron silent print.** Hidden `BrowserWindow` renders an HTML receipt template (58/80 mm
  CSS, monospace, matches the photo of their current Petpooja bill) → `webContents.print({ silent: true,
  deviceName, margins: none, pageSize: 80 mm })`. Works with any installed Windows printer driver; driver handles
  auto-cut. Zero native dependencies (important: old CPU, Electron native builds are the #1 source of Windows pain).
- **Driver B: raw ESC/POS.** Build bytes with a small in-house encoder (init, bold, align, cut, drawer pulse).
  Transport: LAN → `net.Socket` to port 9100; USB → write bytes to the Windows spooler through a bundled
  `RawPrinterHelper.ps1` (winspool `WritePrinter`), no compiled module. Used when they want cash-drawer kick or
  faster prints.
- Settings screen: pick printer from `webContents.getPrintersAsync()`, paper width, copies, KOT on/off, test print.
- Failure handling: print errors never block settling; bill is saved, a "Reprint" button and a toast appear.

---

## 8. Screens (mirroring Petpooja — final list confirmed in Phase 0 from screenshots)

1. **Login** — user tiles + PIN pad (touch).
2. **Billing** — left: category tabs + item grid + search/short-code box; right: cart (qty ± , notes, variant/addon
   picker), customer name/phone, order-type toggle (Dine In / Takeaway), table picker, discount (₹/%), buttons:
   *Save*, *Save & Print*, *KOT*, *KOT & Print*, *Hold*, *Settle* (Cash/UPI/Card/Split with tendered/change numpad).
3. **Table view** — grid of tables by area, colour-coded (free / running / printed), tap → open order.
4. **Orders (today)** — list with status, search by bill no/phone, reprint, cancel with reason (admin PIN).
5. **Cash register** — open day (opening cash) / close day (expected vs counted) + day-end print.
6. **Reports** — Sales summary, item-wise, category-wise, payment-wise, hourly, discounts, cancelled; date range;
   export CSV/PDF.
7. **Menu management** — categories, items, variants, add-ons, prices, active toggle; CSV import.
8. **Settings** — cafe profile & receipt header/footer, printer, bill numbering, users/PINs, sync status, backup/restore.
9. **Owner dashboard (web)** — login, today at a glance, date-range reports, top items, payment split, exports.

UI rules for this hardware: touch targets ≥ 44 px, no hover-only actions, on-screen numpads, no animations,
disable GPU acceleration flag ready if the HD 4000 flickers, dense layout at 1024×768 / 1366×768.

---

## 9. Build phases

**Phase 0 — Discovery (you + client, ~2 days)**
- Collect: screenshots → write `docs/screen-inventory.md` (each Petpooja screen → Hickey screen, every button);
  Windows version + RAM; printer model/connection/paper width; photo of a printed bill + KOT; Petpooja menu export
  (CSV) and, if possible, historical sales export.
- Decision gate: if Windows is 7/8.1 → either upgrade to Win10 (free, this CPU supports it) or pin Electron 22.

**Phase 1 — Foundation**
- pnpm monorepo, electron-vite app boots, Tailwind, Drizzle schema + migrations, seed menu from CSV, PIN login,
  settings store, typed IPC bridge. Smoke-test the installer on the Scantech machine (perf check early).

**Phase 2 — Core billing (the 80%)**
- Menu grid + search, cart, variants/add-ons, discounts, rounding, order types, tables, KOT numbering,
  hold/running orders, settle (cash/UPI/card/split), bill numbering, receipt template, silent print, reprint,
  cancel/void with audit. Parallel-run against Petpooja on real orders for a few days.

**Phase 3 — Day operations & reports**
- Cash register open/close, day-end print, orders list, all reports with CSV/PDF export, admin-only actions.

**Phase 4 — Cloud sync & backups**
- Supabase project, migrations, RLS, device auth, outbox push worker, master-data pull, nightly snapshot + upload,
  restore-from-cloud, keep-alive workflow, sync indicator.

**Phase 5 — Owner dashboard**
- Vite SPA on Cloudflare Pages, Supabase auth (owner email), reports reuse `packages/shared` query definitions,
  mobile layout, exports.

**Phase 6 — Menu management polish**
- Full CRUD in POS; optional dashboard-side editing (uses the pull path from Phase 4).

**Phase 7 — Hardening & handover**
- NSIS installer + auto-update via GitHub Releases, autostart on boot, kiosk-ish fullscreen, printer-failure and
  power-cut tests, restore drill, 1-week parallel run, staff training sheet, admin manual (`docs/`).

---

## 10. Verification (end-to-end)

- Run on the actual Scantech terminal: app start < 5 s, item tap → cart < 100 ms, bill print < 2 s.
- Unplug LAN/Wi-Fi: bill 10 orders → all saved; reconnect → outbox drains to Supabase, indicator turns green,
  rows match (count + totals) in dashboard.
- Kill power mid-settle: on restart the order is either fully settled or still running — never half-written
  (single SQLite transaction).
- Printer off: settle still succeeds, toast + reprint works after printer on.
- Restore drill: wipe `%APPDATA%\Hickey`, "Restore from cloud" → identical report totals.
- Reports cross-check: day totals in POS = dashboard = sum of exported CSV.
- Automated: unit tests (vitest) for money/rounding/bill-numbering/discount math and receipt rendering; Drizzle
  migration tests on a temp DB.

---

## 11. Open items to hand me next

1. Petpooja screenshots (all screens) and a photo of a printed bill + KOT.
2. `winver` output and RAM of the Scantech terminal.
3. Printer model, how it connects (USB / LAN / Bluetooth), paper width, whether a cash drawer is attached.
4. Menu export from Petpooja (Items CSV) and whether they want old Petpooja history imported.
5. Owner's email (for dashboard login) and a GitHub account to host the repo/releases.
