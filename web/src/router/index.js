import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useSubscriptionStore } from '@/stores/subscription';
import { Roles, SELLER_MODE_ROUTES } from '@/config/constants';
import { hasManagerRole } from '@/utils/format';

// Lazy view resolver. Screens not built yet resolve to a placeholder so the app stays usable.
const views = import.meta.glob('../views/**/*.vue');
const page = (path) => views[`../views/${path}.vue`] ?? (() => import('../views/PlaceholderView.vue'));

const routes = [
  // ── Public site ──
  { path: '/', name: 'home', component: page('public/LandingView'), meta: { public: true } },
  { path: '/ar', name: 'home-ar', component: page('public/LandingView'), meta: { public: true, locale: 'ar' } },
  // Public repair status page, opened by scanning the QR code on a repair ticket.
  { path: '/track/:token', name: 'repair-tracking', component: page('public/RepairTrackingView'), meta: { public: true } },
  { path: '/privacy', name: 'privacy', component: page('public/PrivacyPolicyView'), meta: { public: true } },
  { path: '/terms', name: 'terms', component: page('public/TermsOfUseView'), meta: { public: true } },
  { path: '/account/delete', name: 'account-delete', component: page('public/AccountDeleteView'), meta: { public: true } },
  { path: '/careers', name: 'careers', component: page('public/CareersView'), meta: { public: true } },
  { path: '/commander', name: 'commander', component: page('public/CommandeView'), meta: { public: true } },
  { path: '/logiciel-caisse-telephone', name: 'solution-phone-store', component: page('public/PhoneStoreSolutionView'), meta: { public: true } },
  { path: '/logiciel-location-voiture', name: 'solution-car-rental', component: page('public/CarRentalSolutionView'), meta: { public: true } },
  { path: '/audit-visibilite', name: 'audit-visibilite', component: page('public/AuditVisibiliteView'), meta: { public: true } },
  { path: '/blog', name: 'blog-index', component: page('public/blog/BlogIndexView'), meta: { public: true } },
  { path: '/blog/retrouver-vente-iphone-imei', name: 'blog-imei-lookup', component: page('public/blog/ImeiLookupArticle'), meta: { public: true } },
  { path: '/blog/marge-reelle-magasin-telephone', name: 'blog-real-margin', component: page('public/blog/RealMarginArticle'), meta: { public: true } },
  { path: '/login', name: 'login', component: page('auth/LoginView'), meta: { guest: true } },
  { path: '/sso/terrain', name: 'sso-terrain', component: page('auth/SsoView'), meta: { public: true } },

  // ── Tenant app ──
  {
    path: '/app',
    component: () => import('@/layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: { name: 'dashboard' } },
      { path: 'dashboard', name: 'dashboard', component: page('dashboard/DashboardView') },
      { path: 'pos', name: 'pos', component: page('pos/CheckoutView') },
      { path: 'cash-drawer', name: 'cash-drawer', component: page('cash-drawer/CashDrawerView') },
      { path: 'products', name: 'products', component: page('products/ProductsView') },
      { path: 'products/new', name: 'product-new', component: page('products/ProductFormView') },
      { path: 'products/receive', name: 'products-receive', component: page('products/ReceiveStockView') },
      { path: 'products/:id/edit', name: 'product-edit', component: page('products/ProductFormView') },
      { path: 'sold-units', name: 'sold-units', component: page('sold-units/SoldUnitsView') },
      { path: 'sold-units/new', name: 'sold-unit-type-select', component: page('sold-units/DeviceTypeSelectionView') },
      { path: 'sold-units/form', name: 'sold-unit-new', component: page('sold-units/SoldUnitFormView') },
      { path: 'sold-units/:id/edit', name: 'sold-unit-edit', component: page('sold-units/SoldUnitFormView') },
      { path: 'inventory-movements', name: 'inventory-movements', component: page('inventory/InventoryMovementsView') },
      { path: 'customers', name: 'customers', component: page('customers/CustomersView') },
      { path: 'customers/:id', name: 'customer-detail', component: page('customers/CustomerDetailView') },
      { path: 'customers/:id/edit', name: 'customer-edit', component: page('customers/CustomerEditView') },
      { path: 'suppliers', name: 'suppliers', component: page('suppliers/SuppliersView') },
      { path: 'suppliers/:id', name: 'supplier-detail', component: page('suppliers/SupplierDetailView') },
      { path: 'suppliers/:id/edit', name: 'supplier-edit', component: page('suppliers/SupplierEditView') },
      { path: 'supplier-orders', name: 'supplier-orders', component: page('supplier-orders/SupplierOrdersView') },
      { path: 'supplier-orders/new', name: 'supplier-order-new', component: page('supplier-orders/NewSupplierOrderView') },
      { path: 'supplier-orders/:id', name: 'supplier-order-detail', component: page('supplier-orders/SupplierOrderDetailView') },
      { path: 'transactions', name: 'transactions', component: page('transactions/TransactionsView') },
      { path: 'invoices', name: 'invoices', component: page('invoices/InvoicesView') },
      { path: 'invoices/archived', name: 'invoices-archived', component: page('invoices/ArchivedInvoicesView') },
      { path: 'invoices/new', name: 'invoice-new', component: page('invoices/StandaloneInvoiceFormView') },
      { path: 'invoices/:id/edit', name: 'invoice-edit', component: page('invoices/StandaloneInvoiceFormView') },
      { path: 'invoices/:id/preview', name: 'invoice-preview', component: page('invoices/InvoicePreviewView') },
      { path: 'transactions/:id', name: 'transaction-detail', component: page('transactions/TransactionDetailView') },
      { path: 'reports', name: 'reports', component: page('reports/ReportsView') },
      { path: 'expenses', name: 'expenses', component: page('expenses/ExpensesView'), meta: { managersOnly: true } },
      { path: 'categories', name: 'categories', component: page('products/CategoriesView'), meta: { managersOnly: true } },
      { path: 'repairs', name: 'repairs', component: page('repairs/RepairsView') },
      { path: 'repairs/new', name: 'repair-new', component: page('repairs/RepairFormView') },
      { path: 'repairs/:id/edit', name: 'repair-edit', component: page('repairs/RepairFormView') },
      { path: 'repairs/:id', name: 'repair-detail', component: page('repairs/RepairDetailView') },
      { path: 'debts', name: 'debts', component: page('debts/DebtsView') },
      { path: 'settings', name: 'settings', component: page('settings/SettingsView') },
      { path: 'settings/label-templates', name: 'label-templates', component: page('settings/LabelTemplatesView') },
      { path: 'users', name: 'users', component: page('users/UsersView') },
      { path: 'employees', name: 'employees', component: page('employees/EmployeesView') },
      { path: 'subscription', name: 'subscription', component: page('subscription/PlanSelectionView') },
      { path: 'subscription/manage', name: 'subscription-manage', component: page('subscription/SubscriptionView') },
      { path: 'subscription/success', name: 'subscription-success', component: page('subscription/PaymentSuccessView') },
      { path: 'subscription/error', name: 'subscription-error', component: page('subscription/PaymentErrorView') },
    ],
  },

  // ── Platform administration ──
  {
    path: '/app/superadmin',
    component: page('superadmin/SuperAdminLayout'),
    meta: { requiresAuth: true },
    children: [
      { path: '', name: 'superadmin-dashboard', component: page('superadmin/SuperAdminDashboardView') },
      { path: 'tenants', name: 'superadmin-tenants', component: page('superadmin/TenantsView') },
    ],
  },

  { path: '/:pathMatch(.*)*', name: 'not-found', component: page('NotFoundView'), meta: { public: true } },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, _from, saved) {
    if (saved) return saved;
    if (to.hash) return { el: to.hash, behavior: 'smooth' };
    return { top: 0 };
  },
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} — CaissePro` : 'CaissePro';
});

router.beforeEach(async (to, from) => {
  if (to.meta.public) return true;
  const auth = useAuthStore();
  if (to.meta.requiresAuth || to.meta.guest) await auth.initializeAuth();

  const loggedIn = auth.isAuthenticated;
  const user = auth.currentUser;
  const isSuperAdmin = user?.roles?.includes(Roles.SUPER_ADMIN);

  if (to.meta.requiresAuth && !loggedIn) {
    return {
      name: 'login',
      query: to.fullPath === '/app' || to.fullPath === '/app/dashboard' ? undefined : { redirect: to.fullPath },
    };
  }
  if (to.meta.guest && loggedIn) return isSuperAdmin ? { name: 'superadmin-dashboard' } : { name: 'dashboard' };

  if (loggedIn && to.meta.requiresAuth) {
    const inSuperAdmin = to.path.startsWith('/app/superadmin');
    if (isSuperAdmin && !inSuperAdmin) return { name: 'superadmin-dashboard' };
    if (!isSuperAdmin && inSuperAdmin) return { name: 'dashboard' };

    // Cashier-only accounts live in the POS.
    if (!isSuperAdmin && user?.roles?.includes(Roles.CASHIER) && user?.roles?.length === 1 && to.path !== '/app/pos') {
      return { name: 'pos' };
    }

    // Financial and catalogue administration screens are for managers.
    if (to.meta.managersOnly && !isSuperAdmin && !hasManagerRole(user?.roles)) return { name: 'dashboard' };

    // A locked account can only reach selling screens.
    if (auth.sellerMode && !SELLER_MODE_ROUTES.has(to.name)) {
      if (SELLER_MODE_ROUTES.has(from.name)) {
        auth.notifyLocked();
        return false;
      }
      return { name: 'pos' };
    }

    // Without an online payment gateway, plan management falls back to the plan picker (bank transfer).
    if (to.name === 'subscription-manage' && !isSuperAdmin) {
      const sub = useSubscriptionStore();
      try {
        if (!sub.status) await sub.fetchStatus();
        if (sub.status?.platformSettings && !sub.status.platformSettings.paymentGatewayEnabled) {
          return { name: 'subscription' };
        }
      } catch {
        /* ignore */
      }
    }
  }
  return true;
});
