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
