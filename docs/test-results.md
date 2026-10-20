# Change request: trial removal, English, POS images, repair profit — test results

Tested on 2026-10-17 against the local app (`npm run dev`, demo tenant `admin@caissepro.local`), in the built-in browser and through the API the screens use. Nothing here touched the live systememaroc.com account.

## 1. Trial period removed

| Check | Result |
|---|---|
| "Période d'essai — N jours restants" banner and sidebar link | Gone (layout, store and banner no longer reference a trial) |
| New tenants | Created `active` with no expiry (schema default + seed) |
| Blocking | Only for an active paid plan whose `expiresAt` has passed, or suspended/cancelled tenants; lifetime plans never |
| Sign-in, dashboard, POS | Work as before (48/48 server tests pass) |

## 2. English

| Check | Result |
|---|---|
| Translation files | `web/src/i18n/en/*` — 1,916 keys, identical key set to French and Arabic, placeholders checked (`npm run i18n:check -w web`) |
| Hard-coded French in templates | 0 lines left (`node scripts/i18n-accents.mjs`); remaining scan hits are data (clothing sizes/colours, bank names, city list) |
| Screen sweep in English | 26 routes + 5 report tabs + repair and transaction detail pages: no French text found except stored data |
| Switcher | Header (desktop and cashier), sidebar (FR / EN / ع), login page, Settings → Localization |
| Persistence | Saved in the browser and on the user (`User.locale`). Verified: choose English on the login page → signed in → `/auth/me` returns `locale: "en"`; then on a "French" device, signing in switches to English from the account |
| Live switch | Category chips and other API data refetch: FR "Coques & Protections" → EN "Cases & Protection" → AR "الأغطية والحماية" (RTL kept) |
| API errors | 86 server messages translated client-side (wrong password shows "Invalid email address or password") — `scripts/server-messages-check.mjs` fails if a new server message has no translation |
| Numbers and dates | Follow the language (English: `1,234.50 DH`, `17 Oct 2026`) |
| Receipts, invoices, repair tickets, report PDFs | English when the interface is English; French otherwise (the PDF font cannot draw Arabic, and French is the usual language for Moroccan invoices). English invoices write the amount in English words |
| Stored texts | Drawer reasons, stock movement notes and seeded category names are stored in French and shown translated |

## 3. POS with product images

| Check | Result |
|---|---|
| Upload | Product form → photo picker; resized in the browser to ≤480 px WebP (1.3 MB test PNG → 3 KB) and stored under `server/uploads/<tenant>/` with a one-year immutable cache |
| Security | Only WebP/JPEG/PNG whose file signature matches, ≤2 MB; a product can only point to its own tenant's uploads or an https URL; replaced/removed images are deleted (server tests `uploads.test.ts`) |
| Grid | Image cards with lazy loading; products without a photo get a tinted placeholder with initials; stock badge (out / low / count); in-cart quantity badge |
| Filters | Search + category chips with counts |
| Cart | Thumbnails, quantity −/+, subtotal, discount (when set), VAT (when enabled), total |
| Test sale (English UI) | TEST Coque iPhone 15 (with photo) + TEST Support voiture (no photo) = 178.00 DH, paid cash → English receipt "Payment successful … Thank you for your purchase!" |
| Out-of-stock card | Click adds nothing (unchanged cart rule) |

## 4. Repair profit — end-to-end test

Repair REP-MVCIE85T-IHTZ, price **600 DH**, technician "TEST Technicien":

| Cost | Amount |
|---|---|
| 2 × TEST Verre trempé from stock (cost 8) | 16 |
| Purchased part (TEST Ecran OLED) | 100 |
| Technician, paid in cash from the drawer | 150 |
| Other direct cost (transport) | 20 |
| **Repair profit** = 600 − 116 − 150 − 20 | **314** |

| Moment | Counted in profit? |
|---|---|
| Completed, unpaid | No (`realized: false`) |
| 300 DH deposit (partial) | No — dashboard repair profit unchanged at 410 |
| 300 DH balance (paid) | Yes |
| Extra 50 DH payment | Refused ("Repair already paid") |

Dashboard and reports for the day, before → after the POS sale and the repair:

| Figure | Expected change | Measured |
|---|---|---|
| Sales (dashboard card) | +178 (repairs are not sales) | +178 |
| Sales COGS | +55 (25 + 30) | +55 |
| Repair revenue / parts / labour / other / profit | +600 / +116 / +150 / +20 / +314 | same |
| Total revenue | +778 | +778 |
| Cost of goods (sales + repair parts) | +171 | +171 |
| Gross profit | +607 | +607 |
| Direct expenses | +170 | +170 |
| **Net profit** | +437 (123 + 314) | **+437** |
| Reports profit statement = dashboard | identical | identical |
| Repairs report filtered by technician | 1 repair, 314 | 1 repair, 314 |
| Repairs report filtered by "unpaid" | nothing realized | 0 |
| Glass stock | 60 → 58 | 60 → 58 |
| Cash drawer | +178 − 150 + 600 = +628 | +628 |

No double counting: the repair's money appears once (repair revenue), never in POS sales; parts from stock are costed once (in the repair, at cost price) and leave inventory once. Repairs on the shop's own stock devices keep the earlier rule (costs added to the device, see `docs/accounting.md`).

## Automated checks

- Server: 48 tests pass (`npm test -w server`), including `repairAccounting.test.ts` and `uploads.test.ts`.
- Web: `npx vite build` passes; `npm run i18n:check -w web` passes.

## Not verified / limitations

- The operating-system file dialog of the photo picker could not be driven from the test browser; the same compress-and-upload code was exercised from the page.
- Clothing sizes and colours (e.g. "Taille unique", "Bleu marine") are saved into product names and variants, so they stay French.
- Names users type (custom categories, products, reasons) are shown as typed.
- The "Delete repair" button still shows on a paid repair; the server refuses the deletion with a translated message.
- Arabic printed documents stay in French (PDF font limitation, unchanged from before).

---

# Change request: barcodes for products, QR codes for repairs, payment options — test results

Tested on 2026-10-17 on the local app (built-in browser, English interface) and with server tests (52 passing).

## Products: barcode only

| Check | Result |
|---|---|
| QR codes for products | Removed: product QR dialog deleted, label templates no longer offer a QR, device (phone) labels switched to a barcode of the IMEI / device reference |
| New products | Get an EAN-13 in the 20… in-store range automatically (bulk/variant creation too); a scanned manufacturer code is kept |
| Existing products | Backfilled at server start: the 8 local products received valid, unique EAN-13 codes |
| Duplicates | Refused (409) including against archived products and inside one bulk batch; also a database unique index per business. Clearing a barcode generates a new one, so every product keeps one |
| Labels | Products list → barcode button, or tick several products → "Print labels". Name, selling price, barcode + digits; sizes Compact 40×25 mm (default), Standard 50×25, Mini 30×20; copies per product or one per piece in stock; live preview identical to the print |
| Scanning — Products | A scanner burst anywhere on the page (or typing + Enter) finds and highlights the product; unknown codes offer "Create a product with this code" |
| Scanning — POS | Exact barcode/IMEI scans go straight into the cart, also in Detailed mode and when the search box isn't focused (tested: 2 × charger + 1 case) |

## Repairs: QR tracking

| Check | Result |
|---|---|
| Unique code | Each repair gets an unguessable 22-character tracking token (backfilled for existing repairs) |
| QR | On the repair page (with open/copy link), the printed/PDF repair ticket ("Scan to track your repair") and the device label. Sale receipts have no QR |
| Estimated completion | Set in the repair form or edited on the repair page; shown on the ticket and the public page; flagged "Overdue" when passed |
| Public page `/track/<token>` | Status message, 4-step progress, device, received date, estimated date, store phone/address; FR/EN/AR; refreshes every minute. No customer name, phone, price or internal id is exposed; wrong tokens → 404 |
| Tested | New repair (ETA +3 days) → page shows "Estimated date Tuesday, 20 October 2026"; moved to in progress → page shows "Your device is being repaired." |

## Payment dialog

| Check | Result |
|---|---|
| Single source | `web/src/config/saleOptions.js` lists sale types and payment methods; a new entry appears in the dialog (the server's enum must accept it) |
| Payment methods | Cash, Card, Bank transfer, Check, Mobile payment (check and mobile were accepted by the API but missing from the dialog); optional reference field, check number required |
| Sale types | Direct, Credit, Reservation, Trade-in are all clickable: without a customer they open the customer picker and apply after selection; reservation on a non-device cart explains why |
| Split payment | "Add another payment method": tested 337 DH = 100 card (slip reference) + 237 cash → two payments recorded, drawer +237 only, receipt "Split payment" |
| Reservation completion | Offers the same five methods |

---

# Arabic display fix ("Bar" disappearing) — test results

Tested on 2026-10-17 in the local app, desktop (1902 px) and mobile (375 px), in Arabic, French and English.

## Root cause

The sidebar ("barre latérale") disappeared in Arabic. `web/src/styles/main.css` had
`[dir='rtl'] .sidebar.-translate-x-full { --tw-translate-x: 100% }`, meant to hide the closed mobile sidebar to the
right. It was not limited to small screens, and its selector (attribute + two classes) outranked Tailwind's
`lg:translate-x-0`, so on desktop the sidebar stayed translated off-screen (measured at x = 1887–2143 px in a
1902 px window) while the content kept its 256 px gap. French and English never matched the rule.

**Fix:** the custom rule is removed; the sidebar uses Tailwind's `rtl:` variant (no added specificity):
`-translate-x-full rtl:translate-x-full lg:translate-x-0 rtl:lg:translate-x-0`.

| Width / language | Closed | Open |
|---|---|---|
| Desktop FR / EN | visible at 0–256 px, content 256–1887 | — |
| Desktop AR | visible at 1631–1887 px, content 0–1631 | — |
| Mobile FR / EN | off-screen left (−256–0) | 0–256 |
| Mobile AR | off-screen right (375–631) | 119–375 |

No horizontal scrolling in any case.

## Mixed Arabic / Latin text

In a right-to-left line the browser reorders Latin words and numbers. Found and fixed:

| Before (Arabic) | After |
|---|---|
| `DH 199,00` | `199,00 DH` — amounts are wrapped in a left-to-right isolate (`formatCurrency`) |
| `1.858,00 DH+`, `2.6%+`, `5+` | `+1.858,00 DH`, `+2.6%`, `+5` — signs moved inside the value (15 screens) |
| `969222 046822 2` (barcode digits) | `2 046822 969222` |
| `mm 25 × 40` | `40 × 25 mm` |
| French month names in Arabic (`17 oct. 2026`) | Arabic month names with Western digits (`17 أكتوبر 2026`) |

Printed documents (receipts, invoices, repair tickets, PDFs) stay in French formatting under an Arabic interface and
have the isolate marks stripped, because the PDF font has no Arabic glyphs.

## Fonts

- Arabic interface: **Noto Sans Arabic** (Arabic + Latin glyphs, self-hosted with `font-display: swap`, loaded per
  Unicode range), then Inter for any missing Latin glyph.
- French / English: Inter, with Noto Sans Arabic as fallback so Arabic words (customer names, "العربية") use the
  proper font.
- Form fields inherit the page font; Arabic inputs use `unicode-bidi: plaintext` so typed emails/codes keep their order.
- Both fonts verified loaded (`document.fonts.check`) in all three languages.

## Also fixed

- Login error box used physical left/right borders (now logical, flips in Arabic).
- Two leftover French texts (reports chart tooltip "Ventes/Profit", store card "Marge").

---

# Direct expenses, phone sticker templates, product categories — test results

Tested on 2026-10-17: 56 server tests pass (new: `expenses.test.ts`, 4 tests), web build passes, translations complete
(FR/EN/AR, 96 API messages covered), and the flows below were run in the local app in English.

## Direct expenses

Before: the dashboard's "Direct expenses" only held repair technician/other costs and there was no way to record
business expenses. Now: an **Expenses** page (sidebar, and "+ Add expense" / "Manage expenses" on the dashboard's
profit card), managers only.

| Check (UI) | Result |
|---|---|
| Empty form / negative amount | "The description is required", "Enter an amount greater than 0" |
| Add 120.50 cash (dashboard link) | Business expenses +120.50, direct expenses +120.50, net profit −120.50, cash drawer −120.50 |
| Edit to 150 by card | Business expenses 180 (30 + 150); drawer back to its starting balance (cash reversed, card does not touch it) |
| Same description/amount/day again | "Duplicate expense?" warning, nothing saved unless confirmed |
| Search "water", category "Rent" | Matching rows only / empty state |
| Delete the card expense | Business expenses back to 30, net profit restored, drawer unchanged; record kept (soft delete) |
| Reports → Expenses (month) | Total, count, average per day, cash part, by category, by method, list, profit statement, PDF and CSV |

Server tests also cover: re-sent form (same idempotency key) creates one expense; drawer history shows each
movement and reversal; cashiers get 403; pagination and date filters.

## Phone stickers use the Label Templates settings

Before: the template stored a size but printing ignored it (fixed 50 × 25 mm), and product labels had their own size
picker. Now one renderer (`web/src/utils/labelRenderer.js`) is used by the Settings preview, the phone sticker dialog,
bulk phone stickers and product labels, reading the saved template: width/height, margins, text and price sizes,
line spacing, barcode height, text above/below the barcode, alignment, roll or A4 sheet, labels per row, rows, gaps,
sheet margins; plus the existing field switches. The server returns every template complete (defaults filled in).

| Check | Result |
|---|---|
| Settings → Phones: format "2 × 40 × 25", text 9 pt, Save | Saved: 40 × 25, 2 per row, gap 2, 9 pt (read back from the API) |
| Phone sticker dialog | "Template: 40 × 25 mm · Roll"; preview page 82 × 25 mm, grid 2 × 40 mm, 9 pt |
| Print 3 copies (output captured) | Same page/grid/fonts as the preview; 3 labels on 2 rows |
| Template set to A4 sheet 3 × 8 (70 × 37), bulk print 2 phones | One 210 × 297 mm page, 3-column grid of 70 × 37 mm, both phones |
| Settings preview | Shows the whole A4 sheet / roll row exactly as printed |

Your phone template was put back to 50 × 25 mm roll after the test.

## Product categories

Categories → "Add category". Built-in categories are shared and cannot be renamed or deleted (they can be hidden when
unused); categories you create belong to your business.

| Check (UI) | Result |
|---|---|
| Create "TEST Smartwatches"; create "test SMARTWATCHES" | Created; second refused: The category "TEST Smartwatches" already exists |
| Product form | New category in the dropdown; "+ New category" created "TEST Quick Cat" and selected it |
| Product in the new category | Shown by the Products category filter and as a POS chip ("TEST Smartwatches 1") with its card |
| Label templates | The new category appears there too |
| Delete "TEST Smartwatches" (1 product) | Refused without a target; "Move and delete" moved the product to "TEST Quick Cat", then deleted |

Server tests also cover: other businesses cannot see or use your categories; renames show on products; sales history
of moved products is kept.

## Not verified / limitations

- The printer itself: the print documents were captured and checked, not printed on a physical label printer.
- Receipt attachments were tested on the server (image/PDF validation) but not through the file dialog.
- Product labels now follow each category's template size; the size picker they had is gone (set the size per
  category in Settings → Label templates).
- Test data left: expense "water" (yours, 30 DH) untouched; TEST category "TEST Quick Cat" with product "TEST Watch Band".

## Repair cost accounting (2026-10-17)

Automated (`npm test -w server`, 57 tests pass), including:

- New Repair with price 500 and Repair Cost 150 → repair profit 350; no Expense created; drawer unchanged until the
  customer pays; after completion and a 500 cash payment the drawer moves by +500 only; dashboard and reports show
  revenue 500, repair costs 150, gross/net profit 350, direct expenses 0.
- A repair linked to a stock device keeps its costs in the repair; the device cost is unchanged and its sale is not
  charged the repair cost again. A legacy (`costsCapitalized`) repair still feeds the device cost.

In the app (local dev data, TEST customer): New Repair "TEST Samsung A54", price 500, Repair Cost 150 → detail shows
profit 350 (70%). Before → after completion and 500 cash payment: direct expenses 30 → 30, Expenses page 30 → 30,
drawer 5,493 → 5,993 (one movement "Paiement réparation", +500), repair profit 724 → 1,074 (+350), revenue
5,613 → 6,113, repair costs 326 → 476, net profit 1,869 → 2,219. The existing repair on a stock device kept its 120 DH
in the device cost after the migration.

## POS pagination and product cards (2026-10-18)

Automated: `POS catalogue paging` (server, 58 tests pass) — 30 products paged 12 per page: every product exactly once,
sellable first then out of stock (each by name), search by name and by barcode and category filter run on the whole
catalogue, category counts cover the whole catalogue.

In the app (local dev data, 40 extra "TEST POS Article" products, 56 in total, 24 per page → 3 pages):
- Pager 1 / 2 / 3 with previous / next, page size 20 / 40 / 60 (remembered per browser; full rows of 5 or 4).
- Adding a product twice → one line ×2; switching to page 3 and back keeps the cart and the ×2 badge.
- Out-of-stock products are listed last, greyed with "Out of stock" and cannot be clicked; catalogue devices stay
  clickable (they are sold by unit).
- Scanning the barcode of a product on page 2 while on page 1 adds it to the cart; searching "Article 39" while on
  page 3 finds it; the Audio chip shows 21 and lists all 21 products.
- Layout: 375 px phone (2 columns, no horizontal scroll), 1024 px laptop (2 columns beside the cart — the cart used to
  be pushed off-screen at this width), 1600 px desktop (4 columns).
- Grid (2026-10-18): exactly 5 cards per row on desktop (≥1536 px: 1536 and 1920 checked), 4 at 1366 px and on
  tablets (768 px), 2 beside the cart at 1024 px and on phones (375 px); every card in a row the same height, prices
  never clipped, no horizontal scroll; adding, paging and the in-cart badge still work.

## Arabic translation review (2026-10-18)

- All 2,134 Arabic strings reviewed against their English meaning in context; 341 corrected (wrong meanings such as
  trade-in shown as "refund", cash in/out shown as "expenses", "Sales of the day" on any period, suppliers we owe
  shown as "debtor suppliers", "identity theft" for support sign-in; Moroccan slang such as "كريدي"; and one term per
  concept — see docs/arabic-glossary.md).
- Hardcoded French found and translated: box/piece counts in the POS cart and box dialog, "Ajouter « … »" in
  searchable dropdowns, clothing colour and kids' size chips (stored values unchanged), placeholder page title; POS
  category chips now show built-in categories in the selected language.
- Checks: 2,174 keys in fr/en/ar, 0 missing, 0 placeholder mismatches; 58 server tests pass; build OK.
- In the app (Arabic): every module crawled for leftover Latin words — only user data, codes and brand names remain;
  POS, transactions table, expense form checked right-to-left (pager arrows mirrored, amounts in DH kept in order).

## Supplier invoices (2026-10-18)

Automated (`server/test/supplierInvoices.test.ts`, 62 tests pass in total):
- 5,000 DH invoice: draft owes 0 and cannot be paid; confirmed → supplier owes 5,000, drawer and expenses unchanged.
  Payments 2,000 cash → 3,000 left (partial, drawer −2,000); 1,000 transfer → 2,000 (drawer unchanged); 2,500 refused;
  2,000 card → 0, Paid; further payment refused. Receiving 4 then the rest, third receive refused; new product created
  once; edits cannot go below paid / received. Statement 5,000 / 2,000 / 1,000 / 2,000 → balance 0; dashboard supplier
  debt 0; suppliers report spent 5,000; voiding the cash payment puts 2,000 back in the drawer and reopens 2,000.
- Filters (supplier, status, payment status, overdue, dates, search), totals, overdue flags, statement period with
  opening balance, delete draft only, cancel.
- Invoice from a purchase order: order payment carried (no new drawer movement), no double debt, stock not received
  twice, order payment then refused, cancelling gives the debt back to the order.

In the app (local data, TEST supplier): invoice FF-2026-0002 created in the form (10 × 300 for an existing product +
20 × 100 for a new product = 5,000 DH), confirmed, paid in the dialog 2,000 cash (remaining 3,000, drawer 5,993 →
3,993), 1,000 transfer (remaining 2,000, drawer unchanged), 2,000 cash with "pay the balance" (remaining 0, Paid,
drawer 1,993, payment button hidden). "Receive all": product stock 2 → 12 and cost 300; new product created with 20
in stock, cost 100, price 199, category Audio; second reception refused. Supplier page, statement, list, dashboard
(supplier debt 0) and suppliers report agree; print and PDF of the invoice and the statement generated.

## Device images (2026-10-18)

Automated: photo per device on create, in lists and on its page; replace deletes the old file; editing other fields
keeps it; removing clears it; deleting the device deletes its file; another business's image URL refused.
In the app: TEST devices with their own photos and one without (placeholder by device type), grid 2 / 3 / 4 per row at
375 / 768 / 1440 px with square images, no horizontal scroll; photo shown in the edit form, removed and saved (file
deleted, other device's photo kept); search and the list view (with thumbnails) still work.

## IMEI identification (2026-10-18)

Automated (`server/test/tac.test.ts`, 66 tests pass in total): Luhn validation; unknown TAC → not found; a saved device
teaches its TAC (brand / model only — no IMEI, storage or price in the answer); another business does not see it;
editing a device updates it; importing a TAC file (Osmocom-style header) maps "iPhone 15 Pro (A2848)" and
"SM-S921B Galaxy S24" to catalogue models with their model numbers; the business's own record wins over the file;
re-importing a source replaces it.
In the app: Add a device → Phone opens with the IMEI focused; wrong check digit refused; a known code fills Samsung
Galaxy S24 Ultra and loads its storage options, with the source shown; only `/tac/99000101` (8 digits) was requested;
changing to an iPhone code with Samsung already filled asked before replacing (kept / used on demand); an unknown code
showed "not identified" and kept the fields; saving that phone by hand made its code recognised. Test devices removed.

## IMEI identification fix (2026-10-19)

Cause: the Osmocom import read the licence banner as the header, then took the contributor column as the model ("Ryd",
"tacdb submission") and dropped rows with an empty contributor (iPhone 4 TAC 01242200 missing). The API therefore
returned meaningless models or nothing. Fixed parser (banner, duplicate `name` columns, `aka`, brand-only rows),
lookup (verified model or brand only), form (brand-only fill, not-found and failure messages with retry); re-imported
22,524 TACs. Automated: 68 tests pass (real export layout included).
In the app, Add a device → Phone with IMEIs built on real TACs of the file: 35915207 → Apple iPhone 7 (storage options
loaded); 35603310 → Samsung Galaxy S10e (from SM-G970U); 35067889 → Samsung Galaxy A51 (from "aka"); 35753906 →
Samsung, model left to choose; 12345678 → "Device model not found in the TAC database"; a failed request → message
and "Try again", which then filled Apple iPhone 7.

## Phone stickers and label settings (2026-10-19)

Causes found:
- Settings → Printing → Label settings (show brand, shorten brand names, abbreviations) are stored as
  `settings.printingSettings`, but the phone sticker (modal and bulk) read `settings.printing`, which does not exist:
  those options were never applied to stickers, nor to the Label Templates preview. One `labelContext()` now builds
  the sticker context for the phone modal, bulk phone stickers, product labels and the settings preview.
- The Label Templates layout panel had no unsaved-changes signal and its number fields only applied on leaving the
  field: a size changed in the preview but not saved kept stickers on the old saved size. Now: live preview while
  typing, an "Unsaved changes" banner with its own Save button, and a confirmation before leaving with unsaved changes.
- Print documents only used named @page rules; a plain `@page { size }` of the template is now emitted too, so
  browsers / drivers without named pages still print at the template size.

Tested in the app (template restored afterwards to 40 × 25 mm, barcode 7 mm, price on, brand hidden):
- Settings → Label Templates: 58 × 40 → saved; 40 × 30 + barcode 10 mm + price off → preview 40 × 30 mm, barcode
  37.8 px (10 mm), no price, "Unsaved changes" shown; saved from the banner → server 40 × 30 / 10 mm / price off.
- Phones → sticker of "Apple iPhone 18": preview "Template: 40 × 30 mm", frame 40 × 30 mm, barcode 10 mm, no price;
  Print document `@page { size: 40mm 30mm }` + named page, label 151 × 113 px (40 × 30 mm), `.bars` 10 mm, no price.
- With "Hide the brand" off, the sticker name followed Printing → Label settings ("Shorten brand names"): "IP 18".

## Settings → Printing → Label settings on phone stickers (2026-10-19)

Cause: device names on stickers were controlled twice — the Label settings card (Full name / Without the manufacturer
/ Abbreviated / Model only) and a "Hide the brand" switch in Label Templates, which overrode the card whenever it was
on (it was on: every option printed the model only). The card's preview also used its own copy of the naming rules,
with a different brand list. Now the card is the only control: one `deviceDisplayName()` drives the card's preview,
the phone sticker modal and bulk sticker printing; the template switch is removed (Label Templates links to the card);
the Settings sidebar entry that opens Label Templates is named "Label templates".

Tested through the card (select + Save), then the sticker of "Apple iPhone 18":
Full name → "Apple iPhone 18" (card preview "Apple iPhone 15 Pro Max"); Abbreviated → "IP 18" ("IP 15 Pro Max");
Model only → "18" ("15 Pro Max"); Without the manufacturer → "iPhone 18" ("iPhone 15 Pro Max"). Bulk "Print stickers"
printed "iPhone 18" at 40 × 25 mm. The saved choice was left on "Without the manufacturer", as before.

## Barcode label preview in Arabic (2026-10-19)

Causes: in right-to-left pages the scaled preview frame (transform-origin top left) was anchored on the right and grew
out of its box, so only the left part of the sticker was visible; the "Serial number" label was in the monospace font
(no Arabic glyphs: letters shown disconnected); Latin specs on cards and in the modal were reordered ("GB · Pink 512").
Fix: the preview area is laid out left to right (a physical rendering); the sticker document is left to right with
per-line automatic direction and Arabic-capable fonts; the serial label uses the UI font and only the number is
monospace and isolated; specs and codes are isolated.
Tested (TEST Pixel 9, template 40 × 25 mm): Arabic — frame inside the preview box, all lines visible ("Samsung TEST
Pixel 9", "128GB - Black · درجة A", "2.600 DH", barcode, code, store name), "الرقم التسلسلي" joined; printed document
`@page 40mm 25mm`, label 151 × 94 px, same lines; French and English — preview inside its box, texts unchanged.

## Abbreviated device names on stickers (2026-10-19)

Data flow checked: the saved preference (tenant `printing`: shortenBrandNames = Abbreviated) reached the sticker.
Cause: the naming rules matched names case-sensitively — the catalogue spells the brand "OPPO", the rule is "Oppo" —
so no rule applied and the full name was printed; "Without the manufacturer" / "Model only" also removed only a fixed
list of brands. Fix (one function for the Settings preview, sticker preview, print and bulk print): brands and series
match as whole leading words regardless of case, longest rule first; manufacturer removal uses the device's own brand.

Tested through Settings → Printing (select + Save), then Phones → sticker of OPPO Reno 15 Pro (and bulk print with
Apple iPhone 18):
| Option | Preview | Printed | Bulk print |
|---|---|---|---|
| Abbreviated | OP Reno 15 Pro | OP Reno 15 Pro | OP Reno 15 Pro · IP 18 |
| Full name | OPPO Reno 15 Pro | OPPO Reno 15 Pro | OPPO Reno 15 Pro · Apple iPhone 18 |
| Without the manufacturer | Reno 15 Pro | Reno 15 Pro | Reno 15 Pro · iPhone 18 |
| Model only | Reno 15 Pro | Reno 15 Pro | Reno 15 Pro · 18 |
Other lines unchanged (256 GB - Aurora White · Grade A+ · 100%, 3,400 DH, IMEI digits, 40 × 25 mm). Setting left on
Abbreviated.

## Barcode scanning (2026-10-19)

Tested on the local app in the built-in browser and through the API. The test records were removed afterwards, except the `TESTBOX0001` box-barcode link.

| Check | Result |
|---|---|
| Known product `2002987930002` (TEST Chargeur 20W, 129.00 DH, 10 in stock) | Scan to identify shows the price and stock. "Add to cart" gives a cart line with qty 1. Scanning again gives one line with qty 2 at 258.00 DH (no duplicate line). Server stock stays 10 until checkout. |
| Phone IMEI `990003047946245` | Identified as OPPO Reno 15 Pro, 3,400 DH, in stock, without opening Devices. "Sell" adds the unique item. |
| Unknown code `4006381333931` | "Code not known" with Create a product / Add a device. The product form is prefilled and warns if the barcode belongs to another product. |
| Box barcode `TESTBOX0001` | First scan: "new". The device saved with it was a Samsung Galaxy S24 Ultra 256 GB, identified by TAC. Next scan: "Known box barcode". "Add a device of this model" prefills brand, model and storage, with no price. |
| Camera decoding | ZXing decoded a rendered EAN-13 image of `2002987930002` (format EAN_13). The pane itself has no camera. |
| Camera refused | Message + Retry; the manual field still works. |
| Server tests | `scan.test.ts`: lookups by barcode, SKU, IMEI, ref and box barcode; TAC; unknown code; tenant isolation; manual link; checkout stock 5 → 3 exact. Full suite: 70/70. |
| Supplier invoices (fixed during this run) | A payment dated today kept noon UTC, so it sorted after later payments in the morning. It now keeps the time it was recorded, and the statement orders by day, with purchases before payments. |

## Phone scanner (2026-10-19)

Tested on the local app. The phone was the built-in browser at 375 × 812, next to the POS in another tab, because no real smartphone was available to the session. The camera is blocked in that browser, so codes were entered in the phone page's field. That goes through the same path as a camera read.

| Check | Result |
|---|---|
| Pairing | Phone button → QR code + link `http://192.168.1.13:5173/scanner#t=…` (LAN address, not localhost), with the HTTPS warning on http. Phone page: "Connected to Demo · Electro36"; the token was removed from the address bar; the link survives a reload. |
| POS | Phone scan of `2002987930002` (TEST Chargeur 20W) shows 129.00 DH and stock 10; the POS cart gets 1 line. A second scan gives the same line with qty 2 (258.00 DH). "Look up only" adds nothing. Phone IMEI `990003047946245` → OPPO / Reno 15 Pro, 256 GB · Aurora White, 3,400.00 DH, stock 1 → added as its unique item. |
| Unknown code `4006381333931` | Phone: "Code not known…". POS: "No product found" + *Create a product* link (`/app/products/new?barcode=…`, new tab). |
| Products / product form / dashboard | Opens the product's edit page / fills the barcode field / opens "Scan to identify". |
| `/app/scan` signed in on the phone | Result with *Add to cart* → POS with the item (qty 1, 129.00 DH). |
| Reload of the computer | Pairing kept, no scan replayed. |
| Server restart | Found and fixed: a restarted server numbered scans from 1 again, so the first scan after a restart was skipped. A boot id now resets the screen's cursor. |
| Two screens, same user | Found and fixed: a second screen's pairing revoked the first. Each screen now keeps its own pairing. |
| Disconnect | On the computer → the phone shows "This scanner link is no longer valid". |
| Arabic | Phone page in RTL, labels from the glossary, prices / IMEI kept LTR, no horizontal scroll. The header's Phone button is hidden on phone screens (it was pushing the header past 375 px). |
| HTTPS mode | `vite --mode phone` on a spare port: HTTPS, network URL `https://192.168.1.13:…`, `/scanner` 200, API proxied (401 without token). |
| Server tests | `scanner.test.ts`: token hashed; scans reach the screen by long poll; selling price only (no cost); token refused everywhere else; other users get 404; per-screen replacement, disconnect from both sides, expiry; restart replay. Full suite 71/71. |
| Not verified | A real phone camera (Chrome Android / Safari iOS) on `npm run dev:phone`: it needs the user's phone on the shop Wi-Fi. |

## CaissePro Scanner app and desktop clean-up (2026-10-20)

The user's dev server was running `npm run dev:phone` (self-signed HTTPS), which the built-in browser refuses. Tests ran on a temporary http Vite on port 5180 with the same API; it was stopped afterwards and `.claude/launch.json` was restored.

| Check | Result |
|---|---|
| Desktop (1024 px, lg) | Sidebar: Dashboard, Point of Sale, Accessories… (no *Scan Product*). Header: Search, Phone, language, printer (no *Scan*). POS camera button still there. |
| Phone (375 px) | Sidebar shows *Scan Product* → `/scanner`; header keeps the scan button; no horizontal scroll. |
| `/scanner?source=home-screen` | Title "CaissePro Scanner"; manifest linked (name, `start_url`, scope `/scanner`, standalone); icons 200 `image/png`; apple-touch-icon and `apple-mobile-web-app-*` tags. Leaving the page removes the manifest. |
| Signed in | "Signed in: youness". `2002987930002` → TEST Chargeur 20W, 129.00 DH, stock 10. *Add to cart* → POS cart 1 × 129.00 DH (cart cleared afterwards). |
| Signed out | Sign-in screen → *Sign in* → `/login?redirect=/scanner` → local test account → back on the scanner, signed in. |
| QR pairing | Token kept in localStorage: reopening `/scanner?source=home-screen` is still paired. Pairing link opened on an already open scanner → new pairing used (fixed: it was ignored). *Disconnect* → back to the account. |
| Arabic | RTL header and texts, no horizontal scroll. |
| Production serving | `/scanner` 200 html, `.webmanifest` `application/manifest+json`, `scanner-sw.js` JavaScript, icons PNG. |
| Not verified here | Service worker registration (the built-in browser refuses it; the script is served and parses) and install / home-screen launch on a real Android or iPhone. |
| Server tests | 71/71 |

## Several phones, paired once (2026-10-20)

Tested on a temporary http Vite (port 5180, same API; stopped afterwards, `.claude/launch.json` restored). Your dev server runs `dev:phone` (self-signed HTTPS), which the built-in browser refuses.

- **Computer:** `localhost:5180` at desktop size.
- **Phone A:** `[::1]:5180` at 375 px. It is a different origin, so it has its own storage, like a separate phone.
- **Phone B:** a third tab.
- **Second computer "TEST Réserve":** listened to by a script.

| Check | Result |
|---|---|
| Computer | Registers by itself ("Windows · youness", renamed to "TEST Caisse PC"); green dot. |
| Phone A authorized | QR link `/scanner#p=…`; the phone shows "Téléphone autorisé…"; its key is kept; the code is removed from the address. Default target: the computer that showed the QR code. |
| Phone A scans | 2 × `2002987930002` → "Envoyé à « TEST Caisse PC »", POS cart: TEST Chargeur 20W × 2 (258.00 DH). |
| Reopen without QR | `/scanner?source=home-screen` → reconnected, same name and target, ready to scan. |
| Phone B → TEST Réserve | IMEI `990003047946245` → "Sent to "TEST Réserve"". Only TEST Réserve received it; the POS cart stayed at charger × 2. |
| Manage | Rename on the computer ("TEST iPhone caisse") is shown on the phone. Look-up-only target adds nothing to the cart; switching back works. |
| Revoke phone B (CaissePro also signed in on that browser) | It disappears from the list; the phone says "This phone's access was revoked" and carries on with the account. |
| Revoke phone A (not signed in) | Sign-in screen with "L'accès de ce téléphone a été retiré" + how to authorize it again. |
| Found and fixed | Two computers had the same default name (this test browser and your own on 5173): duplicates now get " 2". The computer's dot stayed orange until its first 25 s wait: it now turns green on registration. |
| Server tests | `scanner.test.ts`: one-time QR codes (reuse, 10-minute expiry, invalid); key hashed; two phones → two computers independently; computer not connected → not sent, nothing queued; switch computer, but never to another business's; rename / revoke; expiry; deactivated user; key refused elsewhere; costs never sent; cashier vs manager. Full suite 72/72. |
| Cleanup | TEST computers deleted; both TEST phones revoked; test cart emptied. |
| Not verified | Real phones (camera, home-screen app) on the shop Wi-Fi. |
