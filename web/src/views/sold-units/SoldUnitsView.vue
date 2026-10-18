<script setup>
import { intlLocale } from '@/i18n';
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ListBulletIcon,
  Squares2X2Icon,
  ComputerDesktopIcon,
  CubeIcon,
  DevicePhoneMobileIcon,
  DeviceTabletIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  TruckIcon,
  WrenchScrewdriverIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';
import { soldUnitsApi, formatImei } from '@/api/soldUnits';
import { deviceCatalogApi } from '@/api/deviceCatalog';
import { repairsApi } from '@/api/repairs';
import { formatCurrency } from '@/utils/format';
import { conditionBadge, isComputerUnit } from '@/utils/soldUnitDisplay';
import UnitLabelModal from '@/components/sold-units/UnitLabelModal.vue';
import { labelTemplatesApi } from '@/api/labelTemplates';
import { settingsApi } from '@/api/misc';
import { deviceLabel, layoutKey, normalizeLayout, printLabels } from '@/utils/labelRenderer';
import BarcodeIcon from '@/components/ui/BarcodeIcon.vue';
import DateRangePicker from '@/components/ui/DateRangePicker.vue';
import Toast from '@/components/ui/Toast.vue';
import ConfirmModal from '@/components/ui/ConfirmModal.vue';
import DeviceImage from '@/components/sold-units/DeviceImage.vue';

const { t } = useI18n();
const route = useRoute();
const queryClient = useQueryClient();

const search = ref('');
const deviceType = ref('all');
const brand = ref(null);
const model = ref(null);
const storage = ref(null);
const condition = ref(null);
const stock = ref('inStock');
const dateRange = ref(null);
const page = ref(1);
const pageSize = ref(20);

// Deep links from the global search: ?q=<imei>&stock=all
watch(
  () => route.query,
  (q) => {
    if (q.q) search.value = q.q;
    if (['all', 'sold', 'inStock'].includes(q.stock)) stock.value = q.stock;
  },
  { immediate: true },
);

const TYPE_TABS = [
  { value: 'all', label: 'common.all', icon: null },
  { value: 'phone', label: 'soldUnits.deviceTypes.phone.name', icon: DevicePhoneMobileIcon },
  { value: 'tablet', label: 'soldUnits.deviceTypes.tablet.name', icon: DeviceTabletIcon },
  { value: 'laptop', label: 'soldUnits.deviceTypes.laptop.name', icon: ComputerDesktopIcon },
  { value: 'macbook', label: 'soldUnits.deviceTypes.macbook.name', icon: ComputerDesktopIcon },
];

watch(deviceType, () => {
  brand.value = null;
  model.value = null;
  storage.value = null;
  page.value = 1;
});
watch(brand, () => {
  model.value = null;
  storage.value = null;
  page.value = 1;
});
watch(model, () => {
  storage.value = null;
  page.value = 1;
});
watch([search, condition, stock, dateRange], () => (page.value = 1));

const hasFilters = computed(() => !!(brand.value || model.value || storage.value || condition.value || dateRange.value || search.value));
function clearFilters() {
  search.value = '';
  brand.value = null;
  model.value = null;
  storage.value = null;
  condition.value = null;
  dateRange.value = null;
  page.value = 1;
}

const typeParam = computed(() => (deviceType.value === 'all' ? undefined : deviceType.value));
const { data: brands } = useQuery({
  queryKey: computed(() => ['device-brands', typeParam.value]),
  queryFn: () => deviceCatalogApi.getBrands(typeParam.value),
});
const { data: filterOptions } = useQuery({
  queryKey: computed(() => ['sold-units-filter-options', brand.value, model.value, typeParam.value]),
  queryFn: () => soldUnitsApi.getFilterOptions({ brand: brand.value || undefined, model: model.value || undefined, deviceType: typeParam.value }),
});
const modelOptions = computed(() => filterOptions.value?.models || []);
const storageOptions = computed(() => filterOptions.value?.storage || []);

const { data, isLoading, refetch } = useQuery({
  queryKey: ['sold-units', search, deviceType, brand, model, storage, condition, stock, dateRange, page, pageSize],
  queryFn: () =>
    soldUnitsApi.getAll({
      query: search.value || undefined,
      deviceType: typeParam.value,
      brand: brand.value || undefined,
      model: model.value || undefined,
      storage: storage.value || undefined,
      condition: condition.value || undefined,
      inStock: stock.value === 'all' ? undefined : stock.value === 'inStock',
      startDate: dateRange.value?.[0] || undefined,
      endDate: dateRange.value?.[1] || undefined,
      page: page.value,
      limit: pageSize.value,
    }),
});
const units = computed(() => data.value?.units || []);
const total = computed(() => data.value?.meta?.total || 0);
const totalPages = computed(() => data.value?.meta?.totalPages || 1);

const unitIds = computed(() => units.value.map((u) => u.id));
const { data: repairCounts } = useQuery({
  queryKey: ['unit-repair-counts', unitIds],
  queryFn: async () => {
    const counts = {};
    await Promise.all(
      unitIds.value.map(async (id) => {
        const repairs = await repairsApi.getBySoldUnit(id).catch(() => []);
        if (repairs.length > 0) counts[id] = repairs.length;
      }),
    );
    return counts;
  },
  enabled: computed(() => unitIds.value.length > 0),
});

const toast = ref({ show: false, message: '', type: 'success' });
const labelOpen = ref(false);
const labelUnit = ref(null);
const confirmOpen = ref(false);
const pendingDelete = ref(null);

const deleteMutation = useMutation({
  mutationFn: (id) => soldUnitsApi.delete(id),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['sold-units'] });
    toast.value = { show: true, message: t('soldUnits.deleteSuccess'), type: 'success' };
  },
  onError: () => (toast.value = { show: true, message: t('soldUnits.deleteError'), type: 'error' }),
});

const shortDate = (d) => new Date(d).toLocaleDateString(intlLocale(), { day: '2-digit', month: 'short', year: 'numeric' });
const CONDITIONS = computed(() => [
  { value: 'new', label: t('soldUnits.conditions.new') },
  { value: 'new_no_box', label: t('soldUnits.conditions.newNoBox') },
  { value: 'grade_a_plus', label: t('soldUnits.conditions.gradeAPlus') },
  { value: 'grade_a', label: t('soldUnits.conditions.gradeA') },
  { value: 'grade_b', label: t('soldUnits.conditions.gradeB') },
  { value: 'grade_c', label: t('soldUnits.conditions.gradeC') },
]);

// ── Bulk stickers: each device uses its template (brand / type variant or default) from Settings ──
const selectedUnits = ref(new Map());
const toggleUnit = (u) => (selectedUnits.value.has(u.id) ? selectedUnits.value.delete(u.id) : selectedUnits.value.set(u.id, u));
const allUnitsSelected = computed(() => units.value.length > 0 && units.value.every((u) => selectedUnits.value.has(u.id)));
function toggleAllUnits() {
  const all = allUnitsSelected.value;
  for (const u of units.value) all ? selectedUnits.value.delete(u.id) : selectedUnits.value.set(u.id, u);
}
const printingStickers = ref(false);
async function printStickers() {
  printingStickers.value = true;
  try {
    const settings = await settingsApi.getTenantSettings().catch(() => null);
    const ctx = { storeName: settings?.storeName || settings?.tenantName || '', printing: settings?.printing || {} };
    const cache = new Map();
    const groups = new Map();
    for (const u of selectedUnits.value.values()) {
      const k = `${(u.brand || '').toLowerCase()}|${u.deviceType || ''}`;
      if (!cache.has(k)) cache.set(k, await labelTemplatesApi.getForSoldUnit(u.brand, u.deviceType));
      const tpl = cache.get(k);
      const layout = normalizeLayout(tpl);
      const key = layoutKey(layout);
      if (!groups.has(key)) groups.set(key, { layout, labels: [] });
      groups.get(key).labels.push(deviceLabel(u, tpl, ctx));
    }
    if (groups.size) printLabels([...groups.values()], { title: t('soldUnits.printLabel') });
  } catch {
    toast.value = { show: true, message: t('common.genericError'), type: 'error' };
  } finally {
    printingStickers.value = false;
  }
}

function openLabel(u) {
  labelUnit.value = u;
  labelOpen.value = true;
}
function askDelete(id) {
  pendingDelete.value = id;
  confirmOpen.value = true;
}
function confirmDelete() {
  if (pendingDelete.value) deleteMutation.mutate(pendingDelete.value);
  confirmOpen.value = false;
  pendingDelete.value = null;
}

// Grid (photos) or list (details); remembered in this browser.
const VIEW_KEY = 'devices_view';
const view = ref((() => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
})());
watch(view, (v) => {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* private mode */
  }
});
const statusBadge = (u) =>
  u.soldAt ? ['bg-success-600 text-white', t('soldUnits.sold')] : u.reservedAt ? ['bg-purple-600 text-white', t('soldUnits.reserved')] : ['bg-white/95 text-blue-700 ring-1 ring-blue-200', t('soldUnits.inStock')];

const iconTile = (u) => (u.deviceType === 'macbook' ? 'bg-gray-100' : u.deviceType === 'laptop' ? 'bg-gray-200' : 'bg-blue-50');
const iconColor = (u) => (u.deviceType === 'macbook' ? 'text-gray-600' : u.deviceType === 'laptop' ? 'text-gray-700' : 'text-blue-600');
const th = 'px-4 py-3 text-start text-xs font-medium uppercase text-gray-500';
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">{{ t('nav.soldUnits') }}</h1>
        <p class="text-sm text-gray-500">{{ t('soldUnits.subtitle') }}</p>
      </div>
      <RouterLink to="/app/sold-units/new" class="btn-primary inline-flex items-center gap-2"><PlusIcon class="h-5 w-5" /> {{ t('soldUnits.add') }}</RouterLink>
    </div>

    <div class="flex gap-2 overflow-x-auto pb-1">
      <button
        v-for="tab in TYPE_TABS"
        :key="tab.value"
        :class="[
          'flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition-all',
          deviceType === tab.value ? 'bg-black text-white shadow-lg' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-100',
        ]"
        @click="deviceType = tab.value"
      >
        <component :is="tab.icon" v-if="tab.icon" class="h-5 w-5" /> {{ t(tab.label) }}
      </button>
    </div>

    <div class="card p-4">
      <div class="flex flex-col flex-wrap gap-3 sm:flex-row sm:items-center">
        <div class="relative min-w-[200px] flex-1">
          <MagnifyingGlassIcon class="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input v-model="search" type="text" :placeholder="t('soldUnits.search')" class="input ps-9 text-sm" />
        </div>
        <select v-model="brand" class="input w-full text-sm sm:w-auto sm:min-w-[140px]">
          <option :value="null">{{ t('soldUnits.allBrands') }}</option>
          <option v-for="b in brands" :key="b.id" :value="b.name">{{ b.name }}</option>
        </select>
        <select v-model="model" class="input w-full text-sm sm:w-auto sm:min-w-[160px]" :disabled="!brand || modelOptions.length === 0">
          <option :value="null">{{ t('soldUnits.allModels') }}</option>
          <option v-for="m in modelOptions" :key="m" :value="m">{{ m }}</option>
        </select>
        <select v-if="storageOptions.length > 0" v-model="storage" class="input w-full text-sm sm:w-auto sm:min-w-[130px]">
          <option :value="null">{{ t('soldUnits.allStorage') }}</option>
          <option v-for="s in storageOptions" :key="s" :value="s">{{ s }}</option>
        </select>
        <select v-model="condition" class="input w-full text-sm sm:w-auto sm:min-w-[130px]">
          <option :value="null">{{ t('soldUnits.allConditions') }}</option>
          <option v-for="c in CONDITIONS" :key="c.value" :value="c.value">{{ c.label }}</option>
        </select>
        <div class="w-full sm:w-64"><DateRangePicker v-model="dateRange" :placeholder="t('soldUnits.selectDateRange')" /></div>
        <div class="flex gap-1">
          <button
            v-for="opt in [
              { value: 'all', label: t('common.all') },
              { value: 'inStock', label: t('soldUnits.inStock') },
              { value: 'sold', label: t('soldUnits.sold') },
            ]"
            :key="opt.value"
            :class="['rounded-lg px-3 py-2 text-xs font-medium transition-colors', stock === opt.value ? 'bg-black text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200']"
            @click="stock = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>
        <div class="flex items-center gap-1">
          <button
            v-if="hasFilters"
            class="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
            :title="t('soldUnits.clearFilters')"
            @click="clearFilters"
          >
            <XMarkIcon class="h-4 w-4" /> {{ t('soldUnits.clearFilters') }}
          </button>
          <button class="btn-secondary p-2" @click="refetch()"><ArrowPathIcon class="h-4 w-4" /></button>
        </div>
      </div>
    </div>

    <div class="card overflow-hidden">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div class="flex items-center gap-3">
        <div class="flex rounded-lg border border-gray-200 p-0.5">
          <button :class="['rounded-md p-1.5', view === 'grid' ? 'bg-black text-white' : 'text-gray-500 hover:text-gray-900']" :title="t('soldUnits.viewGrid')" :aria-label="t('soldUnits.viewGrid')" :aria-pressed="view === 'grid'" @click="view = 'grid'"><Squares2X2Icon class="h-4 w-4" /></button>
          <button :class="['rounded-md p-1.5', view === 'list' ? 'bg-black text-white' : 'text-gray-500 hover:text-gray-900']" :title="t('soldUnits.viewList')" :aria-label="t('soldUnits.viewList')" :aria-pressed="view === 'list'" @click="view = 'list'"><ListBulletIcon class="h-4 w-4" /></button>
        </div>
        <p class="text-sm text-gray-500">{{ selectedUnits.size ? t('soldUnits.selectedCount', { n: selectedUnits.size }) : `${total} ${t('common.units')}` }}</p>
        </div>
        <div v-if="selectedUnits.size" class="flex items-center gap-2">
          <button class="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100" @click="selectedUnits.clear()">{{ t('common.cancel') }}</button>
          <button class="btn-primary btn-sm inline-flex items-center gap-1.5" :disabled="printingStickers" @click="printStickers">
            <BarcodeIcon class="h-4 w-4" /> {{ t('soldUnits.printStickers', { n: selectedUnits.size }) }}
          </button>
        </div>
      </div>
      <!-- Grid: one card per device with its own photo -->
      <div v-if="view === 'grid'" class="p-4">
        <p v-if="isLoading" class="py-8 text-center text-gray-500">{{ t('common.loading') }}</p>
        <p v-else-if="units.length === 0" class="py-8 text-center text-gray-500">{{ t('soldUnits.noUnits') }}</p>
        <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          <article
            v-for="u in units"
            :key="u.id"
            :class="['group relative flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md', selectedUnits.has(u.id) ? 'border-gray-900 ring-1 ring-gray-900' : 'border-gray-200']"
          >
            <div class="relative aspect-square w-full overflow-hidden border-b border-gray-100 bg-white">
              <RouterLink :to="`/app/sold-units/${u.id}/edit?type=${u.deviceType}`" :class="['block h-full w-full', { 'pointer-events-none': u.soldAt }]" :tabindex="u.soldAt ? -1 : 0">
                <DeviceImage :unit="u" />
              </RouterLink>
              <input type="checkbox" class="absolute start-2 top-2 h-5 w-5 rounded border-gray-300 shadow" :checked="selectedUnits.has(u.id)" :aria-label="t('products.labels.select')" @change="toggleUnit(u)" />
              <span :class="['absolute end-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm', statusBadge(u)[0]]">{{ statusBadge(u)[1] }}</span>
              <span v-if="repairCounts?.[u.id]" class="absolute bottom-2 start-2 inline-flex items-center gap-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[11px] font-semibold text-white shadow" :title="`${repairCounts[u.id]} ${t('nav.repairs').toLowerCase()}`">
                <WrenchScrewdriverIcon class="h-3 w-3" /> {{ repairCounts[u.id] }}
              </span>
            </div>
            <div class="flex flex-1 flex-col p-3">
              <p class="truncate text-[11px] font-semibold uppercase tracking-wide text-gray-500">{{ u.brand }}</p>
              <p class="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-5 text-gray-900">{{ u.model }}</p>
              <p class="mt-0.5 truncate text-xs text-gray-500">{{ [u.storage, isComputerUnit(u) ? u.ram : null, u.color].filter(Boolean).join(' · ') || '—' }}</p>
              <p class="mt-1 truncate font-mono text-[11px] text-gray-400">{{ u.imei ? formatImei(u.imei) : u.serialNumber || `REF ${u.ref}` }}</p>
              <div class="mt-auto flex items-end justify-between gap-2 pt-2">
                <div class="min-w-0">
                  <p class="whitespace-nowrap text-base font-bold leading-tight text-gray-900">{{ formatCurrency(u.salePrice) }}</p>
                  <span :class="['mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium', conditionBadge(u.condition)]">{{ t(`soldUnits.conditions.${u.condition}`) }}</span>
                </div>
              </div>
              <div class="mt-2 flex items-center justify-end gap-0.5 border-t border-gray-100 pt-2">
                <button class="p-1.5 text-gray-400 hover:text-black" :title="t('soldUnits.barcodeLabel')" :aria-label="t('soldUnits.barcodeLabel')" @click="openLabel(u)"><BarcodeIcon class="h-4 w-4" /></button>
                <RouterLink v-if="!u.soldAt" :to="`/app/repairs/new?unitId=${u.id}`" class="p-1.5 text-gray-400 hover:text-amber-600" :title="t('soldUnits.sendToRepair')" :aria-label="t('soldUnits.sendToRepair')"><WrenchScrewdriverIcon class="h-4 w-4" /></RouterLink>
                <RouterLink v-if="!u.soldAt" :to="`/app/sold-units/${u.id}/edit?type=${u.deviceType}`" class="p-1.5 text-gray-400 hover:text-primary-600" :title="t('common.edit')" :aria-label="t('common.edit')"><PencilIcon class="h-4 w-4" /></RouterLink>
                <button v-if="!u.soldAt" class="p-1.5 text-gray-400 hover:text-danger-600" :title="t('common.delete')" :aria-label="t('common.delete')" @click="askDelete(u.id)"><TrashIcon class="h-4 w-4" /></button>
              </div>
            </div>
          </article>
        </div>
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full">
          <thead class="border-b border-gray-200 bg-gray-50">
            <tr>
              <th class="w-10 px-4 py-3"><input type="checkbox" class="rounded" :checked="allUnitsSelected" :aria-label="t('products.labels.selectAll')" @change="toggleAllUnits" /></th>
              <th :class="th">{{ t('soldUnits.device') }}</th>
              <th :class="th">{{ t('soldUnits.imeiSerial') }}</th>
              <th :class="th">{{ t('soldUnits.condition') }}</th>
              <th :class="th">{{ t('soldUnits.source') }}</th>
              <th :class="th">{{ t('soldUnits.purchasePrice') }}</th>
              <th :class="th">{{ t('soldUnits.salePrice') }}</th>
              <th :class="th">{{ t('soldUnits.profit') }}</th>
              <th :class="th">{{ t('soldUnits.status') }}</th>
              <th :class="[th, 'text-end']">{{ t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-if="isLoading"><td colspan="10" class="px-4 py-8 text-center text-gray-500">{{ t('common.loading') }}</td></tr>
            <tr v-else-if="units.length === 0"><td colspan="10" class="px-4 py-8 text-center text-gray-500">{{ t('soldUnits.noUnits') }}</td></tr>
            <tr v-for="u in units" :key="u.id" class="hover:bg-gray-50">
              <td class="px-4 py-3"><input type="checkbox" class="rounded" :checked="selectedUnits.has(u.id)" :aria-label="t('products.labels.select')" @change="toggleUnit(u)" /></td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <div class="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-gray-100 bg-white">
                    <DeviceImage :unit="u" size="sm" />
                  </div>
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <p class="font-medium text-gray-900">{{ u.brand }} {{ u.model }}</p>
                      <span
                        v-if="repairCounts?.[u.id]"
                        class="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700"
                        :title="`${repairCounts[u.id]} ${t('nav.repairs').toLowerCase()}`"
                      >
                        <WrenchScrewdriverIcon class="h-3 w-3" /> {{ repairCounts[u.id] }}
                      </span>
                    </div>
                    <p class="text-sm text-gray-500">
                      {{ u.storage }}<span v-if="isComputerUnit(u) && u.ram"> · {{ u.ram }}</span><span v-if="u.color"> · {{ u.color }}</span>
                    </p>
                  </div>
                </div>
              </td>
              <td class="px-4 py-3">
                <span class="font-mono text-sm">{{ u.imei ? formatImei(u.imei) : u.serialNumber || '-' }}</span>
                <p class="text-xs text-gray-400">REF: {{ u.ref }}</p>
              </td>
              <td class="px-4 py-3">
                <span :class="['rounded px-2 py-1 text-xs font-medium', conditionBadge(u.condition)]">{{ t(`soldUnits.conditions.${u.condition}`) }}</span>
              </td>
              <td class="px-4 py-3">
                <div v-if="u.tradeInAt" class="flex items-center gap-2">
                  <ArrowPathIcon class="h-4 w-4 flex-shrink-0 text-amber-500" />
                  <div class="min-w-0">
                    <RouterLink
                      v-if="u.tradeInFromCustomerId"
                      :to="`/app/customers/${u.tradeInFromCustomerId}`"
                      class="truncate text-xs font-medium text-amber-700 hover:text-amber-900 hover:underline"
                      :title="t('soldUnits.viewCustomerInfo')"
                    >
                      {{ u.tradeInFromCustomer?.firstName }} {{ u.tradeInFromCustomer?.lastName || '' }}
                    </RouterLink>
                    <p class="text-xs text-gray-400">
                      {{ shortDate(u.tradeInAt) }}<span v-if="u.tradeInValue"> · {{ formatCurrency(u.tradeInValue) }}</span>
                    </p>
                  </div>
                </div>
                <div v-else-if="u.supplier" class="flex items-center gap-2">
                  <TruckIcon class="h-4 w-4 flex-shrink-0 text-blue-500" />
                  <RouterLink
                    :to="`/app/suppliers/${u.supplierId}`"
                    class="truncate text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline"
                    :title="t('soldUnits.viewSupplierInfo')"
                  >
                    {{ u.supplier.name }}
                  </RouterLink>
                </div>
                <span v-else class="text-gray-400">-</span>
              </td>
              <td class="px-4 py-3 text-sm">{{ formatCurrency(u.purchasePrice) }}</td>
              <td class="px-4 py-3 text-sm font-medium">{{ formatCurrency(u.salePrice) }}</td>
              <td class="px-4 py-3 text-sm">
                <span :class="['font-medium', Number(u.profit) >= 0 ? 'text-success-600' : 'text-danger-600']">
                  <template v-if="Number(u.profit) > 0">+</template>{{ formatCurrency(u.profit) }}
                </span>
                <p v-if="Number(u.repairCost ?? 0) > 0" class="text-xs text-amber-600">{{ t('soldUnits.repairCost') }}: {{ formatCurrency(u.repairCost, 'DH', '-') }}</p>
              </td>
              <td class="px-4 py-3">
                <div v-if="u.soldAt" class="flex items-start gap-1.5 text-success-600">
                  <CheckCircleIcon class="mt-0.5 h-4 w-4 shrink-0" />
                  <div class="min-w-0">
                    <p class="text-sm font-medium">{{ t('soldUnits.sold') }}</p>
                    <RouterLink
                      v-if="u.customerId && u.customer"
                      :to="`/app/customers/${u.customerId}`"
                      class="block truncate text-xs text-primary-600 hover:text-primary-800 hover:underline"
                      :title="t('soldUnits.viewCustomerInfo')"
                    >
                      {{ u.customer.firstName }} {{ u.customer.lastName || '' }}
                    </RouterLink>
                    <RouterLink v-if="u.transactionId" :to="`/app/transactions/${u.transactionId}`" class="text-xs text-gray-400 hover:text-gray-600 hover:underline">
                      {{ shortDate(u.soldAt) }}
                    </RouterLink>
                    <p v-else class="text-xs text-gray-400">{{ shortDate(u.soldAt) }}</p>
                  </div>
                </div>
                <div v-else class="flex items-center gap-1.5 text-blue-600">
                  <CubeIcon class="h-4 w-4" />
                  <span class="text-sm font-medium">{{ u.reservedAt ? t('soldUnits.reserved') : t('soldUnits.inStock') }}</span>
                </div>
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-end gap-1">
                  <button class="p-2 text-gray-400 hover:text-black" :title="t('soldUnits.barcodeLabel')" @click="openLabel(u)"><BarcodeIcon class="h-5 w-5" /></button>
                  <RouterLink v-if="!u.soldAt" :to="`/app/repairs/new?unitId=${u.id}`" class="p-2 text-gray-400 hover:text-amber-600" :title="t('soldUnits.sendToRepair')">
                    <WrenchScrewdriverIcon class="h-5 w-5" />
                  </RouterLink>
                  <RouterLink
                    :to="`/app/sold-units/${u.id}/edit?type=${u.deviceType}`"
                    :class="['p-2 text-gray-400 hover:text-primary-600', { 'pointer-events-none opacity-50': u.soldAt }]"
                  >
                    <PencilIcon class="h-5 w-5" />
                  </RouterLink>
                  <button
                    :disabled="!!u.soldAt"
                    :class="['p-2 text-gray-400 hover:text-danger-600', { 'cursor-not-allowed opacity-50': u.soldAt }]"
                    @click="askDelete(u.id)"
                  >
                    <TrashIcon class="h-5 w-5" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="totalPages > 1" class="flex items-center justify-between border-t border-gray-200 px-4 py-3">
        <p class="text-sm text-gray-500">
          {{ t('common.showing') }} {{ (page - 1) * pageSize + 1 }} - {{ Math.min(page * pageSize, total) }} {{ t('common.of') }} {{ total }}
        </p>
        <div class="flex gap-2">
          <button :disabled="page === 1" class="btn-secondary px-3 py-1 text-sm" @click="page--">{{ t('common.previous') }}</button>
          <button :disabled="page >= totalPages" class="btn-secondary px-3 py-1 text-sm" @click="page++">{{ t('common.next') }}</button>
        </div>
      </div>
    </div>

    <UnitLabelModal :is-open="labelOpen" :unit="labelUnit" @close="labelOpen = false" />
    <Toast :show="toast.show" :message="toast.message" :type="toast.type" @close="toast.show = false" />
    <ConfirmModal
      :show="confirmOpen"
      :title="t('common.confirm')"
      :message="t('soldUnits.confirmDelete')"
      :confirm-text="t('common.delete')"
      :cancel-text="t('common.cancel')"
      type="danger"
      @confirm="confirmDelete"
      @cancel="confirmOpen = false"
    />
  </div>
</template>
