# Cloud setup (Supabase free tier) — one-time, ~15 minutes

The POS works fully offline. This adds the cloud mirror (backup + owner dashboard). Everything below is
on the **free** tier: 500 MB database, no card needed.

## 0. Accounts (placeholder plan agreed on 2026-09-17)

- **Owner login placeholder:** until the cafe has its own Google account, the developer's email is the
  first dashboard admin. Password recovery works through Supabase's built-in "Forgot password" email.
- When the cafe creates `hickeynalsar.pos@gmail.com` (or similar), add it as a second `owner` in
  `org_members`, transfer the Supabase project to that account (Project settings → Transfer), and remove
  the developer if desired. Nothing in the POS changes.
- Code and installers: GitHub `tharunkuchulu/hickey`.

## 1. Create the project

1. https://supabase.com → New project → name `hickey`, region **Mumbai (ap-south-1)**, free plan.
   Save the database password somewhere safe (only needed for CLI/psql).
2. Project settings → API: copy **Project URL** and **anon public key**.

## 2. Create the schema

SQL editor → New query → paste `supabase/migrations/0001_init.sql` → Run. It creates the mirrored tables,
row-level security, and the `sync_push` / `sync_pull_all` / `sync_ping` functions.

## 3. Create the org and the counter device

```sql
insert into orgs (name) values ('HICKEY NALSAR') returning id;          -- copy the id
select register_device('<org id>', 'Counter 1');                        -- copy the token (shown once)
```

## 4. Point the POS at it

Hickey POS → ☰ → Settings → **Cloud Sync** (admin):
- Enable cloud sync ✓, paste Project URL, anon key, device token → **Save settings** → **Test connection**
  (expect: `Connected as device "Counter 1"`) → **Sync now**.
- The top-right dot turns green ("Synced"). Every bill now reaches the cloud within seconds when online;
  when offline they queue ("N pending") and drain automatically.

## 5. Dashboard login (Phase 5)

1. Authentication → Users → **Add user** → the placeholder email + a password. Turn on
   "Confirm email" if you want; recovery mails come from Supabase.
2. `insert into org_members (org_id, user_id, role) values ('<org id>', '<auth user id>', 'owner');`
3. Deploy `apps/dashboard` to Cloudflare Pages (steps in that folder's README once Phase 5 lands) with
   the same Project URL + anon key. RLS guarantees the owner sees only their org.

## 6. Keep the free project awake

Supabase pauses free projects after ~7 days without traffic. The POS syncs daily, and the GitHub Action
`.github/workflows/keep-supabase-alive.yml` pings every 3 days: add repo secrets `SUPABASE_URL` and
`SUPABASE_ANON_KEY`.

## 7. Restore on a new machine

Install Hickey POS → Settings → Cloud Sync: same URL / anon key / device token → Save → **Backup & Restore →
Restore from cloud**. All orders, menu and users come back. (Local nightly snapshots live in
`%APPDATA%\hickey-pos\backups` as a second copy — copy that folder to a pen drive occasionally.)

## What is never stored in the cloud

- No Supabase **service key** ships in the app. The device token can only upsert rows for its own org
  (checked inside `sync_push`) and cannot read other orgs or delete anything.
- User PINs are stored as scrypt hashes only.
