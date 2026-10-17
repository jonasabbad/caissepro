<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { ArrowLeftIcon, CheckIcon, PlusIcon, TrashIcon } from '@heroicons/vue/24/outline';
import { invoicesApi } from '@/api/invoices';
import { customersApi } from '@/api/customers';
import { formatCurrency } from '@/utils/format';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const queryClient = useQueryClient();
const id = computed(() => route.params.id || null);
const isEdit = computed(() => !!id.value);

const customerId = ref('');
const notes = ref('');
const discount = ref(0);
const items = ref([]);
let seq = 0;
const addItem = () => items.value.push({ id: seq++, description: '', quantity: 1, unitPrice: 0 });
function removeItem(itemId) {
  items.value = items.value.filter((i) => i.id !== itemId);
  if (!items.value.length) addItem();
}

const { data: customersData } = useQuery({ queryKey: ['customers-for-invoice'], queryFn: () => customersApi.getAll({ limit: 500 }) });
const customers = computed(() => customersData.value?.customers || []);
const { data: existing } = useQuery({ queryKey: ['invoice-edit', id], queryFn: () => invoicesApi.getById(id.value), enabled: isEdit });
watch(
  existing,
  (inv) => {
    if (!inv) return;
    customerId.value = inv.customer?.id || '';
    notes.value = inv.notes || '';
    discount.value = Number(inv.discountAmount) || 0;
    items.value = (inv.items || []).map((i) => ({ id: seq++, description: i.description, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) }));
    if (!items.value.length) addItem();
  },
  { immediate: true },
);
onMounted(() => !isEdit.value && addItem());

const lineTotal = (i) => i.quantity * i.unitPrice;
const subtotal = computed(() => items.value.reduce((s, i) => s + lineTotal(i), 0));
const total = computed(() => Math.max(0, subtotal.value - discount.value));
const validItems = computed(() => items.value.filter((i) => i.description.trim() !== '' && i.quantity >= 1 && i.unitPrice > 0));

const error = ref('');
const save = useMutation({
  mutationFn: (payload) => (isEdit.value ? invoicesApi.updateStandalone(id.value, payload) : invoicesApi.createStandalone(payload)),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    router.push('/app/invoices');
  },
  onError: (e) => (error.value = e?.response?.data?.message || t('errors.serverError')),
});
function submit() {
  if (!validItems.value.length) return;
  error.value = '';
  save.mutate({
    customerId: customerId.value || undefined,
    items: validItems.value.map((i) => ({ description: i.description.trim(), quantity: i.quantity, unitPrice: i.unitPrice })),
    discountAmount: discount.value > 0 ? discount.value : undefined,
    notes: notes.value.trim() || undefined,
  });
}
</script>

<template>
  <div class="max-w-4xl space-y-6">
    <div class="flex items-center gap-4">
      <RouterLink to="/app/invoices" class="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ArrowLeftIcon class="w-5 h-5 text-gray-600 rtl:rotate-180" /></RouterLink>
      <div>
        <h1 class="text-2xl font-bold text-gray-900">{{ isEdit ? t('invoices.editStandalone') : t('invoices.newStandalone') }}</h1>
        <p class="text-gray-500 text-sm">{{ isEdit ? t('invoices.editStandaloneDesc') : t('invoices.newStandaloneDesc') }}</p>
      </div>
    </div>

    <form class="space-y-6" @submit.prevent="submit">
      <div v-if="error" class="bg-danger-50 border border-danger-200 rounded-lg p-3 text-sm text-danger-700">{{ error }}</div>
      <div class="card p-6">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">{{ t('invoices.customer') }}</h2>
        <label class="label">{{ t('invoices.selectCustomer') }}</label>
        <select v-model="customerId" class="input">
          <option value="">-- {{ t('invoices.walkIn') }} --</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.firstName }} {{ c.lastName }}<template v-if="c.ice"> (ICE: {{ c.ice }})</template></option>
        </select>
        <p class="text-xs text-gray-500 mt-1">{{ t('invoices.customerHelp') }}</p>
      </div>

      <div class="card p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-gray-900">{{ t('invoices.items') }}</h2>
          <button type="button" class="btn-primary text-sm inline-flex items-center gap-1" @click="addItem"><PlusIcon class="w-4 h-4" /> {{ t('invoices.addItem') }}</button>
        </div>
        <div class="hidden md:grid grid-cols-12 gap-3 px-3 py-2 bg-gray-50 rounded-lg text-xs font-medium text-gray-500 uppercase">
          <div class="col-span-5">{{ t('invoices.description') }}</div>
          <div class="col-span-2 text-center">{{ t('invoices.quantity') }}</div>
          <div class="col-span-2 text-end">{{ t('invoices.unitPrice') }}</div>
          <div class="col-span-2 text-end">{{ t('invoices.total') }}</div>
          <div class="col-span-1" />
        </div>
        <div class="divide-y divide-gray-100">
          <div v-for="item in items" :key="item.id" class="grid grid-cols-12 gap-3 px-1 md:px-3 py-3 items-center hover:bg-gray-50">
            <div class="col-span-12 md:col-span-5">
              <input v-model="item.description" type="text" :placeholder="t('invoices.descriptionPlaceholder')" class="input" required />
            </div>
            <div class="col-span-3 md:col-span-2"><input v-model.number="item.quantity" type="number" min="1" class="input text-center" required /></div>
            <div class="col-span-5 md:col-span-2">
              <div class="relative">
                <input v-model.number="item.unitPrice" type="number" min="0" step="0.01" class="input text-end pe-10" required />
                <span class="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">DH</span>
              </div>
            </div>
            <div class="col-span-3 md:col-span-2 text-end"><span class="font-medium text-gray-900">{{ formatCurrency(lineTotal(item)) }}</span></div>
            <div class="col-span-1 text-end">
              <button type="button" class="p-1.5 text-gray-400 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-colors" @click="removeItem(item.id)"><TrashIcon class="w-4 h-4" /></button>
            </div>
          </div>
        </div>
        <div class="flex justify-end mt-4 pt-4 border-t border-gray-100">
          <div class="w-full sm:w-72 space-y-2 text-sm">
            <div class="flex justify-between"><span class="text-gray-500">{{ t('invoices.subtotal') }}:</span><span class="font-medium">{{ formatCurrency(subtotal) }}</span></div>
            <div class="flex items-center justify-between gap-2">
              <span class="text-gray-500">{{ t('invoices.discount') }}:</span>
              <div class="flex items-center gap-2">
                <input v-model.number="discount" type="number" min="0" step="0.01" class="w-28 py-1.5 px-3 text-end input" />
                <span class="text-gray-500">DH</span>
              </div>
            </div>
            <div class="flex justify-between pt-2 border-t border-gray-200 text-lg font-bold"><span>{{ t('invoices.total') }}:</span><span>{{ formatCurrency(total) }}</span></div>
          </div>
        </div>
      </div>

      <div class="card p-6">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">{{ t('invoices.notes') }} ({{ t('common.optional') }})</h2>
        <textarea v-model="notes" rows="3" :placeholder="t('invoices.notesPlaceholder')" class="input" />
      </div>

      <div class="flex justify-end gap-3">
        <RouterLink to="/app/invoices" class="btn-secondary">{{ t('common.cancel') }}</RouterLink>
        <button type="submit" class="btn-primary inline-flex items-center gap-2" :disabled="!validItems.length || save.isPending.value">
          <CheckIcon class="w-5 h-5" />
          {{ save.isPending.value ? (isEdit ? t('common.saving') : t('common.creating')) : isEdit ? t('invoices.saveInvoice') : t('invoices.createInvoice') }}
        </button>
      </div>
    </form>
  </div>
</template>
