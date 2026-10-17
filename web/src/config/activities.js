// Business activity profiles: they decide which modules, nav entries and dashboard widgets a tenant sees.

const STOCK_WIDGETS = ['dailySales', 'realProfit', 'customerDebt', 'supplierDebt', 'lowStock', 'topProducts', 'salesTrend', 'recentTransactions'];
const STOCK_KPIS = [
  { id: 'dailySales', priority: 1 },
  { id: 'realProfit', priority: 2 },
  { id: 'customerDebt', priority: 3 },
  { id: 'supplierDebt', priority: 4 },
];
const RETAIL_NAV = ['dashboard', 'pos', 'products', 'categories', 'inventoryMovements', 'customers', 'suppliers', 'supplierOrders', 'transactions', 'invoices', 'debts', 'expenses', 'reports', 'users', 'employees', 'settings'];

export const ACTIVITIES = {
  phone_seller: {
    id: 'phone_seller',
    label: 'Vendeur de Téléphones',
    labelEn: 'Phone Seller',
    descriptionEn: 'Phones and accessories sales',
    labelAr: 'بائع الهواتف',
    description: 'Vente de téléphones et accessoires',
    descriptionAr: 'بيع الهواتف والإكسسوارات',
    modules: ['core', 'inventory', 'phone-seller'],
    dashboardWidgets: STOCK_WIDGETS,
    navItems: ['dashboard', 'pos', 'products', 'soldUnits', 'categories', 'inventoryMovements', 'customers', 'suppliers', 'supplierOrders', 'transactions', 'invoices', 'repairs', 'debts', 'expenses', 'reports', 'users', 'employees', 'settings'],
    kpiConfig: STOCK_KPIS,
    enabled: true,
  },
  retail: {
    id: 'retail',
    label: 'Commerce de Détail',
    labelEn: 'Retail Store',
    descriptionEn: 'General retail',
    labelAr: 'تجارة التجزئة',
    description: 'Commerce de détail général',
    descriptionAr: 'تجارة التجزئة العامة',
    modules: ['core', 'inventory'],
    dashboardWidgets: STOCK_WIDGETS,
    navItems: RETAIL_NAV,
    kpiConfig: STOCK_KPIS,
    enabled: false,
  },
  clothing: {
    id: 'clothing',
    label: 'Boutique de Vêtements',
    labelEn: 'Clothing Store',
    descriptionEn: 'Clothes, shoes and accessories sales',
    labelAr: 'متجر الملابس',
    description: 'Vente de vêtements, chaussures et accessoires',
    descriptionAr: 'بيع الملابس والأحذية والإكسسوارات',
    modules: ['core', 'inventory'],
    dashboardWidgets: STOCK_WIDGETS,
    navItems: RETAIL_NAV,
    kpiConfig: STOCK_KPIS,
    enabled: true,
  },
  coiffeur: {
    id: 'coiffeur',
    label: 'Salon de Coiffure',
    labelEn: 'Hair Salon',
    descriptionEn: 'Hair salon and care',
    labelAr: 'صالون حلاقة',
    description: 'Salon de coiffure et soins',
    descriptionAr: 'صالون الحلاقة والعناية',
    modules: ['core', 'services', 'appointments'],
    dashboardWidgets: ['dailySales', 'todayAppointments', 'customerDebt', 'topServices'],
    navItems: ['dashboard', 'pos', 'appointments', 'services', 'customers', 'transactions', 'expenses', 'reports', 'users', 'employees', 'settings'],
    kpiConfig: [
      { id: 'dailySales', priority: 1 },
      { id: 'todayAppointments', priority: 2 },
      { id: 'customerDebt', priority: 3 },
    ],
    enabled: false,
  },
  restaurant: {
    id: 'restaurant',
    label: 'Restaurant',
    labelEn: 'Restaurant',
    descriptionEn: 'Restaurant and café',
    labelAr: 'مطعم',
    description: 'Restaurant et café',
    descriptionAr: 'مطعم ومقهى',
    modules: ['core', 'tables', 'kitchen'],
    dashboardWidgets: ['dailySales', 'activeTables', 'pendingOrders', 'topDishes'],
    navItems: ['dashboard', 'pos', 'tables', 'kitchen', 'menu', 'customers', 'transactions', 'expenses', 'reports', 'users', 'employees', 'settings'],
    kpiConfig: [
      { id: 'dailySales', priority: 1 },
      { id: 'activeTables', priority: 2 },
      { id: 'pendingOrders', priority: 3 },
    ],
    enabled: false,
  },
};

export const DEFAULT_ACTIVITY = 'phone_seller';
