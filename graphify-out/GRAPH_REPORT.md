# Graph Report - caissepro  (2026-10-19)

## Corpus Check
- 304 files · ~201,101 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 1, .example 1, .prisma 1)

## Summary
- 2863 nodes · 6106 edges · 180 communities (110 shown, 70 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 207 edges (avg confidence: 0.85)
- Token cost: 91,977 input · 0 output

## Community Hubs (Navigation)
- POS Checkout View
- Product Form
- Reports View
- Label Templates Editor
- Accounting & IMEI Docs
- Invoices View
- Repair Detail View
- Profit & Expense Reporting
- Fastify Routes & Roles
- Main Layout & Bank Transfer
- Sold Units List
- Sales & Supplier Orders API
- Repair Form
- Server Test Suite
- Auth & Error Helpers
- Repairs List & Sales Chart
- Products List & Barcode Scanner
- Router, i18n & Shared Forms
- Prisma Serialization & Uploads
- Settings View
- Cash Drawer Ledger (Server)
- TAC/IMEI Lookup & Import
- Dashboard
- Employees
- Announcements & Paper Orders
- Sold Unit Labels & IMEI Validation
- Receipts & Repair Printing
- Web Dependencies
- Customers List
- Cash Drawer View
- Sold Unit Form
- Supplier Invoice Detail
- Supplier Order Detail
- Supplier Invoices & Suppliers API
- Supplier Invoice Form
- Transaction Detail
- Product Labels Modal
- Customer Detail
- Users Management
- Server Bootstrap & Catalog
- Device Catalog Select
- Expenses View
- New Supplier Order
- Transactions List
- Barcode & Label Renderer
- Invoice PDF Preview
- Categories & API Errors
- Debts View
- Server Dependencies & Seed
- Global Search & Customer Edit
- Invoice Numbering (Server)
- Inventory Movements
- Cash Drawer Hardware Service
- Standalone Invoice Form
- Expense Form Modal
- Login & Language Switcher
- Trade-In Modal
- Receive Stock & Scan Input
- Repairs API
- Product Details Modal
- Searchable Select
- Web Package Dependencies
- Supplier Orders List
- Stock Adjust Modal
- Root Package Config
- Product & Device Images
- Pinia Stores & Activity
- Supplier Statement & Toast
- Settings Save Actions
- Suppliers List
- Supplier Invoices API
- Repair Expenses & Shared i18n t()
- Auth & Checkout API Client
- Archived Invoices
- Label Preview
- Supplier Document Printing
- Checkout Unit Cart Actions
- Public Repair Tracking
- App Shell & RTL
- Label Templates API
- Subscription Banner
- Server Entry & Data Migrations
- TypeScript Config
- Product Image Upload
- Amount In Words
- Pack Choice Modal
- Checkout Customer & Pack
- NPM Scripts
- Device Unit Item Form
- Date Range Picker
- Label Templates Client
- Unlock Modal
- i18n Loader
- QZ Printer Service
- Supplier Order Conversion
- Server Error Translation
- Checkout Payment & Returns
- Reference Data Labels
- Server Package Dependencies
- Server Messages Check Script
- Return Modal
- Pagination
- Tailwind Theme
- Confirm Modal
- Expenses Client
- Device Colors
- Repair Form Mutations
- Products Client
- Report PDF Export
- Device Catalog Client
- Repairs Client
- Supplier Order Status
- Customer Create
- Favicon
- Reservation Refunds Client
- Transactions Client
- Customer Refund
- Report Period
- Repair Update

## God Nodes (most connected - your core abstractions)
1. `t()` - 141 edges
2. `vue` - 84 edges
3. `r2()` - 73 edges
4. `@heroicons/vue` - 73 edges
5. `vue-i18n` - 72 edges
6. `num()` - 66 edges
7. `ok()` - 57 edges
8. `badRequest()` - 55 edges
9. `notFound()` - 54 edges
10. `authed()` - 54 edges

## Surprising Connections (you probably didn't know these)
- `Global Search behavior spec (docs/analysis)` --semantically_similar_to--> `Global Search behavior spec (root copy)`  [INFERRED] [semantically similar]
  docs/analysis/global-search-spec.md → global-search-spec.md
- `web/index.html SPA entry (mounts /src/main.js)` --conceptually_related_to--> `Colour design tokens (--c-brand, --c-neutral, --c-ink...) mapped to Tailwind`  [AMBIGUOUS]
  web/index.html → docs/theme.md
- `series` --calls--> `t()`  [INFERRED]
  web/src/components/dashboard/SalesChart.vue → web/src/components/ui/DateRangePicker.vue
- `groups` --calls--> `t()`  [INFERRED]
  web/src/components/layout/KeyboardShortcuts.vue → web/src/components/ui/DateRangePicker.vue
- `typeLabel` --calls--> `t()`  [INFERRED]
  web/src/components/layout/PaperOrderModal.vue → web/src/components/ui/DateRangePicker.vue

## Import Cycles
- 3-file cycle: `web/src/api/auth.js -> web/src/api/http.js -> web/src/stores/auth.js -> web/src/api/auth.js`
- 3-file cycle: `web/src/api/http.js -> web/src/stores/auth.js -> web/src/api/misc.js -> web/src/api/http.js`

## Hyperedges (group relationships)
- **No-double-counting accounting rules across repairs, expenses, supplier invoices and drawer** — docs_accounting_repair_costs_not_expenses, docs_accounting_business_expenses, docs_accounting_supplier_invoices, docs_accounting_cash_drawer_movements, docs_accounting_whole_business_profit [EXTRACTED 1.00]
- **IMEI identification flow (Luhn, TAC lookup, sources, form fill, catalogue)** — docs_imei_identification_luhn_check, docs_imei_identification_tac_lookup, docs_imei_identification_business_own_devices, docs_imei_identification_osmocom_tac_database, docs_imei_identification_form_fill_rules, server_src_data_device_catalog [INFERRED 0.85]
- **Arabic / RTL localization effort** — docs_arabic_glossary, docs_test_results_arabic_translation_review, docs_test_results_rtl_sidebar_fix, docs_theme_typography [INFERRED 0.85]

## Communities (180 total, 70 thin omitted)

### Community 0 - "POS Checkout View"
Cohesion: 0.02
Nodes (99): amountDue, amountPaid, auth, autoPrint, cart, cartOnlyDevices, cashierName, categoryFilter (+91 more)

### Community 1 - "Product Form"
Cohesion: 0.03
Nodes (65): { activityType }, ALL_SIZES, auth, categoryError, categorySlug, categoryTemplates, cellKey(), COLOR_KEYS (+57 more)

### Community 2 - "Reports View"
Cohesion: 0.03
Nodes (62): auth, barMax, brands, cashTotal, categories, conditionLabel(), conditions, customers (+54 more)

### Community 3 - "Label Templates Editor"
Cohesion: 0.05
Nodes (57): { activityType }, allChosen, appliesTo, applyAll(), applySelected(), applyTemplate(), auth, brandChoices (+49 more)

### Community 4 - "Accounting & IMEI Docs"
Cohesion: 0.05
Nodes (54): Accounting rules (docs/accounting.md), Business expenses (Expenses page, direct expenses), Cash drawer movements (sale, cash_out, cash_in), costsCapitalized legacy repairs migration, server/src/lib/profit.ts shared profit functions, Repair profit (revenue - parts - technician - other), Sales revenue / net sales / sales gross profit / COGS, Supplier invoices and payments (remaining balance, status, statement) (+46 more)

### Community 5 - "Invoices View"
Cohesion: 0.04
Nodes (48): archiveMut, auth, calcIr(), calcTva(), { data: irMonth }, { data: irQuarter }, { data: irYear }, { data: list, isLoading } (+40 more)

### Community 6 - "Repair Detail View"
Cohesion: 0.04
Nodes (47): actions, auth, blankExpense(), closed, confirmDelete, confirmExpense, { data: repair, isLoading }, { data: stockProducts } (+39 more)

### Community 7 - "Profit & Expense Reporting"
Cohesion: 0.12
Nodes (46): ExpenseCategory, expensesPnl(), expensesWhere(), businessPnl(), ExpenseLike, ExpenseType, repairCosts(), RepairFilters (+38 more)

### Community 8 - "Fastify Routes & Roles"
Cohesion: 0.14
Nodes (37): fastify, zod, requireRoles(), catalogFor(), forbidden(), authed(), ok(), Req (+29 more)

### Community 9 - "Main Layout & Bank Transfer"
Cohesion: 0.05
Nodes (40): qrcode, emit, hasDetails, props, qr, ribSameBank, { t }, APP_CONFIG (+32 more)

### Community 10 - "Sold Units List"
Cohesion: 0.04
Nodes (38): allUnitsSelected, brand, condition, CONDITIONS, confirmOpen, { data: brands }, { data: filterOptions }, { data, isLoading, refetch } (+30 more)

### Community 11 - "Sales & Supplier Orders API"
Cohesion: 0.12
Nodes (40): badRequest(), notFound(), makeRef(), addTransactionPayment(), assertSeller(), CheckoutInput, checkoutSchema, createSale() (+32 more)

### Community 12 - "Repair Form"
Cohesion: 0.04
Nodes (36): activeRepair, customer, customers, customerSearch, { data: customersData }, { data: existing }, { data: preloadUnit }, { data: repairersData } (+28 more)

### Community 13 - "Server Test Suite"
Cohesion: 0.09
Nodes (18): vitest, buildApp(), UPLOAD_DIR, base(), noon(), today(), categoryId(), client() (+10 more)

### Community 14 - "Auth & Error Helpers"
Cohesion: 0.10
Nodes (38): AuthContext, authenticate(), blockInSellerMode(), fastify, FastifyRequest, hashPassword(), isManager(), issueTokens() (+30 more)

### Community 15 - "Repairs List & Sales Chart"
Cohesion: 0.06
Nodes (37): vue3-apexcharts, money(), options, props, series, { t }, intlLocale(), ltr() (+29 more)

### Community 16 - "Products List & Barcode Scanner"
Cohesion: 0.05
Nodes (31): useBarcodeScanner(), DEVICE_CATEGORY_SLUGS, { activityType, productsLabelKey }, adjustMutation, adjustOpen, adjustProduct, allOnPageSelected, categoryId (+23 more)

### Community 17 - "Router, i18n & Shared Forms"
Cohesion: 0.06
Nodes (30): vue-i18n, vue-router, form, { t }, groups, isOpen, isTyping(), onKeydown() (+22 more)

### Community 18 - "Prisma Serialization & Uploads"
Cohesion: 0.10
Nodes (34): @prisma/client, dec(), HIDDEN_FIELDS, JSON_FIELDS, toJson(), stockStatus(), lookupTac(), isAllowedImageUrl() (+26 more)

### Community 19 - "Settings View"
Cohesion: 0.05
Nodes (36): auth, BANK_CODES, BRAND_MODES, brandMode, business, { data: settings, isLoading }, detecting, drawerBaud (+28 more)

### Community 20 - "Cash Drawer Ledger (Server)"
Cohesion: 0.13
Nodes (32): CaisseType, INFLOW_TYPES, moveCaisse(), EXPENSE_CATEGORIES, EXPENSE_METHODS, dateRange(), endOfDay(), pageMeta() (+24 more)

### Community 21 - "TAC/IMEI Lookup & Import"
Cohesion: 0.09
Nodes (31): args, check, cov, [file, source = DEFAULT_SOURCE], rows, ALIAS_COLS, BRAND_ALIASES, BRAND_COLS (+23 more)

### Community 22 - "Dashboard"
Cohesion: 0.06
Nodes (31): dashboardApi, visibleNavigation, hasManagerRole(), canManageExpenses, customFrom, customTo, { data: kpis }, { data: lowStock } (+23 more)

### Community 23 - "Employees"
Cohesion: 0.07
Nodes (29): employeesApi, blank(), closeForm(), confirmDeactivate, createMut, { data: employeesData, isLoading }, { data: linkableUsers }, { data: stores } (+21 more)

### Community 24 - "Announcements & Paper Orders"
Cohesion: 0.06
Nodes (25): announcementsApi, paperOrdersApi, storesApi, auth, { data }, dismissed, isAdmin, isRtl (+17 more)

### Community 25 - "Sold Unit Labels & IMEI Validation"
Cohesion: 0.08
Nodes (29): formatImei(), isValidImei(), soldUnitsApi, confirm(), { data, isLoading, refetch }, emit, props, search (+21 more)

### Community 26 - "Receipts & Repair Printing"
Cohesion: 0.14
Nodes (30): download(), downloading, emit, print(), printing, props, qrDataUrl, receipt (+22 more)

### Community 27 - "Web Dependencies"
Cohesion: 0.07
Nodes (29): apexcharts, autoprefixer, axios, @fontsource/ibm-plex-sans-arabic, @fontsource/noto-sans-arabic, @fontsource-variable/inter, jszip, postcss (+21 more)

### Community 28 - "Customers List"
Cohesion: 0.06
Nodes (24): confirmOpen, counts, customers, { data, isLoading }, { data: pendingRefunds }, deleteMutation, editing, filter (+16 more)

### Community 29 - "Cash Drawer View"
Cohesion: 0.07
Nodes (24): caisseApi, CaisseMovementType, DEPOSIT_REASONS, EXACT, OTHER_REASON, PREFIXED, reasonLabel(), WITHDRAW_REASONS (+16 more)

### Community 30 - "Sold Unit Form"
Cohesion: 0.07
Nodes (29): applyIdentified(), autofilled, { data: suppliers }, { data: unit, isLoading }, details, device, deviceType, errors (+21 more)

### Community 31 - "Supplier Invoice Detail"
Cohesion: 0.08
Nodes (31): act(), askCancel, askDelete, busy, cancelInvoice(), cancelReason, canReceive, company (+23 more)

### Community 32 - "Supplier Order Detail"
Cohesion: 0.06
Nodes (26): cancelOpen, canConvertAll, conditionLabel(), convertingItem, convertingUnit, { data: order, isLoading }, expanded, hasUnits (+18 more)

### Community 33 - "Supplier Invoices & Suppliers API"
Cohesion: 0.08
Nodes (27): supplierInvoicesApi, suppliersApi, invoiceBadge(), badge, { data, isLoading, isError }, { data: suppliers }, debounced, meta (+19 more)

### Community 34 - "Supplier Invoice Form"
Cohesion: 0.08
Nodes (28): round2(), payAfter, submitPay(), addProduct(), base, { data: categories }, { data: suppliers }, editId (+20 more)

### Community 35 - "Transaction Detail"
Cohesion: 0.07
Nodes (28): auth, canCollect, CONDITION_CLASS, conditionLabel(), { data: tx, isLoading, refetch }, form, id, METHOD_KEY (+20 more)

### Community 36 - "Product Labels Modal"
Cohesion: 0.10
Nodes (26): copied, copies, ctx, { data: settings }, emit, first, keyOf(), loading (+18 more)

### Community 37 - "Customer Detail"
Cohesion: 0.07
Nodes (27): credit, customerId, { data: customer, isLoading }, { data: paymentsData }, { data: txData }, debt, error, form (+19 more)

### Community 38 - "Users Management"
Cohesion: 0.09
Nodes (26): blank(), canAdd, cashiers, closeForm(), createMut, { data: stores }, { data: usage }, { data: users, isLoading } (+18 more)

### Community 39 - "Server Bootstrap & Catalog"
Cohesion: 0.09
Nodes (14): @fastify/cors, @fastify/static, vite, @vitejs/plugin-vue, catalog, CatalogDevice, src, walk() (+6 more)

### Community 40 - "Device Catalog Select"
Cohesion: 0.07
Nodes (25): activeCondition, activeIndex, brand, brandOptions, color, colorOptions, condition, CONDITIONS (+17 more)

### Community 41 - "Expenses View"
Cohesion: 0.08
Nodes (25): category, CATEGORY_TONE, { data: cashData }, { data, isLoading, isError }, debounced, deleteMut, editing, formOpen (+17 more)

### Community 42 - "New Supplier Order"
Cohesion: 0.08
Nodes (24): addProduct(), alert, createOrder, createProduct, creatingProduct, { data: products }, { data: suppliers }, DEVICE_TYPES (+16 more)

### Community 43 - "Transactions List"
Cohesion: 0.07
Nodes (26): auth, { data, isLoading }, dateFrom, dateRange, dateTo, exportCsv(), exporting, limit (+18 more)

### Community 44 - "Barcode & Label Renderer"
Cohesion: 0.13
Nodes (24): jsbarcode, previewLabel, label, props, svg, barcodeSvg(), formatBarcodeText(), isEan13() (+16 more)

### Community 45 - "Invoice PDF Preview"
Cohesion: 0.13
Nodes (22): jspdf, settingsApi, stripBidi(), cap(), companyFromSettings(), customerLabel(), cut(), day() (+14 more)

### Community 46 - "Categories & API Errors"
Cohesion: 0.10
Nodes (22): apiErrorMessage(), confirmDelete(), { data: categories, isLoading }, deleteError, deleting, editor, editorError, hiddenCount (+14 more)

### Community 47 - "Debts View"
Cohesion: 0.08
Nodes (22): auth, closeRefund(), creditors, { data: customersData, isLoading: customersLoading }, { data: refundsData, isLoading: refundsLoading }, { data: suppliersData, isLoading: suppliersLoading }, debtors, isPhoneSeller (+14 more)

### Community 48 - "Server Dependencies & Seed"
Cohesion: 0.08
Nodes (22): bcryptjs, jsonwebtoken, prisma, tsx, @types/jsonwebtoken, @types/node, typescript, devDependencies (+14 more)

### Community 49 - "Global Search & Customer Edit"
Cohesion: 0.09
Nodes (21): customersApi, go(), isLoading, isOpen, onKeydown(), query, quickLinks, results (+13 more)

### Community 50 - "Invoice Numbering (Server)"
Cohesion: 0.16
Nodes (19): DEFAULT_IR_FLAT_RATE, formatInvoiceNumber(), INVOICED_TYPES, InvoiceItem, InvoiceNumbering, invoiceTotals(), invoicingEnabled(), numbering() (+11 more)

### Community 51 - "Inventory Movements"
Cohesion: 0.09
Nodes (20): inventoryMovementsApi, auth, { data: movements, isLoading: loadingMovements }, { data: productList }, { data: units, isLoading: loadingUnits }, dateFrom, dateTo, formatWhen() (+12 more)

### Community 52 - "Cash Drawer Hardware Service"
Cohesion: 0.18
Nodes (22): DEFAULT_DRAWER_BAUD, DEFAULT_DRAWER_COMMAND, enqueue(), getDrawerBaudRate(), getDrawerCommand(), isCashDrawerPaired(), isCashDrawerSupported(), KEYS (+14 more)

### Community 53 - "Standalone Invoice Form"
Cohesion: 0.09
Nodes (21): addItem(), customerId, customers, { data: customersData }, { data: existing }, discount, error, id (+13 more)

### Community 54 - "Expense Form Modal"
Cohesion: 0.12
Nodes (20): blank(), duplicate, emit, errors, form, isEdit, METHOD_ICONS, onReceipt() (+12 more)

### Community 55 - "Login & Language Switcher"
Cohesion: 0.10
Nodes (17): auth, { locale }, open, root, SHORT, LOCALE_NAMES, LOCALES, auth (+9 more)

### Community 56 - "Trade-In Modal"
Cohesion: 0.10
Nodes (19): batteryHealth, confirm(), device, deviceType, emit, estimatedSalePrice, finalAmount, hasBattery (+11 more)

### Community 57 - "Receive Stock & Scan Input"
Cohesion: 0.10
Nodes (17): useScanInput(), boxCost, boxes, isPack, notFoundCode, packSize, pieces, product (+9 more)

### Community 58 - "Repairs API"
Cohesion: 0.14
Nodes (19): conflict(), refreshRepairFinancials(), ACTIVE, expenseSchema, money, NEXT, PAY_METHODS, paymentSchema (+11 more)

### Community 59 - "Product Details Modal"
Cohesion: 0.11
Nodes (17): add(), cost, { data: repairsData }, emit, isUnit, lowStock, margin, outOfStock (+9 more)

### Community 60 - "Searchable Select"
Cohesion: 0.16
Nodes (19): canCreate, close(), create(), emit, filtered, highlighted, inputRef, listRef (+11 more)

### Community 61 - "Web Package Dependencies"
Cohesion: 0.11
Nodes (19): dependencies, apexcharts, axios, date-fns, @fontsource/ibm-plex-sans-arabic, @fontsource/noto-sans-arabic, @fontsource-variable/inter, @heroicons/vue (+11 more)

### Community 62 - "Supplier Orders List"
Cohesion: 0.11
Nodes (15): supplierOrdersApi, formatDate(), { data: orders, isLoading }, payAmount, payMutation, payOpen, payOrderId, queryClient (+7 more)

### Community 63 - "Stock Adjust Modal"
Cohesion: 0.11
Nodes (17): boxCost, emit, isPack, mode, newStock, newUnitCost, packSize, pieces (+9 more)

### Community 64 - "Root Package Config"
Cohesion: 0.11
Nodes (17): description, devDependencies, concurrently, engines, node, name, private, scripts (+9 more)

### Community 65 - "Product & Device Images"
Cohesion: 0.11
Nodes (15): @heroicons/vue, failed, initials, props, tint, TINTS, alt, failed (+7 more)

### Community 66 - "Pinia Stores & Activity"
Cohesion: 0.23
Nodes (13): pinia, clear(), useActivity(), ACTIVITIES, DEFAULT_ACTIVITY, RETAIL_NAV, STOCK_KPIS, STOCK_WIDGETS (+5 more)

### Community 67 - "Supplier Statement & Toast"
Cohesion: 0.13
Nodes (13): emit, props, daysLate(), PAYMENT_METHODS, shortDay(), { data: st, isLoading, isError }, id, params (+5 more)

### Community 68 - "Settings Save Actions"
Cohesion: 0.28
Nodes (17): saveDrawerSettings(), businessMut, changePassword(), errMsg(), fail(), ok(), pairDrawer(), passwordMut (+9 more)

### Community 69 - "Suppliers List"
Cohesion: 0.12
Nodes (13): confirmOpen, { data, isLoading }, deleteMutation, editing, emptyForm(), form, formOpen, openCreate() (+5 more)

### Community 70 - "Supplier Invoices API"
Cohesion: 0.17
Nodes (15): asDate(), assertProducts(), day, include, InvoiceInput, invoiceSchema, itemSchema, load() (+7 more)

### Community 71 - "Repair Expenses & Shared i18n t()"
Cohesion: 0.23
Nodes (16): t(), COMPLETE_METHODS, addExpense, deleteMut, diagMut, etaMut, notify(), payMut (+8 more)

### Community 72 - "Auth & Checkout API Client"
Cohesion: 0.21
Nodes (7): authApi, checkoutApi, http, publicHttp, subscriptionsApi, usersApi, useSubscriptionStore

### Community 73 - "Archived Invoices"
Cohesion: 0.14
Nodes (12): invoicesApi, { data, isLoading }, formatWhen(), invoices, limit, page, query, queryClient (+4 more)

### Community 74 - "Label Preview"
Cohesion: 0.17
Nodes (14): box, frameStyle, holderStyle, html, l, page, props, scale (+6 more)

### Community 75 - "Supplier Document Printing"
Cohesion: 0.38
Nodes (14): printHtmlDocument(), clean(), dayOf(), htmlPage(), invoiceRows(), money(), newDoc(), printSupplierInvoice() (+6 more)

### Community 76 - "Checkout Unit Cart Actions"
Cohesion: 0.14
Nodes (15): addUnitToCart(), choiceComplete(), choiceSellOther(), closeDetails(), closeReservedChoice(), closeReservedWarning(), confirmReservedWarning(), isCatalogDevice() (+7 more)

### Community 77 - "Public Repair Tracking"
Cohesion: 0.13
Nodes (13): cancelled, data, day(), loading, notFound, reached, repair, route (+5 more)

### Community 78 - "App Shell & RTL"
Cohesion: 0.14
Nodes (11): vue, effectiveLocale, isRtl, { locale, t }, reload(), route, updateAvailable, c (+3 more)

### Community 79 - "Label Templates API"
Cohesion: 0.20
Nodes (13): BASE_LAYOUT, defaults(), labelTemplateRoutes(), getOrCreate(), LIMITS, pickConfig(), present(), PRODUCT_FLAGS (+5 more)

### Community 80 - "Subscription Banner"
Cohesion: 0.14
Nodes (13): auth, emit, exceeded, gatewayEnabled, isCancelled, isCashierOnly, isExpired, isLifetime (+5 more)

### Community 81 - "Server Entry & Data Migrations"
Cohesion: 0.26
Nodes (9): port, backfillCodes(), Db, ean13CheckDigit(), generateProductBarcode(), isEan13(), newTrackingToken(), MIGRATIONS (+1 more)

### Community 82 - "TypeScript Config"
Cohesion: 0.15
Nodes (12): compilerOptions, esModuleInterop, module, moduleResolution, outDir, resolveJsonModule, rootDir, skipLibCheck (+4 more)

### Community 83 - "Product Image Upload"
Cohesion: 0.19
Nodes (11): uploadsApi, busy, dragging, error, input, model, onDrop(), onPick() (+3 more)

### Community 84 - "Amount In Words"
Cohesion: 0.27
Nodes (12): amountInWords(), amountInWordsEn(), below100(), below1000(), EN_TENS, EN_UNITS, enBelow100(), enBelow1000() (+4 more)

### Community 85 - "Pack Choice Modal"
Cohesion: 0.18
Nodes (11): boxes, boxPrice, canPack, canUnit, emit, free, loose, onKey() (+3 more)

### Community 86 - "Checkout Customer & Pack"
Cohesion: 0.18
Nodes (12): chooseCustomer(), chooseSaleOption(), closeCustomerModal(), closePack(), closeUnitPicker(), createCustomer, onKeydown(), onUnitPicked() (+4 more)

### Community 87 - "NPM Scripts"
Cohesion: 0.18
Nodes (11): scripts, build, db:init, db:push, db:reset, db:seed, dev, start (+3 more)

### Community 88 - "Device Unit Item Form"
Cohesion: 0.20
Nodes (10): add(), canAdd, device, emit, name, props, quantity, salePrice (+2 more)

### Community 89 - "Date Range Picker"
Cohesion: 0.24
Nodes (9): date-fns, @vuepic/vue-datepicker, dfLocale(), display(), iso(), model, presets, today (+1 more)

### Community 90 - "Label Templates Client"
Cohesion: 0.24
Nodes (8): cache, DEFAULT_PRODUCT_LABEL, DEFAULT_UNIT_LABEL, fetchTemplate(), labelTemplatesApi, persist(), saveTemplate(), SOLD_UNITS_KEY

### Community 91 - "Unlock Modal"
Cohesion: 0.22
Nodes (9): auth, busy, emit, error, input, password, props, submit() (+1 more)

### Community 92 - "i18n Loader"
Cohesion: 0.24
Nodes (9): arModules, deepMerge(), enModules, frModules, INTL, merge(), normalize(), saved (+1 more)

### Community 93 - "QZ Printer Service"
Cohesion: 0.36
Nodes (9): connect(), isQzAvailable(), listPrinters(), loadQz(), openCashDrawer(), printHtml(), printRaw(), setSavedPrinter() (+1 more)

### Community 94 - "Supplier Order Conversion"
Cohesion: 0.36
Nodes (10): cancelMutation, convertAll, convertItem, convertItemUnits(), convertOne, notify(), payMutation, receiveMutation (+2 more)

### Community 95 - "Server Error Translation"
Cohesion: 0.36
Nodes (8): translateError(), build(), esc(), EXTRA, lookup(), toRegex(), translateErrorResponse(), translateServerMessage()

### Community 96 - "Checkout Payment & Returns"
Cohesion: 0.31
Nodes (9): paymentMethod(), addReturnItem(), addReturnUnit(), completePayment(), confirmCompleteReservation(), confirmReturn(), invalidate(), notify() (+1 more)

### Community 97 - "Reference Data Labels"
Cohesion: 0.31
Nodes (7): i18n, frenchNames(), label(), localizeReferenceData(), walk(), NOTES, stockReasonLabel()

### Community 98 - "Server Package Dependencies"
Cohesion: 0.25
Nodes (8): dependencies, bcryptjs, fastify, @fastify/cors, @fastify/static, jsonwebtoken, @prisma/client, zod

### Community 99 - "Server Messages Check Script"
Cohesion: 0.29
Nodes (7): esc(), messages, patterns, serverSrc, toRegex(), walk(), web

### Community 100 - "Return Modal"
Cohesion: 0.29
Nodes (7): emit, original(), props, refunds, { t }, totalOriginal, totalRefund

### Community 101 - "Pagination"
Cohesion: 0.29
Nodes (7): emit, from, go(), items, props, { t }, to

### Community 102 - "Tailwind Theme"
Cohesion: 0.25
Nodes (6): brand, danger, neutral, STEPS, success, warning

### Community 103 - "Confirm Modal"
Cohesion: 0.38
Nodes (6): cancel(), confirm(), emit, props, style, STYLES

### Community 104 - "Expenses Client"
Cohesion: 0.40
Nodes (3): EXPENSE_CATEGORIES, EXPENSE_METHODS, expensesApi

### Community 105 - "Device Colors"
Cohesion: 0.40
Nodes (4): colorHex(), isLight(), NAMED, WORDS

### Community 106 - "Repair Form Mutations"
Cohesion: 0.40
Nodes (5): create, createCustomer, createRepairer, pickCustomer(), pickRepairer()

### Community 107 - "Products Client"
Cohesion: 0.50
Nodes (3): accessoryCatalogApi, categoriesApi, productsApi

### Community 108 - "Report PDF Export"
Cohesion: 0.50
Nodes (4): dh(), exportPdf(), methodLabel(), shortDate()

### Community 112 - "Customer Create"
Cohesion: 0.67
Nodes (3): emptyForm(), openCreate(), saveMutation

## Ambiguous Edges - Review These
- `Colour design tokens (--c-brand, --c-neutral, --c-ink...) mapped to Tailwind` → `web/index.html SPA entry (mounts /src/main.js)`  [AMBIGUOUS]
  web/index.html · relation: conceptually_related_to

## Knowledge Gaps
- **22 isolated node(s):** `concurrently`, `@types/jsonwebtoken`, `@types/node`, `prisma`, `tsx` (+17 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1734 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **70 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vue` connect `App Shell & RTL` to `POS Checkout View`, `Product Form`, `Reports View`, `Label Templates Editor`, `Invoices View`, `Repair Detail View`, `Main Layout & Bank Transfer`, `Sold Units List`, `Repair Form`, `Repairs List & Sales Chart`, `Products List & Barcode Scanner`, `Router, i18n & Shared Forms`, `Settings View`, `Dashboard`, `Employees`, `Announcements & Paper Orders`, `Sold Unit Labels & IMEI Validation`, `Receipts & Repair Printing`, `Web Dependencies`, `Customers List`, `Cash Drawer View`, `Sold Unit Form`, `Supplier Invoice Detail`, `Supplier Order Detail`, `Supplier Invoices & Suppliers API`, `Supplier Invoice Form`, `Transaction Detail`, `Product Labels Modal`, `Customer Detail`, `Users Management`, `Device Catalog Select`, `Expenses View`, `New Supplier Order`, `Transactions List`, `Barcode & Label Renderer`, `Invoice PDF Preview`, `Categories & API Errors`, `Debts View`, `Global Search & Customer Edit`, `Inventory Movements`, `Standalone Invoice Form`, `Expense Form Modal`, `Login & Language Switcher`, `Trade-In Modal`, `Receive Stock & Scan Input`, `Product Details Modal`, `Searchable Select`, `Supplier Orders List`, `Stock Adjust Modal`, `Product & Device Images`, `Pinia Stores & Activity`, `Supplier Statement & Toast`, `Suppliers List`, `Auth & Checkout API Client`, `Archived Invoices`, `Label Preview`, `Public Repair Tracking`, `Subscription Banner`, `Product Image Upload`, `Pack Choice Modal`, `Device Unit Item Form`, `Date Range Picker`, `Unlock Modal`, `Return Modal`, `Pagination`, `Confirm Modal`?**
  _High betweenness centrality (0.162) - this node is a cross-community bridge._
- **Are the 122 inferred relationships involving `t()` (e.g. with `series` and `onReceipt()`) actually correct?**
  _`t()` has 122 INFERRED edges - model-reasoned connections that need verification._
- **What connects `concurrently`, `@types/jsonwebtoken`, `@types/node` to the rest of the system?**
  _22 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `POS Checkout View` be split into smaller, more focused modules?**
  _Cohesion score 0.018018018018018018 - nodes in this community are weakly interconnected._
- **Why does `@heroicons/vue` connect `Product & Device Images` to `POS Checkout View`, `Product Form`, `Reports View`, `Label Templates Editor`, `Invoices View`, `Repair Detail View`, `Main Layout & Bank Transfer`, `Sold Units List`, `Repair Form`, `Repairs List & Sales Chart`, `Products List & Barcode Scanner`, `Router, i18n & Shared Forms`, `Settings View`, `Dashboard`, `Employees`, `Announcements & Paper Orders`, `Sold Unit Labels & IMEI Validation`, `Receipts & Repair Printing`, `Web Dependencies`, `Customers List`, `Cash Drawer View`, `Sold Unit Form`, `Supplier Invoice Detail`, `Supplier Order Detail`, `Supplier Invoices & Suppliers API`, `Supplier Invoice Form`, `Transaction Detail`, `Product Labels Modal`, `Customer Detail`, `Users Management`, `Device Catalog Select`, `Expenses View`, `New Supplier Order`, `Transactions List`, `Invoice PDF Preview`, `Categories & API Errors`, `Debts View`, `Global Search & Customer Edit`, `Inventory Movements`, `Standalone Invoice Form`, `Expense Form Modal`, `Login & Language Switcher`, `Trade-In Modal`, `Receive Stock & Scan Input`, `Product Details Modal`, `Searchable Select`, `Supplier Orders List`, `Stock Adjust Modal`, `Supplier Statement & Toast`, `Suppliers List`, `Archived Invoices`, `Public Repair Tracking`, `App Shell & RTL`, `Subscription Banner`, `Product Image Upload`, `Pack Choice Modal`, `Device Unit Item Form`, `Unlock Modal`, `Return Modal`, `Pagination`, `Confirm Modal`, `Supplier Order Status`?**
  _High betweenness centrality (0.147) - this node is a cross-community bridge._
- **Should `Product Form` be split into smaller, more focused modules?**
  _Cohesion score 0.02937625754527163 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Colour design tokens (--c-brand, --c-neutral, --c-ink...) mapped to Tailwind` and `web/index.html SPA entry (mounts /src/main.js)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._