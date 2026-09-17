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
