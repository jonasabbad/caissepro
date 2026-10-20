<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useQuery } from '@tanstack/vue-query';
import {
  HomeIcon,
  ShoppingCartIcon,
  BanknotesIcon,
  CubeIcon,
  DevicePhoneMobileIcon,
  ArrowsRightLeftIcon,
  UsersIcon,
  TruckIcon,
  ClipboardDocumentListIcon,
  CreditCardIcon,
  DocumentTextIcon,
  WrenchScrewdriverIcon,
  WalletIcon,
  ChartBarIcon,
  ReceiptPercentIcon,
  TagIcon,
  UserGroupIcon,
  CalendarDaysIcon,
  SparklesIcon,
  Squares2X2Icon,
  FireIcon,
  QueueListIcon,
  Cog6ToothIcon,
  LanguageIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  LockClosedIcon,
  LockOpenIcon,
  TicketIcon,
  ExclamationTriangleIcon,
  ViewfinderCircleIcon,
} from '@heroicons/vue/24/outline';
import GlobalSearch from '@/components/layout/GlobalSearch.vue';
import ScanIdentify from '@/components/scan/ScanIdentify.vue';
import PhoneScannerPair from '@/components/scan/PhoneScannerPair.vue';
import { useScreenReceiver } from '@/composables/usePhoneScanner';
import KeyboardShortcuts from '@/components/layout/KeyboardShortcuts.vue';
import SubscriptionBanner from '@/components/layout/SubscriptionBanner.vue';
import AnnouncementBanner from '@/components/layout/AnnouncementBanner.vue';
import PaperOrderModal from '@/components/layout/PaperOrderModal.vue';
import UnlockModal from '@/components/layout/UnlockModal.vue';
import BankTransferModal from '@/components/subscription/BankTransferModal.vue';
import { useAuthStore } from '@/stores/auth';
import { useSubscriptionStore } from '@/stores/subscription';
import { useActivity } from '@/composables/useActivity';
import { settingsApi } from '@/api/misc';
import { LOCALES, LOCALE_NAMES } from '@/i18n';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher.vue';
import { APP_CONFIG, Modules, Plans, Roles, SELLER_MODE_ROUTES } from '@/config/constants';
import { hasManagerRole } from '@/utils/format';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
// On a computer, receive the scans of the phones that send to it (Phone button).
useScreenReceiver(auth.currentUser?.firstName);
const sub = useSubscriptionStore();
const { hasNavItem, productsLabelKey } = useActivity();

const isCashierOnly = computed(() => auth.currentUser?.roles?.includes(Roles.CASHIER) && auth.currentUser?.roles?.length === 1);
const onSubscriptionPage = computed(() => route.path.startsWith('/app/subscription'));
const isBlocked = computed(() => sub.blocked && !onSubscriptionPage.value);
const gatewayEnabled = computed(() => sub.status?.platformSettings?.paymentGatewayEnabled ?? true);
const platformRib = computed(() => sub.status?.platformSettings?.rib ?? null);
const platformBank = computed(() => sub.status?.platformSettings?.bankName ?? null);
const platformHolder = computed(() => sub.status?.platformSettings?.accountHolderName ?? null);
const renewalAmount = computed(() => Number(sub.status?.platformSettings?.firstPlanMonthlyPrice) || 0);

const showBankTransfer = ref(false);
const sidebarOpen = ref(false);
const showPaperOrder = ref(false);
const showUnlock = ref(false);
const locking = ref(false);

onMounted(() => {
  sub.fetchStatus();
  sub.fetchUsage();
});

const { data: tenantSettings } = useQuery({
  queryKey: ['tenant-settings'],
  queryFn: () => settingsApi.getTenantSettings(),
  staleTime: 300_000,
});
const storeTitle = computed(() => tenantSettings.value?.storeName || t('app.name'));

async function lockAccount() {
  locking.value = true;
  try {
    await auth.lock();
    if (!SELLER_MODE_ROUTES.has(route.name)) router.push({ name: 'pos' });
  } finally {
    locking.value = false;
  }
}

const navigation = computed(() => [
  { id: 'dashboard', name: t('nav.dashboard'), href: '/app/dashboard', icon: HomeIcon },
  { id: 'pos', name: t('nav.pos'), href: '/app/pos', icon: ShoppingCartIcon },
  // Phones only: opens CaissePro Scanner (on a computer, POS and Products have their own scan buttons).
  { id: 'scan', name: t('nav.scan'), href: '/scanner', icon: ViewfinderCircleIcon, mobileOnly: true },
  { id: 'cashDrawer', name: t('nav.cashDrawer'), href: '/app/cash-drawer', icon: BanknotesIcon },
  { id: 'products', name: t(productsLabelKey.value), href: '/app/products', icon: CubeIcon },
  { id: 'soldUnits', name: t('nav.soldUnits'), href: '/app/sold-units', icon: DevicePhoneMobileIcon },
  { id: 'categories', name: t('nav.categories'), href: '/app/categories', icon: TagIcon },
  { id: 'inventoryMovements', name: t('nav.inventoryMovements'), href: '/app/inventory-movements', icon: ArrowsRightLeftIcon },
  { id: 'customers', name: t('nav.customers'), href: '/app/customers', icon: UsersIcon },
  { id: 'suppliers', name: t('nav.suppliers'), href: '/app/suppliers', icon: TruckIcon },
  { id: 'supplierOrders', name: t('nav.supplierOrders'), href: '/app/supplier-orders', icon: ClipboardDocumentListIcon },
  { id: 'supplierInvoices', name: t('nav.supplierInvoices'), href: '/app/supplier-invoices', icon: DocumentTextIcon },
  { id: 'transactions', name: t('nav.transactions'), href: '/app/transactions', icon: CreditCardIcon },
  { id: 'invoices', name: t('nav.invoices'), href: '/app/invoices', icon: DocumentTextIcon },
  { id: 'repairs', name: t('nav.repairs'), href: '/app/repairs', icon: WrenchScrewdriverIcon },
  { id: 'debts', name: t('nav.debts'), href: '/app/debts', icon: WalletIcon },
  { id: 'expenses', name: t('nav.expenses'), href: '/app/expenses', icon: ReceiptPercentIcon },
  { id: 'reports', name: t('nav.reports'), href: '/app/reports', icon: ChartBarIcon },
  { id: 'users', name: t('nav.users'), href: '/app/users', icon: UsersIcon },
  { id: 'employees', name: t('employees.title'), href: '/app/employees', icon: UserGroupIcon },
  { id: 'appointments', name: t('nav.appointments'), href: '/app/appointments', icon: CalendarDaysIcon },
  { id: 'services', name: t('nav.services'), href: '/app/services', icon: SparklesIcon },
  { id: 'tables', name: t('nav.tables'), href: '/app/tables', icon: Squares2X2Icon },
  { id: 'kitchen', name: t('nav.kitchen'), href: '/app/kitchen', icon: FireIcon },
  { id: 'menu', name: t('nav.menu'), href: '/app/menu', icon: QueueListIcon },
]);

const visibleNavigation = computed(() =>
  navigation.value.filter((item) => {
    if (auth.sellerMode && !SELLER_MODE_ROUTES.has(router.resolve(item.href).name)) return false;
    if (item.id === 'scan') return true; // every activity
    if (!hasNavItem(item.id)) return false;
    if (item.id === 'users') {
      // Multi-user management is part of the paid plans.
      const plan = sub.status?.plan;
      return auth.currentUser?.roles?.includes(Roles.ADMIN) && [Plans.PROFESSIONNEL, Plans.PREMIUM, Plans.LIFETIME].includes(plan);
    }
    if (['employees', 'expenses', 'categories'].includes(item.id)) return hasManagerRole(auth.currentUser?.roles);
    return true;
  }),
);

const isActive = (href) => (href === '/app/dashboard' ? route.path === '/app/dashboard' : route.path.startsWith(href));


async function logout() {
  await auth.logout();
  router.push({ name: 'login' });
}

async function stopImpersonation() {
  window.location.href = (await auth.stopImpersonation()) ? '/app/superadmin' : '/login';
}

const roleLabel = computed(() => {
  const role = auth.currentUser?.roles?.[0];
  return role ? t(`roles.${role}`) : '';
});

const initials = computed(() => `${auth.currentUser?.firstName?.[0] ?? ''}${auth.currentUser?.lastName?.[0] ?? ''}`);
const supportLink = `https://wa.me/${APP_CONFIG.support.whatsapp}?text=${encodeURIComponent('Bonjour, je souhaite renouveler mon abonnement.')}`;
</script>

<template>
  <div class="min-h-screen bg-gray-50 print:min-h-0 print:bg-white">
    <div v-if="sidebarOpen" class="fixed inset-0 z-40 bg-black/50 print:hidden lg:hidden" @click="sidebarOpen = false" />

    <!-- Sidebar -->
    <aside
      v-if="!isCashierOnly"
      :class="['sidebar print:hidden', sidebarOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full lg:translate-x-0 rtl:lg:translate-x-0']"
    >
      <div class="border-b border-primary-700 px-6 py-5">
        <h1 class="truncate text-lg font-bold text-white">{{ storeTitle }}</h1>
      </div>
      <nav class="flex-1 overflow-y-auto py-4">
        <RouterLink
          v-for="item in visibleNavigation"
          :key="item.href"
          :to="item.href"
          :class="['sidebar-link', isActive(item.href) && 'sidebar-link-active', item.mobileOnly && 'lg:hidden']"
          @click="sidebarOpen = false"
        >
          <component :is="item.icon" class="h-5 w-5" />
          <span>{{ item.name }}</span>
        </RouterLink>
      </nav>
      <div class="space-y-2 border-t border-primary-700 p-4">
        <template v-if="!auth.sellerMode">
          <RouterLink to="/app/settings" class="sidebar-link" :class="isActive('/app/settings') && 'sidebar-link-active'">
            <Cog6ToothIcon class="h-5 w-5" />
            <span>{{ t('nav.settings') }}</span>
          </RouterLink>
        </template>
        <div class="flex items-center gap-2 px-3 py-1.5 text-sm">
          <LanguageIcon class="h-5 w-5 shrink-0 opacity-80" />
          <div class="flex flex-1 gap-1">
            <button
              v-for="l in LOCALES"
              :key="l"
              :lang="l"
              :title="LOCALE_NAMES[l]"
              :class="['flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors', $i18n.locale === l ? 'bg-white text-gray-900' : 'text-white/70 hover:bg-white/10 hover:text-white']"
              @click="auth.setLanguage(l)"
            >
              {{ l === 'ar' ? 'ع' : l.toUpperCase() }}
            </button>
          </div>
        </div>
        <button v-if="!auth.sellerMode" class="sidebar-link w-full text-red-400 hover:bg-red-600 hover:text-white" @click="logout">
          <ArrowRightOnRectangleIcon class="h-5 w-5" />
          <span>{{ t('nav.logout') }}</span>
        </button>
      </div>
    </aside>

    <div :class="['print:ps-0', !isCashierOnly && 'lg:ps-64']">
      <!-- Cashier-only header -->
      <header v-if="isCashierOnly" class="sticky top-0 z-30 bg-white shadow-sm print:hidden">
        <div class="flex h-16 items-center justify-between px-4 lg:px-8">
          <div class="text-sm font-medium text-gray-900">{{ auth.currentUser?.firstName }} {{ auth.currentUser?.lastName }}</div>
          <div class="flex items-center gap-2">
            <button class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-stone-700 transition-colors hover:bg-gray-100" @click="showPaperOrder = true">
              <TicketIcon class="h-4 w-4" />
              <span class="hidden sm:inline">{{ t('paperOrders.button') }}</span>
            </button>
            <LanguageSwitcher compact />
            <button class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50" @click="logout">
              <ArrowRightOnRectangleIcon class="h-4 w-4" /> {{ t('nav.logout') }}
            </button>
          </div>
        </div>
      </header>

      <!-- Main header -->
      <header v-else class="sticky top-0 z-30 bg-white shadow-sm print:hidden">
        <div class="flex h-16 items-center justify-between px-4 lg:px-8">
          <button class="rounded-lg p-2 hover:bg-gray-100 lg:hidden" @click="sidebarOpen = !sidebarOpen">
            <XMarkIcon v-if="sidebarOpen" class="h-6 w-6" />
            <Bars3Icon v-else class="h-6 w-6" />
          </button>
          <div class="flex flex-1 justify-center"><GlobalSearch /></div>
          <div class="flex items-center gap-3">
            <ScanIdentify />
            <PhoneScannerPair />
            <LanguageSwitcher compact />
            <template v-if="auth.hasModule(Modules.SELLER_MODE)">
              <button
                v-if="auth.sellerMode"
                class="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100"
                @click="showUnlock = true"
              >
                <LockOpenIcon class="h-4 w-4" />
                <span class="hidden sm:inline">{{ t('sellerMode.unlock') }}</span>
              </button>
              <button
                v-else
                :disabled="locking"
                class="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-stone-300 hover:bg-gray-50 disabled:opacity-50"
                @click="lockAccount"
              >
                <LockClosedIcon class="h-4 w-4" />
                <span class="hidden sm:inline">{{ t('sellerMode.lock') }}</span>
              </button>
            </template>
            <button
              class="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-stone-300 hover:bg-gray-50"
              @click="showPaperOrder = true"
            >
              <TicketIcon class="h-4 w-4" />
              <span class="hidden sm:inline">{{ t('paperOrders.button') }}</span>
            </button>
            <div class="flex items-center gap-3">
              <div class="hidden text-end sm:block">
                <p class="text-sm font-medium text-gray-900">{{ auth.currentUser?.firstName }} {{ auth.currentUser?.lastName }}</p>
                <p class="text-xs text-gray-500">{{ roleLabel }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100">
                <span class="text-sm font-medium text-primary-800">{{ initials }}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <SubscriptionBanner @show-bank-transfer="showBankTransfer = true" />
      <AnnouncementBanner />

      <div v-if="auth.isImpersonating" class="flex items-center justify-between bg-amber-500 px-4 py-2 text-white print:hidden">
        <div class="flex items-center gap-2 text-sm font-medium">
          <ExclamationTriangleIcon class="h-5 w-5" />
          <span>{{ t('impersonation.banner', { name: `${auth.currentUser?.firstName} ${auth.currentUser?.lastName}` }) }}</span>
        </div>
        <button class="rounded-md bg-white px-3 py-1 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50" @click="stopImpersonation">
          {{ t('impersonation.stop') }}
        </button>
      </div>

      <!-- Blocked (expired / suspended / cancelled) -->
      <div v-if="isBlocked" class="flex min-h-[60vh] items-center justify-center p-8">
        <div class="max-w-md text-center">
          <div class="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <LockClosedIcon class="h-8 w-8 text-red-600" />
          </div>
          <h2 class="mb-2 text-xl font-bold text-gray-900">
            {{
              sub.blockedReason === 'suspended'
                ? t('subscription.expired.suspendedTitle')
                : sub.blockedReason === 'cancelled'
                  ? t('subscription.expired.cancelledTitle')
                  : t('subscription.expired.title')
            }}
          </h2>
          <p class="mb-6 text-gray-500">
            {{
              sub.blockedReason === 'suspended'
                ? t('subscription.expired.suspendedMessage')
                : sub.blockedReason === 'cancelled'
                  ? t('subscription.expired.cancelledMessage')
                  : t('subscription.expired.message')
            }}
          </p>
          <div class="space-y-3">
            <RouterLink
              v-if="gatewayEnabled"
              to="/app/subscription"
              class="block w-full rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800"
            >
              {{ t('subscription.expired.renew') }}
            </RouterLink>
            <button
              v-else
              class="block w-full rounded-lg bg-stone-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800"
              @click="showBankTransfer = true"
            >
              {{ t('subscription.expired.renew') }}
            </button>
            <a
              :href="supportLink"
              target="_blank"
              rel="noopener"
              class="block w-full rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              {{ t('subscription.expired.contactSupport') }}
            </a>
          </div>
        </div>
      </div>

      <main v-else class="p-4 print:p-0 lg:p-8">
        <Suspense>
          <RouterView />
          <template #fallback>
            <div class="flex h-64 items-center justify-center">
              <p class="text-gray-500">{{ t('common.loading') }}</p>
            </div>
          </template>
        </Suspense>
      </main>
    </div>

    <div class="print:hidden"><KeyboardShortcuts /></div>

    <BankTransferModal
      :show="showBankTransfer"
      :amount="renewalAmount"
      :rib="platformRib"
      :bank-name="platformBank"
      :account-holder-name="platformHolder"
      @close="showBankTransfer = false"
    />
    <PaperOrderModal :show="showPaperOrder" @close="showPaperOrder = false" />
    <UnlockModal :show="showUnlock" @close="showUnlock = false" />

    <div v-if="auth.lockNotice" class="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 print:hidden">
      <div class="flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-3 text-sm text-white shadow-sm">
        <LockClosedIcon class="h-4 w-4 shrink-0" />
        <span>{{ t('sellerMode.blocked') }}</span>
      </div>
    </div>
  </div>
</template>
