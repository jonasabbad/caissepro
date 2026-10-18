<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { ArrowLeftIcon, LockClosedIcon, MagnifyingGlassIcon, PlusIcon, SparklesIcon, TrashIcon } from '@heroicons/vue/24/outline';
import { supplierInvoicesApi } from '@/api/supplierInvoices';
import { suppliersApi } from '@/api/suppliers';
import { categoriesApi, productsApi } from '@/api/products';
import { apiErrorMessage } from '@/api/http';
import { formatCurrency, isoDate, round2 } from '@/utils/format';
import Toast from '@/components/ui/Toast.vue';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const editId = computed(() => route.params.id || null);

const form = ref({
  supplierId: route.query.supplierId || '',
  supplierRef: '',
  invoiceDate: isoDate(),
  dueDate: '',
  discount: 0,
  taxRate: 0,
  extraCharges: 0,
  extraChargesLabel: '',
  notes: '',
  paymentTerms: '',
});
const lines = ref([]);
const status = ref('draft');
const linkedOrder = ref(null);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const toast = ref({ show: false, message: '', type: 'error' });

const { data: suppliers } = useQuery({ queryKey: ['suppliers', 'all'], queryFn: () => suppliersApi.getAll() });
const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => categoriesApi.getAll() });

onMounted(async () => {
  if (!editId.value) return;
  loading.value = true;
  try {
    const inv = await supplierInvoicesApi.getById(editId.value);
    if (inv.status === 'cancelled') return router.replace(`/app/supplier-invoices/${inv.id}`);
    status.value = inv.status;
    linkedOrder.value = inv.supplierOrder;
    form.value = {
      supplierId: inv.supplierId,
      supplierRef: inv.supplierRef || '',
      invoiceDate: inv.invoiceDate.slice(0, 10),
      dueDate: inv.dueDate ? inv.dueDate.slice(0, 10) : '',
      discount: Number(inv.discount),
      taxRate: Number(inv.taxRate),
      extraCharges: Number(inv.extraCharges),
      extraChargesLabel: inv.extraChargesLabel || '',
      notes: inv.notes || '',
      paymentTerms: inv.paymentTerms || '',
    };
    lines.value = inv.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: i.productName,
      reference: i.reference || '',
      quantity: i.quantity,
      unitCost: Number(i.unitCost),
      quantityReceived: i.quantityReceived,
      newRetailPrice: i.newRetailPrice != null ? Number(i.newRetailPrice) : null,
      newCategoryId: i.newCategoryId || '',
    }));
  } catch (e) {
    error.value = apiErrorMessage(e);
  } finally {
    loading.value = false;
  }
});

// ── Product search (name, barcode, SKU); an exact barcode scan adds the line directly ──
const search = ref('');
const results = ref([]);
let timer;
watch(search, (v) => {
  clearTimeout(timer);
  if (v.trim().length < 2) return (results.value = []);
  timer = setTimeout(async () => (results.value = (await productsApi.getAll({ query: v.trim(), limit: 8 })).products), 250);
});
function addProduct(p) {
  const existing = lines.value.find((l) => l.productId === p.id);
  if (existing) existing.quantity++;
  else lines.value.push({ productId: p.id, productName: p.name, reference: p.barcode || p.sku || '', quantity: 1, unitCost: Number(p.costPrice) || 0, quantityReceived: 0 });
  search.value = '';
  results.value = [];
}
async function onSearchEnter() {
  const q = search.value.trim();
  if (!q) return;
  const found = results.value.length ? results.value : (await productsApi.getAll({ query: q, limit: 8 })).products;
  const exact = found.find((p) => p.barcode === q || p.sku === q);
  if (exact) addProduct(exact);
  else if (found.length === 1) addProduct(found[0]);
}
function addNewProduct() {
  const q = search.value.trim();
  const isCode = /^\d{8,14}$/.test(q);
  lines.value.push({ productId: null, productName: isCode ? '' : q, reference: isCode ? q : '', quantity: 1, unitCost: 0, quantityReceived: 0, newRetailPrice: null, newCategoryId: '' });
  search.value = '';
  results.value = [];
}
const removeLine = (i) => lines.value.splice(i, 1);

// ── Totals (same rules as the server) ──
const subtotal = computed(() => round2(lines.value.reduce((s, l) => s + round2((Number(l.quantity) || 0) * (Number(l.unitCost) || 0)), 0)));
const base = computed(() => round2(subtotal.value - (Number(form.value.discount) || 0)));
const taxAmount = computed(() => round2((base.value * (Number(form.value.taxRate) || 0)) / 100));
const total = computed(() => round2(base.value + taxAmount.value + (Number(form.value.extraCharges) || 0)));

function validate() {
  if (!form.value.supplierId) return t('supplierInvoices.errors.supplier');
  if (!lines.value.length) return t('supplierInvoices.errors.items');
  if (lines.value.some((l) => !l.productName.trim() || !(l.quantity >= 1) || !(Number(l.unitCost) >= 0))) return t('supplierInvoices.errors.line');
  if (base.value < 0) return t('supplierInvoices.errors.discount');
  return '';
}

async function save(confirm = false) {
  error.value = validate();
  if (error.value) return;
  saving.value = true;
  const payload = {
    ...form.value,
    dueDate: form.value.dueDate || null,
    items: lines.value.map((l) => ({
      id: l.id,
      productId: l.productId || null,
      productName: l.productName.trim(),
      reference: l.reference?.trim() || null,
      quantity: Number(l.quantity),
      unitCost: Number(l.unitCost),
      newRetailPrice: l.productId ? null : l.newRetailPrice === '' || l.newRetailPrice == null ? null : Number(l.newRetailPrice),
      newCategoryId: l.productId ? null : l.newCategoryId || null,
    })),
  };
  try {
    let inv = editId.value ? await supplierInvoicesApi.update(editId.value, payload) : await supplierInvoicesApi.create({ ...payload, confirm });
    if (editId.value && confirm && inv.status === 'draft') inv = await supplierInvoicesApi.confirm(inv.id);
    queryClient.invalidateQueries({ queryKey: ['supplier-invoices'] });
    queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    router.push(`/app/supplier-invoices/${inv.id}`);
  } catch (e) {
    error.value = apiErrorMessage(e);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <div class="flex items-center gap-3">
      <button class="rounded-lg p-2 hover:bg-gray-100" :aria-label="t('common.back')" @click="router.back()"><ArrowLeftIcon class="h-5 w-5 text-gray-600 rtl:rotate-180" /></button>
      <div>
        <h1 class="text-2xl font-bold text-gray-900">{{ editId ? t('supplierInvoices.edit') : t('supplierInvoices.new') }}</h1>
        <p class="text-sm text-gray-500">{{ status === 'draft' ? t('supplierInvoices.draftHint') : t('supplierInvoices.confirmHint') }}</p>
      </div>
    </div>

    <div v-if="loading" class="card p-8 text-center text-gray-500">{{ t('common.loading') }}</div>
    <template v-else>
      <div class="card grid grid-cols-1 gap-4 p-5 md:grid-cols-2 lg:grid-cols-4">
        <div class="md:col-span-2">
          <label class="label" for="si-supplier">{{ t('supplierInvoices.supplier') }} *</label>
          <select id="si-supplier" v-model="form.supplierId" class="input" :disabled="!!linkedOrder">
            <option value="">{{ t('supplierInvoices.chooseSupplier') }}</option>
            <option v-for="s in suppliers?.suppliers || []" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </div>
        <div>
          <label class="label" for="si-ref">{{ t('supplierInvoices.supplierRef') }}</label>
          <input id="si-ref" v-model="form.supplierRef" class="input" />
        </div>
        <div v-if="linkedOrder" class="flex items-end">
          <p class="text-sm text-gray-500">{{ t('supplierInvoices.linkedOrder') }} : <span class="font-mono">{{ linkedOrder.orderNumber }}</span></p>
        </div>
        <div>
          <label class="label" for="si-date">{{ t('supplierInvoices.invoiceDate') }} *</label>
          <input id="si-date" v-model="form.invoiceDate" type="date" class="input" />
        </div>
        <div>
          <label class="label" for="si-due">{{ t('supplierInvoices.dueDate') }}</label>
          <input id="si-due" v-model="form.dueDate" type="date" class="input" :min="form.invoiceDate" />
        </div>
        <div class="md:col-span-2">
          <label class="label" for="si-terms">{{ t('supplierInvoices.paymentTerms') }}</label>
          <input id="si-terms" v-model="form.paymentTerms" class="input" :placeholder="t('supplierInvoices.paymentTermsPlaceholder')" />
        </div>
      </div>

      <div class="card overflow-hidden">
        <div class="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 class="font-semibold text-gray-900">{{ t('supplierInvoices.items') }}</h2>
          <div v-if="!linkedOrder" class="relative w-full sm:w-96">
            <MagnifyingGlassIcon class="absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              v-model="search"
              type="search"
              class="input ps-10"
              :placeholder="t('supplierInvoices.searchProduct')"
              :aria-label="t('supplierInvoices.searchProduct')"
              @keydown.enter.prevent="onSearchEnter"
            />
            <div v-if="search.trim().length >= 2" class="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
              <button v-for="p in results" :key="p.id" type="button" class="flex w-full items-center justify-between gap-3 px-3 py-2 text-start text-sm hover:bg-gray-50" @click="addProduct(p)">
                <span class="min-w-0">
                  <span class="block truncate font-medium text-gray-900">{{ p.name }}</span>
                  <span class="block font-mono text-xs text-gray-500">{{ p.barcode || p.sku }}</span>
                </span>
                <span class="shrink-0 text-xs text-gray-500">{{ formatCurrency(p.costPrice) }}</span>
              </button>
              <button type="button" class="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2 text-start text-sm font-medium text-primary-700 hover:bg-gray-50" @click="addNewProduct">
                <SparklesIcon class="h-4 w-4" /> {{ t('supplierInvoices.newProduct') }} : « {{ search.trim() }} »
              </button>
            </div>
          </div>
        </div>

        <div v-if="!lines.length" class="p-8 text-center text-sm text-gray-500">
          <p>{{ t('supplierInvoices.errors.items') }}</p>
          <button v-if="!linkedOrder" class="btn-secondary mt-3 inline-flex items-center gap-2" @click="addNewProduct"><PlusIcon class="h-4 w-4" /> {{ t('supplierInvoices.addLine') }}</button>
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-3 py-2 text-start font-medium text-gray-500">{{ t('supplierInvoices.product') }}</th>
                <th class="w-40 px-3 py-2 text-start font-medium text-gray-500">{{ t('supplierInvoices.reference') }}</th>
                <th class="w-24 px-3 py-2 text-end font-medium text-gray-500">{{ t('supplierInvoices.quantity') }}</th>
                <th class="w-36 px-3 py-2 text-end font-medium text-gray-500">{{ t('supplierInvoices.unitCost') }}</th>
                <th class="w-32 px-3 py-2 text-end font-medium text-gray-500">{{ t('supplierInvoices.lineTotal') }}</th>
                <th class="w-10" />
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 align-top">
              <tr v-for="(l, i) in lines" :key="l.id || `new-${i}`">
                <td class="px-3 py-2">
                  <template v-if="l.productId">
                    <p class="py-2 font-medium text-gray-900">{{ l.productName }}</p>
                  </template>
                  <template v-else>
                    <input v-model="l.productName" class="input" :placeholder="t('supplierInvoices.productName')" :aria-label="t('supplierInvoices.productName')" />
                    <div class="mt-2 grid grid-cols-2 gap-2">
                      <input v-model.number="l.newRetailPrice" type="number" min="0" step="0.01" class="input text-xs" :placeholder="t('supplierInvoices.retailPrice')" :aria-label="t('supplierInvoices.retailPrice')" />
                      <select v-model="l.newCategoryId" class="input text-xs" :aria-label="t('products.category')">
                        <option value="">{{ t('products.noCategory') }}</option>
                        <option v-for="c in categories || []" :key="c.id" :value="c.id">{{ c.name }}</option>
                      </select>
                    </div>
                    <p class="mt-1 flex items-center gap-1 text-xs text-primary-700"><SparklesIcon class="h-3.5 w-3.5" /> {{ t('supplierInvoices.newProductHint') }}</p>
                  </template>
                  <p v-if="l.quantityReceived" class="mt-1 flex items-center gap-1 text-xs text-gray-500"><LockClosedIcon class="h-3.5 w-3.5" /> {{ t('supplierInvoices.received') }} : {{ l.quantityReceived }}</p>
                </td>
                <td class="px-3 py-2">
                  <input v-if="!l.productId" v-model="l.reference" class="input font-mono text-xs" :aria-label="t('supplierInvoices.reference')" />
                  <p v-else class="py-2 font-mono text-xs text-gray-500">{{ l.reference || '—' }}</p>
                </td>
                <td class="px-3 py-2"><input v-model.number="l.quantity" type="number" :min="Math.max(1, l.quantityReceived || 0)" step="1" class="input text-end" :aria-label="t('supplierInvoices.quantity')" /></td>
                <td class="px-3 py-2"><input v-model.number="l.unitCost" type="number" min="0" step="0.01" class="input text-end" :aria-label="t('supplierInvoices.unitCost')" /></td>
                <td class="whitespace-nowrap px-3 py-2 pt-4 text-end font-semibold text-gray-900">{{ formatCurrency((Number(l.quantity) || 0) * (Number(l.unitCost) || 0)) }}</td>
                <td class="px-1 py-2">
                  <button v-if="!l.quantityReceived && !linkedOrder" class="p-2 text-gray-400 hover:text-danger-600" :aria-label="t('common.remove')" @click="removeLine(i)"><TrashIcon class="h-5 w-5" /></button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_24rem]">
        <div class="card space-y-4 p-5">
          <div>
            <label class="label" for="si-notes">{{ t('supplierInvoices.notes') }}</label>
            <textarea id="si-notes" v-model="form.notes" rows="4" class="input" />
          </div>
          <p class="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">{{ t('supplierInvoices.notExpense') }}</p>
        </div>
        <div class="card space-y-3 p-5 text-sm">
          <div class="flex justify-between"><span class="text-gray-600">{{ t('supplierInvoices.subtotal') }}</span><span class="font-medium">{{ formatCurrency(subtotal) }}</span></div>
          <div class="flex items-center justify-between gap-3">
            <label class="text-gray-600" for="si-discount">{{ t('supplierInvoices.discount') }}</label>
            <input id="si-discount" v-model.number="form.discount" type="number" min="0" step="0.01" class="input w-32 text-end" />
          </div>
          <div class="flex items-center justify-between gap-3">
            <label class="text-gray-600" for="si-tax">{{ t('supplierInvoices.taxRate') }}</label>
            <input id="si-tax" v-model.number="form.taxRate" type="number" min="0" max="100" step="0.01" class="input w-32 text-end" />
          </div>
          <div v-if="taxAmount" class="flex justify-between text-gray-500"><span>{{ t('supplierInvoices.tax') }}</span><span>{{ formatCurrency(taxAmount) }}</span></div>
          <div class="flex items-center justify-between gap-3">
            <label class="text-gray-600" for="si-extra">{{ t('supplierInvoices.extraCharges') }}</label>
            <input id="si-extra" v-model.number="form.extraCharges" type="number" min="0" step="0.01" class="input w-32 text-end" />
          </div>
          <input v-if="form.extraCharges > 0" v-model="form.extraChargesLabel" class="input" :placeholder="t('supplierInvoices.extraChargesLabel')" :aria-label="t('supplierInvoices.extraChargesLabel')" />
          <div class="flex items-center justify-between border-t border-gray-200 pt-3 text-base">
            <span class="font-semibold text-gray-900">{{ t('supplierInvoices.total') }}</span>
            <span class="text-xl font-bold text-gray-900">{{ formatCurrency(total) }}</span>
          </div>
          <p v-if="error" class="rounded-lg bg-danger-50 p-3 text-sm text-danger-700">{{ error }}</p>
          <div class="flex flex-col gap-2 pt-2">
            <button class="btn-primary" :disabled="saving" @click="save(true)">{{ status === 'draft' ? t('supplierInvoices.saveConfirm') : t('supplierInvoices.save') }}</button>
            <button v-if="status === 'draft'" class="btn-secondary" :disabled="saving" @click="save(false)">{{ t('supplierInvoices.saveDraft') }}</button>
          </div>
        </div>
      </div>
    </template>
    <Toast :show="toast.show" :message="toast.message" :type="toast.type" @close="toast.show = false" />
  </div>
</template>
