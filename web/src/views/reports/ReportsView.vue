<script setup>
import { intlLocale } from '@/i18n';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQuery } from '@tanstack/vue-query';
import {
  ArchiveBoxIcon,
  BanknotesIcon,
  BuildingLibraryIcon,
  ChartBarIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CubeIcon,
  DevicePhoneMobileIcon,
  DocumentArrowDownIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  ShoppingBagIcon,
  TruckIcon,
  UsersIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/vue/24/outline';
import { http } from '@/api/http';
import { reservationRefundsApi } from '@/api/reservations';
import { soldUnitsApi } from '@/api/soldUnits';
import { repairersApi } from '@/api/repairs';
import { useAuthStore } from '@/stores/auth';
import { formatCurrency } from '@/utils/format';
import { summaryPdfBlob } from '@/utils/invoicePdf';
import DateRangePicker from '@/components/ui/DateRangePicker.vue';

const { t, te } = useI18n();
const auth = useAuthStore();
const isPhoneSeller = computed(() => auth.activityType === 'phone_seller');
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const now = new Date();
const range = ref([iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(now)]);
const period = computed(() => ({ from: range.value?.[0] || iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: range.value?.[1] || iso(now) }));
const tab = ref('sales');
const TABS = computed(() => [
  { id: 'sales', icon: ShoppingBagIcon, label: 'reports.sales' },
  { id: 'inventory', icon: isPhoneSeller.value ? DevicePhoneMobileIcon : CubeIcon, label: 'reports.inventory' },
  { id: 'customers', icon: UsersIcon, label: 'reports.customers' },
  { id: 'suppliers', icon: TruckIcon, label: 'reports.suppliers' },
  { id: 'repairs', icon: WrenchScrewdriverIcon, label: 'reports.repairs' },
]);
// Repairs tab filters.
const repairFilters = ref({ repairerId: '', status: '', paymentStatus: '' });
const { data: repairers } = useQuery({ queryKey: ['repairers-all'], queryFn: () => repairersApi.getAll(), enabled: computed(() => tab.value === 'repairs') });

const { data: report, isLoading } = useQuery({
  queryKey: computed(() => ['report', tab.value, period.value.from, period.value.to, tab.value === 'repairs' ? { ...repairFilters.value } : null]),
  queryFn: async () => {
    const extra = tab.value === 'repairs' ? Object.fromEntries(Object.entries(repairFilters.value).filter(([, v]) => v)) : {};
    return (await http.get('/reports', { params: { type: tab.value, dateFrom: period.value.from, dateTo: period.value.to, ...extra } })).data.data.report;
  },
});
const sales = computed(() => (tab.value === 'sales' ? report.value : null));
const inventory = computed(() => (tab.value === 'inventory' ? report.value : null));
const customers = computed(() => (tab.value === 'customers' ? report.value : null));
const suppliers = computed(() => (tab.value === 'suppliers' ? report.value : null));
const repairsReport = computed(() => (tab.value === 'repairs' ? report.value : null));
const REPAIR_STATUSES = ['pending', 'in_progress', 'completed', 'delivered', 'cancelled'];
const PAYMENT_STATUSES = ['unpaid', 'partial', 'paid'];
const PAY_BADGE = { unpaid: 'bg-red-100 text-red-700', partial: 'bg-amber-100 text-amber-700', paid: 'bg-emerald-100 text-emerald-700' };

const onCustomers = computed(() => tab.value === 'customers');
const refundParams = computed(() => ({ dateFrom: period.value.from, dateTo: period.value.to }));
const { data: refundSummary } = useQuery({ queryKey: ['refunds-summary', refundParams], queryFn: () => reservationRefundsApi.getSummary(refundParams.value), enabled: onCustomers });
const { data: pendingRefunds } = useQuery({ queryKey: ['pending-refunds', refundParams], queryFn: () => reservationRefundsApi.getPending(refundParams.value), enabled: onCustomers });
const { data: doneRefunds } = useQuery({
  queryKey: ['completed-refunds', refundParams],
  queryFn: async () => {
    const [done, partial] = await Promise.all([reservationRefundsApi.getCompleted(refundParams.value), reservationRefundsApi.getPartial(refundParams.value)]);
    return [...partial, ...done];
  },
  enabled: onCustomers,
});
const { data: reserved } = useQuery({ queryKey: ['reserved-units'], queryFn: () => soldUnitsApi.getReserved(), enabled: onCustomers });

const METHOD_KEY = { cash: 'cash', bank_transfer: 'transfer', transfer: 'transfer', card: 'card', check: 'check', cheque: 'check', credit: 'credit', mobile_money: 'mobile' };
const methodLabel = (m) => (METHOD_KEY[m] ? t(`payment.${METHOD_KEY[m]}`) : m);
const cashTotal = computed(() => (sales.value?.byPaymentMethod || []).filter((m) => m.method === 'cash').reduce((s, m) => s + Number(m.amount), 0));
const transferTotal = computed(() => (sales.value?.byPaymentMethod || []).filter((m) => ['bank_transfer', 'transfer'].includes(m.method)).reduce((s, m) => s + Number(m.amount), 0));
const methodMax = computed(() => Math.max(1, ...(sales.value?.byPaymentMethod || []).map((m) => m.amount)));
const hasSellers = computed(() => (sales.value?.bySeller || []).some((s) => !!s.employeeId));
const barMax = computed(() => (sales.value?.byDay?.length ? Math.max(...sales.value.byDay.map((d) => d.sales)) * 1.1 || 100 : 100));
const barDay = (d) => new Date(d).toLocaleDateString(intlLocale(), { weekday: 'short', day: 'numeric' });
const shortDate = (d) => new Date(d).toLocaleDateString(intlLocale(), { day: '2-digit', month: 'short', year: 'numeric' });

// ── Inventory: devices by brand/model ──
const deviceTypeLabel = (d) => (d === 'accessory' ? t('reports.accessory') : te(`soldUnits.deviceTypes.${d}.name`) ? t(`soldUnits.deviceTypes.${d}.name`) : d);
const conditionLabel = (c) => (te(`soldUnits.conditions.${c}`) ? t(`soldUnits.conditions.${c}`) : c);
const PAGE = 15;
const modelRows = computed(() => {
  const rows = [];
  for (const b of inventory.value?.byBrand || [])
    for (const m of b.models) {
      rows.push({
        brand: b.brand,
        model: m.model,
        variants: (m.variants || []).map((v) => `${[v.storage, v.color].filter(Boolean).join(' ')} (${v.inStock})`).join(', '),
        storages: [...new Set((m.variants || []).map((v) => v.storage).filter(Boolean))],
        conditions: m.conditions || [],
        deviceTypes: m.deviceTypes || [],
        inStock: m.inStock,
        sold: m.sold,
        value: m.value,
      });
    }
  return rows;
});
const mSearch = ref('');
const mBrand = ref(null);
const mStorage = ref(null);
const mCondition = ref(null);
const mType = ref(null);
const mStock = ref('all');
const mSort = ref('inStock');
const mDir = ref('desc');
const mPage = ref(1);
const filteredModels = computed(() => {
  let rows = [...modelRows.value];
  const q = mSearch.value.toLowerCase();
  if (q) rows = rows.filter((r) => r.model.toLowerCase().includes(q) || r.brand.toLowerCase().includes(q) || r.variants.toLowerCase().includes(q));
  if (mBrand.value) rows = rows.filter((r) => r.brand === mBrand.value);
  if (mStorage.value) rows = rows.filter((r) => r.storages.includes(mStorage.value));
  if (mCondition.value) rows = rows.filter((r) => r.conditions.includes(mCondition.value));
  if (mType.value) rows = rows.filter((r) => r.deviceTypes.includes(mType.value));
  if (mStock.value === 'inStock') rows = rows.filter((r) => r.inStock > 2);
  else if (mStock.value === 'lowStock') rows = rows.filter((r) => r.inStock > 0 && r.inStock <= 2);
  else if (mStock.value === 'outOfStock') rows = rows.filter((r) => r.inStock === 0);
  const dir = mDir.value === 'asc' ? 1 : -1;
  return rows.sort((a, b) => (mSort.value === 'model' ? dir * a.model.localeCompare(b.model) : dir * (a[mSort.value] - b[mSort.value])));
});
const modelPages = computed(() => Math.ceil(filteredModels.value.length / PAGE));
const pagedModels = computed(() => filteredModels.value.slice((mPage.value - 1) * PAGE, mPage.value * PAGE));
const brands = computed(() => (inventory.value?.byBrand || []).map((b) => b.brand));
const storages = computed(() => [...new Set(modelRows.value.flatMap((r) => r.storages))].sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0)));
const conditions = computed(() => [...new Set(modelRows.value.flatMap((r) => r.conditions))]);
const deviceTypes = computed(() => [...new Set(modelRows.value.flatMap((r) => r.deviceTypes))]);
const modelFiltered = computed(() => mSearch.value || mBrand.value || mStorage.value || mCondition.value || mType.value || mStock.value !== 'all');
function clearModelFilters() {
  mSearch.value = '';
  mBrand.value = mStorage.value = mCondition.value = mType.value = null;
  mStock.value = 'all';
  mPage.value = 1;
}
function sortModels(col) {
  if (mSort.value === col) mDir.value = mDir.value === 'asc' ? 'desc' : 'asc';
  else {
    mSort.value = col;
    mDir.value = col === 'model' ? 'asc' : 'desc';
  }
  mPage.value = 1;
}
watch([mSearch, mBrand, mStorage, mCondition, mType, mStock], () => (mPage.value = 1));

// ── Inventory: products by category ──
const productRows = computed(() => (inventory.value?.byCategory || []).flatMap((c) => c.products.map((p) => ({ categoryId: c.categoryId, categoryName: c.categoryName, ...p }))));
const pSearch = ref('');
const pCategory = ref(null);
const pStock = ref('all');
const pPage = ref(1);
const filteredProducts = computed(() => {
  let rows = [...productRows.value];
  const q = pSearch.value.toLowerCase();
  if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.sku?.toLowerCase().includes(q) || r.categoryName.toLowerCase().includes(q));
  if (pCategory.value) rows = rows.filter((r) => r.categoryId === pCategory.value);
  if (pStock.value === 'inStock') rows = rows.filter((r) => r.stockQuantity > r.minStockLevel);
  else if (pStock.value === 'lowStock') rows = rows.filter((r) => r.stockQuantity > 0 && r.stockQuantity <= r.minStockLevel);
  else if (pStock.value === 'outOfStock') rows = rows.filter((r) => r.stockQuantity === 0);
  return rows;
});
const productPages = computed(() => Math.ceil(filteredProducts.value.length / PAGE));
const pagedProducts = computed(() => filteredProducts.value.slice((pPage.value - 1) * PAGE, pPage.value * PAGE));
const categories = computed(() => (inventory.value?.byCategory || []).map((c) => ({ id: c.categoryId, name: c.categoryName })));
const productFiltered = computed(() => pSearch.value || pCategory.value || pStock.value !== 'all');
function clearProductFilters() {
  pSearch.value = '';
  pCategory.value = null;
  pStock.value = 'all';
  pPage.value = 1;
}
watch([pSearch, pCategory, pStock], () => (pPage.value = 1));

// ── PDF export (built in the browser) ──
const dh = (v) => `${new Intl.NumberFormat(intlLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0)} DH`;
async function exportPdf() {
  const r = report.value;
  if (!r) return;
  const doc = { title: te(`reports.pdfTitle.${tab.value}`) ? t(`reports.pdfTitle.${tab.value}`) : '', period: period.value, summary: [], tables: [] };
  if (tab.value === 'sales') {
    doc.summary = [
      { label: t('reports.totalSales'), value: dh(r.summary.totalSales) },
      { label: t('reports.totalProfit'), value: dh(r.summary.totalProfit) },
      { label: t('reports.transactionCount'), value: String(r.summary.totalTransactions) },
      { label: t('reports.avgTicket'), value: dh(r.summary.averageTransaction) },
    ];
    if (r.topProducts?.length) doc.tables.push({ title: t('reports.topProducts'), headers: [t('reports.product'), t('reports.quantity'), t('reports.revenue')], rows: r.topProducts.map((p) => [p.name, String(p.quantity), dh(p.revenue)]) });
    if (r.byPaymentMethod?.length) doc.tables.push({ title: t('reports.paymentMethods'), headers: [t('reports.method'), t('reports.amount'), t('dashboard.transactions')], rows: r.byPaymentMethod.map((m) => [methodLabel(m.method), dh(m.amount), String(m.count)]) });
  } else if (tab.value === 'inventory') {
    doc.summary = [
      { label: t('reports.totalInventoryValue'), value: dh(r.summary.totalInventoryValue) },
      { label: t('reports.unitsInStock'), value: String(r.summary.unitsInStock) },
      { label: t('reports.productsInStock'), value: String(r.summary.productsInStock) },
      { label: t('reports.lowStock'), value: String(r.summary.lowStockCount) },
    ];
    if (r.byBrand?.length) doc.tables.push({ title: t('reports.stockByBrand'), headers: [t('products.brand'), t('products.model'), t('reports.inStock'), t('reports.value')], rows: r.byBrand.flatMap((b) => b.models.map((m) => [b.brand, m.model, String(m.inStock), dh(m.value)])) });
    if (productRows.value.length) doc.tables.push({ title: t('reports.stockByCategory'), headers: [t('products.category'), t('reports.product'), t('reports.stock'), t('reports.value')], rows: productRows.value.map((p) => [p.categoryName, p.name, String(p.stockQuantity), dh(p.stockValue)]) });
  } else if (tab.value === 'customers') {
    doc.summary = [
      { label: t('reports.totalCustomers'), value: String(r.summary.totalCustomers) },
      { label: t('reports.newCustomers'), value: String(r.summary.newCustomers) },
      { label: t('reports.totalDebt'), value: dh(r.summary.totalDebt) },
      { label: t('debts.totalToRefund'), value: dh(refundSummary.value?.totalPending) },
    ];
    if (r.topCustomers?.length)
      doc.tables.push({
        title: t('reports.topCustomers'),
        headers: isPhoneSeller.value
          ? [t('reports.customer'), t('reports.purchases'), t('reports.tradeIns'), t('reports.returns'), t('reports.totalSpent')]
          : [t('reports.customer'), t('reports.purchases'), t('reports.returns'), t('reports.totalSpent')],
        rows: r.topCustomers.map((c) => (isPhoneSeller.value ? [c.name, String(c.purchases), String(c.exchanges || 0), String(c.returns || 0), dh(c.spent)] : [c.name, String(c.purchases), String(c.returns || 0), dh(c.spent)])),
      });
  } else if (tab.value === 'repairs') {
    doc.title = t('reports.repairsTitle');
    doc.summary = [
      { label: t('reports.repairRevenue'), value: dh(r.summary.revenue) },
      { label: t('reports.partsCost'), value: dh(r.summary.partsCost) },
      { label: t('reports.laborCost'), value: dh(r.summary.laborCost) },
      { label: t('reports.repairProfit'), value: dh(r.summary.profit) },
    ];
    if (r.repairs?.length)
      doc.tables.push({
        title: t('reports.repairsList'),
        headers: [t('repairs.table.repair'), t('repairs.table.repairer'), t('repairs.table.status'), t('reports.revenue'), t('reports.costs'), t('reports.repairProfit')],
        rows: r.repairs.map((x) => [x.repairNumber, x.technician || '-', t(`repairs.status.${x.status}`), dh(x.revenue), dh(x.totalCost), dh(x.profit)]),
      });
  } else {
    doc.summary = [
      { label: t('reports.totalSuppliers'), value: `${r.summary.activeSuppliers} / ${r.summary.totalSuppliers}` },
      { label: t('reports.totalOrders'), value: String(r.summary.totalOrders) },
      { label: t('reports.totalSpent'), value: dh(r.summary.totalSpent) },
      { label: t('reports.supplierDebt'), value: dh(r.summary.totalDebt) },
    ];
    if (r.topSuppliers?.length) doc.tables.push({ title: t('reports.topSuppliers'), headers: [t('reports.supplier'), t('reports.orders'), t('reports.spent'), t('reports.debt')], rows: r.topSuppliers.map((s) => [s.name, String(s.orders), dh(s.spent), dh(s.debt)]) });
    if (r.suppliersWithDebt?.length) doc.tables.push({ title: t('reports.suppliersWithDebt'), headers: [t('reports.supplier'), t('reports.phone'), t('reports.debt')], rows: r.suppliersWithDebt.map((s) => [s.name, s.phone || '-', dh(s.debt)]) });
  }
  const blob = await summaryPdfBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${t('reports.filePrefix')}-${tab.value}-${period.value.from}-${period.value.to}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="space-y-6">
    <div class="card p-3">
      <div class="flex flex-col lg:flex-row lg:items-center gap-3">
        <div class="flex gap-1 overflow-x-auto">
          <button
            v-for="tb in TABS"
            :key="tb.id"
            :class="['flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap', tab === tb.id ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100']"
            @click="tab = tb.id"
          >
            <component :is="tb.icon" class="w-4 h-4" /><span>{{ t(tb.label) }}</span>
          </button>
        </div>
        <div class="flex-1" />
        <div class="flex items-center gap-2">
          <div class="w-full sm:w-64"><DateRangePicker v-model="range" :clearable="false" /></div>
          <button class="btn-secondary inline-flex items-center gap-2 py-2" @click="exportPdf"><DocumentArrowDownIcon class="w-4 h-4" /><span class="hidden sm:inline">PDF</span></button>
        </div>
      </div>
    </div>

    <div v-if="isLoading" class="card p-12 text-center text-gray-500">{{ t('common.loading') }}</div>

    <!-- SALES -->
    <template v-else-if="sales">
      <div class="rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 text-white p-6">
        <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p class="text-emerald-100 text-sm mb-1">{{ t('reports.cashFlow') }}</p>
            <p class="text-4xl font-bold">{{ formatCurrency(sales.summary.totalAmountCollected) }}</p>
          </div>
          <div class="flex gap-8">
            <div>
              <p class="text-emerald-200 text-xs">{{ t('reports.toCollect') }}</p>
              <p class="text-xl font-semibold">{{ formatCurrency(sales.summary.totalAmountPending) }}</p>
            </div>
            <div>
              <p class="text-emerald-200 text-xs">{{ t('reports.totalProfit') }}</p>
              <p :class="['text-xl font-semibold', sales.summary.totalProfit < 0 && 'text-red-300']">{{ sales.summary.totalProfit > 0 ? '+' : '' }}{{ formatCurrency(sales.summary.totalProfit) }}</p>
            </div>
          </div>
        </div>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div class="card p-4"><p class="text-sm text-gray-500 mb-1">{{ t('reports.totalSales') }}</p><p class="text-2xl font-bold text-gray-900">{{ formatCurrency(sales.summary.totalSales) }}</p></div>
        <div class="card p-4">
          <p class="text-sm text-gray-500 mb-1">{{ t('reports.transactionCount') }}</p>
          <p class="text-2xl font-bold text-gray-900">{{ sales.summary.totalTransactions }}</p>
          <div class="flex flex-wrap gap-2 text-xs mt-1">
            <span class="text-success-600">{{ t('reports.completedCount', { n: sales.summary.completedTransactions }) }}</span>
            <span v-if="sales.summary.partialTransactions" class="text-amber-600">{{ t('reports.inProgressCount', { n: sales.summary.partialTransactions }) }}</span>
          </div>
        </div>
        <div class="card p-4"><p class="text-sm text-gray-500 mb-1">{{ t('reports.avgTicket') }}</p><p class="text-2xl font-bold text-gray-900">{{ formatCurrency(sales.summary.averageTransaction) }}</p></div>
        <div class="card p-4"><p class="text-sm text-gray-500 mb-1">{{ t('reports.totalItems') }}</p><p class="text-2xl font-bold text-gray-900">{{ sales.summary.totalItems }}</p></div>
        <div class="card p-4 col-span-2 lg:col-span-1">
          <p class="text-sm text-gray-500 mb-1">{{ t('reports.totalProfit') }}</p>
          <p :class="['text-2xl font-bold', sales.summary.totalProfit >= 0 ? 'text-success-600' : 'text-danger-600']">{{ sales.summary.totalProfit > 0 ? '+' : '' }}{{ formatCurrency(sales.summary.totalProfit) }}</p>
        </div>
      </div>

      <div v-if="sales.profit" class="card p-5">
        <h3 class="font-semibold text-gray-900">{{ t('reports.profitStatement') }}</h3>
        <p class="text-xs text-gray-500 mb-4">{{ t('reports.profitStatementHint') }}</p>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <tbody class="divide-y divide-gray-100">
              <tr><td class="py-2 text-gray-600">{{ t('reports.netSales') }}</td><td class="py-2 text-end">{{ formatCurrency(sales.profit.sales.netRevenue) }}</td></tr>
              <tr><td class="py-2 text-gray-600">{{ t('reports.repairRevenue') }}</td><td class="py-2 text-end">{{ formatCurrency(sales.profit.repairs.revenue) }}</td></tr>
              <tr class="font-semibold"><td class="py-2">{{ t('reports.totalRevenue') }}</td><td class="py-2 text-end">{{ formatCurrency(sales.profit.totals.revenue) }}</td></tr>
              <tr><td class="py-2 text-gray-600">{{ t('reports.cogs') }}</td><td class="py-2 text-end text-danger-600">−{{ formatCurrency(sales.profit.sales.cogs) }}</td></tr>
              <tr><td class="py-2 text-gray-600">{{ t('reports.partsCost') }}</td><td class="py-2 text-end text-danger-600">−{{ formatCurrency(sales.profit.repairs.partsCost) }}</td></tr>
              <tr class="font-semibold"><td class="py-2">{{ t('reports.grossProfit') }}</td><td class="py-2 text-end">{{ formatCurrency(sales.profit.totals.grossProfit) }}</td></tr>
              <tr><td class="py-2 text-gray-600">{{ t('reports.laborCost') }}</td><td class="py-2 text-end text-danger-600">−{{ formatCurrency(sales.profit.repairs.laborCost) }}</td></tr>
              <tr><td class="py-2 text-gray-600">{{ t('reports.otherCost') }}</td><td class="py-2 text-end text-danger-600">−{{ formatCurrency(sales.profit.repairs.otherCost) }}</td></tr>
              <tr :class="['font-bold text-base', sales.profit.totals.netProfit >= 0 ? 'text-success-700' : 'text-danger-700']">
                <td class="py-2">{{ t('reports.netProfit') }}</td>
                <td class="py-2 text-end">{{ formatCurrency(sales.profit.totals.netProfit) }} <span class="text-xs font-normal text-gray-500">({{ sales.profit.totals.margin.toFixed(1) }}%)</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="card p-5">
          <h3 class="font-semibold text-gray-900 mb-4">{{ t('reports.salesTrend') }}</h3>
          <div v-if="sales.byDay?.length" class="flex gap-2">
            <div class="flex flex-col justify-between text-xs text-gray-400 h-[180px] pe-1 text-end shrink-0">
              <span>{{ formatCurrency(barMax) }}</span><span>{{ formatCurrency(barMax / 2) }}</span><span>0</span>
            </div>
            <div class="flex-1 flex items-end gap-1 h-[200px] overflow-x-auto">
              <div v-for="d in sales.byDay" :key="d.date" class="flex flex-col items-center group relative flex-1 min-w-[22px] max-w-[60px]">
                <div class="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-xs rounded-lg p-2 whitespace-nowrap z-10">
                  <p class="font-medium">{{ barDay(d.date) }}</p>
                  <p>Ventes: {{ d.sales.toLocaleString() }} DH</p>
                  <p>Profit: {{ d.profit.toLocaleString() }} DH</p>
                  <p>{{ t('reports.transactionsCount', { n: d.transactions }) }}</p>
                </div>
                <div class="w-full bg-black rounded-t-sm hover:bg-gray-800 min-h-[4px]" :style="{ height: `${(d.sales / barMax) * 180}px` }" />
                <span class="text-[10px] text-gray-500 mt-1 truncate w-full text-center">{{ barDay(d.date) }}</span>
              </div>
            </div>
          </div>
          <div v-else class="h-48 flex items-center justify-center text-gray-300"><ChartBarIcon class="w-12 h-12 opacity-50" /></div>
        </div>
        <div class="card p-5">
          <h3 class="font-semibold text-gray-900 mb-4">{{ t('reports.paymentMethods') }}</h3>
          <div class="grid grid-cols-2 gap-3 mb-4">
            <div class="rounded-xl bg-emerald-50 p-4">
              <div class="flex items-center gap-2 mb-1"><BanknotesIcon class="w-5 h-5 text-emerald-600" /><p class="text-sm text-emerald-700">{{ t('reports.cashTotal') }}</p></div>
              <p class="text-xl font-bold text-emerald-700">{{ formatCurrency(cashTotal) }}</p>
            </div>
            <div class="rounded-xl bg-indigo-50 p-4">
              <div class="flex items-center gap-2 mb-1"><BuildingLibraryIcon class="w-5 h-5 text-indigo-600" /><p class="text-sm text-indigo-700">{{ t('reports.transferTotal') }}</p></div>
              <p class="text-xl font-bold text-indigo-700">{{ formatCurrency(transferTotal) }}</p>
            </div>
          </div>
          <div v-if="sales.byPaymentMethod?.length" class="space-y-3">
            <div v-for="m in sales.byPaymentMethod" :key="m.method" class="flex items-center gap-4">
              <div class="w-24 text-sm text-gray-600">{{ methodLabel(m.method) }}</div>
              <div class="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden"><div class="h-full bg-black rounded-full" :style="{ width: `${(m.amount / methodMax) * 100}%` }" /></div>
              <div class="text-sm whitespace-nowrap"><span class="font-medium">{{ formatCurrency(m.amount) }}</span> <span class="text-gray-400">({{ m.count }})</span></div>
            </div>
          </div>
          <div v-else class="text-center text-gray-400 py-4">{{ t('reports.noData') }}</div>
        </div>
      </div>

      <div v-if="hasSellers" class="card overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100"><h3 class="font-semibold text-gray-900">{{ t('employees.salesBySeller') }}</h3></div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('employees.seller') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('employees.salesCount') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('employees.revenue') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('employees.profit') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="s in sales.bySeller" :key="s.employeeId ?? 'unattributed'">
                <td class="px-4 py-3"><span v-if="s.employeeId" class="font-medium text-gray-900">{{ s.name }}</span><span v-else class="text-gray-400 italic">{{ t('employees.unattributed') }}</span></td>
                <td class="px-4 py-3 text-end">{{ s.transactions }}</td>
                <td class="px-4 py-3 text-end">{{ formatCurrency(s.sales) }}</td>
                <td class="px-4 py-3 text-end">{{ formatCurrency(s.profit) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100"><h3 class="font-semibold text-gray-900">{{ t('reports.topProducts') }}</h3></div>
        <div v-if="sales.topProducts?.length" class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('reports.product') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('reports.quantity') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('reports.revenue') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="p in sales.topProducts" :key="p.productId">
                <td class="px-4 py-3 font-medium text-gray-900">{{ p.name }}</td>
                <td class="px-4 py-3 text-end">{{ p.quantity }}</td>
                <td class="px-4 py-3 text-end">{{ formatCurrency(p.revenue) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="p-8 text-center text-gray-400">{{ t('reports.noData') }}</div>
      </div>

      <div v-if="sales.recentSales?.length" class="card overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><ShoppingBagIcon class="w-5 h-5 text-blue-600" /></div>
          <div>
            <h3 class="font-semibold text-gray-900">{{ t('reports.recentSales') }}</h3>
            <p class="text-xs text-gray-500">{{ t('reports.recentSalesCount', { n: sales.recentSales.length }) }}</p>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50">
                <th class="px-5 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{{ t('reports.type') }}</th>
                <th class="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">{{ t('reports.product') }}</th>
                <th class="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">{{ t('pos.quantity') }}</th>
                <th v-if="isPhoneSeller" class="px-4 py-3 text-start text-xs font-semibold text-gray-600 uppercase">IMEI</th>
                <th class="px-4 py-3 text-end text-xs font-semibold text-gray-600 uppercase">{{ t('reports.amount') }}</th>
                <th class="px-5 py-3 text-end text-xs font-semibold text-gray-600 uppercase">{{ t('reports.date') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="s in sales.recentSales" :key="s.id" class="hover:bg-gray-50/50">
                <td class="px-5 py-3">
                  <span v-if="s.type === 'unit'" class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700"><DevicePhoneMobileIcon class="w-3 h-3 me-1" /> {{ t('reports.deviceTag') }}</span>
                  <span v-else class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700"><CubeIcon class="w-3 h-3 me-1" /> {{ t('reports.productTag') }}</span>
                </td>
                <td class="px-4 py-3 font-medium text-gray-900">{{ s.name }}</td>
                <td class="px-4 py-3 text-center">{{ s.quantity }}</td>
                <td v-if="isPhoneSeller" class="px-4 py-3 font-mono text-xs text-gray-500">{{ s.imei || '-' }}</td>
                <td class="px-4 py-3 text-end font-medium">{{ formatCurrency(s.salePrice) }}</td>
                <td class="px-5 py-3 text-end text-gray-500 whitespace-nowrap">{{ shortDate(s.soldAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- INVENTORY -->
    <template v-else-if="inventory">
      <div class="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 text-white p-6">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <p class="text-slate-400 text-sm mb-1">{{ t('reports.totalInventoryValue') }}</p>
            <p class="text-4xl font-bold">{{ formatCurrency(inventory.summary.totalInventoryValue) }}</p>
            <div class="flex gap-8 mt-4">
              <div v-if="isPhoneSeller"><p class="text-slate-500 text-xs uppercase tracking-wide">{{ t('reports.devices') }}</p><p class="text-lg font-semibold">{{ formatCurrency(inventory.summary.unitsValue) }}</p></div>
              <div><p class="text-slate-500 text-xs uppercase tracking-wide">{{ t('reports.products') }}</p><p class="text-lg font-semibold">{{ formatCurrency(inventory.summary.productsValue) }}</p></div>
            </div>
          </div>
          <div class="flex items-center gap-6">
            <div class="relative w-24 h-24">
              <svg viewBox="0 0 36 36" class="w-24 h-24 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#334155" stroke-width="3" />
                <circle
                  cx="18"
                  cy="18"
                  r="15.9"
                  fill="none"
                  :stroke="inventory.summary.stockHealthScore >= 70 ? '#10b981' : inventory.summary.stockHealthScore >= 40 ? '#f59e0b' : '#ef4444'"
                  stroke-width="3"
                  :stroke-dasharray="`${inventory.summary.stockHealthScore} 100`"
                />
              </svg>
              <span class="absolute inset-0 flex items-center justify-center text-lg font-bold">{{ inventory.summary.stockHealthScore }}%</span>
            </div>
            <div class="space-y-1 text-sm">
              <div class="flex items-center justify-between gap-6"><span class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-emerald-500" /> {{ t('reports.stockOk') }}</span><span>{{ inventory.stockDistribution.healthy }}</span></div>
              <div class="flex items-center justify-between gap-6"><span class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-amber-500" /> {{ t('reports.lowStock') }}</span><span>{{ inventory.stockDistribution.low }}</span></div>
              <div class="flex items-center justify-between gap-6"><span class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-red-500" /> {{ t('reports.outOfStock') }}</span><span>{{ inventory.stockDistribution.outOfStock }}</span></div>
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="card p-4 flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center"><CubeIcon class="w-6 h-6 text-emerald-600" /></div>
          <div><p class="text-2xl font-bold">{{ inventory.summary.totalProducts }}</p><p class="text-sm text-gray-500">{{ t('reports.products') }}</p></div>
        </div>
        <div v-if="isPhoneSeller" class="card p-4 flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center"><DevicePhoneMobileIcon class="w-6 h-6 text-purple-600" /></div>
          <div><p class="text-2xl font-bold">{{ inventory.summary.unitsInStock }}</p><p class="text-sm text-gray-500">{{ t('reports.unitsInStock') }}</p></div>
        </div>
        <div class="card p-4 flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center"><ExclamationTriangleIcon class="w-6 h-6 text-amber-600" /></div>
          <div><p class="text-2xl font-bold">{{ inventory.summary.lowStockCount }}</p><p class="text-sm text-gray-500">{{ t('reports.lowStock') }}</p></div>
        </div>
        <div class="card p-4 flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center"><ExclamationTriangleIcon class="w-6 h-6 text-red-600" /></div>
          <div><p class="text-2xl font-bold">{{ inventory.summary.outOfStockCount }}</p><p class="text-sm text-gray-500">{{ t('reports.outOfStockLong') }}</p></div>
        </div>
      </div>

      <div v-if="inventory.lowStockAlerts?.length" class="card overflow-hidden border-amber-200">
        <div class="px-5 py-4 bg-amber-50 border-b border-amber-100 flex items-center gap-3">
          <ExclamationTriangleIcon class="w-5 h-5 text-amber-600" />
          <div>
            <h3 class="font-semibold text-amber-900">{{ t('dashboard.lowStockAlerts') }}</h3>
            <p class="text-xs text-amber-700">{{ t('reports.restockNeeded', { n: inventory.lowStockAlerts.length }) }}</p>
          </div>
        </div>
        <div class="divide-y divide-gray-100">
          <div v-for="a in inventory.lowStockAlerts" :key="a.id" class="px-4 py-3 flex items-center justify-between hover:bg-gray-50">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center"><span class="font-bold text-amber-700">{{ a.currentStock }}</span></div>
              <div>
                <p class="font-medium text-gray-900">{{ a.name }}</p>
                <p class="text-xs text-gray-500">{{ a.category }} · {{ a.sku || 'Sans SKU' }}</p>
              </div>
            </div>
            <div class="text-end">
              <p class="text-sm text-gray-600">Min: {{ a.minStock }}</p>
              <p class="text-xs text-amber-600">{{ t('reports.missingUnits', { n: a.minStock - a.currentStock }) }}</p>
            </div>
          </div>
        </div>
      </div>

      <div v-if="isPhoneSeller && inventory.byBrand?.length" class="card overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center"><DevicePhoneMobileIcon class="w-5 h-5 text-primary-600" /></div>
            <div>
              <h3 class="font-semibold text-gray-900">{{ t('reports.stockByBrand') }}</h3>
              <p class="text-xs text-gray-500">{{ modelRows.length }} {{ t('reports.models') }} · {{ t('reports.brandsCount', { n: inventory.byBrand.length }) }}</p>
            </div>
          </div>
          <div class="text-end">
            <p class="text-2xl font-bold">{{ inventory.summary.unitsInStock }}</p>
            <p class="text-xs text-gray-500">{{ t('reports.unitsAvailable') }}</p>
          </div>
        </div>
        <div class="p-4 border-b border-gray-100 space-y-3">
          <div class="relative">
            <MagnifyingGlassIcon class="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input v-model="mSearch" type="text" class="input ps-10" :placeholder="t('reports.searchModel')" />
          </div>
          <div class="grid grid-cols-2 md:grid-cols-5 gap-2">
            <select v-model="mBrand" class="input text-sm"><option :value="null">{{ t('soldUnits.allBrands') }}</option><option v-for="b in brands" :key="b" :value="b">{{ b }}</option></select>
            <select v-model="mStorage" class="input text-sm"><option :value="null">{{ t('soldUnits.allStorage') }}</option><option v-for="s in storages" :key="s" :value="s">{{ s }}</option></select>
            <select v-model="mCondition" class="input text-sm"><option :value="null">{{ t('soldUnits.allConditions') }}</option><option v-for="c in conditions" :key="c" :value="c">{{ conditionLabel(c) }}</option></select>
            <select v-model="mType" class="input text-sm"><option :value="null">{{ t('invoices.allTypes') }}</option><option v-for="d in deviceTypes" :key="d" :value="d">{{ deviceTypeLabel(d) }}</option></select>
            <select v-model="mStock" class="input text-sm">
              <option value="all">{{ t('reports.allStock') }}</option><option value="inStock">{{ t('reports.stockAbove2') }}</option><option value="lowStock">{{ t('reports.stockLow12') }}</option><option value="outOfStock">{{ t('reports.stockOut0') }}</option>
            </select>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-start font-medium text-gray-500 cursor-pointer" @click="sortModels('model')">{{ t('products.model') }}</th>
                <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('reports.variants') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500 cursor-pointer" @click="sortModels('inStock')">{{ t('reports.inStock') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500 cursor-pointer" @click="sortModels('sold')">{{ t('reports.soldUnits') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500 cursor-pointer" @click="sortModels('value')">{{ t('reports.stockValue') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="m in pagedModels" :key="`${m.brand}-${m.model}`" :class="m.inStock === 0 && 'bg-red-50/40'">
                <td class="px-4 py-3"><p class="font-medium text-gray-900">{{ m.model }}</p><p class="text-xs text-gray-500">{{ m.brand }}</p></td>
                <td class="px-4 py-3 text-xs text-gray-500 max-w-xs">{{ m.variants }}</td>
                <td class="px-4 py-3 text-end">
                  <span :class="['inline-flex px-2 py-0.5 rounded text-xs font-medium', m.inStock === 0 ? 'bg-red-100 text-red-700' : m.inStock <= 2 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700']">{{ m.inStock }}</span>
                </td>
                <td class="px-4 py-3 text-end">{{ m.sold }}</td>
                <td class="px-4 py-3 text-end font-medium">{{ formatCurrency(m.value) }}</td>
              </tr>
              <tr v-if="!pagedModels.length">
                <td colspan="5" class="px-5 py-12 text-center">
                  <p class="text-gray-500 font-medium">{{ t('reports.noResult') }}</p>
                  <p v-if="modelFiltered" class="text-sm text-gray-400">{{ t('reports.tryOther') }}</p>
                  <button v-if="modelFiltered" class="mt-3 px-4 py-2 text-sm text-primary-600 hover:bg-primary-50 rounded-lg" @click="clearModelFilters">{{ t('reports.clearFilters') }}</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="modelPages > 1" class="flex items-center justify-between px-4 py-3 border-t border-gray-100">
          <p class="text-sm text-gray-500">{{ t('reports.pageOf', { page: mPage, total: modelPages }) }}</p>
          <div class="flex gap-2">
            <button class="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50" :disabled="mPage === 1" @click="mPage--"><ChevronLeftIcon class="w-5 h-5 rtl:rotate-180" /></button>
            <button class="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50" :disabled="mPage === modelPages" @click="mPage++"><ChevronRightIcon class="w-5 h-5 rtl:rotate-180" /></button>
          </div>
        </div>
      </div>

      <div class="card overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><CubeIcon class="w-5 h-5 text-blue-600" /></div>
            <div>
              <h3 class="font-semibold text-gray-900">{{ t('reports.stockByCategory') }}</h3>
              <p class="text-xs text-gray-500">{{ t('reports.productsCategories', { products: productRows.length, categories: categories.length }) }}</p>
            </div>
          </div>
          <div class="text-end"><p class="text-2xl font-bold">{{ inventory.summary.productsInStock }}</p><p class="text-xs text-gray-500">{{ t('reports.unitsInStockShort') }}</p></div>
        </div>
        <div class="p-4 border-b border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-2">
          <div class="relative">
            <MagnifyingGlassIcon class="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input v-model="pSearch" type="text" class="input ps-10" :placeholder="t('products.search')" />
          </div>
          <select v-model="pCategory" class="input text-sm"><option :value="null">{{ t('products.allCategories') }}</option><option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option></select>
          <select v-model="pStock" class="input text-sm">
            <option value="all">{{ t('reports.allStock') }}</option><option value="inStock">{{ t('reports.stockOk') }}</option><option value="lowStock">{{ t('reports.lowStock') }}</option><option value="outOfStock">{{ t('reports.outOfStock') }}</option>
          </select>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('reports.product') }}</th>
                <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('products.category') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('reports.stock') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('reports.minStock') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('reports.price') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('reports.stockValue') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="p in pagedProducts" :key="p.id" :class="p.isLowStock && 'bg-amber-50/40'">
                <td class="px-4 py-3"><p class="font-medium text-gray-900">{{ p.name }}</p><p class="text-xs text-gray-500 font-mono">{{ p.sku }}</p></td>
                <td class="px-4 py-3 text-gray-600">{{ p.categoryName }}</td>
                <td class="px-4 py-3 text-end">
                  <span :class="['inline-flex px-2 py-0.5 rounded text-xs font-medium', p.stockQuantity === 0 ? 'bg-red-100 text-red-700' : p.isLowStock ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700']">
                    {{ p.stockQuantity }}
                  </span>
                </td>
                <td class="px-4 py-3 text-end">{{ p.minStockLevel }}</td>
                <td class="px-4 py-3 text-end">{{ formatCurrency(p.retailPrice) }}</td>
                <td class="px-4 py-3 text-end font-medium">{{ formatCurrency(p.stockValue) }}</td>
              </tr>
              <tr v-if="!pagedProducts.length">
                <td colspan="6" class="px-5 py-12 text-center">
                  <p class="text-gray-500 font-medium">{{ t('reports.noResult') }}</p>
                  <p v-if="productFiltered" class="text-sm text-gray-400">{{ t('reports.tryOther') }}</p>
                  <button v-if="productFiltered" class="mt-3 px-4 py-2 text-sm text-primary-600 hover:bg-primary-50 rounded-lg" @click="clearProductFilters">{{ t('reports.clearFilters') }}</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="productPages > 1" class="flex items-center justify-between px-4 py-3 border-t border-gray-100">
          <p class="text-sm text-gray-500">{{ t('reports.pageOf', { page: pPage, total: productPages }) }}</p>
          <div class="flex gap-2">
            <button class="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50" :disabled="pPage === 1" @click="pPage--"><ChevronLeftIcon class="w-5 h-5 rtl:rotate-180" /></button>
            <button class="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50" :disabled="pPage === productPages" @click="pPage++"><ChevronRightIcon class="w-5 h-5 rtl:rotate-180" /></button>
          </div>
        </div>
      </div>
    </template>

    <!-- CUSTOMERS -->
    <template v-else-if="customers">
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div class="card p-4"><p class="text-sm text-gray-500 mb-1">{{ t('reports.totalCustomers') }}</p><p class="text-2xl font-bold">{{ customers.summary.totalCustomers }}</p></div>
        <div class="card p-4"><p class="text-sm text-gray-500 mb-1">{{ t('reports.newCustomers') }}</p><p class="text-2xl font-bold">{{ customers.summary.newCustomers }}</p></div>
        <div class="card p-4"><p class="text-sm text-gray-500 mb-1">{{ t('reports.totalDebt') }}</p><p class="text-2xl font-bold text-danger-600">{{ formatCurrency(customers.summary.totalDebt) }}</p></div>
        <div class="card p-4"><p class="text-sm text-gray-500 mb-1">{{ t('customers.filters.refund') }}</p><p class="text-2xl font-bold text-amber-600">{{ formatCurrency(refundSummary?.totalPending || 0) }}</p></div>
        <div class="card p-4 col-span-2 lg:col-span-1"><p class="text-sm text-gray-500 mb-1">{{ t('reports.totalRefunded') }}</p><p class="text-2xl font-bold text-emerald-600">{{ formatCurrency(refundSummary?.totalRefunded || 0) }}</p></div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="card overflow-hidden">
          <div class="px-5 py-4 border-b border-gray-100"><h3 class="font-semibold text-gray-900">{{ t('reports.topCustomers') }}</h3></div>
          <div v-if="customers.topCustomers?.length" class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('reports.customer') }}</th>
                  <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('reports.purchases') }}</th>
                  <th v-if="isPhoneSeller" class="px-4 py-3 text-end font-medium text-gray-500">{{ t('reports.tradeIns') }}</th>
                  <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('reports.returns') }}</th>
                  <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('reports.totalSpent') }}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr v-for="c in customers.topCustomers" :key="c.customerId">
                  <td class="px-4 py-3 font-medium">{{ c.name }}</td>
                  <td class="px-4 py-3 text-end">{{ c.purchases }}</td>
                  <td v-if="isPhoneSeller" class="px-4 py-3 text-end">{{ c.exchanges || 0 }}</td>
                  <td class="px-4 py-3 text-end">{{ c.returns || 0 }}</td>
                  <td class="px-4 py-3 text-end">{{ formatCurrency(c.spent) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="p-8 text-center text-gray-400">{{ t('reports.noData') }}</div>
        </div>
        <div class="card overflow-hidden">
          <div class="px-5 py-4 border-b border-gray-100 flex items-center gap-2"><ExclamationTriangleIcon class="w-5 h-5 text-danger-500" /><h3 class="font-semibold text-gray-900">{{ t('reports.debtors') }}</h3></div>
          <table v-if="customers.debtors?.length" class="w-full text-sm">
            <thead class="bg-gray-50">
              <tr><th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('reports.customer') }}</th><th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('reports.debt') }}</th></tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="d in customers.debtors" :key="d.customerId"><td class="px-4 py-3 font-medium">{{ d.name }}</td><td class="px-4 py-3 text-end text-danger-600">{{ formatCurrency(d.debt) }}</td></tr>
            </tbody>
          </table>
          <div v-else class="p-8 text-center text-gray-400">{{ t('reports.noDebtors') }}</div>
        </div>
      </div>
      <div v-if="isPhoneSeller" class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="card overflow-hidden">
          <div class="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <ClockIcon class="w-5 h-5 text-purple-500" /><h3 class="font-semibold text-gray-900">{{ t('reports.reservationsInProgress') }}</h3>
            <span v-if="reserved?.length" class="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700">{{ reserved.length }}</span>
          </div>
          <table v-if="reserved?.length" class="w-full text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('reports.customer') }}</th><th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('supplierOrders.table.product') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('reservation.deposit') }}</th><th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('reports.price') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="u in reserved" :key="u.id">
                <td class="px-4 py-3">{{ u.reservedByCustomer?.firstName }} {{ u.reservedByCustomer?.lastName }}</td>
                <td class="px-4 py-3">{{ u.brand }} {{ u.model }} <span v-if="u.storage" class="text-xs text-gray-500">{{ u.storage }}</span></td>
                <td class="px-4 py-3 text-end">{{ formatCurrency(Number(u.reservationDeposit) || 0) }}</td>
                <td class="px-4 py-3 text-end">{{ formatCurrency(u.salePrice) }}</td>
              </tr>
            </tbody>
          </table>
          <div v-else class="p-8 text-center text-gray-400">{{ t('customers.emptyFilters.reservation') }}</div>
        </div>
        <div class="card overflow-hidden">
          <div class="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <ShoppingBagIcon class="w-5 h-5 text-amber-500" /><h3 class="font-semibold text-gray-900">{{ t('customers.filters.refund') }}</h3>
            <span v-if="pendingRefunds?.length" class="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700">{{ pendingRefunds.length }}</span>
          </div>
          <table v-if="pendingRefunds?.length" class="w-full text-sm">
            <thead class="bg-gray-50">
              <tr><th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('reports.customer') }}</th><th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('supplierOrders.table.product') }}</th><th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('reports.amount') }}</th></tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="r in pendingRefunds" :key="r.id">
                <td class="px-4 py-3">{{ r.customer?.firstName }} {{ r.customer?.lastName }}</td>
                <td class="px-4 py-3">{{ r.soldUnit?.brand }} {{ r.soldUnit?.model }}</td>
                <td class="px-4 py-3 text-end">{{ formatCurrency(Number(r.depositAmount) - Number(r.refundedAmount)) }}</td>
              </tr>
            </tbody>
          </table>
          <div v-else class="p-8 text-center text-gray-400">{{ t('debts.noRefunds') }}</div>
        </div>
        <div class="card overflow-hidden">
          <div class="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <CheckCircleIcon class="w-5 h-5 text-emerald-500" /><h3 class="font-semibold text-gray-900">{{ t('reports.refundsDone') }}</h3>
            <span v-if="doneRefunds?.length" class="px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-700">{{ doneRefunds.length }}</span>
          </div>
          <table v-if="doneRefunds?.length" class="w-full text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('reports.customer') }}</th><th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('supplierOrders.table.product') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('customers.sourceRefund') }}</th><th class="px-4 py-3 text-center font-medium text-gray-500">{{ t('common.status') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="r in doneRefunds" :key="r.id">
                <td class="px-4 py-3">{{ r.customer?.firstName }} {{ r.customer?.lastName }}</td>
                <td class="px-4 py-3">{{ r.soldUnit?.brand }} {{ r.soldUnit?.model }}</td>
                <td class="px-4 py-3 text-end">
                  {{ formatCurrency(Number(r.refundedAmount)) }}<span v-if="Number(r.refundedAmount) < Number(r.depositAmount)" class="text-xs text-gray-400"> / {{ formatCurrency(Number(r.depositAmount)) }}</span>
                </td>
                <td class="px-4 py-3 text-center">
                  <span v-if="r.status === 'completed'" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700"><CheckCircleIcon class="w-3.5 h-3.5" /> {{ t('reports.refundComplete') }}</span>
                  <span v-else class="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">{{ t('reports.refundPartial') }}</span>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="p-8 text-center text-gray-400">{{ t('reports.noRefundsDone') }}</div>
        </div>
      </div>
    </template>

    <!-- SUPPLIERS -->
    <template v-else-if="suppliers">
      <div class="rounded-2xl bg-gradient-to-br from-orange-600 to-orange-800 text-white p-6">
        <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p class="text-orange-100 text-sm mb-1">{{ t('reports.totalSpent') }}</p>
            <p class="text-4xl font-bold">{{ formatCurrency(suppliers.summary.totalSpent) }}</p>
          </div>
          <div class="flex gap-8">
            <div><p class="text-orange-200 text-xs">{{ t('reports.supplierDebt') }}</p><p class="text-xl font-semibold">{{ formatCurrency(suppliers.summary.totalDebt) }}</p></div>
            <div><p class="text-orange-200 text-xs">{{ t('reports.pendingOrders') }}</p><p class="text-xl font-semibold">{{ suppliers.pendingOrders?.length || 0 }}</p></div>
          </div>
        </div>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="card p-4">
          <p class="text-sm text-gray-500 mb-1">{{ t('reports.totalSuppliers') }}</p><p class="text-2xl font-bold">{{ suppliers.summary.totalSuppliers }}</p>
          <p class="text-xs text-gray-500">{{ suppliers.summary.activeSuppliers }} {{ t('reports.activeSuppliers').toLowerCase() }}</p>
        </div>
        <div class="card p-4"><p class="text-sm text-gray-500 mb-1">{{ t('reports.totalOrders') }}</p><p class="text-2xl font-bold">{{ suppliers.summary.totalOrders }}</p></div>
        <div class="card p-4">
          <p class="text-sm text-gray-500 mb-1">{{ t('reports.pendingAndDraft') }}</p>
          <p class="text-2xl font-bold">{{ (suppliers.summary.draftOrders || 0) + (suppliers.pendingOrders?.length || 0) }}</p>
          <p v-if="suppliers.summary.draftOrders" class="text-xs text-gray-500">{{ suppliers.summary.draftOrders }} {{ t('reports.draftOrders').toLowerCase() }}</p>
        </div>
        <div class="card p-4"><p class="text-sm text-gray-500 mb-1">{{ t('reports.supplierDebt') }}</p><p class="text-2xl font-bold text-danger-600">{{ formatCurrency(suppliers.summary.totalDebt) }}</p></div>
      </div>
      <div v-if="suppliers.ordersByStatus?.length" class="card p-5">
        <h3 class="font-semibold text-gray-900 mb-4">{{ t('reports.ordersByStatus') }}</h3>
        <div class="space-y-3">
          <div v-for="s in suppliers.ordersByStatus" :key="s.status" class="flex items-center gap-4">
            <div class="w-28 text-sm text-gray-600">{{ te(`supplierOrders.status.${s.status}`) ? t(`supplierOrders.status.${s.status}`) : s.status }}</div>
            <div class="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
              <div class="h-full bg-orange-500 rounded-full" :style="{ width: `${(s.count / (suppliers.summary.totalOrders || 1)) * 100}%` }" />
            </div>
            <div class="text-sm"><span class="font-medium">{{ s.count }}</span> <span class="text-gray-400">({{ Math.round((s.count / (suppliers.summary.totalOrders || 1)) * 100) }}%)</span></div>
          </div>
        </div>
      </div>
      <div class="card overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100"><h3 class="font-semibold text-gray-900">{{ t('reports.topSuppliers') }}</h3></div>
        <div v-if="suppliers.topSuppliers?.length" class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('reports.supplier') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('reports.orders') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('reports.totalSpent') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('reports.debt') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('reports.lastOrder') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="s in suppliers.topSuppliers" :key="s.supplierId">
                <td class="px-4 py-3 font-medium">{{ s.name }}</td>
                <td class="px-4 py-3 text-end">{{ s.orders }}</td>
                <td class="px-4 py-3 text-end">{{ formatCurrency(s.spent) }}</td>
                <td class="px-4 py-3 text-end"><span :class="s.debt > 0 ? 'text-danger-600 font-medium' : 'text-gray-400'">{{ s.debt > 0 ? formatCurrency(s.debt) : '-' }}</span></td>
                <td class="px-4 py-3 text-end text-gray-500">{{ s.lastOrderDate ? shortDate(s.lastOrderDate) : '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="p-8 text-center text-gray-400">{{ t('reports.noData') }}</div>
      </div>
      <div class="card overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <ExclamationTriangleIcon class="w-5 h-5 text-amber-600" /><h3 class="font-semibold text-gray-900">{{ t('reports.suppliersWithDebt') }}</h3>
          <span v-if="suppliers.suppliersWithDebt?.length" class="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700">{{ suppliers.suppliersWithDebt.length }}</span>
        </div>
        <table v-if="suppliers.suppliersWithDebt?.length" class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('reports.supplier') }}</th>
              <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('reports.phone') }}</th>
              <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('reports.debt') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="s in suppliers.suppliersWithDebt" :key="s.supplierId">
              <td class="px-4 py-3 font-medium">{{ s.name }}</td><td class="px-4 py-3">{{ s.phone || '-' }}</td><td class="px-4 py-3 text-end text-danger-600">{{ formatCurrency(s.debt) }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="p-8 text-center text-gray-400">{{ t('reports.noSuppliersWithDebt') }}</div>
      </div>
      <div class="card overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100"><h3 class="font-semibold text-gray-900">{{ t('reports.pendingOrders') }}</h3></div>
        <div v-if="suppliers.pendingOrders?.length" class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('reports.orderNumber') }}</th>
                <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('reports.supplier') }}</th>
                <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('common.status') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('reports.amount') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('reports.paid') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('reports.remaining') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('reports.date') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="o in suppliers.pendingOrders" :key="o.orderId">
                <td class="px-4 py-3 font-mono">{{ o.orderNumber }}</td>
                <td class="px-4 py-3">{{ o.supplier }}</td>
                <td class="px-4 py-3">
                  <span :class="['px-2 py-0.5 rounded text-xs font-medium', o.status === 'draft' ? 'bg-gray-100 text-gray-700' : o.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700']">
                    {{ o.status === 'draft' ? 'Brouillon' : o.status === 'pending' ? 'En attente' : 'Partiel' }}
                  </span>
                </td>
                <td class="px-4 py-3 text-end">{{ formatCurrency(o.amount) }}</td>
                <td class="px-4 py-3 text-end">{{ formatCurrency(o.amountPaid) }}</td>
                <td class="px-4 py-3 text-end text-danger-600">{{ formatCurrency(o.amountRemaining) }}</td>
                <td class="px-4 py-3 text-end text-gray-500 whitespace-nowrap">{{ shortDate(o.orderedAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="p-8 text-center text-gray-400">{{ t('reports.noPendingOrders') }}</div>
      </div>
    </template>

    <!-- REPAIRS -->
    <template v-else-if="repairsReport">
      <div class="card p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <select v-model="repairFilters.repairerId" class="input text-sm">
          <option value="">{{ t('reports.allTechnicians') }}</option>
          <option v-for="r in repairers || []" :key="r.id" :value="r.id">{{ r.name }}</option>
        </select>
        <select v-model="repairFilters.status" class="input text-sm">
          <option value="">{{ t('repairs.allStatus') }}</option>
          <option v-for="st in REPAIR_STATUSES" :key="st" :value="st">{{ t(`repairs.status.${st}`) }}</option>
        </select>
        <select v-model="repairFilters.paymentStatus" class="input text-sm">
          <option value="">{{ t('repairs.payment.allStatus') }}</option>
          <option v-for="ps in PAYMENT_STATUSES" :key="ps" :value="ps">{{ t(`repairs.payment.status.${ps}`) }}</option>
        </select>
      </div>
      <div class="rounded-2xl bg-gradient-to-br from-amber-600 to-amber-800 text-white p-6">
        <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p class="text-amber-100 text-sm mb-1">{{ t('reports.repairProfit') }}</p>
            <p class="text-4xl font-bold">{{ formatCurrency(repairsReport.summary.profit) }}</p>
            <p class="text-amber-100 text-xs mt-1">{{ repairsReport.summary.realizedCount }} {{ t('reports.realizedRepairs') }} · {{ repairsReport.summary.margin.toFixed(1) }}%</p>
          </div>
          <div class="flex gap-8">
            <div>
              <p class="text-amber-200 text-xs">{{ t('reports.pendingRevenue') }}</p>
              <p class="text-xl font-semibold">{{ formatCurrency(repairsReport.summary.pendingRevenue) }}</p>
            </div>
            <div>
              <p class="text-amber-200 text-xs">{{ t('reports.collectedNotRealized') }}</p>
              <p class="text-xl font-semibold">{{ formatCurrency(repairsReport.summary.collectedNotRealized) }}</p>
            </div>
          </div>
        </div>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div class="card p-4"><p class="text-sm text-gray-500 mb-1">{{ t('reports.repairRevenue') }}</p><p class="text-2xl font-bold">{{ formatCurrency(repairsReport.summary.revenue) }}</p></div>
        <div class="card p-4"><p class="text-sm text-gray-500 mb-1">{{ t('reports.partsCost') }}</p><p class="text-2xl font-bold text-danger-600">{{ formatCurrency(repairsReport.summary.partsCost) }}</p></div>
        <div class="card p-4"><p class="text-sm text-gray-500 mb-1">{{ t('reports.grossProfit') }}</p><p class="text-2xl font-bold">{{ formatCurrency(repairsReport.summary.grossProfit) }}</p></div>
        <div class="card p-4"><p class="text-sm text-gray-500 mb-1">{{ t('reports.laborCost') }}</p><p class="text-2xl font-bold text-danger-600">{{ formatCurrency(repairsReport.summary.laborCost) }}</p></div>
        <div class="card p-4 col-span-2 lg:col-span-1"><p class="text-sm text-gray-500 mb-1">{{ t('reports.otherCost') }}</p><p class="text-2xl font-bold text-danger-600">{{ formatCurrency(repairsReport.summary.otherCost) }}</p></div>
      </div>
      <div v-if="repairsReport.byTechnician?.length" class="card overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100"><h3 class="font-semibold text-gray-900">{{ t('reports.byTechnician') }}</h3></div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('repairs.table.repairer') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('reports.realizedRepairs') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('reports.revenue') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('reports.laborCost') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('reports.repairProfit') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="x in repairsReport.byTechnician" :key="x.repairerId ?? 'none'">
                <td class="px-4 py-3 font-medium">{{ x.repairerId ? x.name : t('reports.workshop') }}</td>
                <td class="px-4 py-3 text-end">{{ x.count }}</td>
                <td class="px-4 py-3 text-end">{{ formatCurrency(x.revenue) }}</td>
                <td class="px-4 py-3 text-end">{{ formatCurrency(x.laborCost) }}</td>
                <td class="px-4 py-3 text-end font-medium">{{ formatCurrency(x.profit) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="card overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100">
          <h3 class="font-semibold text-gray-900">{{ t('reports.repairsList') }}</h3>
          <p class="text-xs text-gray-500">{{ t('reports.repairsListHint') }}</p>
        </div>
        <div v-if="repairsReport.repairs?.length" class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('repairs.table.repair') }}</th>
                <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('repairs.table.repairer') }}</th>
                <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('repairs.table.status') }}</th>
                <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('repairs.payment.title') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('reports.revenue') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('reports.costs') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('reports.repairProfit') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="x in repairsReport.repairs" :key="x.id" :class="x.status === 'cancelled' && 'opacity-50'">
                <td class="px-4 py-3">
                  <RouterLink :to="`/app/repairs/${x.id}`" class="font-medium text-gray-900 hover:underline">{{ x.repairNumber }}</RouterLink>
                  <p class="text-xs text-gray-500 truncate max-w-[220px]">{{ x.customer }} · {{ x.deviceDescription }}</p>
                </td>
                <td class="px-4 py-3">{{ x.technician || '-' }}</td>
                <td class="px-4 py-3">{{ t(`repairs.status.${x.status}`) }}</td>
                <td class="px-4 py-3">
                  <span :class="['px-2 py-0.5 rounded text-xs font-medium', PAY_BADGE[x.paymentStatus]]">{{ t(`repairs.payment.status.${x.paymentStatus}`) }}</span>
                </td>
                <td class="px-4 py-3 text-end whitespace-nowrap">{{ formatCurrency(x.revenue) }}</td>
                <td class="px-4 py-3 text-end whitespace-nowrap">
                  {{ formatCurrency(x.totalCost) }}<span v-if="x.costsCapitalized" class="block text-[11px] text-gray-400">{{ t('repairs.profit.capitalizedShort') }}</span>
                </td>
                <td :class="['px-4 py-3 text-end whitespace-nowrap font-medium', x.realized ? (x.profit >= 0 ? 'text-success-700' : 'text-danger-700') : 'text-gray-400']">
                  {{ formatCurrency(x.profit) }}<span v-if="!x.realized" class="block text-[11px] font-normal">{{ t('repairs.profit.notRealized') }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="p-8 text-center text-gray-400">{{ t('reports.noData') }}</div>
      </div>
    </template>

    <div v-else class="card p-12 text-center text-gray-400">
      <ArchiveBoxIcon class="w-16 h-16 mx-auto mb-4 opacity-50" />
      <p>{{ t('reports.noData') }}</p>
    </div>
  </div>
</template>
