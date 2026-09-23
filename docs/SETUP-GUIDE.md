# Hickey POS — complete setup, from zero to the first printed bill

Everything is free-tier. Total time ≈ 1 hour, most of it waiting for builds.
Do the steps in order; each one says what to copy for the next.

---

## 1. Database — Supabase (10 min)

1. Go to https://supabase.com → **Start your project** → sign up (GitHub or email).
2. **New project** → Name `hickey` · Region **Mumbai (ap-south-1)** · generate a database password (save it) · Plan **Free** → Create. Wait ~2 min.
3. Left menu **SQL Editor** → **New query** → paste the whole file `supabase/migrations/0001_init.sql` → **Run**. (Creates tables, security rules, sync functions.)
   Then run **every later file in `supabase/migrations/` in order** (0002 … 0004) — each one is safe to re-run.
   *HICKEY NALSAR: 0001–0004 applied (0004 on 18 Sep 2026 23:20).*
4. Same SQL editor, run and **copy the two results**:
   ```sql
   insert into orgs (name) values ('HICKEY NALSAR') returning id;     -- → ORG_ID
   select register_device('<ORG_ID>', 'Counter 1');                   -- → DEVICE_TOKEN (shown once)
   ```
5. **Project Settings → API** → copy **Project URL** and **anon public** key.

## 2. Owner login for the dashboard (3 min)

1. **Authentication → Users → Add user** → email = your email for now (placeholder until the cafe has its own), a strong password, tick **Auto Confirm User** → Create. Copy the user's **UUID**.
2. SQL Editor:
   ```sql
   insert into org_members (org_id, user_id, role) values ('<ORG_ID>', '<USER_UUID>', 'owner');
   ```
3. After step 4 below, come back to **Authentication → URL Configuration** and set **Site URL** = the dashboard
   URL and add `https://hickey.nalsar.workers.dev/**` under **Redirect URLs** — otherwise mail links land on localhost.
4. **Production email (do this before handing over).** Supabase's built-in mailer is for development: **2 mails per
   hour** and it may refuse addresses outside your Supabase team — so "Forgot password" and invite mails to the cafe
   owner can silently fail. Fix once: **Project Settings → Authentication → SMTP Settings → Enable custom SMTP**:
   - Gmail: Host `smtp.gmail.com` · Port `587` · Username = a Gmail address · Password = a Google **App password**
     (Google account → Security → 2-Step Verification → App passwords) · Sender email = that Gmail · Sender name `Hickey`.
   - Or any free transactional provider (Brevo: 300 mails/day) with the SMTP values it shows.
   Supabase raises the limit to 30 mails/hour automatically once custom SMTP is saved (Rate Limits → emails/h).
   *HICKEY NALSAR: done on 17 Sep 2026 — sender `Hickey <vankayalatharun@gmail.com>` via a Google App password; to revoke or rotate, Google Account → Security → App passwords.*
5. The owner can change their own **password and sign-in email inside the dashboard** (Account tab) — the password
   change needs no email at all, so it never depends on step 4.

## 3. Code hosting — GitHub (5 min)

Auto-update downloads installers from GitHub Releases, so the repo (or at least its releases) must be **public**.
Nothing secret is in the code — keys live only in Settings on the terminal.

```bash
cd "C:\Users\MAMIDALA ANVESH\OneDrive\Desktop\Kuchulu\Hickey"
git init
git add .
git commit -m "Hickey POS v0.1.0"
git branch -M main
git remote add origin https://github.com/tharunkuchulu/hickey.git   # create this repo on github.com first (Public)
git push -u origin main
git tag v0.1.0
git push --tags
```

`git push --tags` starts the **release** Action (≈8 min). When it finishes, **Releases** on GitHub has
`Hickey-POS-Setup-0.1.0.exe`. (Repo → Settings → Secrets → add `SUPABASE_URL` and `SUPABASE_ANON_KEY` so the
keep-alive Action stops the free project from pausing.)

Prefer to build locally instead? `pnpm install && pnpm --filter @hickey/pos dist` → `apps/pos/release/`.

## 4. Owner dashboard — Cloudflare Workers (5 min)

1. https://dash.cloudflare.com → sign up → **Workers & Pages → Create → Workers → Import a repository** → pick `tharunkuchulu/hickey`.
2. Build settings (Settings → Builds → Build configuration):
   - **Root directory: leave EMPTY** (repo root — `dist` is created by the build, so it must not be the root)
   - Build command: `pnpm install && pnpm --filter @hickey/dashboard build`
   - Deploy command: `npx wrangler deploy --config apps/dashboard/wrangler.jsonc`
   - Build variables: `VITE_SUPABASE_URL` = Project URL · `VITE_SUPABASE_ANON_KEY` = anon key · `NODE_VERSION` = `22`
   - API token: pick / create the build token Cloudflare offers (needed for the deploy step)
3. **Save** (the card has its own Save button) → Deployments → **Retry build** if one already failed.
   Live URL for HICKEY NALSAR: **https://hickey.nalsar.workers.dev** — open it → sign in with the owner email/password.
   Now do step 2.3 (Site URL / Redirect URL) with this address.

## 5. Install on the counter terminal (10 min)

1. Copy the newest `Hickey-POS-Setup-x.y.z.exe` from https://github.com/tharunkuchulu/hickey/releases to a pen drive → run it on the Scantech → Next → Install.
   A desktop shortcut appears; the app also auto-starts after every reboot.
2. First launch creates the database with the real HICKEY NALSAR menu and two logins:
   **Admin — PIN 1234** (settings, menu, users, cancellations) · **biller — PIN 1111** (billing, orders, reports).
3. Log in as **Admin** → ☰ → **Settings**:
   - **Outlet Details**: phone number (address is already filled).
   - **Billing & Calculations** → *Start bill numbers from* = last Petpooja bill number **+ 1** (e.g. 22073).
   - **Print**: choose the thermal printer (the "POS Printer Driver V7.17" device, usually `POS-80`), paper 80 mm → **Print test page**. No print? Windows → Printers → that printer → Printing preferences → paper size = 80 mm roll; make sure it isn't paused.
   - **Cloud Sync**: Enable ✓ · Project URL · anon key · DEVICE_TOKEN (all three are in `GO-LIVE-VALUES.local.md` in the project folder — not in git) → **Save settings** → **Test connection** → **Sync now**. Top-right dot turns green.
4. Operations → **Billing User Profile** → change the Admin PIN and the biller PIN (keep them private).
5. Optional: if the screen flickers on this old Intel graphics, add ` --disable-gpu` to the shortcut's Target.

## 6. Print the first bill (1 min)

1. Log in as **biller** → **New Order** (top bar).
2. Tap **Pick Up**, tap items — hot coffees ask for the size (chota / sip); or type the short code in *Short Code* and press Enter.
3. Choose **Cash** or **Card** → **Save & Print**. The bill prints with the KOT slip (customer's token number).
4. **Orders** shows the card; **View** → Reprint bill / Reprint KOT; **Food Is Ready** when done.
5. Open the dashboard on your phone: the sale is there within seconds (or after the internet returns — the counter never stops billing offline).

## How billing buttons work (v0.3.0 — four buttons)

| Button | What happens | Counts as sale? |
|---|---|---|
| **KOT** | Only the kitchen/token slip prints — but the bill number and the payment are saved, exactly like Save & Print. Saves bill paper on the ~90% of orders where nobody asks for a bill. The slip shows the amount, the payment and the bill number. | **Yes** |
| **Save & Print** | Bill + KOT slip print | Yes |
| **Save** | Bill is made (bill no., payment recorded) but **nothing prints**; card shows SAVED with a *Print bill* button | Yes |
| **Hold** | Parks the order; resume from *Hold* | No (until billed) |

Tick the payment (Cash / Card / UPI / Not Paid) **before** pressing KOT, the same as for Save & Print — that is what
gets recorded. A customer who does want paper: Orders → the card's **Print bill** (or View → Print bill).
To go back to Petpooja's old KOT (sends food only, order stays running): Settings → Billing & Calculations →
untick *KOT also saves the bill*.

**Hold / Alerts badges:** the red number on **Hold** is how many orders are parked (any day); on **Alerts** how many things
need attention — an order on hold for over 20 minutes, sync offline with bills waiting, a print that failed, the day end
coming up, an update ready to install. Open Alerts and use the button on the row (Resume / Discard / Sync now / Extend…).
**Discarding a parked order** (customer left): Hold → *Discard* — any biller, no admin PIN, nothing is printed or counted.
Cancelling a *billed* order still needs a reason and the admin PIN.
**Wrong payment button?** Orders → *Payment* (or View → *Change payment*), or Daily Sales → tap the payment — works after billing.
**Part payment:** choose *More → Part* → pick the two modes and type the first amount on the number pad.
**Favourites:** tap ☆ on any item tile (or in Menu) to pin it to the ★ Favourites rail at the top of the menu; ★ removes it.
**Menu changes** (items, prices, categories, add-ons) can be done by the biller too: Operations → Menu.

## Late nights — extending the business day

Sales are grouped by **business day**, which ends at **03:30** (Settings → Billing → *Business day starts at*). Everything
billed before 03:30 belongs to the previous date, like in Petpooja. If the cafe is still open:

- At **03:00** the counter asks *"Business day ends at 03:30 — still open?"* → tap **+1 hour / +2 hours / +3 hours** or a
  custom time (up to 12 hours). Bills, KOT/bill numbers, Live View, Cash Flow and reports keep the same date until then,
  and the question comes back 30 minutes before the new end. **No, end at 03:30** keeps the normal end.
- Forgot, and it is already past 03:30? Alerts → **Reopen…** works for an hour after the day ended, as long as nothing was
  billed on the new date yet.
- Any way in: Operations → **Extend business day**, or the Alerts row. The header shows *Day 18/09 ends 04:30 (extended)*.
- The owner dashboard follows automatically (it reads the date stamped on the bills).

## Daily / later

- Item out of stock → top bar **Item On/Off**. Menu or price changes → Operations → **Menu** (admin).
- Expenses paid from the drawer → Operations → **Expense** (keeps Cash Flow right). No day-end needed.
- Day-end: ☰ → **Reports → Daily Sales** — total, split by Cash / Card / UPI / Not Paid, cancelled, and every bill with its payment and time. Same page on the owner dashboard (Reports → Daily Sales).
- New app version: bump `version` in `apps/pos/package.json`, `git commit`, `git tag v0.1.1`, `git push --tags`. Terminals update themselves (see **Updates** below).
- Handing the dashboard to the owner: either sign in and use **Account → Change sign-in email** (confirmation mail
  goes to the owner's address — needs step 2.4), then hand over the password and let them change it in Account; or
  create them as a second user (step 2.1–2.2). Later, Supabase **Project Settings → Transfer project** moves the
  whole project to their Supabase account — nothing changes on the terminal.
- Cloud looks incomplete (menu missing, reports empty although bills exist)? Terminal → Settings → Cloud Sync →
  **Re-upload all data** (admin).

## Updates (v0.3.1 and later) — nobody at the counter has to do anything

The app checks GitHub 15 s after it opens and every 6 hours, downloads the new version in the background and
shows what is going on in the top bar, left of the pink box:

| Top bar shows | Meaning | What to do |
|---|---|---|
| nothing | up to date, or still checking | nothing |
| grey **↓ Update 43%** | downloading (≈110 MB) | keep the app open; billing works as usual |
| green **Restart to update** | downloaded | nothing — it installs by itself the first time the counter is quiet for 10 minutes (no touch, no bill, empty cart); or tap it → *Restart now* (about a minute, the app reopens by itself) |
| red **Update failed** | download failed (no internet / GitHub down) | nothing — it retries every 10 minutes; Alerts shows the reason |

Closing the app with a downloaded update also installs it (fallback). Bills, settings and the printer setup are
never touched by an update.

**Terminals still on 0.2.0 / 0.3.0** have the old updater (no progress, download restarts from zero on every
relaunch). Get them onto 0.3.1 once by hand: Chrome → https://github.com/tharunkuchulu/hickey/releases/latest →
download `Hickey-POS-Setup-0.3.1.exe` → close Hickey POS → run it → Next → Install. From then on it is automatic.

**Log file:** ☰ → Settings → About → **Open folder** (`%APPDATA%\hickey-pos\logs\hickey.log`) — every update
step, sync problem and app error is written there. When something is odd, send that file.

## If something goes wrong

| Symptom | Fix |
|---|---|
| "Test connection" fails | URL must look like `https://xxxx.supabase.co`; token is the one from `register_device` (run it again to get a new one) |
| Dashboard says "No rows" | `org_members` row missing (step 2.2) or the POS hasn't synced yet |
| Dashboard pill "POS synced 3 hours ago" turns amber/red while the cafe is open | Counter → Alerts. *Offline* = internet; *refused by the cloud* = a row the cloud rejected is parked, bills keep uploading — send the log file. The 18 Sep 2026 case (items row missing `is_favourite`) is fixed by migration 0004. |
| Reset-password link opens localhost | Step 2.3 Site URL / Redirect URL |
| "email rate limit exceeded" / reset mail never arrives | Step 2.4 custom SMTP (built-in mailer = 2/hour). Meanwhile: Account tab → Change password (no mail), or SQL `update auth.users set encrypted_password = extensions.crypt('NEW', extensions.gen_salt('bf')) where email = '...'` |
| Printer prints blank or cuts early | Driver paper size 80 mm, or switch Settings → Print → 58 mm if the roll is narrow |
| Terminal dies | Install on a new PC → Settings → Cloud Sync (same values) → Backup & Restore → **Restore from cloud** |
