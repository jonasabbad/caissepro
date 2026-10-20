export const APP_CONFIG = {
  name: 'CaissePro',
  // Support contact shown on the "subscription expired" screen. Replace with your own number.
  support: { whatsapp: '212600000000', email: 'support@caissepro.local' },
};

export const Roles = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  MANAGER: 'manager',
  CASHIER: 'cashier',
  VIEWER: 'viewer',
});

export const Plans = Object.freeze({
  DEMARRAGE: 'demarrage',
  PROFESSIONNEL: 'professionnel',
  PREMIUM: 'premium',
  LIFETIME: 'lifetime',
});

export const Modules = Object.freeze({ SELLER_MODE: 'seller_mode' });

/** Routes a locked ("seller mode") account may visit. */
export const SELLER_MODE_ROUTES = new Set([
  'pos',
  'cash-drawer',
  'products',
  'product-new',
  'sold-units',
  'sold-unit-type-select',
  'sold-unit-new',
  'customers',
  'customer-detail',
  'transactions',
  'transaction-detail',
  'repairs',
  'repair-new',
  'repair-detail',
]);
