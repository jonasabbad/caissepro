# Global Search: behavior spec (Systeme Maroc `/app/*`)

Source: static analysis of the public Vue 3 / Vite bundle (`MainLayout-*.js` → component `GlobalSearch`, plus the `products`, `customers`, `soldUnits` and `auth` chunks), checked against a live signed-in session on 2026-10-16.
This file describes **behavior only**. Rebuild it with your own code. Don't copy the bundle.

Legend: **[code]** read from the bundle · **[live]** seen in the running app · **[unverified]** inferred, needs test data

---

## 1. Where it lives

- It's rendered in the sticky app header (`sticky top-0 z-30 bg-white shadow-sm`, height 64px), centered in a `flex-1 flex justify-center` slot. **[code]**
- The header, and so the search, **is not rendered** when the current user has exactly one role and that role is `CASHIER`. **[code]**
- It shows on every route that uses `MainLayout` (all `/app/*` pages). **[code]**

## 2. Trigger button

- A pill button: magnifying-glass icon (16px), the text `Rechercher...`, and a `kbd` showing `⌘ K`. **[code][live]**
- Below the `sm` breakpoint, the text and the kbd are hidden and only the icon shows. **[code]**
- The kbd always shows `⌘`, even on Windows. That's a quirk; keep it for parity. **[code]**
- Click opens the dialog. **[code][live]**

## 3. Opening and closing

| Action | Effect |
|---|---|
| Click the trigger | open |
| `Ctrl+K` or `⌘+K` while closed | `preventDefault`, open. The listener is on `document`, so it works from any focus, including inside other inputs. |
| `Ctrl/⌘+K` while open | nothing. It doesn't toggle. |
| `Escape` while open | close |
| Click the backdrop (self only, not the panel) | close |
| Click the ✕ button | close |
| Choose a result or a quick link | navigate, close, clear the query |

On every open: query = `""`, results = `[]`, selected index = 0, and the input gets focus on the next tick. **[code][live]**

## 4. Dialog layout

- It's teleported to `<body>`. Overlay: `fixed inset-0 bg-black/50 backdrop-blur-sm z-50`, panel aligned to the top with `pt-20 p-4`. **[code][live]**
- Panel: white, `rounded-2xl shadow-2xl`, `max-w-xl`, full width. **[code]**
- Input row: search icon (20px) + borderless input, `text-lg`, placeholder `Rechercher par IMEI, appareil, produit, client...`, plus the ✕ button. **[code][live]**
- Body: `max-h-96 overflow-y-auto`. **[code]**
- Footer, always visible: `↑↓ Naviguer`, `↵ Ouvrir`, and on the right `Esc Fermer`. **[code][live]**
- No open/close animation on this dialog. The separate `?` shortcuts dialog does fade. **[code]**

## 5. Body states (evaluated in this order)

1. **`query.length < 2`** → section header "NAVIGATION RAPIDE" and 5 fixed links: **[code][live]**
   | Label | Route |
   |---|---|
   | Tableau de bord | `/app/dashboard` |
   | Nouvelle vente | `/app/pos` |
   | Produits | `/app/products` |
   | Clients | `/app/customers` |
   | Transactions | `/app/transactions` |
2. **`results.length > 0`** → result list (§7).
3. **`query.length >= 2 && !loading`** → `Aucun résultat pour "<query>"`. **[code][live]**
4. **`loading`** → centered spinner (`animate-spin`, 24px, black bottom border). **[code]**

Parity quirks that come from this order:
- During the 300 ms debounce, before `loading` turns on, state 3 ("Aucun résultat") **flashes** for a new query with no previous results. **[code]**
- While a new query is loading, **the previous query's results stay on screen** (state 2 wins over the spinner). **[code]**
- `length` is the raw length. Whitespace isn't trimmed, so `"  "` triggers a search. **[code]**

## 6. Query pipeline

```
on query change:
  clear pending timer
  if query.length < 2: results = []; stop
  timer = 300ms → {
    loading = true
    parallel (all-or-nothing):
      GET /api/v1/products?query=Q&page=1&limit=5
      GET /api/v1/customers?query=Q&page=1&limit=5
      GET /api/v1/phone-seller/sold-units?query=Q&page=1&limit=5
    results = [...units, ...products, ...customers]   // display order
    selected = 0
    on error: console.error("Search error:", e); results stay as they were
    finally loading = false
  }
```

- Debounce: 300 ms, trailing. **[code]** In the live run, typing `a` then `pp` sent exactly one batch, for `app`. **[live]**
- Up to 15 results (5 per type). **[code]**
- No cancellation of in-flight requests and no stale-response guard, so a slow earlier response can overwrite a newer one. This is a race; decide whether you want parity here or a fix. **[code]**
- With `Promise.all`, one failing endpoint drops all three result sets. **[code]**
- Display order is **units → products → customers**, even though the requests are made in products/customers/units order. **[code]**

### HTTP client

- axios instance, `baseURL: /api/v1`, `withCredentials: true`, `Content-Type: application/json; charset=utf-8`. **[code]**
- Header `Authorization: Bearer <accessToken>`. The token is kept in `localStorage["auth_tokens"]`. **[code][live]**
- Response interceptors: **[code]**
  - `401` → clear auth and do a hard redirect to `/login`.
  - `403` with `error: "SUBSCRIPTION_BLOCKED"` → set the subscription store to blocked.
  - `403` with `error: "SELLER_MODE"` → mark the user `sellerMode`, show the locked notice.
  - Response header `x-cash-drawer: open` → pop the cash drawer if one is paired. Not relevant to search.
- Params set to `undefined` (`categoryId`, `status`, `deviceType`, `sold`, …) are left out of the URL. **[code][live]**

### Response shapes [live]

```json
GET /products        → {"success":true,"data":{"products":[…],"meta":{"total":0,"page":"1","limit":"5","totalPages":0}}}
GET /customers       → {"success":true,"data":{"customers":[…],"meta":{…}}}
GET /phone-seller/sold-units → {"success":true,"data":{"units":[…],"meta":{…}}}
```

Note that `meta.page` and `meta.limit` come back as **strings**.

## 7. Result rows

Row: 32px rounded icon tile (colored by type), name (`font-medium truncate`), subtitle (`text-sm text-gray-500 truncate`), and a type label on the right (`text-xs text-gray-400 capitalize`). **[code]**

| type | tile bg / fg | Label | name | subtitle | href on select |
|---|---|---|---|---|---|
| `unit` | purple-100 / purple-600 | Appareil | `${brand} ${model}` | `[imei ‖ serialNumber ‖ ref, soldAt ? "Vendu" : "En stock"]` falsy items removed, joined with `" · "` | `/app/sold-units?q=${encodeURIComponent(imei‖serialNumber‖ref)}&stock=all` |
| `product` | blue-100 / blue-600 | Produit | `name` | `sku` | `/app/products/${id}/edit` |
| `customer` | green-100 / green-600 | Client | `${firstName} ${lastName}` | `phone` | `/app/customers/${id}` |

Edge cases to reproduce (or fix on purpose): **[code]**
- A unit with no imei, serial or ref → href contains `q=undefined`.
- A customer with a null `lastName` → shows `"John null"`.
- Row key is `${type}-${id}`.

Destination behavior: `SoldUnitsView` watches `route.query` (immediate). If `q` is set, it pre-fills its search box. If `stock` is `all`, `sold` or `inStock`, it sets the stock filter (default `inStock`). That's why the link passes `stock=all`, so sold units also show up. **[code]**

## 8. Keyboard navigation (while open)

A single `keydown` listener on `document`, added on mount and removed on unmount. **[code]**

| Key | Behavior |
|---|---|
| `ArrowDown` | `preventDefault`. `selected = min(selected+1, max)`, where `max = results.length-1` if `query.length ≥ 2`, else `4` (quick links). |
| `ArrowUp` | `preventDefault`. `selected = max(selected-1, 0)` |
| `Enter` | `preventDefault`. If `query.length ≥ 2` and `results[selected]` exists, open it. Otherwise open `quickLinks[selected]` if it exists. |
| `Escape` | close |

Quirks: **[code]**
- With `query ≥ 2` and zero results, ArrowDown sets `selected = -1`. The next ArrowUp brings it back to 0.
- Going from fewer than 2 chars to 2 or more keeps the old `selected` until results arrive. Enter in that window opens nothing, or a stale result.
- Mouse hover doesn't move the selection. Only click does.
- The selected row isn't scrolled into view.
- `Enter` with `query ≥ 2` but no matching result **falls back to the quick link** at that index. For example, typing `zz` and pressing Enter before results load goes to `/app/dashboard`.
- Selected style: `bg-primary-50 text-primary-700`. Others: `hover:bg-gray-50`.

## 9. Related: the keyboard-shortcuts component (same layout)

Not part of search, but users see it together with ⌘K. **[code]**
- `?` toggles a "Raccourcis clavier" dialog. `Esc` closes it. Ignored while typing in an input or textarea.
- `g` then within 1 s `h` / `p` / `c` / `t` → `/app/dashboard`, `/app/products`, `/app/pos`, `/app/transactions`.

## 10. Server-side matching: still unverified

The test tenant has no products, customers or units, so every query returned empty. These need checking with seeded data before you can claim 100% parity:
- Which fields each endpoint matches (likely: units → IMEI/serial/ref/brand/model; products → name/SKU/barcode; customers → name/phone/email).
- Case and accent sensitivity, partial vs. prefix match, and whether IMEIs typed with dashes match. The client formats a 15-digit IMEI as `xx-xxxxxx-xxxxxx-x` for display and runs a Luhn check.
- Result ordering within each type.
- Tenant/location scoping and role-based filtering.

Suggested check: add 1–2 test records of each type in this account, then run queries for full value, prefix, mid-string, mixed case, accents, and IMEI with and without dashes.

## 11. Parity checklist

- [ ] Hidden for cashier-only users
- [ ] Trigger: icon-only below `sm`, `⌘ K` kbd everywhere
- [ ] Ctrl/⌘+K opens (doesn't toggle), document-level
- [ ] State reset and autofocus on open
- [ ] 5 quick links below 2 chars
- [ ] 300 ms trailing debounce, 2-char minimum, no trim
- [ ] 3 parallel requests, limit 5, all-or-nothing on error
- [ ] Order: units → products → customers
- [ ] Row formats, colors, labels, hrefs exactly as in §7
- [ ] State precedence as in §5 (including the "no results" flash and stale results while loading)
- [ ] Keyboard behavior and quirks as in §8
- [ ] Selecting navigates, closes and clears the query
- [ ] 401 → `/login`, 403 subscription and seller-mode handling
- [ ] `/app/sold-units` reads `q` and `stock` from the URL
- [ ] Server matching rules (§10) verified with seeded data
