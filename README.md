# Hickey POS

Offline-first cafe billing system (Petpooja look-alike) for the HICKEY NALSAR counter, with a free cloud mirror
and an owner dashboard. Architecture and phase plan: [docs/PLAN.md](docs/PLAN.md). Screen-by-screen contract
with Petpooja: [docs/screen-inventory.md](docs/screen-inventory.md).

## Status (2026-09-17)

| Phase | What | State |
|---|---|---|
| 1 | Monorepo, SQLite schema, seed, PIN login | done |
| 2 | Billing (Save & Print, KOT, Hold, Not Paid, Part), Orders, Live View, receipts | done |
| 3 | Reports (11), Billing User Profile, Cash Flow (expense / withdrawal / top-up), Item On/Off | done |
| 4 | Supabase mirror (token-gated sync), restore from cloud, nightly local snapshots | code done — needs the Supabase project (docs/setup-cloud.md) |
| 5 | Owner dashboard (Cloudflare Workers) | code done — needs Supabase + deploy |
| 6 | Menu management (items, variations, categories, add-ons) | done |
| 7 | Windows installer, auto-update via GitHub Releases, autostart | done — needs the GitHub repo + first tag |

Go-live steps for the cafe terminal: [docs/go-live-checklist.md](docs/go-live-checklist.md).

## Layout

```
apps/pos          Electron + React desktop app (the billing counter)
apps/dashboard    Owner web dashboard (Vite SPA, Supabase auth) → Cloudflare Workers
packages/shared   Money/time/ID helpers, zod schemas, analytics shared by both apps
packages/db       Drizzle SQLite schema, migrations, real-menu seed
supabase/         Cloud mirror schema + RLS + sync functions (run once in the SQL editor)
docs/             Plan, screen inventory, decisions, setup and go-live guides
```

## Prerequisites (developer machine)

- Node.js **22+** (24 LTS installed here), pnpm 9 (`npm i -g pnpm@9`), Git.
- No C++ compiler needed: `better-sqlite3` ships prebuilt N-API binaries.

## Commands

```bash
pnpm install                       # install everything
pnpm dev                           # POS with hot reload
pnpm -r typecheck && pnpm -r test  # strict TS + unit tests (money maths, DB, analytics)
pnpm --filter @hickey/pos smoke    # end-to-end smoke test against a running app (start it with --remote-debugging-port=9222)
pnpm --filter @hickey/pos dist     # Windows installer → apps/pos/release/
pnpm --filter @hickey/dashboard build   # dashboard → apps/dashboard/dist (deployed by Cloudflare Workers git builds)
pnpm db:generate                   # regenerate SQL migrations after editing packages/db/src/schema
```

First run seeds **Admin (PIN 1234)** and **biller (PIN 1111)** plus the real menu. Change PINs before going live.

## Where data lives

- Live database: `%APPDATA%\hickey-pos\hickey.db` (SQLite, WAL) — the source of truth, works offline.
- Nightly snapshots: `%APPDATA%\hickey-pos\backups\` (last 30).
- Cloud mirror: Supabase Postgres (Settings → Cloud Sync); every bill is pushed within seconds when online.
- Exports: any report → Excel (CSV); dashboard → All Orders → Export Excel.

## Regenerating the menu seed

Edit `docs/reference/menu-hickey-nalsar.csv` and regenerate `packages/db/src/seed/menu-data.ts` (the generator
snippet is recorded in `docs/decisions.md`). Day-to-day menu edits are done in the app (Operations → Menu).

## Troubleshooting on the POS terminal

- UI flickers / black window on Intel HD graphics: add `--disable-gpu` to the shortcut target.
- Nothing prints: Settings → Print → pick the printer → **Print test page**; check the driver's paper size and
  that the printer isn't paused in Windows.
- "Sync error" in the top bar: Settings → Cloud Sync → Test connection; bills are safe locally and will drain later.
