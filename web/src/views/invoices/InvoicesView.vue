<script setup>
import { docIntlLocale, dt, intlLocale } from '@/i18n';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import {
  ArchiveBoxIcon,
  ArrowDownTrayIcon,
  CalculatorIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline';
import { invoicesApi } from '@/api/invoices';
import { settingsApi } from '@/api/misc';
import { useAuthStore } from '@/stores/auth';
import { formatCurrency } from '@/utils/format';
import { companyFromSettings, customerLabel, invoicePdfBlob, summaryPdfBlob } from '@/utils/invoicePdf';
import DateRangePicker from '@/components/ui/DateRangePicker.vue';
import ConfirmModal from '@/components/ui/ConfirmModal.vue';

const { t } = useI18n();
const queryClient = useQueryClient();
const auth = useAuthStore();
const isAutoEntrepreneur = computed(() => auth.isAutoEntrepreneur);

// ── Tax summary periods (local calendar) ──
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(y, m, 0).getDate();
const Y = now.getFullYear();
const M = now.getMonth() + 1;
const monthFrom = `${Y}-${pad(M)}-01`;
const monthTo = `${Y}-${pad(M)}-${pad(lastDay(Y, M))}`;
const yearFrom = `${Y}-01-01`;
const yearTo = `${Y}-12-31`;
const q = Math.floor(now.getMonth() / 3);
const quarterFrom = `${Y}-${pad(q * 3 + 1)}-01`;
const quarterTo = `${Y}-${pad(q * 3 + 3)}-${pad(lastDay(Y, q * 3 + 3))}`;
const quarterLabel = t('invoices.quarterShort', { n: q + 1, year: Y });
const monthName = (d) => new Date(d).toLocaleDateString(intlLocale(), { month: 'long', year: 'numeric' });

const periodQuery = (key, fn, from, to, enabled) => useQuery({ queryKey: [key], queryFn: () => fn(from, to), enabled });
const notAE = computed(() => !isAutoEntrepreneur.value);
const { data: irMonth } = periodQuery('ir-month', invoicesApi.calculateCustomPeriodIr, monthFrom, monthTo, isAutoEntrepreneur);
const { data: irQuarter } = periodQuery('ir-trimestre', invoicesApi.calculateCustomPeriodIr, quarterFrom, quarterTo, isAutoEntrepreneur);
const { data: irYear } = periodQuery('ir-year', invoicesApi.calculateCustomPeriodIr, yearFrom, yearTo, isAutoEntrepreneur);
const { data: tvaMonth } = periodQuery('tva-month', invoicesApi.calculateCustomPeriodTva, monthFrom, monthTo, notAE);
const { data: tvaQuarter } = periodQuery('tva-trimestre', invoicesApi.calculateCustomPeriodTva, quarterFrom, quarterTo, notAE);
const { data: tvaYear } = periodQuery('tva-year', invoicesApi.calculateCustomPeriodTva, yearFrom, yearTo, notAE);
const irCards = computed(() => [
  { key: 'month', title: t('invoices.tva.irCurrentMonth'), badge: monthName(monthFrom), d: irMonth.value, from: monthFrom, to: monthTo },
  { key: 'quarter', title: t('invoices.tva.irCurrentTrimestre'), badge: quarterLabel, d: irQuarter.value, from: quarterFrom, to: quarterTo },
  { key: 'year', title: t('invoices.tva.irCurrentYear'), badge: String(Y), d: irYear.value, from: yearFrom, to: yearTo },
]);
const tvaCards = computed(() => [
  { key: 'month', title: t('invoices.tva.currentMonth'), badge: monthName(monthFrom), d: tvaMonth.value, from: monthFrom, to: monthTo },
  { key: 'quarter', title: t('invoices.tva.currentTrimestre'), badge: quarterLabel, d: tvaQuarter.value, from: quarterFrom, to: quarterTo },
  { key: 'year', title: t('invoices.tva.currentYear'), badge: String(Y), d: tvaYear.value, from: yearFrom, to: yearTo },
]);
const summaryOpen = ref(false);

const quarterYear = ref(Y);
const { data: quarterly } = useQuery({ queryKey: ['quarterly-totals', quarterYear], queryFn: () => invoicesApi.getQuarterlyTotals(quarterYear.value) });

// Custom periods
const tvaRange = ref(null);
const tvaResult = ref(null);
const tvaLoading = ref(false);
const irRange = ref(null);
const irResult = ref(null);
const irLoading = ref(false);
const info = ref({ show: false, message: '' });
const inform = (message) => (info.value = { show: true, message });
async function calcTva() {
  if (!tvaRange.value?.[0] || !tvaRange.value?.[1]) return inform(t('invoices.tva.selectDates'));
  tvaLoading.value = true;
  try {
    tvaResult.value = await invoicesApi.calculateCustomPeriodTva(tvaRange.value[0], tvaRange.value[1]);
  } catch {
    inform(t('invoices.tva.calculateError'));
  } finally {
    tvaLoading.value = false;
  }
}
async function calcIr() {
  if (!irRange.value?.[0] || !irRange.value?.[1]) return inform(t('invoices.tva.selectDates'));
  irLoading.value = true;
  try {
    irResult.value = await invoicesApi.calculateCustomPeriodIr(irRange.value[0], irRange.value[1]);
  } catch {
    inform(t('invoices.tva.irCalculateError'));
  } finally {
    irLoading.value = false;
  }
}

// ── List ──
const query = ref('');
const type = ref(null);
const page = ref(1);
const limit = ref(20);
const dateRange = ref(null);
const dateFrom = computed(() => dateRange.value?.[0] || '');
const dateTo = computed(() => dateRange.value?.[1] || '');
const { data: list, isLoading } = useQuery({
  queryKey: ['invoices', query, type, dateFrom, dateTo, page, limit],
  queryFn: () =>
    invoicesApi.getAll({ query: query.value || undefined, type: type.value, dateFrom: dateFrom.value || undefined, dateTo: dateTo.value || undefined, page: page.value, limit: limit.value }),
});
const invoices = computed(() => list.value?.invoices || []);
const total = computed(() => list.value?.total || 0);
const totalPages = computed(() => Math.ceil(total.value / limit.value));
const formatWhen = (d) => new Date(d).toLocaleDateString(intlLocale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const refreshAll = () => {
  for (const k of ['invoices', 'quarterly-totals', 'ir-month', 'ir-trimestre', 'ir-year', 'tva-month', 'tva-trimestre', 'tva-year']) queryClient.invalidateQueries({ queryKey: [k] });
};
const toDelete = ref(null);
const deleteMut = useMutation({
  mutationFn: ({ id, type: kind }) => invoicesApi.delete(id, kind),
  onSuccess: () => {
    refreshAll();
    toDelete.value = null;
  },
});
const toArchive = ref(null);
const archiveMut = useMutation({
  mutationFn: (id) => invoicesApi.archive(id),
  onSuccess: () => {
    refreshAll();
    toArchive.value = null;
  },
});

// ── ZIP of every invoice PDF in a period + a summary PDF ──
const downloading = ref(null);
async function downloadPeriod(from, to, label, summaryInfo) {
  downloading.value = label;
  try {
    const rows = (await invoicesApi.getAll({ dateFrom: from, dateTo: to, isArchived: false, limit: 9999 })).invoices;
    if (!rows.length) return inform(t('invoices.noInvoicesInPeriod'));
    const company = companyFromSettings(await settingsApi.getTenantSettings());
    const sum = (k) => rows.reduce((s, i) => s + Number(i[k]), 0);
    const summary =
      summaryInfo?.type === 'ir'
        ? [
            { label: dt('invoices.invoiceCount'), value: String(summaryInfo.invoiceCount || rows.length) },
            { label: dt('invoices.tva.flatRate'), value: `${summaryInfo.flatTaxRate || 0}%` },
            { label: dt('invoices.tva.totalRevenue'), value: formatCurrency(summaryInfo.totalRevenue || 0) },
            { label: dt('invoices.irFlat'), value: formatCurrency(summaryInfo.irAmount || 0) },
          ]
        : summaryInfo?.type === 'tva'
          ? [
              { label: dt('invoices.invoiceCount'), value: String(summaryInfo.invoiceCount || rows.length) },
              { label: dt('invoices.vatRate'), value: `${summaryInfo.taxRate || 0}%` },
              { label: dt('invoices.totalHt'), value: formatCurrency(summaryInfo.taxableAmount || 0) },
              { label: dt('invoices.vatAmount'), value: formatCurrency(summaryInfo.tvaAmount || 0) },
              { label: dt('invoices.totalTtc'), value: formatCurrency(sum('totalAmount')) },
            ]
          : [
              { label: dt('invoices.invoiceCount'), value: String(rows.length) },
              { label: dt('invoices.totalHt'), value: formatCurrency(sum('subtotal')) },
              { label: dt('invoices.totalVat'), value: formatCurrency(sum('taxAmount')) },
              { label: dt('invoices.totalTtc'), value: formatCurrency(sum('totalAmount')) },
            ];
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    zip.file(
      `${dt('invoices.zipSummary')}.pdf`,
      await summaryPdfBlob({
        title: dt('invoices.title'),
        period: { from, to },
        summary,
        tables: [
          {
            title: dt('invoices.list'),
            headers: [dt('invoices.number'), dt('invoices.date'), dt('invoices.customer'), dt('invoices.ht'), dt('invoices.tvaAmount'), dt('invoices.ttc')],
            rows: rows.map((i) => [i.invoiceNumber, new Date(i.date).toLocaleDateString(docIntlLocale()), i.customer?.fullName || dt('invoices.walkIn'), formatCurrency(i.subtotal), formatCurrency(i.taxAmount), formatCurrency(i.totalAmount)]),
          },
        ],
      }),
    );
    const folder = zip.folder(dt('invoices.zipFolder'));
    for (const inv of rows) folder.file(`${inv.invoiceNumber}.pdf`, await invoicePdfBlob(inv, company));
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dt('invoices.zipFolder')}-${label.replace(/\s+/g, '-').toLowerCase()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('Invoice download failed:', e);
    inform(t('invoices.downloadError'));
  } finally {
    downloading.value = null;
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">{{ t('invoices.title') }}</h1>
        <p class="text-gray-500 mt-1">{{ t('invoices.subtitle') }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <RouterLink to="/app/invoices/archived" class="btn-secondary flex items-center gap-2"><ArchiveBoxIcon class="w-5 h-5" /> {{ t('invoices.archived') }}</RouterLink>
        <RouterLink to="/app/invoices/new" class="btn-primary flex items-center gap-2"><PlusIcon class="w-5 h-5" /> {{ t('invoices.addStandalone') }}</RouterLink>
      </div>
    </div>

    <!-- Tax summary: flat income tax for auto-entrepreneurs, TVA otherwise -->
    <div class="card overflow-hidden">
      <button class="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors" @click="summaryOpen = !summaryOpen">
        <div class="flex items-center gap-3">
          <CalculatorIcon :class="['w-5 h-5', isAutoEntrepreneur ? 'text-amber-600' : 'text-indigo-600']" />
          <h2 class="text-lg font-semibold text-gray-900">{{ isAutoEntrepreneur ? t('invoices.tva.irTitle') : t('invoices.tva.title') }}</h2>
        </div>
        <ChevronDownIcon :class="['w-5 h-5 text-gray-400 transition-transform duration-200', { 'rotate-180': summaryOpen }]" />
      </button>
      <div v-show="summaryOpen" class="px-6 pb-6 space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <template v-if="isAutoEntrepreneur">
            <div v-for="c in irCards" :key="c.key" class="rounded-xl border border-amber-100 bg-amber-50/40 p-5">
              <div class="flex items-center justify-between mb-2">
                <p class="text-sm font-medium text-gray-600">{{ c.title }}</p>
                <span class="text-xs text-gray-500 bg-white px-2 py-0.5 rounded-full capitalize">{{ c.badge }}</span>
              </div>
              <p class="text-2xl font-bold text-gray-900">{{ formatCurrency(c.d?.irAmount || 0) }}</p>
              <div class="flex items-center gap-2 text-xs text-gray-500 mt-2">
                <span>{{ c.d?.invoiceCount || 0 }} {{ t('invoices.tva.invoices') }}</span>
                <span class="w-1 h-1 rounded-full bg-gray-300" />
                <span>{{ t('invoices.tva.flatRate') }}: {{ c.d?.flatTaxRate || 0 }}%</span>
              </div>
              <div class="text-xs text-gray-500 mt-1">{{ t('invoices.tva.totalRevenue') }}: {{ formatCurrency(c.d?.totalRevenue || 0) }}</div>
              <button
                class="mt-2 text-xs text-gray-600 hover:text-gray-900 flex items-center gap-1"
                :disabled="downloading !== null"
                @click="downloadPeriod(c.from, c.to, `${t('invoices.irShort')} ${c.badge}`, { type: 'ir', ...c.d })"
              >
                <ArrowDownTrayIcon class="w-3.5 h-3.5" /> {{ downloading === `${t('invoices.irShort')} ${c.badge}` ? t('invoices.downloading') : t('invoices.downloadAll') }}
              </button>
            </div>
          </template>
          <template v-else>
            <div v-for="c in tvaCards" :key="c.key" class="rounded-xl border border-indigo-100 bg-indigo-50/40 p-5">
              <div class="flex items-center justify-between mb-2">
                <p class="text-sm font-medium text-gray-600">{{ c.title }}</p>
                <span class="text-xs text-gray-500 bg-white px-2 py-0.5 rounded-full capitalize">{{ c.badge }}</span>
              </div>
              <p class="text-2xl font-bold text-gray-900">{{ formatCurrency(c.d?.tvaAmount || 0) }}</p>
              <div class="flex items-center gap-2 text-xs text-gray-500 mt-2">
                <span>{{ c.d?.invoiceCount || 0 }} {{ t('invoices.tva.invoices') }}</span>
                <span class="w-1 h-1 rounded-full bg-gray-300" />
                <span>{{ t('invoices.tva.rate') }}: {{ c.d?.taxRate || 0 }}%</span>
              </div>
              <div class="text-xs text-gray-500 mt-1">{{ t('invoices.htValue', { amount: formatCurrency(c.d?.taxableAmount || 0) }) }}</div>
              <button
                class="mt-2 text-xs text-gray-600 hover:text-gray-900 flex items-center gap-1"
                :disabled="downloading !== null"
                @click="downloadPeriod(c.from, c.to, `${t('invoices.tvaShort')} ${c.badge}`, { type: 'tva', ...c.d })"
              >
                <ArrowDownTrayIcon class="w-3.5 h-3.5" /> {{ downloading === `${t('invoices.tvaShort')} ${c.badge}` ? t('invoices.downloading') : t('invoices.downloadAll') }}
              </button>
            </div>
          </template>
        </div>

        <div class="rounded-xl border border-gray-200 p-5">
          <p class="text-sm font-medium text-gray-700 mb-3">{{ t('invoices.tva.customPeriod') }}</p>
          <div class="flex flex-col sm:flex-row gap-3">
            <div class="flex-1"><DateRangePicker v-if="isAutoEntrepreneur" v-model="irRange" :placeholder="t('invoices.choosePeriod')" /><DateRangePicker v-else v-model="tvaRange" :placeholder="t('invoices.choosePeriod')" /></div>
            <button
              class="btn-primary text-sm py-2.5 px-5 whitespace-nowrap flex items-center justify-center gap-2"
              :disabled="isAutoEntrepreneur ? irLoading || !irRange : tvaLoading || !tvaRange"
              @click="isAutoEntrepreneur ? calcIr() : calcTva()"
            >
              <CalculatorIcon class="w-4 h-4" /> {{ (isAutoEntrepreneur ? irLoading : tvaLoading) ? t('common.loading') : t('invoices.tva.calculate') }}
            </button>
          </div>
          <div v-if="isAutoEntrepreneur && irResult" class="mt-4">
            <p class="text-2xl font-bold text-gray-900">{{ formatCurrency(irResult.irAmount) }}</p>
            <div class="flex flex-wrap items-center gap-2 text-xs text-gray-500 mt-1">
              <span>{{ irResult.invoiceCount }} {{ t('invoices.tva.invoices') }}</span><span class="w-1 h-1 rounded-full bg-gray-300" />
              <span>{{ t('invoices.tva.flatRate') }}: {{ irResult.flatTaxRate }}%</span><span class="w-1 h-1 rounded-full bg-gray-300" />
              <span>{{ t('invoices.tva.totalRevenue') }}: {{ formatCurrency(irResult.totalRevenue) }}</span>
            </div>
            <button
              class="mt-2 text-xs text-gray-600 hover:text-gray-900 flex items-center gap-1"
              :disabled="downloading !== null"
              @click="downloadPeriod(irRange[0], irRange[1], t('invoices.customIr'), { type: 'ir', ...irResult })"
            >
              <ArrowDownTrayIcon class="w-3.5 h-3.5" /> {{ downloading === t('invoices.customIr') ? t('invoices.downloading') : t('invoices.downloadAll') }}
            </button>
          </div>
          <div v-if="!isAutoEntrepreneur && tvaResult" class="mt-4">
            <p class="text-2xl font-bold text-gray-900">{{ formatCurrency(tvaResult.tvaAmount) }}</p>
            <div class="flex flex-wrap items-center gap-2 text-xs text-gray-500 mt-1">
              <span>{{ tvaResult.invoiceCount }} {{ t('invoices.tva.invoices') }}</span><span class="w-1 h-1 rounded-full bg-gray-300" />
              <span>{{ t('invoices.tva.rate') }}: {{ tvaResult.taxRate }}%</span><span class="w-1 h-1 rounded-full bg-gray-300" />
              <span>{{ t('invoices.htValue', { amount: formatCurrency(tvaResult.taxableAmount) }) }}</span>
            </div>
            <button
              class="mt-2 text-xs text-gray-600 hover:text-gray-900 flex items-center gap-1"
              :disabled="downloading !== null"
              @click="downloadPeriod(tvaRange[0], tvaRange[1], t('invoices.customTva'), { type: 'tva', ...tvaResult })"
            >
              <ArrowDownTrayIcon class="w-3.5 h-3.5" /> {{ downloading === t('invoices.customTva') ? t('invoices.downloading') : t('invoices.downloadAll') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Quarterly totals -->
    <div class="card p-6">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <DocumentTextIcon class="w-5 h-5 text-emerald-600" />
          <h2 class="text-lg font-semibold text-gray-900">{{ t('invoices.quarterly.title') }}</h2>
        </div>
        <div class="flex items-center gap-2">
          <button class="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors" :title="t('common.previous')" @click="quarterYear--">
            <ChevronLeftIcon class="w-5 h-5 rtl:rotate-180" />
          </button>
          <span class="text-sm font-semibold text-gray-900 w-12 text-center">{{ quarterYear }}</span>
          <button class="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors" :title="t('common.next')" @click="quarterYear++">
            <ChevronRightIcon class="w-5 h-5 rtl:rotate-180" />
          </button>
        </div>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div v-for="qt in quarterly?.quarters || []" :key="qt.quarter" class="rounded-xl border border-emerald-100 bg-emerald-50/40 p-5">
          <div class="flex items-center justify-between mb-2">
            <p class="text-sm font-semibold text-gray-700">{{ qt.label }}</p>
            <span class="text-xs text-gray-500">{{ t(`invoices.quarterMonths.q${qt.quarter}`) }}</span>
          </div>
          <p class="text-xl font-bold text-gray-900">{{ formatCurrency(qt.totalTTC) }}</p>
          <div class="flex flex-wrap items-center gap-2 text-xs text-gray-500 mt-2">
            <span>{{ qt.invoiceCount }} {{ t('invoices.tva.invoices') }}</span><span class="w-1 h-1 rounded-full bg-gray-300" /><span>{{ t('invoices.htValue', { amount: formatCurrency(qt.totalHT) }) }}</span>
          </div>
        </div>
      </div>
      <div class="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
        <span class="text-sm font-medium text-gray-600">{{ t('invoices.quarterly.annualTotal') }} {{ quarterYear }}</span>
        <div class="flex items-center gap-3">
          <span class="text-xs text-gray-500">{{ quarterly?.invoiceCount || 0 }} {{ t('invoices.tva.invoices') }}</span>
          <span class="text-lg font-bold text-emerald-700">{{ formatCurrency(quarterly?.totalTTC || 0) }}</span>
        </div>
      </div>
    </div>

    <div class="card p-4">
      <div class="flex flex-col md:flex-row gap-4">
        <div class="relative flex-1">
          <MagnifyingGlassIcon class="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input v-model="query" type="text" :placeholder="t('invoices.search')" class="input ps-10" @input="page = 1" />
        </div>
        <select v-model="type" class="input w-full md:w-44" @change="page = 1">
          <option :value="null">{{ t('invoices.allTypes') }}</option>
          <option value="transaction">{{ t('invoices.types.transaction') }}</option>
          <option value="standalone">{{ t('invoices.types.standalone') }}</option>
        </select>
        <div class="w-full md:w-64"><DateRangePicker v-model="dateRange" /></div>
      </div>
    </div>

    <div class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
              <th class="px-4 py-3 text-start text-sm font-medium text-gray-500">{{ t('invoices.number') }}</th>
              <th class="px-4 py-3 text-start text-sm font-medium text-gray-500">{{ t('invoices.date') }}</th>
              <th class="px-4 py-3 text-start text-sm font-medium text-gray-500">{{ t('invoices.customer') }}</th>
              <th class="px-4 py-3 text-start text-sm font-medium text-gray-500">{{ t('invoices.transaction') }}</th>
              <th class="px-4 py-3 text-end text-sm font-medium text-gray-500">{{ t('invoices.subtotalHT') }}</th>
              <th class="px-4 py-3 text-end text-sm font-medium text-gray-500">{{ t('invoices.tvaAmount') }}</th>
              <th class="px-4 py-3 text-end text-sm font-medium text-gray-500">{{ t('invoices.totalTTC') }}</th>
              <th class="px-4 py-3 text-end text-sm font-medium text-gray-500">{{ t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-if="isLoading"><td colspan="8" class="px-4 py-8 text-center text-gray-500">{{ t('common.loading') }}</td></tr>
            <tr v-else-if="!invoices.length">
              <td colspan="8" class="px-4 py-8 text-center text-gray-500">
                <DocumentTextIcon class="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>{{ t('invoices.noInvoices') }}</p>
              </td>
            </tr>
            <tr v-for="inv in invoices" :key="inv.id" class="hover:bg-gray-50">
              <td class="px-4 py-3">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-mono font-medium text-gray-900 whitespace-nowrap">{{ inv.invoiceNumber }}</span>
                  <span v-if="inv.type === 'standalone'" class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">{{ t('invoices.types.standalone') }}</span>
                  <span
                    v-if="!inv.customer && inv.type === 'transaction'"
                    class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-warning-100 text-warning-800"
                    :title="t('invoices.missingCustomer')"
                  >
                    <ExclamationTriangleIcon class="w-3 h-3 me-1" /> {{ t('invoices.missingCustomer') }}
                  </span>
                </div>
              </td>
              <td class="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{{ formatWhen(inv.date) }}</td>
              <td class="px-4 py-3">
                <span v-if="inv.customer" class="text-gray-900">{{ inv.customer.fullName }}</span>
                <span v-else class="text-gray-400">{{ t('invoices.walkIn') }}</span>
              </td>
              <td class="px-4 py-3 text-sm whitespace-nowrap">
                <RouterLink v-if="inv.transactionNumber" :to="`/app/transactions/${inv.transactionId}`" class="text-primary-600 hover:text-primary-800 font-mono">{{ inv.transactionNumber }}</RouterLink>
                <span v-else class="text-gray-400">-</span>
              </td>
              <td class="px-4 py-3 text-end text-gray-900 whitespace-nowrap">{{ formatCurrency(inv.subtotal) }}</td>
              <td class="px-4 py-3 text-end text-gray-900 whitespace-nowrap">{{ formatCurrency(inv.taxAmount) }}</td>
              <td class="px-4 py-3 text-end font-medium text-gray-900 whitespace-nowrap">{{ formatCurrency(inv.totalAmount) }}</td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-end gap-1">
                  <RouterLink :to="`/app/invoices/${inv.id}/preview`" class="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50" :title="t('invoices.preview')"><EyeIcon class="w-5 h-5" /></RouterLink>
                  <RouterLink v-if="inv.type === 'standalone'" :to="`/app/invoices/${inv.id}/edit`" class="p-2 text-gray-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50" :title="t('common.edit')">
                    <PencilSquareIcon class="w-5 h-5" />
                  </RouterLink>
                  <button class="p-2 text-gray-400 hover:text-amber-600 rounded-lg hover:bg-amber-50" :title="t('invoices.archive')" @click="toArchive = { id: inv.id, number: inv.invoiceNumber }">
                    <ArchiveBoxIcon class="w-5 h-5" />
                  </button>
                  <button class="p-2 text-gray-400 hover:text-danger-600 rounded-lg hover:bg-danger-50" :title="t('common.delete')" @click="toDelete = { id: inv.id, number: inv.invoiceNumber, type: inv.type }">
                    <TrashIcon class="w-5 h-5" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="totalPages > 1" class="flex items-center justify-between px-4 py-3 border-t border-gray-200">
        <p class="text-sm text-gray-500">{{ t('common.showing') }} {{ (page - 1) * limit + 1 }} - {{ Math.min(page * limit, total) }} {{ t('common.of') }} {{ total }}</p>
        <div class="flex gap-2">
          <button class="btn-secondary px-3 py-1 text-sm" :disabled="page === 1" @click="page--">{{ t('common.previous') }}</button>
          <button class="btn-secondary px-3 py-1 text-sm" :disabled="page >= totalPages" @click="page++">{{ t('common.next') }}</button>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="toDelete" class="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" @click.self="toDelete = null">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-full bg-danger-100 flex items-center justify-center"><TrashIcon class="w-6 h-6 text-danger-600" /></div>
            <div>
              <h3 class="text-lg font-semibold text-gray-900">{{ t('invoices.confirmDelete') }}</h3>
              <p class="text-sm text-gray-500 font-mono">{{ toDelete.number }}</p>
            </div>
          </div>
          <p class="text-sm text-gray-600">{{ toDelete.type === 'standalone' ? t('invoices.deleteStandaloneWarning') : t('invoices.deleteTransactionWarning') }}</p>
          <div class="flex justify-end gap-2">
            <button class="btn-secondary" @click="toDelete = null">{{ t('common.cancel') }}</button>
            <button class="btn-danger" :disabled="deleteMut.isPending.value" @click="deleteMut.mutate({ id: toDelete.id, type: toDelete.type })">
              {{ deleteMut.isPending.value ? t('common.loading') : t('common.delete') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
    <Teleport to="body">
      <div v-if="toArchive" class="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" @click.self="toArchive = null">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center"><ArchiveBoxIcon class="w-6 h-6 text-amber-600" /></div>
            <div>
              <h3 class="text-lg font-semibold text-gray-900">{{ t('invoices.confirmArchive') }}</h3>
              <p class="text-sm text-gray-500 font-mono">{{ toArchive.number }}</p>
            </div>
          </div>
          <p class="text-sm text-gray-600">{{ t('invoices.archiveWarning') }}</p>
          <div class="flex justify-end gap-2">
            <button class="btn-secondary" @click="toArchive = null">{{ t('common.cancel') }}</button>
            <button class="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-medium transition-colors" :disabled="archiveMut.isPending.value" @click="archiveMut.mutate(toArchive.id)">
              {{ archiveMut.isPending.value ? t('common.loading') : t('invoices.archive') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
    <ConfirmModal :show="info.show" title="Information" :message="info.message" confirm-text="OK" type="warning" :show-cancel="false" @confirm="info.show = false" @cancel="info.show = false" />
  </div>
</template>
