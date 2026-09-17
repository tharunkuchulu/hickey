# Screen inventory (Petpooja → Hickey)

Built from the client's Petpooja screenshots. This is the contract the UI is built against so staff see the
same layout, labels and button order they already know. Sections are added batch by batch.

## Facts about the client install (batch 1)

| Item | Value |
|---|---|
| Outlet name in Petpooja | **HICKEY NALSAR** (restaurant ID R401258, ref A401258R) |
| Petpooja desktop version | 127.0.1 |
| Petpooja subscription | **expires 2026-09-17** ("Days Left: 1") — the cafe loses its POS imminently |
| Biller login name | `biller` |
| Terminal | Scantech all-in-one, **Windows 10 Pro 22H2** (build 19045.6466), i3-3110M @ 2.4 GHz, **8 GB RAM**, 128 GB SSD, Intel HD 4000, 10-point touch, ~1366×768 |
| Windows activation | Not activated (watermark) — cosmetic only, no effect on the app |
| Printer driver | **"POS Printer Driver V7.17"** (generic Xprinter-family USB thermal driver, installed from `C:\POS Printer Driver V7.17\`). A Windows driver exists → silent HTML print (Driver A) works. Exact printer name + paper width still to confirm via Settings → Print test. |
| Daily volume | ~100 orders/day (Orders screen: "Total Orders 100", KOT numbers reached 115 by 9:33 PM) |
| Order type actually used | **Pick Up** (Petpooja's takeaway). Cards say "Customer will pick up the order". |
| Payment mode seen | "Card" tag on almost every order (card/UPI) |
| Menu style | Items with size variants named **"Chota"** (e.g. "Green Tea Chota", "Hot Coco (hickey chota)", "Cappuccino (chota)"); coffee-shop menu (Spanish Latte, Simple Blend Frappe, Cappuccino, Hot Coco, Green Tea) |

Implications for Hickey:
- Electron 44 is fine on Win10 22H2 / 8 GB / SSD. No Electron pinning needed.
- Order-type label must be **"Pick Up"** (not "Takeaway") to match staff vocabulary.
- Variants are first-class in the menu import (chota/bada or similar sizes).
- Bill numbers display as `..033` style (prefix truncated) and KOT numbers are a separate daily sequence.

## Global chrome (every screen)

**Top bar** (maroon background, white text/icons), left → right:
1. Hamburger ☰ (opens the dark side menu; shows a red dot badge)
2. Logo (Petpooja POS → **Hickey** wordmark)
3. **New Order** — filled maroon-dark button (primary CTA, goes to Billing)
4. Search box "Bill No" (magnifier icon)
5. Search box "KOT No" (magnifier icon)
6. …spacer…
7. Icon buttons with labels beneath: **Item On/Off**, **Store**, **Live View**, **Orders**, **Recent**, **Hold**, **Alerts**, **Logout**
8. "Need Help? 07969 223344" box (→ Hickey: developer contact)

**Banner row** under top bar (dark red): used for subscription warnings → Hickey: reuse for sync/printer warnings.

**Side menu** (hamburger, dark navy panel overlaying the left ~30%):
- Header "Settings" with ← back
- Items: **Billing**, **Operations**, **Reports** (expandable ▾), **Live View**, **Settings**, **Check Updates**, **Logout**
- Footer: "Ref ID: A401258R  Version: 127.0.1" / "Biller Name: biller"

**Colours (approximate, sampled from photos — verify against a real screenshot later):**
- Primary maroon `#8B1A3B` (top bar, headers); darker maroon `#6E1330` (New Order button)
- Banner red `#A62B3F`
- Side menu navy `#1E2A47`
- Card header light blue `#CFE3F5`; primary blue pill `#1E6FD9`
- Status orange `#F0873A` ("Food Is Ready")
- Page background `#F3F4F6`; tile borders `#E5E7EB`
- Selected tab lavender `#D9D2E9`

## Screen: Operations (hub page)

Grid of tiles grouped under headings, with a right rail "Recently Used" (Live View, Billing,
Connect Captain & Secondary POS, Expense). Title row: "Operations   Version: 127.0.1".

| Group | Tiles (in order) | Hickey v1 |
|---|---|---|
| Orders & Billing | Orders · Online Orders · KOTs · Due Payment · **Billing Screen** · Live View · Bill / KOT Print · Table · Custom Order Status · Delivery Boys | Orders ✓, KOTs ✓, Billing ✓, Bill/KOT Print ✓ (reprint), Table ✓, Custom Order Status ✓ (Food Is Ready), Live View ✓ (today summary). Online Orders / Delivery Boys / Due Payment: tile shown disabled or hidden |
| Payments & Finance | Cash Flow · Expense · Withdrawal · Cash Top-Up · Currency Conversion | Cash Flow ✓ (cash register), Expense ✓, Withdrawal ✓, Cash Top-Up ✓ (all feed the day-end cash reconciliation). Currency Conversion: hidden |
| Menu & Inventory | Menu · Menu Item On Off · Tax · Discount · Customers · Feedback · LED Display · Inventory · Dual Screen | Menu ✓, Menu Item On Off ✓, Tax ✓ (off by default), Discount ✓ (preset discounts), Customers ✓ (basic name/phone). Feedback / LED Display / Inventory / Dual Screen: hidden |
| System Settings | Billing User Profile · Manual Sync · Alerts · Service Renewal · Help · Language Profiles · Settings · Connect Captain & Secondary POS | Billing User Profile ✓ (users/PINs), Manual Sync ✓ (force cloud sync), Alerts ✓, Settings ✓, Help ✓. Service Renewal / Language Profiles / Connect Captain: hidden |

## Screen: Orders

- Top-left pill tabs: **Order View** (selected) | **Kot View**
- Top-right: toggle **New View** | Old View · search "Please enter order no." with **MFR** button · refresh ⟳ · search 🔍 · **Show Filters**
- Count line: "Total Orders | 100"
- 3-column grid of order cards, newest first. Each card:
  - Header (light blue): `BILL: ..033` + outlet name under it; centre: blue pill icon button (print/receipt); right: `KOT: 115` and order type `Pick Up`
  - Note line with icon: "Customer will pick up the order"
  - "Order Details (2 Items | ₹159)" + payment tag on the right (`Card`)
  - Item lines in two columns: `3 x Green Tea Chota (lemon&honey)`, `1 x Hot Coco (hickey chota)`
  - Footer: elapsed timer (`12:02`, `23:57`, `60:04`), expand ⤢ icon, orange **Food Is Ready** button (custom order status)
- Hickey: same card layout; "Food Is Ready" marks the order ready (status column); Kot View lists KOTs.

## Screen: Service Renewal / Connect Captain & Secondary POS

Not needed in Hickey (no subscription, no captain app in v1). Documented only so the Operations grid can
show them hidden/disabled without confusing staff.

## Screens still needed (later batches)

Billing screen (the big one), Table view, KOT view, Live View, Reports (each report), Menu management,
Settings pages, Cash Flow / Expense / Withdrawal / Cash Top-Up, Billing User Profile, Customers, Discount,
Bill print + KOT print samples (photos of paper), Hold orders, Recent, Alerts, Item On/Off, Store.

---

# Batch 2 — Petpooja owner web dashboard (billing.petpooja.com / menu.petpooja.com)

35 full-page captures of the OWNER web portal (not the counter app). Rendered copies live in the session
scratchpad; the extracted menu is in `docs/reference/menu-hickey-nalsar.csv`.

## Business rules discovered (these drive the data model)

| Rule | Evidence | Hickey setting |
|---|---|---|
| **Business day = 03:30 → 03:30 next day** | All Orders / KOT filters default to "16 Sep 2026 03:30:00 – 17 Sep 2026 03:30:00" | `billing.dayStartMinutes = 210` (replace `dayStartHour`) |
| **Order numbers are continuous, never reset** | All Orders shows 22022…22031; POS cards show `BILL: ..033` = last 3 digits | Bill no = global integer; POS displays `..NNN`; full number on receipt |
| **KOT numbers reset daily** | KOT IDs 99–113 on 16 Sep, 113 KOTs = 113 orders | `kotNumberReset = daily`; exactly one KOT per order |
| **Bill + KOT print at the same moment** | KOT "Bill Print Date" == KOT "Created" to the second | Counter flow: New Order → items → payment mode → *Save & Print* prints KOT+bill together |
| **Status after printing = "Printed"** and payment is captured at print time | All Orders: Status `Printed`, Payment `Card`/`Cash` | Order status `printed` is the normal terminal state; explicit `settled` only for due/split flows |
| No tax, no discounts in practice | Tax 0.00, Discount (0.00) on every row; 0 Complementary, 0 Cancelled | Tax engine off; discount UI present but rarely used |
| **Day-end / cash register is NOT used** | Day End Summary: "No Results Found" for the whole last month | Cash register open/close optional, never blocking |
| **Customers essentially unused** | 4 customers ever; 7-day donut 100% "Without Customer" | Customer name/phone optional; no CRM |
| Payment split | Cash ₹435 (4.7%) / Card ₹8,869 (95.3%) — "Card" is the catch-all for card+UPI | Payment modes: Cash, Card, UPI, Other (default Card) |
| Volume | 113 orders/₹9,304 on 16 Sep; 15-day range ₹9.3k–₹16.2k/day; **Aug 2026 = ₹5,43,467** | ~3,400 orders/month → ~40k order rows/yr, tiny for SQLite/Supabase |
| Order types | Dine In / **Pick Up** / Delivery — 100% Pick Up | Keep all three enums for parity; Pick Up default |
| Food type markers | green (veg), red (non-veg), **yellow (egg)** | `items.food_type: veg | nonveg | egg` (replace `is_veg`) |
| Variants | 3 variations, department "portion size": **chota**, **sip**, **hickey chota** | Items flagged `V` have price 0 and per-variant prices (see below) |
| Add-ons | One group "Add On" (contents not captured) | Addon group + items importable later |
| Item notes presets | "Yesh", "Addons" | Preset notes list, tappable in cart |
| Owner | Name **Gangandar** (dashboard login will use the owner's email from the profile page) | Supabase auth invite |

Known variant prices (from actual orders; the rest need the Excel export from Menu → Export/Import):
Americano chota 30 · Cappuccino chota 40 · Cappuccino sip 79 · Flat White chota 50 · Dark Mocha chota 50 ·
Hot Coco hickey chota 39. Items with variants: Espresso, Americano, Cafe Latte, Cappuccino, Flat White,
Dark Mocha, White Mocha, Zebra Mocha, Hot Coco, Brownie With Hot Coco.

## Menu (14 categories, 89 items) — `docs/reference/menu-hickey-nalsar.csv`

Hot Coffee (8, all variant-priced) · Iced Coffee (7) · Shakes (7) · Frappe (7) · Chillers (3) · Iced Teas (4) ·
Matcha (5) · Drinking Coco (5) · Blizzards (11) · Veg Bite Size (7) · Non-Veg Bite Size (5) · Sandwiches (7) ·
Burgers (3) · Waffles (10, also holds Brownie/Chocolava/water/milk). Short codes are mostly numeric (1–91)
and staff type them in the billing search box — keep short-code search exact-match first.

## Owner dashboard (web) — what Hickey's Phase-5 dashboard must show

Layout: left nav (Dashboard · Daily Operations: Live Orders / All Orders / KOT · Menu · Reports · Management),
outlet name header, "POS synced N mins ago" pill, date picker per card.

1. **Sales Statistics card** — Total Sales ₹ + orders count for the day; payment split rows Cash / Card / Other /
   Not paid with ₹ and %; status chips *Successful / Complementary / Cancelled*; bar chart of sales in 4-hour
   buckets (04–08, 08–12, 12–16, 16–20, 20–24, 00–04) stacked by Dine In / Pick Up / Delivery.
2. **Order-type cards** — Dine In / Pick Up / Delivery: ₹, order count, % share, progress bar.
3. **15-day trend** (from All Orders) — daily total line with values labelled.
4. **Item Performance** — Top / Low performing tabs: item name, qty sold, ₹.
5. **Revenue Leakage** — KOTs cancelled / modified; Bills modified / re-printed / waived off.
6. **Expenses & Withdrawals** — Expenses ₹, Withdrawals ₹, Cash top-up ₹ for the day.
7. **Sales Performance** — month total (e.g. Aug 2026 ₹5,43,467).

**All Orders** table: Order No · Order Type · Customer Name · Assign To · Items (comma list) · My Amount ·
Tax · Discount · Grand Total [Round Off] · Payment · Status · Created ↓ · Actions (view / invoice / edit /
reprint) · pagination "Showing 1 to 10 of 113" · **Export Excel** · date range + order type + order id filters.

**KOT** table: KOT ID · Order Type · Customer · Phone · No. of Items · Items · Status (Used In Bill) ·
Bill Print Date · Complete Duration · Created · Actions · Export Excel.

**Live Orders**: Running Orders (count + ₹, by Dine in / Pick up / Delivery) and Pending Orders
(In Preparation / Waiting For Pickup / Out For Delivery) · Running Tables tab · Refresh.

## Reports to implement (chosen from Petpooja's ~90-report catalogue; the rest are hidden)

| Petpooja report | Hickey | Notes |
|---|---|---|
| All Restaurant Sales Report / Day Wise | **Sales Summary** (day / range) | totals, orders, avg ticket, payment split |
| Order Report: Payment Wise | **Payment-wise** | cash/card/upi/other by day |
| Item Wise: Sales Report / Highest Selling Items | **Item-wise** | qty, ₹, share; top N |
| Sales Report: Category Wise | **Category-wise** | |
| All Restaurants Sales: Hourly Item Wise / Item Sale Hourly | **Hourly sales** | 1-hour and 4-hour buckets |
| Variation Report | **Variant-wise** | chota vs sip |
| Cancel Order Report / Discounted Orders (With Reason) | **Cancelled & discounted** | with reason + user |
| Order Print Count Report | **Reprints** | audit_log based |
| Sales Report: Biller Wise | **User-wise** | |
| Growth Report: Day Wise | **Growth** | day/month totals + expenses |
| POS Collection Report | **Collection** | payments + expenses + withdrawals = cash in drawer |
| Day End Summary | **Day end** (optional) | only if they start using cash register |

All reports: date range (business-day aware), export CSV/XLSX, print summary on the thermal printer.

## Menu management (web) — model for Hickey's Menu screen

Tabs: **Items · Categories · Variants · Addons · Tables/Areas · Taxes · Discounts**. Items view: category rail
on the left (with "Hide empty categories" toggle), item rows with veg/non-veg/egg bar, name, flags
(V variation · A addon · O online · F favourite · D dine-in QR), short code, online display name, price,
description, image, actions (edit / copy / on-off). Buttons: Search · Action ▾ · Quick Actions ▾ ·
Copy Menu · Save · Rank wise · **Add Items** · Available toggle. Categories view: name, rank, status,
Add Category, Export/Import. Variants: name, department ("portion size"), rank. Addons: groups with items,
Assign Addons.

## Outlet configuration (web) — model for Hickey's Settings screen

Groups and tiles: **Outlet Information** (Outlet Details · Contact Details · Outlet Timings · Payment ·
Invoice Sequence · Floor Plan) · **Billing Screen** (Display · Set Your Print Logo · Calculations ·
Connected Services · Print · Customer) · **System Setting** (Billing System). Hickey adds Printer, Users &
PINs, Sync, Backup/Restore under the same tile style.

## Schema changes queued for Phase 2 (from this batch)

- `items.is_veg` → `food_type` enum `veg | nonveg | egg`
- `settings.billing.dayStartHour` → `dayStartMinutes` (default 210 = 03:30)
- `orders.order_type` add `delivery`; UI label "Pick Up"
- bill numbering: global sequence with `..NNN` display; `settings.billing.billNumberReset` default `never`
- new tables: `customers` (minimal), `item_notes` (presets), `cash_movements` (expense / withdrawal / top-up)
- `orders.status` semantics: `printed` = billed + paid at counter (normal end state)

---

# Batch 3 — read from the live Petpooja portal (Chrome, read-only) and Petpooja's public screenshots

## Confirmed configuration (billing.petpooja.com → Outlet Configuration)

| Setting | Value |
|---|---|
| Outlet address | Justice City, Shamirpet, Hyderabad, Secunderabad, Telangana 500101 (area: Shamirpet) |
| Tax authority | GST (no taxes configured — Tax Configuration list is empty) |
| Discounts / Tables | none configured |
| Invoice sequence | none custom → plain continuous numbering (22072 on 17 Sep 02:31) |
| Users | one biller: `biller` |
| Payment types enabled | Not Paid, Cash, Card, Due, UPI, Part Payment, Other |
| Billing screen payment row | Option 1 **Cash**, 2 **Card**, 3 **Due**, 4 **Not Paid**; UPI / Part / Other under "More" |
| Default payment type | Cash (staff tap Card for nearly every order) |
| Default order type | Dine In in config, but every real order is Pick Up |
| Layout | **Touch Screen**, menu **on the left**, default screen Billing, new cart line **at bottom**, item sorting **A–Z**, item price shown, search box shown, virtual keyboard on, item images on (none uploaded) |
| Quick quantity buttons | 1, 2, 3, 5, 10 |
| Petty cash default | ₹2000 |
| Discount label / button | "Coupon Code" / "Apply"; "Leave as it is (No Discount)" shown |
| Section names | Delivery / Pick Up / Dine In — all enabled |

## Print settings (Bill & KOT)

KOT: **Print KOT on Print Bill ✓** (KOT + bill print together on the single printer — the KOT slip is the
customer's token), Print only modified KOT ✓, add-ons & notes below item ✓, "Duplicate" on reprint ✓.
Bill: no tax bifurcation, **Duplicate on reprint ✓**, **Print KOT no on bill as "Token No" ✓**, show add-ons ✓,
**merge duplicate items ✓**, quantity shown KOT-wise ✓; customer paid/return ✗; barcode ✗; e-bill ✗.

## Menu data recovered

Variants (chota / sip): Espresso 49/99 · Americano 30/79 · Cafe Latte 40/99 · Cappuccino 40/99 ·
Flat White 50/129 · Dark Mocha 50/139 · White Mocha 50/139 · Zebra Mocha 59/149.
(hickey chota / sip): Hot Coco 39/99 · Brownie With Hot Coco 59/129.
Add-on group "Add On" (assigned to items flagged **A**): Hazelnut 20 · Vanila 20 · Irish 20 · Chocolate 20 ·
Caramel 20 · Peri Peri 20 · Cheese Slice 30 · Espresso 30 · ICE CREAM 30 (all veg).
Item-wise report 16 Sep: 182 items, ₹13,308 (e.g. Cappuccino chota 14 sold).

## Desktop billing screen (Petpooja public screenshots, same layout family as v127)

- **Top bar is WHITE** (not maroon): ☰ · logo · red **New Order** · "Bill No" · "KOT No" · (right) dark-grey icon
  buttons with tiny labels · pink "Need Help?" box. Only the subscription banner and buttons are red/maroon.
- **Row 2**: left = menu selector (red pill) + **Search Item** + **Short Code** inputs; right (over the cart) =
  three tabs **Dine In | Delivery | Pick Up**, active tab red with white text; "Bill No" at the far right.
- **Category rail**: dark grey (#3f3f3f) column, white 12–13 px uppercase-ish labels, active category red,
  "Favorite Items" in yellow at the top.
- **Item grid**: white tiles, 4–5 per row, thick coloured left border (green veg / red non-veg / yellow egg),
  item name top-left, price bottom.
- **Cart panel**: icon toolbar (table/persons · customer · add-ons · notes · discount) with a yellow area
  button; collapsible customer fields (Mobile, Name, Address, Locality); table header
  **ITEMS · CHECK ITEMS · QTY · PRICE**; rows with red ⊗ delete, name, [−] qty [+], price; empty state
  "No Item Selected — Please select item from left menu"; **Total** row with "Complimentary" checkbox;
  payment **radio row** Cash · Card · Due · Not Paid (+ More); buttons **Save** (red) · **Save & Print** (red) ·
  **Save & eBill** (red) · **KOT** (dark) · **KOT & Print** (dark) · **Hold** (outline).
- Newer skin (2024+): active order-type tab is red text on light pink; Save & print dark navy, KOT & print red.
