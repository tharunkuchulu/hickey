# Decisions log

| Date | Decision | Why |
|------|----------|-----|
| 2026-09-17 | Electron desktop app, not a browser/PWA | Direct printer access, offline SQLite, single installer for the Scantech terminal. |
| 2026-09-17 | SQLite on the POS is the source of truth; Supabase is a mirror | Billing must work with no internet; single billing device means no sync conflicts. |
| 2026-09-17 | Money stored as integer paise | No floating-point drift on bills and reports. |
| 2026-09-17 | UUID v7 primary keys generated on the POS | Offline-safe, globally unique, time-sortable for sync and reports. |
| 2026-09-17 | Printing via Electron silent HTML print through the Windows driver first | Zero native modules; works with any driver-installed thermal printer. Raw ESC/POS added later only for drawer kick/speed. |
| 2026-09-17 | better-sqlite3 v13 (N-API prebuilds) | No compiler or electron-rebuild needed on Windows. |
| 2026-09-17 | Vite 7 (not 8) for the POS app | electron-vite 5 peers on Vite ≤ 7. |
| 2026-09-17 | TypeScript 5.9 pinned (not 7) | TS 7 is the new native compiler; tooling compatibility not yet verified. |
| 2026-09-17 | pnpm `node-linker=hoisted` | electron-builder packs a flat node_modules reliably. |
| 2026-09-17 | Renderer imports `@hickey/shared/money` etc. (subpaths), never the barrel | Barrel pulls zod into the UI bundle; subpaths + esbuild minify took it from 849 KB to 239 KB for the slow terminal. |
| 2026-09-17 | Root `ErrorBoundary` in the renderer | A render crash must show a Restart button, never a blank window at the counter. |
| 2026-09-17 | Smoke test via Chrome DevTools Protocol (`pnpm smoke`) | Drives the real Electron window without extra deps (Node 22+ has WebSocket); used for every phase's acceptance check. |
| 2026-09-17 | Order DTO types live in `apps/pos/src/types/orders.ts` (pure types) | Renderer and main share them without the web tsconfig pulling in main-process modules. |
| 2026-09-17 | `Save & Print` = save + KOT + bill + payment in one transaction; printing happens after commit and never fails the sale | Matches the cafe's counter flow (KOT and bill print in the same second in Petpooja); a printer fault must not lose a sale. |
| 2026-09-17 | Bill numbers continuous with `billNumberStart` setting; counter shows `..NNN` | Continue Petpooja's sequence (~22031) so staff and reports stay consistent. |
| 2026-09-17 | Real menu seeded from `packages/db/src/seed/menu-data.ts` (generated from `docs/reference/menu-hickey-nalsar.csv`) | Day-one install has the actual 89-item menu; variant prices still unknown are 0 and flagged red in the picker. |
| 2026-09-17 | Chrome is white with a grey icon row; only New Order / active tab / buttons are red (`#c8102e`) or maroon | Batch-1 photos and Petpooja's public screenshots — the earlier all-maroon header was wrong. |
| 2026-09-17 | KOT prints together with the bill by default and the bill shows "Token No" = KOT number | Petpooja print settings on the client's account (Print KOT on Print Bill ✓, Print KOT no on bill as Token no ✓). |
| 2026-09-17 | Payment row = Cash · Card · Due · Not Paid + More (UPI · Part · Other), default Cash | Client's Petpooja billing-screen configuration. |
| 2026-09-17 | GitHub owner `tharunkuchulu`, repo `hickey` for releases/auto-update | Provided by the developer. |
| 2026-09-17 | Menu seed generator: `python` snippet that reads `docs/reference/menu-hickey-nalsar.csv` and writes `packages/db/src/seed/menu-data.ts` (see git history of this session); variant prices are hard-coded in that snippet | Real menu on day one; edits afterwards happen in the app. |
| 2026-09-17 | Cloud writes go through `sync_push()` (SECURITY DEFINER, per-device token) — no service key on the POS; owner dashboard reads via RLS | Least privilege on a shared anon key; the POS can only upsert its own org. |
| 2026-09-17 | Placeholder dashboard admin = developer's email until the cafe has its own Google account; Supabase reset-password mail keeps recovery working | Owner unreachable at setup time; handover documented in docs/setup-cloud.md. |
| 2026-09-17 | Auto-update: electron-updater against GitHub Releases (`tharunkuchulu/hickey`), silent download, install on quit; app auto-starts at login | Zero-touch updates on the counter; free hosting. |

## v0.3.0 (18 Sep 2026)

- **Business-day extension** is one row in the key/value `settings` table (`day_extension`), not a schema change; the pure
  `resolveBusinessDay()` in shared/time.ts decides the date; every "today" in main goes through `services/day.ts`. Audited as
  `day.extend`. The dashboard infers an extension from the newest bill (no settings sync).
- **Discarding unbilled (held/running) orders** needs no admin PIN: no bill number, no payment, nothing lost; audit keeps who did it.
  Discards are excluded from "cancelled" counts and the Cancel Order report (those are cancelled *bills*).
- **Alerts** live in main-process memory (`services/alerts.ts`) and are pushed as `event:alerts`; the Hold badge rides on the same payload.
- Billing row reduced to KOT · Save & Print · Save · Hold after staff confusion on day one.

## v0.3.1 (19 Sep 2026) — after the 18 Sep sync stall

- **Cause of the stall:** a menu edit at 19:39 queued an `items` row without `is_favourite`; `jsonb_populate_recordset`
  turns a missing key into NULL → NOT NULL violation → 400 → the same batch retried every 5 min for 4 hours while 18 bills
  waited behind it. Two fixes so it cannot recur in either place:
  - **Cloud** (migration 0004): `sync_push` coalesces every missing/null value with the column default. Old terminals and
    partial payloads can no longer poison a batch on a NOT NULL column.
  - **Counter** (`services/sync.ts`): a data error (PostgREST 400/409/422) is pushed row by row and the refused rows are
    **parked** (`last_error = 'parked: …'`, no schema change) — excluded from the drain, shown in Alerts and in the header
    (`· N refused`), retried hourly, on *Sync now* and by *Re-upload all data*. Network/auth errors keep the old
    whole-batch retry. `saveItem` now sends the full row.
- **Owner sees staleness**: the dashboard's "POS synced X ago" pill turns amber after 15 min and red after 2 h.
- **Log file** `%APPDATA%\hickey-pos\logs\hickey.log` (`services/log.ts`, 2 MB rotation, never throws): app start/quit,
  every updater event (electron-updater's logger), sync failures/parked rows, IPC failures. Settings → About → Open folder.
- **Updater rewritten** (`services/updater.ts`): a real state machine (idle / checking / up_to_date / downloading /
  downloaded / error) broadcast as `event:update`; header pill + confirm modal; `quitAndInstall(true, true)` = silent NSIS
  install with self-relaunch; **auto-install when quiet** (10 min without input via `powerMonitor.getSystemIdleTime()`,
  10 min without a bill, and the renderer confirms an empty cart) so illiterate staff never deal with updates;
  install-on-quit kept as fallback; failed download → alert + retry in 10 min. Verified on the laptop with a local
  generic-provider server: 0.3.0 → 0.3.1 downloaded, one tap, relaunched as 0.3.1 in 25 s (log shows every step).
- `closeDatabase()` moved to `will-quit`: `window-all-closed` is skipped on `quitAndInstall`.
- Daily Sales bills table (counter and dashboard) names the items on each bill ("2× Cappuccino (sip), Samosa").
- Dev note: the Claude desktop app is an MSIX package, so tools launched from it see a virtualized `%APPDATA%`; the
  real counter/laptop data folder is only visible to Explorer-launched processes (docs in memory, not a product concern).
