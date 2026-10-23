<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import {
  ArrowLeftIcon,
  ComputerDesktopIcon,
  CubeIcon,
  DevicePhoneMobileIcon,
  DeviceTabletIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';
import { suppliersApi } from '@/api/suppliers';
import { productsApi } from '@/api/products';
import { supplierOrdersApi } from '@/api/supplierOrders';
import { formatCurrency } from '@/utils/format';
import { apiErrorMessage } from '@/api/http';
import SearchableSelect from '@/components/ui/SearchableSelect.vue';
import ConfirmModal from '@/components/ui/ConfirmModal.vue';
import DeviceUnitItemForm from '@/components/supplier-orders/DeviceUnitItemForm.vue';

const { t } = useI18n();
const router = useRouter();
const queryClient = useQueryClient();

const order = ref({ supplierId: '', notes: '' });
const items = ref([]);
const deviceOpen = ref(false);
const deviceType = ref(null);
const productOpen = ref(false);
const productSearch = ref('');
const alert = ref({ show: false, message: '' });
const warn = (message) => (alert.value = { show: true, message });

const DEVICE_TYPES = [
  { value: 'phone', label: () => t('soldUnits.deviceTypes.phone.name'), icon: DevicePhoneMobileIcon },
  { value: 'tablet', label: () => t('soldUnits.deviceTypes.tablet.name'), icon: DeviceTabletIcon },
  { value: 'laptop', label: () => t('soldUnits.deviceTypes.laptop.name'), icon: ComputerDesktopIcon },
  { value: 'macbook', label: () => t('soldUnits.deviceTypes.macbook.name'), icon: ComputerDesktopIcon },
];

const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: () => suppliersApi.getAll() });
const supplierOptions = computed(() => (suppliers.value?.suppliers || []).map((s) => ({ value: s.id, label: s.name })));
const { data: products } = useQuery({ queryKey: ['products', 'order-picker'], queryFn: () => productsApi.getAll({ limit: 500 }) });
const filteredProducts = computed(() => {
  const list = products.value?.products || [];
  if (!productSearch.value) return list;
  const q = productSearch.value.toLowerCase();
  return list.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
});
const total = computed(() => items.value.reduce((s, i) => s + i.quantityOrdered * i.unitCost, 0));

function addDevice(item) {
  items.value.push(item);
  deviceOpen.value = false;
  deviceType.value = null;
}
function addProduct(p) {
  const existing = items.value.find((i) => i.itemType !== 'unit' && i.productId === p.id);
  if (existing) existing.quantityOrdered += 1;
  else
    items.value.push({
      productId: p.id,
      productName: p.name,
      sku: p.sku,
      quantityOrdered: 1,
      unitCost: Number(p.costPrice) || 0,
      itemType: 'product',
    });
  productOpen.value = false;
  productSearch.value = '';
}

// Inline product creation.
const creatingProduct = ref(false);
const newProduct = ref({ name: '', sku: '', costPrice: 0, retailPrice: 0 });
function resetNewProduct() {
  newProduct.value = { name: '', sku: '', costPrice: 0, retailPrice: 0 };
  creatingProduct.value = false;
}
const createProduct = useMutation({
  mutationFn: () => productsApi.create({ ...newProduct.value, stockQuantity: 0 }),
  onSuccess: (p) => {
    queryClient.invalidateQueries({ queryKey: ['products'] });
    addProduct(p);
    resetNewProduct();
  },
  onError: (e) => warn(apiErrorMessage(e, t('common.error'))),
});
function startCreateProduct() {
  newProduct.value.name = productSearch.value;
  creatingProduct.value = true;
}

const lineLabel = (i) => (i.itemType === 'unit' ? [i.brand, i.model, i.storage].filter(Boolean).join(' ') : i.productName);

const createOrder = useMutation({
  mutationFn: () => supplierOrdersApi.create({ supplierId: order.value.supplierId, items: items.value, notes: order.value.notes || undefined }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['supplier-orders'] });
    queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    router.push('/app/supplier-orders');
  },
  onError: (e) => warn(apiErrorMessage(e, t('common.error'))),
});
function submit() {
  if (!order.value.supplierId) return warn(t('suppliers.selectSupplierRequired'));
  if (items.value.length === 0) return warn(t('suppliers.addProductRequired'));
  createOrder.mutate();
}
</script>

<template>
  <div class="max-w-4xl space-y-6 px-4 sm:px-6 lg:px-8">
    <div class="flex items-center gap-4">
      <RouterLink to="/app/supplier-orders" class="rounded-lg p-2 hover:bg-gray-100"><ArrowLeftIcon class="h-5 w-5 rtl:rotate-180" /></RouterLink>
      <h1 class="text-2xl font-bold text-gray-900">{{ t('supplierOrders.form.title') }}</h1>
    </div>

    <form class="space-y-6" @submit.prevent="submit">
      <div class="card space-y-4 p-6">
        <h2 class="border-b pb-2 text-lg font-semibold text-gray-900">{{ t('supplierOrders.form.orderInfo') }}</h2>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label class="label">{{ t('supplierOrders.supplier') }} *</label>
            <SearchableSelect v-model="order.supplierId" :options="supplierOptions" :placeholder="t('supplierOrders.form.selectSupplier')" />
          </div>
          <div>
            <label class="label">{{ t('supplierOrders.form.notes') }}</label>
            <textarea v-model="order.notes" rows="2" class="input" :placeholder="t('supplierOrders.form.notesPlaceholder')" />
          </div>
        </div>
      </div>

      <div class="card space-y-4 p-6">
        <div class="flex flex-col gap-3 border-b pb-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 class="text-lg font-semibold text-gray-900">{{ t('supplierOrders.form.orderItems') }}</h2>
          <div class="flex gap-2">
            <button
              type="button"
              :disabled="deviceOpen"
              :class="[
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                deviceOpen ? 'cursor-not-allowed bg-blue-100 text-blue-400' : 'bg-blue-600 text-white hover:bg-blue-700',
              ]"
              @click="
                deviceOpen = true;
                deviceType = null;
                productOpen = false;
              "
            >
              <DevicePhoneMobileIcon class="h-4 w-4" /> {{ t('supplierOrders.form.addDevice') }}
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
              @click="
                productOpen = true;
                deviceOpen = false;
              "
            >
              <CubeIcon class="h-4 w-4" /> {{ t('supplierOrders.form.addProduct') }}
            </button>
          </div>
        </div>

        <div v-if="deviceOpen && !deviceType" class="space-y-4 rounded-xl border border-blue-200 bg-blue-50/30 p-5">
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-gray-900">{{ t('supplierOrders.form.addDevice') }}</h3>
            <button type="button" class="rounded p-1 text-gray-400 hover:text-gray-600" @click="deviceOpen = false"><XMarkIcon class="h-5 w-5" /></button>
          </div>
          <p class="text-sm text-gray-500">{{ t('supplierOrders.form.chooseDeviceType') }}</p>
          <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
            <button
              v-for="dt in DEVICE_TYPES"
              :key="dt.value"
              type="button"
              class="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-gray-200 bg-white p-4 transition-colors hover:border-blue-500 hover:bg-blue-50"
              @click="deviceType = dt.value"
            >
              <component :is="dt.icon" class="h-8 w-8 text-gray-600" />
              <span class="text-sm font-medium text-gray-700">{{ dt.label() }}</span>
            </button>
          </div>
        </div>
        <DeviceUnitItemForm
          v-if="deviceOpen && deviceType"
          :device-type="deviceType"
          @add-item="addDevice"
          @cancel="
            deviceOpen = false;
            deviceType = null;
          "
        />

        <div v-if="productOpen" class="space-y-3 rounded-xl border border-gray-200 bg-gray-50/50 p-5">
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-gray-900">{{ t('supplierOrders.form.addProduct') }}</h3>
            <button type="button" class="rounded p-1 text-gray-400 hover:text-gray-600" @click="productOpen = false"><XMarkIcon class="h-5 w-5" /></button>
          </div>
          <div class="relative">
            <MagnifyingGlassIcon class="absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input v-model="productSearch" type="text" :placeholder="t('supplierOrders.form.searchProduct')" class="input ps-10" autofocus />
          </div>
          <button
            v-if="!creatingProduct"
            type="button"
            class="flex w-full items-center gap-2 rounded-lg border border-dashed border-gray-300 p-3 text-sm font-medium text-gray-600 transition-colors hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900"
            @click="startCreateProduct"
          >
            <PlusIcon class="h-4 w-4" /> {{ t('supplierOrders.form.createProduct') }}
          </button>
          <div v-if="!creatingProduct" class="max-h-64 space-y-1 overflow-y-auto">
            <button
              v-for="p in filteredProducts"
              :key="p.id"
              type="button"
              class="flex w-full items-center justify-between rounded-lg p-3 text-start hover:bg-white"
              @click="addProduct(p)"
            >
              <div>
                <p class="font-medium text-gray-900">{{ p.name }}</p>
                <p class="text-sm text-gray-500">{{ p.sku }}</p>
              </div>
              <div class="text-end">
                <p class="font-medium text-gray-900">{{ formatCurrency(p.costPrice) }}</p>
                <p class="text-xs text-gray-500">{{ t('products.stock') }}: {{ p.stockQuantity }}</p>
              </div>
            </button>
            <div v-if="filteredProducts.length === 0" class="py-4 text-center text-sm text-gray-500">{{ t('supplierOrders.form.noProductFound') }}</div>
          </div>
          <div v-if="creatingProduct" class="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
            <h4 class="font-semibold text-gray-900">{{ t('supplierOrders.form.newProduct') }}</h4>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="mb-1 block text-sm font-medium text-gray-700">{{ t('supplierOrders.form.productName') }}</label>
                <input v-model="newProduct.name" type="text" class="input" :placeholder="t('supplierOrders.form.productNamePlaceholder')" />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium text-gray-700">{{ t('supplierOrders.form.productSku') }}</label>
                <input v-model="newProduct.sku" type="text" class="input" :placeholder="t('supplierOrders.form.productSkuPlaceholder')" />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium text-gray-700">{{ t('products.costPrice') }}</label>
                <div class="relative">
                  <input v-model.number="newProduct.costPrice" type="number" step="0.01" min="0" class="input pe-12" placeholder="0.00" />
                  <span class="absolute end-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">DH</span>
                </div>
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium text-gray-700">{{ t('products.retailPrice') }}</label>
                <div class="relative">
                  <input v-model.number="newProduct.retailPrice" type="number" step="0.01" min="0" class="input pe-12" placeholder="0.00" />
                  <span class="absolute end-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">DH</span>
                </div>
              </div>
            </div>
            <div class="flex justify-end gap-2">
              <button type="button" class="btn-secondary text-sm" @click="resetNewProduct">{{ t('common.cancel') }}</button>
              <button
                type="button"
                class="btn-primary inline-flex items-center gap-1 text-sm"
                :disabled="!newProduct.name.trim() || !newProduct.sku.trim() || createProduct.isPending.value"
                @click="createProduct.mutate()"
              >
                <PlusIcon class="h-4 w-4" /> {{ createProduct.isPending.value ? t('common.creating') : t('supplierOrders.form.createAndAdd') }}
              </button>
            </div>
          </div>
        </div>

        <div v-if="items.length === 0 && !deviceOpen && !productOpen" class="py-8 text-center text-gray-500">
          <p>{{ t('supplierOrders.form.noProducts') }}</p>
          <p class="mt-1 text-sm">{{ t('supplierOrders.form.noProductsHintNew') }}</p>
        </div>

        <div v-if="items.length > 0" class="overflow-x-auto">
          <table class="w-full">
            <thead class="border-b border-gray-200 bg-gray-50">
              <tr>
                <th class="px-3 py-2 text-start text-sm font-medium text-gray-500">{{ t('supplierOrders.table.product') }}</th>
                <th class="px-3 py-2 text-center text-sm font-medium text-gray-500">{{ t('supplierOrders.table.quantity') }}</th>
                <th class="px-3 py-2 text-end text-sm font-medium text-gray-500">{{ t('supplierOrders.table.total') }}</th>
                <th class="w-12 px-3 py-2" />
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="(item, i) in items" :key="i" class="hover:bg-gray-50/50">
                <td class="px-3 py-3">
                  <div class="flex items-center gap-2">
                    <span v-if="item.itemType === 'unit'" class="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                      <DevicePhoneMobileIcon class="me-0.5 h-3 w-3" /> {{ t('supplierOrders.form.device') }}
                    </span>
                    <span class="font-medium text-gray-900">{{ lineLabel(item) }}</span>
                  </div>
                </td>
                <td class="px-3 py-3 text-center">
                  <span v-if="item.itemType === 'unit'" class="font-medium">{{ item.quantityOrdered }}</span>
                  <input v-else v-model.number="item.quantityOrdered" type="number" min="1" class="input mx-auto w-20 text-center" />
                </td>
                <td class="px-3 py-3 text-end font-medium">{{ formatCurrency(item.quantityOrdered * item.unitCost) }}</td>
                <td class="px-3 py-3 text-center">
                  <button type="button" class="p-1 text-gray-400 hover:text-danger-600" @click="items.splice(i, 1)"><TrashIcon class="h-5 w-5" /></button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="items.length > 0" class="flex justify-end border-t pt-4">
          <div class="flex items-center gap-4">
            <span class="text-gray-600">{{ t('supplierOrders.form.totalOrder') }}</span>
            <span class="text-xl font-bold text-gray-900">{{ formatCurrency(total) }}</span>
          </div>
        </div>
      </div>

      <div class="flex justify-end gap-3">
        <RouterLink to="/app/supplier-orders" class="btn-secondary">{{ t('common.cancel') }}</RouterLink>
        <button type="submit" class="btn-primary" :disabled="createOrder.isPending.value || items.length === 0">
          {{ createOrder.isPending.value ? t('common.creating') : t('supplierOrders.form.createOrder') }}
        </button>
      </div>
    </form>

    <ConfirmModal
      :show="alert.show"
      :title="t('supplierOrders.form.warning')"
      :message="alert.message"
      confirm-text="OK"
      type="warning"
      :show-cancel="false"
      @confirm="alert.show = false"
      @cancel="alert.show = false"
    />
  </div>
</template>
