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
