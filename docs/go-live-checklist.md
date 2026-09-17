# Go-live checklist — HICKEY NALSAR counter

## A. Before you go to the cafe

- [ ] Download the newest installer from https://github.com/tharunkuchulu/hickey/releases (currently
      `Hickey-POS-Setup-0.1.2.exe`, 114 MB). Building locally also works: `pnpm --filter @hickey/pos dist`.
- [ ] Have `GO-LIVE-VALUES.local.md` (project folder, not in git) with you: Supabase URL, anon key, DEVICE_TOKEN,
      dashboard URL — everything Settings → Cloud Sync asks for.
- [ ] Copy the installer to a pen drive.
- [ ] Note the **last Petpooja bill number** from the owner portal (All Orders → newest Order No.; it was 22072 at 02:31 on 17 Sep).

## B. Install on the Scantech (Windows 10)

- [ ] Run the installer → Next → Install (any folder). A desktop shortcut "Hickey POS" appears; the app also
      starts automatically after every reboot.
- [ ] First launch seeds the real menu (14 categories, 89 items, sizes and add-ons) and two logins:
      **Admin 1234** · **biller 1111**.
- [ ] If the screen flickers or stays black (old Intel HD 4000): right-click the shortcut → Properties → add
      ` --disable-gpu` at the end of Target.

## C. Settings (login as Admin → ☰ → Settings)

- [ ] **Outlet Details**: phone number (address is pre-filled), footer note.
- [ ] **Billing & Calculations** → *Start bill numbers from*: last Petpooja bill **+ 1** (e.g. 22073), so the
      sequence continues. Default payment mode: Cash (Petpooja default) or Card (what staff actually use).
- [ ] **Print**: pick the thermal printer (the "POS Printer Driver V7.17" device — usually `POS-80` / `POS80`),
      paper width 80 mm (58 if the roll is narrow) → **Print test page**. If nothing prints: Windows →
      Printers → that printer → Printing preferences → paper size = 80 mm roll; make sure it's not paused.
      Keep "Print KOT ticket" on — the KOT slip is the customer's token, exactly like Petpooja.
- [ ] **Billing User Profile** (Operations): change the Admin PIN, set the biller's PIN, add more billers.
- [ ] **Cloud Sync**: Enable ✓ → paste Project URL, anon key and DEVICE_TOKEN from `GO-LIVE-VALUES.local.md` →
      Save → **Test connection** → **Sync now**. Then open https://hickey.nalsar.workers.dev on a phone
      and check the test bills appear.

## D. Test with the staff (5 minutes)

- [ ] New Order → tap items (size popup for hot coffee) → Card → **Save & Print**: bill + KOT print, token
      number matches the KOT number.
- [ ] Orders screen shows the card; **Food Is Ready** works; **View → Reprint bill** prints "DUPLICATE".
- [ ] Hold an order, resume it from **Hold**.
- [ ] Pull the internet cable → bill again → still prints; the top-right dot says Offline / N pending.
- [ ] Live View totals match the bills just printed.

## E. Daily habits

- Nothing to close at day end (Petpooja day-end was never used). Cash Flow → Expense for milk/gas etc. keeps
  the drawer count right.
- Item out of stock → **Item On/Off** (top bar).
- Menu changes → Operations → **Menu** (admin).

## F. Updates

1. Bump `version` in `apps/pos/package.json`, commit, `git tag v0.1.3` (same number), `git push origin main --tags`.
2. GitHub Actions builds the installer and publishes the Release (~8 min); every counter updates itself within
   6 hours (or ☰ → Check Updates) and installs on the next app close.
