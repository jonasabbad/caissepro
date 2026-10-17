<script setup>
import { hasManagerRole } from '@/utils/format';
import { useAuthStore } from '@/stores/auth';
import { intlLocale } from '@/i18n';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQuery } from '@tanstack/vue-query';
import {
  BanknotesIcon,
  BuildingStorefrontIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  ClipboardDocumentListIcon,
  CurrencyDollarIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  ShoppingCartIcon,
  TruckIcon,
  UsersIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/vue/24/outline';
import { dashboardApi } from '@/api/dashboard';
import { transactionsApi } from '@/api/transactions';
import { storesApi } from '@/api/misc';
import { useActivity } from '@/composables/useActivity';
import { useSubscriptionStore } from '@/stores/subscription';
import { Plans } from '@/config/constants';
import { formatCurrency } from '@/utils/format';
import KpiCard from '@/components/dashboard/KpiCard.vue';
import SalesChart from '@/components/dashboard/SalesChart.vue';

const { t } = useI18n();
const canManageExpenses = computed(() => hasManagerRole(useAuthStore().currentUser?.roles));
const { hasWidget, productsLabelKey } = useActivity();
const subscription = useSubscriptionStore();

// Multi-store selector only on the multi-store plan with several stores.
const isPremium = computed(() => subscription.status?.plan === Plans.PREMIUM);
const { data: stores } = useQuery({ queryKey: ['stores-active'], queryFn: () => storesApi.getActive(), enabled: isPremium });
const multiStore = computed(() => (stores.value?.length ?? 0) > 1);
const storeFilter = ref('all');
const storeId = computed(() => (isPremium.value && multiStore.value && storeFilter.value !== 'all' ? storeFilter.value : undefined));

const preset = ref('today');
const customFrom = ref('');
const customTo = ref('');
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const range = computed(() => {
  const now = new Date();
  switch (preset.value) {
    case 'week': {
      const start = new Date(now);
      start.setDate(start.getDate() - ((start.getDay() || 7) - 1));
      return { startDate: iso(start), endDate: iso(now) };
    }
    case 'month':
      return { startDate: iso(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: iso(now) };
    case 'custom':
      return { startDate: customFrom.value || iso(now), endDate: customTo.value || iso(now) };
    default:
      return { startDate: iso(now), endDate: iso(now) };
  }
});

const { data: kpis } = useQuery({
  queryKey: ['dashboard-kpis', range, storeId],
  queryFn: () => dashboardApi.getKpis(range.value.startDate, range.value.endDate, storeId.value),
  refetchInterval: 60_000,
});
const { data: trend, isLoading: trendLoading } = useQuery({
  queryKey: ['dashboard-sales-trend', range, storeId],
  queryFn: () => dashboardApi.getSalesTrend(30, range.value.startDate, range.value.endDate, storeId.value),
});
const { data: topProducts } = useQuery({
  queryKey: ['dashboard-top-products', range, storeId],
  queryFn: () => dashboardApi.getTopProducts(5, 30, range.value.startDate, range.value.endDate, storeId.value),
});
const { data: lowStock } = useQuery({ queryKey: ['dashboard-low-stock', storeId], queryFn: () => dashboardApi.getLowStock(5, storeId.value) });
const { data: storeBreakdown } = useQuery({
  queryKey: ['dashboard-store-breakdown', range],
  queryFn: () => dashboardApi.getStoreBreakdown(range.value.startDate, range.value.endDate),
  enabled: computed(() => isPremium.value && multiStore.value && storeFilter.value === 'all'),
});
const { data: recent } = useQuery({ queryKey: ['dashboard-recent-transactions'], queryFn: () => transactionsApi.getAll({ limit: 5 }) });
const recentTransactions = computed(() => recent.value?.transactions || []);

const salesTitle = computed(() =>
  preset.value === 'today' ? t('dashboard.dailySales') : preset.value === 'week' ? t('dashboard.thisWeek') : preset.value === 'month' ? t('dashboard.thisMonth') : t('dashboard.period'),
);
const profit = computed(() => kpis.value?.realProfit?.total ?? 0);
const pnl = computed(() => kpis.value?.profitBreakdown);
const STATUS_BADGE = { completed: 'badge-success', pending: 'badge-warning', partial: 'badge-info' };
const when = (d) => new Date(d).toLocaleDateString(intlLocale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const PRESETS = computed(() => [
  { key: 'today', label: t('dashboard.today') },
  { key: 'week', label: t('dashboard.thisWeek') },
  { key: 'month', label: t('dashboard.thisMonth') },
  { key: 'custom', label: t('dashboard.custom') },
]);
</script>

<template>
  <div>
    <div class="flex flex-wrap gap-2 mb-6">
      <RouterLink to="/app/pos" class="btn-primary inline-flex items-center gap-2"><ShoppingCartIcon class="w-5 h-5" /> {{ t('dashboard.newSale') }}</RouterLink>
      <RouterLink to="/app/products/new" class="btn-secondary inline-flex items-center gap-2"><PlusIcon class="w-5 h-5" /> {{ t(productsLabelKey) }}</RouterLink>
      <RouterLink to="/app/supplier-orders/new" class="btn-secondary inline-flex items-center gap-2"><TruckIcon class="w-5 h-5" /> {{ t('supplierOrders.title') }}</RouterLink>
      <RouterLink to="/app/reports" class="btn-secondary inline-flex items-center gap-2"><ChartBarIcon class="w-5 h-5" /> {{ t('nav.reports') }}</RouterLink>
    </div>

    <div class="flex flex-wrap items-center gap-3 mb-6">
      <div v-if="isPremium && multiStore" class="flex items-center gap-2">
        <BuildingStorefrontIcon class="w-5 h-5 text-gray-500" />
        <select v-model="storeFilter" class="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white">
          <option value="all">{{ t('dashboard.allStores') }}</option>
          <option v-for="s in stores" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </div>
      <CalendarDaysIcon class="w-5 h-5 text-gray-500" />
      <div class="inline-flex rounded-lg border border-gray-200 overflow-hidden">
        <button
          v-for="p in PRESETS"
          :key="p.key"
          :class="['px-3 py-1.5 text-sm font-medium transition-colors', preset === p.key ? 'bg-black text-white' : 'bg-white text-gray-600 hover:bg-gray-50']"
          @click="preset = p.key"
        >
          {{ p.label }}
        </button>
      </div>
      <template v-if="preset === 'custom'">
        <input v-model="customFrom" type="date" class="px-2 py-1.5 text-sm border border-gray-200 rounded-lg" />
        <span class="text-gray-400 text-sm">—</span>
        <input v-model="customTo" type="date" class="px-2 py-1.5 text-sm border border-gray-200 rounded-lg" />
      </template>
      <span v-else class="text-sm text-gray-500">{{ range.startDate }} — {{ range.endDate }}</span>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
      <KpiCard
        v-if="hasWidget('dailySales')"
        :title="salesTitle"
        :value="formatCurrency(kpis?.dailySales?.total ?? 0)"
        :change="kpis?.dailySales?.comparison"
        :icon="CurrencyDollarIcon"
        color="blue"
      />
      <KpiCard
        v-if="hasWidget('realProfit')"
        :title="t('dashboard.realProfit')"
        :value="formatCurrency(profit, 'DH', profit > 0 ? '+' : '')"
        :subtitle="`${(kpis?.realProfit?.margin ?? 0).toFixed(1)}% ${t('dashboard.margin')}`"
        :change="kpis?.realProfit?.comparison"
        :icon="BanknotesIcon"
        :color="profit >= 0 ? 'green' : 'red'"
      />
      <KpiCard
        v-if="hasWidget('customerDebt')"
        :title="t('dashboard.customerDebt')"
        :value="formatCurrency(kpis?.customerDebt?.total ?? 0)"
        :subtitle="`${kpis?.customerDebt?.count ?? 0} ${t('dashboard.clients')}`"
        :icon="UsersIcon"
        color="amber"
      />
      <KpiCard
        v-if="hasWidget('supplierDebt')"
        :title="t('dashboard.supplierDebt')"
        :value="formatCurrency(kpis?.supplierDebt?.total ?? 0)"
        :subtitle="`${kpis?.supplierDebt?.count ?? 0} ${t('dashboard.fournisseurs')}`"
        :icon="TruckIcon"
        color="red"
      />
      <KpiCard
        :title="t('dashboard.repairs')"
        :value="formatCurrency(kpis?.repairs?.revenue ?? 0)"
        :subtitle="`${t('dashboard.repairProfit')}: ${formatCurrency(kpis?.repairs?.profit ?? 0)} · ${kpis?.repairs?.count ?? 0} ${t('dashboard.realized')}`"
        :change="kpis?.repairs?.comparison"
        :icon="WrenchScrewdriverIcon"
        color="green"
      />
    </div>

    <div v-if="pnl" class="card p-5 mb-6">
      <h2 class="font-semibold text-gray-900 mb-1">{{ t('dashboard.profitStatement') }}</h2>
      <p class="text-xs text-gray-500 mb-4">{{ t('dashboard.profitStatementHint') }}</p>
      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 text-sm">
        <div class="rounded-lg bg-gray-50 p-3">
          <p class="text-gray-500">{{ t('dashboard.revenue') }}</p>
          <p class="text-lg font-bold text-gray-900">{{ formatCurrency(pnl.totals.revenue) }}</p>
          <p class="text-xs text-gray-500">{{ t('dashboard.salesShort') }} {{ formatCurrency(pnl.sales.netRevenue) }} · {{ t('dashboard.repairsShort') }} {{ formatCurrency(pnl.repairs.revenue) }}</p>
        </div>
        <div class="rounded-lg bg-gray-50 p-3">
          <p class="text-gray-500">{{ t('dashboard.cogs') }}</p>
          <p class="text-lg font-bold text-gray-900">{{ formatCurrency(pnl.totals.cogs, 'DH', '−') }}</p>
          <p class="text-xs text-gray-500">{{ t('dashboard.cogsHint') }}</p>
        </div>
        <div class="rounded-lg bg-gray-50 p-3">
          <p class="text-gray-500">{{ t('dashboard.repairCosts') }}</p>
          <p class="text-lg font-bold text-gray-900">{{ formatCurrency(pnl.totals.repairCosts ?? 0, 'DH', '−') }}</p>
          <p class="text-xs text-gray-500">{{ t('dashboard.repairCostsHint', { parts: formatCurrency(pnl.repairs.partsCost), other: formatCurrency(pnl.repairs.laborCost + pnl.repairs.otherCost) }) }}</p>
        </div>
        <div class="rounded-lg bg-gray-50 p-3">
          <p class="text-gray-500">{{ t('dashboard.grossProfit') }}</p>
          <p class="text-lg font-bold text-gray-900">{{ formatCurrency(pnl.totals.grossProfit) }}</p>
        </div>
        <div class="rounded-lg bg-gray-50 p-3">
          <p class="text-gray-500">{{ t('dashboard.directExpenses') }}</p>
          <p class="text-lg font-bold text-gray-900">{{ formatCurrency(pnl.totals.directExpenses, 'DH', '−') }}</p>
          <p class="text-xs text-gray-500">{{ t('dashboard.directExpensesHint') }}</p>
          <div v-if="canManageExpenses" class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium">
            <RouterLink :to="{ name: 'expenses', query: { new: 1 } }" class="text-primary-600 hover:underline">+ {{ t('expenses.add') }}</RouterLink>
            <RouterLink :to="{ name: 'expenses' }" class="text-gray-600 hover:underline">{{ t('expenses.manage') }}</RouterLink>
          </div>
        </div>
        <div :class="['rounded-lg p-3', pnl.totals.netProfit >= 0 ? 'bg-success-50' : 'bg-danger-50']">
          <p class="text-gray-500">{{ t('dashboard.netProfit') }}</p>
          <p :class="['text-lg font-bold', pnl.totals.netProfit >= 0 ? 'text-success-700' : 'text-danger-700']">{{ formatCurrency(pnl.totals.netProfit) }}</p>
          <p class="text-xs text-gray-500">{{ pnl.totals.margin.toFixed(1) }}% {{ t('dashboard.margin') }}</p>
        </div>
      </div>
    </div>

    <div v-if="isPremium && multiStore && storeFilter === 'all' && storeBreakdown?.length" class="mb-6">
      <h2 class="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2"><BuildingStorefrontIcon class="w-5 h-5 text-gray-500" /> {{ t('dashboard.storePerformance') }}</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <div
          v-for="s in storeBreakdown"
          :key="s.storeId"
          class="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 transition-colors cursor-pointer"
          @click="storeFilter = s.storeId"
        >
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-gray-900">{{ s.storeName }}</h3>
            <span class="text-xs text-gray-500 font-mono">{{ s.storeCode }}</span>
          </div>
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div><p class="text-gray-500">{{ t('dashboard.sales') }}</p><p class="font-semibold">{{ formatCurrency(s.sales) }}</p></div>
            <div><p class="text-gray-500">{{ t('dashboard.transactions') }}</p><p class="font-semibold">{{ s.transactionCount }}</p></div>
            <div>
              <p class="text-gray-500">{{ t('dashboard.profit') }}</p>
              <p :class="['font-semibold', s.profit >= 0 ? 'text-green-600' : 'text-red-600']">{{ formatCurrency(s.profit) }}</p>
            </div>
            <div><p class="text-gray-500">{{ t('dashboard.drawer') }}</p><p class="font-semibold">{{ formatCurrency(s.caisseBalance) }}</p></div>
          </div>
          <div class="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div :class="['h-full rounded-full', s.margin >= 20 ? 'bg-green-500' : s.margin >= 10 ? 'bg-amber-500' : 'bg-red-500']" :style="{ width: `${Math.min(Math.max(s.margin, 0), 100)}%` }" />
          </div>
          <p class="text-xs text-gray-500 mt-1">{{ s.margin.toFixed(1) }}% {{ t('dashboard.margin') }}</p>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
      <div v-if="hasWidget('salesTrend')" class="card lg:col-span-2">
        <div class="px-5 py-4 border-b border-gray-100"><h2 class="font-semibold text-gray-900">{{ t('dashboard.salesTrend') }}</h2></div>
        <div class="p-4">
          <div v-if="trendLoading" class="flex items-center justify-center h-80"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-black" /></div>
          <SalesChart v-else-if="trend?.length" :data="trend" />
          <div v-else class="flex items-center justify-center h-80 text-gray-400">{{ t('common.noResults') }}</div>
        </div>
      </div>
      <div v-if="hasWidget('topProducts')" class="card">
        <div class="px-5 py-4 border-b border-gray-100"><h2 class="font-semibold text-gray-900">{{ t('dashboard.topProducts') }}</h2></div>
        <div class="p-5 space-y-4">
          <div v-for="(p, i) in topProducts || []" :key="p.productId" class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-700 shrink-0">{{ i + 1 }}</div>
              <div class="min-w-0">
                <p class="font-medium text-gray-900 truncate">{{ p.productName }}</p>
                <p class="text-xs text-gray-500 font-mono truncate">{{ p.sku }}</p>
              </div>
            </div>
            <div class="text-end shrink-0">
              <p class="text-sm font-medium text-gray-900">{{ p.quantity }} {{ t('common.units') }}</p>
              <p class="text-xs text-gray-500">{{ formatCurrency(p.revenue) }}</p>
            </div>
          </div>
          <div v-if="!topProducts?.length" class="text-center text-gray-400 py-6">{{ t('common.noResults') }}</div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div v-if="hasWidget('recentTransactions')" class="card lg:col-span-2">
        <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <ClipboardDocumentListIcon class="w-5 h-5 text-gray-500" />
            <h2 class="font-semibold text-gray-900">{{ t('dashboard.recentTransactions') }}</h2>
          </div>
          <RouterLink to="/app/transactions" class="text-sm text-primary-600 hover:underline">{{ t('common.viewAll') }}</RouterLink>
        </div>
        <div class="divide-y divide-gray-100">
          <RouterLink v-for="tx in recentTransactions" :key="tx.id" :to="`/app/transactions/${tx.id}`" class="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <p class="font-medium text-gray-900 font-mono">{{ tx.transactionNumber }}</p>
                <span v-if="tx.type === 'reservation'" class="badge bg-purple-100 text-purple-700 text-xs">{{ t('reservation.title') }}</span>
                <span v-else-if="tx.type === 'credit'" class="badge bg-blue-100 text-blue-700 text-xs">{{ t('transactions.type.credit') }}</span>
                <span v-else-if="tx.type === 'return'" class="badge bg-red-100 text-red-700 text-xs">{{ t('transactions.type.return') }}</span>
                <span v-else-if="tx.type === 'exchange'" class="badge bg-amber-100 text-amber-700 text-xs">{{ t('transactions.type.exchange') }}</span>
              </div>
              <p class="text-sm text-gray-500">{{ when(tx.createdAt) }}</p>
            </div>
            <div class="text-end">
              <p class="font-semibold text-gray-900">{{ formatCurrency(tx.totalAmount) }}</p>
              <div v-if="tx.status === 'partial'" class="flex items-center gap-1 justify-end">
                <span class="text-xs text-success-600">{{ t('transactions.paidAmount', { amount: formatCurrency(tx.amountPaid) }) }}</span><span class="text-xs text-gray-400">·</span>
                <span class="text-xs text-danger-600">{{ t('transactions.dueAmount', { amount: formatCurrency(tx.totalAmount - tx.amountPaid) }) }}</span>
              </div>
              <span v-else :class="['badge text-xs', STATUS_BADGE[tx.status] || 'badge-secondary']">{{ t(`transactions.status.${tx.status}`) }}</span>
            </div>
          </RouterLink>
          <div v-if="!recentTransactions.length" class="p-8 text-center text-gray-400">{{ t('common.noResults') }}</div>
        </div>
      </div>
      <div v-if="hasWidget('lowStock') && lowStock?.length" class="card">
        <div class="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <ExclamationTriangleIcon class="w-5 h-5 text-warning-500" />
          <h2 class="font-semibold text-gray-900">{{ t('dashboard.lowStockAlerts') }}</h2>
        </div>
        <div class="p-4 space-y-2">
          <div v-for="p in lowStock" :key="p.id" class="flex items-center justify-between p-3 bg-warning-50 rounded-lg">
            <div class="min-w-0">
              <p class="font-medium text-gray-900 truncate">{{ p.name }}</p>
              <p class="text-xs text-gray-500 font-mono">{{ p.sku }}</p>
            </div>
            <div class="text-end shrink-0">
              <p class="text-lg font-bold text-warning-600">{{ p.stockQuantity }}</p>
              <p class="text-xs text-gray-500">{{ t('common.remaining') }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
