<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ComputerDesktopIcon,
  CubeIcon,
  DevicePhoneMobileIcon,
  DeviceTabletIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  PlusIcon,
  QrCodeIcon,
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
import UnitQRCode from '@/components/sold-units/UnitQRCode.vue';
import DateRangePicker from '@/components/ui/DateRangePicker.vue';
import Toast from '@/components/ui/Toast.vue';
import ConfirmModal from '@/components/ui/ConfirmModal.vue';

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
const qrOpen = ref(false);
const qrUnit = ref(null);
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

const shortDate = (d) => new Date(d).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: 'numeric' });
const CONDITIONS = computed(() => [
  { value: 'new', label: t('soldUnits.conditions.new') },
  { value: 'new_no_box', label: t('soldUnits.conditions.newNoBox') },
  { value: 'grade_a_plus', label: t('soldUnits.conditions.gradeAPlus') },
  { value: 'grade_a', label: t('soldUnits.conditions.gradeA') },
  { value: 'grade_b', label: t('soldUnits.conditions.gradeB') },
  { value: 'grade_c', label: t('soldUnits.conditions.gradeC') },
]);

function openQr(u) {
  qrUnit.value = u;
  qrOpen.value = true;
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
      <div class="border-b border-gray-100 px-4 py-3">
        <p class="text-sm text-gray-500">{{ total }} {{ t('common.units') }}</p>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="border-b border-gray-200 bg-gray-50">
            <tr>
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
            <tr v-if="isLoading"><td colspan="9" class="px-4 py-8 text-center text-gray-500">{{ t('common.loading') }}</td></tr>
            <tr v-else-if="units.length === 0"><td colspan="9" class="px-4 py-8 text-center text-gray-500">{{ t('soldUnits.noUnits') }}</td></tr>
            <tr v-for="u in units" :key="u.id" class="hover:bg-gray-50">
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <div :class="['rounded-lg p-2', iconTile(u)]">
                    <component :is="isComputerUnit(u) ? ComputerDesktopIcon : DevicePhoneMobileIcon" :class="['h-5 w-5', iconColor(u)]" />
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
                <p v-if="Number(u.repairCost ?? 0) > 0" class="text-xs text-amber-600">{{ t('soldUnits.repairCost') }}: -{{ formatCurrency(u.repairCost) }}</p>
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
                  <button class="p-2 text-gray-400 hover:text-black" :title="t('soldUnits.qrCode')" @click="openQr(u)"><QrCodeIcon class="h-5 w-5" /></button>
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

    <UnitQRCode :is-open="qrOpen" :unit="qrUnit" @close="qrOpen = false" />
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
