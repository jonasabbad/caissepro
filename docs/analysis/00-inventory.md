# Systeme Maroc: inventory of pages, screens, modules and APIs

Captured 2026-10-16 from the public Vue 3 + Vite bundle (79 routes, 188 JS chunks, ~3.9 MB) and a live session.
Account used: `ynsabbad@gmail.com`. Role `admin`, activity `phone_seller`, `enabledModules: ["core"]`, status `trial` (expires 2026-10-23), plan empty, 1 store ("Electro36"), no data.

Access legend: ✅ reachable with this account · 🔒 code exists but this account can't open it (role/plan/module) · ⛔ super-admin only, not verifiable

## 1. Stack observed

- SPA: Vue 3 (Composition API, `<script setup>`), vue-router, Pinia (`auth`, `cart`, `subscription` stores), vue-i18n (`fr` default, `ar` with RTL), TanStack Vue Query, Tailwind CSS, Heroicons (outline 24), ApexCharts (`vue3-apexcharts`), a PWA service worker (`/sw.js`, update check every 5 min plus on tab focus, "Nouvelle version disponible / Actualiser" banner).
- API: REST under `/api/v1`, JSON envelope `{success, data, error?}`, Bearer JWT (`localStorage.auth_tokens`), `POST /auth/refresh`, 401 → `/login`.
- Multi-tenant (tenantId, stores, `currentStoreId`), roles `admin | manager | cashier | super_admin`, plans `PROFESSIONNEL | PREMIUM | LIFETIME`, an activity type that drives labels and modules.

## 2. Public site (no auth)

| Route | Screen | Access |
|---|---|---|
| `/` , `/ar` | Landing page (FR / AR) | ✅ |
| `/logiciel-caisse-telephone` | Solution page: phone stores | ✅ |
| `/logiciel-location-voiture` | Solution page: car rental | ✅ |
| `/commander` | Public order form (`GET /public/catalog`, `POST /public/orders`) | ✅ |
| `/audit-visibilite` | Visibility audit page | ✅ |
| `/blog`, `/blog/retrouver-vente-iphone-imei`, `/blog/marge-reelle-magasin-telephone` | Blog index + 2 articles | ✅ |
| `/careers`, `/privacy`, `/terms` | Static pages | ✅ |
| `/account/delete` | Account deletion request (`DELETE /auth/me`) | ✅ (destructive, not exercised) |
| `/login` | Login | ✅ |
| `/sso/terrain` | SSO from a partner app (`POST /auth/sso/terrain`) | ⛔ no partner token |
| `/:pathMatch(.*)*` | 404 | ✅ |

## 3. Tenant app (`/app`, MainLayout)

Sidebar as seen live for this account (labels follow the activity type: products = "Accessoires", sold units = "Téléphones"):

| # | Sidebar label | Route(s) | Access |
|---|---|---|---|
| 1 | Tableau de bord | `dashboard` | ✅ |
| 2 | Caisse | `pos` | ✅ |
| – | Fond de Caisse | `cash-drawer` | 🔒 hidden for this account (module-gated) |
| 3 | Accessoires | `products`, `products/new`, `products/:id/edit`, `products/receive` | ✅ |
| 4 | Téléphones | `sold-units`, `sold-units/new` (device-type picker), `sold-units/form`, `sold-units/:id/edit` | ✅ |
| 5 | Mouvements | `inventory-movements` | ✅ |
| 6 | Clients | `customers`, `customers/:id`, `customers/:id/edit` | ✅ |
| 7 | Fournisseurs | `suppliers`, `suppliers/:id`, `suppliers/:id/edit` | ✅ |
| 8 | Commandes | `supplier-orders`, `supplier-orders/new`, `supplier-orders/:id` | ✅ |
| 9 | Transactions | `transactions`, `transactions/:id` | ✅ |
| 10 | Factures | `invoices`, `invoices/archived`, `invoices/new`, `invoices/:id/edit`, `invoices/:id/preview` | ✅ |
| 11 | Réparations | `repairs`, `repairs/new`, `repairs/:id`, `repairs/:id/edit` | ✅ |
| 12 | Dettes | `debts` | ✅ |
| 13 | Rapports | `reports` | ✅ |
| 14 | Vendeurs | `employees` | ✅ |
| – | Utilisateurs | `users` | 🔒 needs admin + paid plan (PROFESSIONNEL/PREMIUM/LIFETIME) |
| – | Paramètres | `settings`, `settings/label-templates` | ✅ (via the user menu) |
| – | Abonnement | `subscription`, `subscription/manage`, `subscription/success`, `subscription/error` | ✅ (payment gateway disabled on the platform) |
| – | Rendez-vous, Services, Tables, Cuisine, Menu | nav entries only; **no routes exist** | ⛔ not implemented in the original |

Shell features: global search (⌘K; see `global-search-spec.md`), keyboard shortcuts (`?`, `g h/p/c/t`), FR/AR switch (RTL), trial badge with days left, lock screen (`/auth/lock`, `/auth/unlock`; seller mode limits navigation), announcements banner, paper-roll order (`/paper-orders`), impersonation banner, cashier-only layout (no header or sidebar).

## 4. Super-admin (`/app/superadmin`) ⛔

tenants (list/new/edit, map of locations, stores, plan assignment, status, password reset, impersonation), transactions monitoring, payments, wallets/transfers, expenses, categories (with seeding by activity type), subscription plans, tenant pricing, deletion requests, orders (public + paper), sales/equipment, announcements, platform settings. **Can't be verified with this account.** The only source is the client code.

## 5. API surface (221 endpoints the client calls)

Grouped by module (`:p` = path param):

- **auth**: `POST login, logout, refresh, lock, unlock, impersonation/stop, sso/terrain` · `GET/DELETE me`
- **dashboard**: `GET kpis, sales-trend, top-products, low-stock, payment-breakdown, store-breakdown`
- **checkout (POS)**: `POST /checkout, /checkout/preview, /checkout/return, /checkout/trade-in`
- **products**: CRUD, `GET barcode/:p, low-stock`, `POST bulk, :p/adjust-stock, :p/archive` · `GET /accessory-catalog`
- **categories**: `GET /categories, /categories/:p` (admin CRUD is super-admin)
- **sold units (phones)**: CRUD, `GET available, inventory, reserved, sold, filter-options`, `POST :p/mark-sold, :p/mark-returned, :p/complete-reservation`
- **device catalog**: `GET /phone-seller/catalog/{all,brands,models,device,search}`
- **reservation refunds**: `GET list, pending, summary, :p`, `POST :p/record-payment`
- **inventory movements**: `GET /inventory-movements`
- **customers**: CRUD, `GET/POST :p/payments`, `GET :p/transactions`
- **suppliers**: CRUD, `GET :p/orders`
- **supplier orders**: CRUD, `POST submit, receive, cancel, payment, convert-all-units`, `POST/PATCH items/:p/(convert-units|units)`
- **transactions**: `GET list, :p, :p/receipt, export, sold-items`, `POST :p/cancel, :p/payment`, `PATCH :p/correct`
- **invoices**: `GET list, :p, quarterly-totals`, `POST standalone, tva/calculate-period, ir/calculate-period`, `PATCH standalone/:p, :p/archive, :p/unarchive`
- **repairs**: CRUD, `PATCH :p/status`, `POST/DELETE :p/expenses`, `GET by-unit/:p` · `GET/POST /repairers`
- **reports**: `GET /reports, /reports/export`
- **employees**: CRUD, `GET sellable, linkable-users`, `POST/DELETE :p/link-user`
- **users**: CRUD
- **settings**: `GET tenant, team` · `PATCH business-info, legal-status, preferences, printing, profile, store` · `POST change-password`
- **label templates**: `GET list, :p`, `PUT :p`, `POST :p/reset`, sold-unit variants (`GET resolve, variants`, `PUT variants`, `DELETE variants/:p`)
- **stores / cash drawer**: `GET /stores, /stores/active` · `GET /stores/:p/caisse, caisse/balance` · `POST caisse/cash-in, cash-out, adjust`
- **subscriptions**: `GET plans, status, usage, payments, calculate-price, payments/:p/verify` · `POST payment-token, lifetime-payment`
- **misc**: `GET /tenant/announcements/active` · `GET/POST /paper-orders(/mine)` · `GET /public/catalog`, `POST /public/orders`
- **super-admin / admin**: ~60 endpoints under `/superadmin/*` and `/admin/*` (see §4)

## 6. What can and can't be verified

- **Client behavior** (screens, forms, validation, calculations done in the browser): fully readable from the bundle.
- **Server behavior** (search matching, stock/caisse side effects, invoice numbering, TVA/IR calculation, report aggregation, permission checks): only seen through the responses. Verifying it needs test records in this account.
- **No access**: super-admin, users (plan-gated), cash drawer (module-gated), SSO, real payments.
