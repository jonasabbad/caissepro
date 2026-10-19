<script setup>
import { DEVICE_CATEGORY_SLUGS } from '@/config/categories';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import {
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline';
import { productsApi, categoriesApi } from '@/api/products';
import { useActivity } from '@/composables/useActivity';
import { formatCurrency } from '@/utils/format';
import { apiErrorMessage } from '@/api/http';
import StockAdjustModal from '@/components/products/StockAdjustModal.vue';
import ProductLabelsModal from '@/components/products/ProductLabelsModal.vue';
import BarcodeIcon from '@/components/ui/BarcodeIcon.vue';
import { useBarcodeScanner } from '@/composables/useBarcodeScanner';
import Toast from '@/components/ui/Toast.vue';
import ProductImage from '@/components/products/ProductImage.vue';
import ConfirmModal from '@/components/ui/ConfirmModal.vue';
import ScanButton from '@/components/scan/ScanButton.vue';
import { useRouter } from 'vue-router';

const { t } = useI18n();
const queryClient = useQueryClient();
const { activityType, productsLabelKey } = useActivity();

const search = ref('');
const categoryId = ref(null);
const status = ref(null);
const page = ref(1);
const pageSize = ref(20);
watch([search, categoryId, status], () => (page.value = 1));

const adjustOpen = ref(false);
const adjustProduct = ref(null);
const labelsOpen = ref(false);
const labelProducts = ref([]);
// Selection for printing labels in bulk (kept across pages).
const selected = ref(new Map());
const toast = ref({ show: false, message: '', type: 'success' });
const confirmOpen = ref(false);
const pendingDeleteId = ref(null);

const notify = (message, type = 'success') => (toast.value = { show: true, message, type });

// Phones are managed as serialised units, so their categories are hidden from the accessories catalogue.
const PHONE_CATEGORY_SLUGS = DEVICE_CATEGORY_SLUGS;
const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => categoriesApi.getAll() });
const visibleCategories = computed(() => {
  if (!categories.value) return [];
  return activityType.value === 'phone_seller' ? categories.value.filter((c) => !PHONE_CATEGORY_SLUGS.includes(c.slug || '')) : categories.value;
});

const { data, isLoading, refetch } = useQuery({
  queryKey: ['products', search, categoryId, status, page, pageSize],
  queryFn: () =>
    productsApi.getAll({
      query: search.value,
      categoryId: categoryId.value || undefined,
      status: status.value || undefined,
      sort: 'createdAt',
      page: page.value,
      limit: pageSize.value,
    }),
});
const products = computed(() => data.value?.products || []);
const total = computed(() => data.value?.meta?.total || 0);
const totalPages = computed(() => Math.ceil(total.value / pageSize.value));
watch(totalPages, (n) => {
  if (data.value && page.value > n) page.value = Math.max(1, n);
});

const deleteMutation = useMutation({
  mutationFn: (id) => productsApi.delete(id),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['products'] });
    notify(t('products.deleteSuccess'));
  },
  onError: (e) => notify(apiErrorMessage(e, t('products.deleteError')), 'error'),
});

const badgeClass = (s) =>
  ({ available: 'badge-success', low_stock: 'badge-warning', out_of_stock: 'badge-danger', archived: 'badge-secondary' })[s] || 'badge-info';

function askDelete(id) {
  pendingDeleteId.value = id;
  confirmOpen.value = true;
}
function confirmDelete() {
  if (pendingDeleteId.value) deleteMutation.mutate(pendingDeleteId.value);
  confirmOpen.value = false;
  pendingDeleteId.value = null;
}

function openAdjust(p) {
  adjustProduct.value = p;
  adjustOpen.value = true;
}
function openLabels(list) {
  labelProducts.value = list;
  labelsOpen.value = true;
}
const toggleSelect = (p) => (selected.value.has(p.id) ? selected.value.delete(p.id) : selected.value.set(p.id, p));
const allOnPageSelected = computed(() => products.value.length > 0 && products.value.every((p) => selected.value.has(p.id)));
function toggleAll() {
  const all = allOnPageSelected.value;
  for (const p of products.value) all ? selected.value.delete(p.id) : selected.value.set(p.id, p);
}

// ── Scanning: a scanned (or typed + Enter) barcode finds the product and highlights it ──
const highlightId = ref(null);
const scanMiss = ref('');
async function findByCode(code) {
  const c = String(code || '').trim();
  if (!c) return;
  scanMiss.value = '';
  const p = await productsApi.getByBarcode(c).catch(() => null);
  if (!p) {
    scanMiss.value = c;
    return;
  }
  search.value = c;
  highlightId.value = p.id;
  notify(t('products.scan.found', { name: p.name }));
  setTimeout(() => highlightId.value === p.id && (highlightId.value = null), 4000);
}
useBarcodeScanner(findByCode);
const router = useRouter();
/** Camera scan: open the product's record when it exists; otherwise the "create it" banner shows. */
async function onCameraScan(code) {
  const p = await productsApi.getByBarcode(code).catch(() => null);
  if (p) {
    notify(t('scan.productOpened', { name: p.name }));
    router.push(`/app/products/${p.id}/edit`);
  } else findByCode(code);
}

const adjustMutation = useMutation({
  mutationFn: (payload) => {
    let delta = Math.abs(payload.quantity);
    if (payload.type === 'remove') delta = -Math.abs(payload.quantity);
    else if (payload.type === 'set') delta = payload.quantity - (adjustProduct.value?.stockQuantity || 0);
    return productsApi.adjustStock(payload.productId, delta, payload.reason, { type: payload.movementType, packCostPrice: payload.packCostPrice });
  },
  onSuccess: () => {
    notify(t('products.adjust.success'));
    adjustOpen.value = false;
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
  },
  onError: (e) => notify(apiErrorMessage(e, t('products.adjust.error')), 'error'),
});
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <h1 class="text-2xl font-bold text-gray-900">{{ t(productsLabelKey) }}</h1>
      <div class="flex items-center gap-3">
        <RouterLink to="/app/products/new" class="btn-primary inline-flex items-center gap-2">
          <PlusIcon class="h-5 w-5" /> {{ t('products.add') }}
        </RouterLink>
      </div>
    </div>

    <div class="card p-4">
      <div class="flex flex-col gap-4 md:flex-row">
        <div class="relative flex-1">
          <MagnifyingGlassIcon class="absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input v-model="search" type="text" :placeholder="t('products.search')" :title="t('products.scan.hint')" class="input ps-10" @keydown.enter.prevent="findByCode(search)" />
        </div>
        <ScanButton :title="t('scan.button')" @scan="onCameraScan" />
        <select v-model="categoryId" class="input w-full md:w-48">
          <option :value="null">{{ t('products.allCategories') }}</option>
          <option v-for="c in visibleCategories" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <select v-model="status" class="input w-full md:w-40">
          <option :value="null">{{ t('products.allStatus') }}</option>
          <option value="available">{{ t('products.status.available') }}</option>
          <option value="low_stock">{{ t('products.status.lowStock') }}</option>
          <option value="out_of_stock">{{ t('products.status.outOfStock') }}</option>
          <option value="archived">{{ t('products.status.archived') }}</option>
        </select>
        <button class="btn-secondary p-2" @click="refetch()"><ArrowPathIcon class="h-5 w-5" /></button>
      </div>
      <div v-if="scanMiss" class="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        <span>{{ t('products.scan.notFound', { code: scanMiss }) }}</span>
        <RouterLink :to="{ path: '/app/products/new', query: { barcode: scanMiss } }" class="font-medium underline">{{ t('products.scan.create') }}</RouterLink>
      </div>
    </div>

    <div v-if="selected.size" class="flex items-center justify-between rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">
      <span>{{ t('products.labels.count', { n: selected.size }) }}</span>
      <div class="flex items-center gap-2">
        <button class="rounded px-2 py-1 hover:bg-white/10" @click="selected.clear()">{{ t('common.cancel') }}</button>
        <button class="inline-flex items-center gap-1.5 rounded bg-white px-3 py-1 font-medium text-gray-900" @click="openLabels([...selected.values()])">
          <BarcodeIcon class="h-4 w-4" /> {{ t('products.labels.printSelected', { n: selected.size }) }}
        </button>
      </div>
    </div>

    <div class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="border-b border-gray-200 bg-gray-50">
            <tr>
              <th class="w-10 px-4 py-3"><input type="checkbox" class="rounded" :checked="allOnPageSelected" :aria-label="t('products.labels.selectAll')" @change="toggleAll" /></th>
              <th class="px-4 py-3 text-start text-sm font-medium text-gray-500">{{ t('products.product') }}</th>
              <th class="px-4 py-3 text-start text-sm font-medium text-gray-500">{{ t('products.sku') }}</th>
              <th class="px-4 py-3 text-start text-sm font-medium text-gray-500">{{ t('products.costPrice') }}</th>
              <th class="px-4 py-3 text-start text-sm font-medium text-gray-500">{{ t('products.retailPrice') }}</th>
              <th class="px-4 py-3 text-start text-sm font-medium text-gray-500">{{ t('products.stock') }}</th>
              <th class="px-4 py-3 text-start text-sm font-medium text-gray-500">{{ t('products.statusLabel') }}</th>
              <th class="px-4 py-3 text-end text-sm font-medium text-gray-500">{{ t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-if="isLoading"><td colspan="8" class="px-4 py-8 text-center text-gray-500">{{ t('common.loading') }}</td></tr>
            <tr v-else-if="products.length === 0"><td colspan="8" class="px-4 py-8 text-center text-gray-500">{{ t('products.noProducts') }}</td></tr>
            <tr v-for="p in products" :key="p.id" :class="['hover:bg-gray-50 transition-colors', highlightId === p.id && 'bg-amber-50 ring-2 ring-inset ring-amber-300']">
              <td class="px-4 py-3"><input type="checkbox" class="rounded" :checked="selected.has(p.id)" :aria-label="t('products.labels.select')" @change="toggleSelect(p)" /></td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <div class="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-gray-100"><ProductImage :src="p.imageUrl" :name="p.name" size="sm" /></div>
                  <div class="min-w-0">
                    <p class="font-medium text-gray-900">{{ p.name }}</p>
                    <p v-if="p.barcode" class="font-mono text-xs text-gray-500">{{ p.barcode }}</p>
                  </div>
                </div>
              </td>
              <td class="px-4 py-3 text-gray-500">{{ p.sku }}</td>
              <td class="px-4 py-3 font-medium">{{ formatCurrency(p.costPrice) }}</td>
              <td class="px-4 py-3 font-medium text-black">{{ formatCurrency(p.retailPrice) }}</td>
              <td class="px-4 py-3">
                <span :class="p.stockQuantity <= 5 ? 'font-bold text-danger-600' : ''">{{ p.stockQuantity }}</span>
              </td>
              <td class="px-4 py-3">
                <span :class="['badge', badgeClass(p.status)]">{{ t(`products.status.${p.status}`) }}</span>
              </td>
              <td class="px-4 py-3 text-end">
                <div class="flex items-center justify-end gap-1">
                  <button class="p-2 text-gray-400 hover:text-primary-600" :title="t('products.adjustStock')" @click="openAdjust(p)">
                    <AdjustmentsHorizontalIcon class="h-5 w-5" />
                  </button>
                  <button class="p-2 text-gray-400 hover:text-primary-600" :title="t('products.labels.title')" @click="openLabels([p])">
                    <BarcodeIcon class="h-5 w-5" />
                  </button>
                  <RouterLink :to="`/app/products/${p.id}/edit`" class="p-2 text-gray-400 hover:text-primary-600">
                    <PencilIcon class="h-5 w-5" />
                  </RouterLink>
                  <button class="p-2 text-gray-400 hover:text-danger-600" @click="askDelete(p.id)"><TrashIcon class="h-5 w-5" /></button>
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

    <StockAdjustModal :is-open="adjustOpen" :product="adjustProduct" @close="adjustOpen = false" @save="adjustMutation.mutate" />
    <ProductLabelsModal :is-open="labelsOpen" :products="labelProducts" @close="labelsOpen = false" />
    <Toast :show="toast.show" :message="toast.message" :type="toast.type" @close="toast.show = false" />
    <ConfirmModal
      :show="confirmOpen"
      :title="t('common.confirm')"
      :message="t('products.confirmDelete')"
      :confirm-text="t('common.delete')"
      :cancel-text="t('common.cancel')"
      type="danger"
      @confirm="confirmDelete"
      @cancel="confirmOpen = false"
    />
  </div>
</template>
