<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { EyeIcon, MagnifyingGlassIcon, PaperClipIcon, PencilIcon, PlusIcon, ReceiptPercentIcon, TrashIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import { EXPENSE_CATEGORIES, EXPENSE_METHODS, expensesApi } from '@/api/expenses';
import { apiErrorMessage } from '@/api/http';
import { intlLocale } from '@/i18n';
import { formatCurrency, isoDate } from '@/utils/format';
import DateRangePicker from '@/components/ui/DateRangePicker.vue';
import ConfirmModal from '@/components/ui/ConfirmModal.vue';
import Toast from '@/components/ui/Toast.vue';
import ExpenseFormModal from '@/components/expenses/ExpenseFormModal.vue';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();

// Filters (the period defaults to the current month).
const now = new Date();
const range = ref([isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), isoDate(now)]);
const search = ref('');
const debounced = ref('');
let timer;
watch(search, (v) => {
  clearTimeout(timer);
  timer = setTimeout(() => (debounced.value = v.trim()), 300);
});
const category = ref('');
const method = ref('');
const page = ref(1);
const limit = 20;
watch([range, debounced, category, method], () => (page.value = 1));

const params = computed(() => ({
  query: debounced.value,
  category: category.value,
  paymentMethod: method.value,
  dateFrom: range.value?.[0],
  dateTo: range.value?.[1],
  page: page.value,
  limit,
}));
const { data, isLoading, isError } = useQuery({ queryKey: ['expenses', params], queryFn: () => expensesApi.getAll(params.value), placeholderData: keepPreviousData });
const rows = computed(() => data.value?.expenses || []);
const meta = computed(() => data.value?.meta || { total: 0, page: 1, totalPages: 1 });
// Cash part of the period, for the drawer reconciliation hint.
const { data: cashData } = useQuery({
  queryKey: ['expenses', 'cash', range, debounced, category],
  queryFn: () => expensesApi.getAll({ ...params.value, paymentMethod: 'cash', page: 1, limit: 1 }),
});

const day = (d) => new Date(d).toLocaleDateString(intlLocale(), { day: '2-digit', month: 'short', year: 'numeric' });
const CATEGORY_TONE = { rent: 'bg-indigo-50 text-indigo-700', salaries: 'bg-sky-50 text-sky-700', utilities: 'bg-amber-50 text-amber-700', taxes: 'bg-red-50 text-red-700' };

// Add / edit / view / delete.
const formOpen = ref(false);
const editing = ref(null);
const viewing = ref(null);
const toDelete = ref(null);
const toast = ref({ show: false, message: '', type: 'success' });
const notify = (message, type = 'success') => (toast.value = { show: true, message, type });
function openAdd() {
  editing.value = null;
  formOpen.value = true;
}
function openEdit(e) {
  viewing.value = null;
  editing.value = e;
  formOpen.value = true;
}
function onSaved(_e, wasEdit) {
  formOpen.value = false;
  notify(wasEdit ? t('expenses.updated') : t('expenses.saved'));
}
const deleteMut = useMutation({
  mutationFn: (id) => expensesApi.remove(id),
  onSuccess: () => {
    for (const k of ['expenses', 'dashboard-kpis', 'dashboard-store-breakdown', 'report', 'caisse']) queryClient.invalidateQueries({ queryKey: [k] });
    toDelete.value = null;
    notify(t('expenses.deleted'));
  },
  onError: (e) => notify(apiErrorMessage(e), 'error'),
});

// The dashboard's "Add expense" link lands here with ?new=1.
onMounted(() => {
  if (route.query.new) {
    openAdd();
    router.replace({ query: {} });
  }
});
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">{{ t('expenses.title') }}</h1>
        <p class="mt-1 text-sm text-gray-500">{{ t('expenses.subtitle') }}</p>
      </div>
      <button class="btn-primary inline-flex items-center gap-2 self-start" @click="openAdd"><PlusIcon class="h-5 w-5" /> {{ t('expenses.add') }}</button>
    </div>

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div class="card p-4">
        <p class="text-sm text-gray-500">{{ t('expenses.total') }}</p>
        <p class="mt-1 text-2xl font-bold text-gray-900">{{ formatCurrency(data?.totals?.amount ?? 0) }}</p>
      </div>
      <div class="card p-4">
        <p class="text-sm text-gray-500">{{ t('expenses.count', { n: data?.totals?.count ?? 0 }) }}</p>
        <p class="mt-1 text-2xl font-bold text-gray-900">{{ data?.totals?.count ?? 0 }}</p>
      </div>
      <div class="card p-4">
        <p class="text-sm text-gray-500">{{ t('expenses.cashOut') }}</p>
        <p class="mt-1 text-2xl font-bold text-gray-900">{{ formatCurrency(cashData?.totals?.amount ?? 0) }}</p>
      </div>
    </div>

    <div class="card p-4">
      <div class="flex flex-col gap-3 lg:flex-row">
        <div class="relative flex-1">
          <MagnifyingGlassIcon class="absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input v-model="search" type="search" class="input ps-10" :placeholder="t('expenses.search')" :aria-label="t('expenses.search')" />
        </div>
        <select v-model="category" class="input lg:w-52" :aria-label="t('expenses.fields.category')">
          <option value="">{{ t('expenses.allCategories') }}</option>
          <option v-for="c in EXPENSE_CATEGORIES" :key="c" :value="c">{{ t(`expenses.categories.${c}`) }}</option>
        </select>
        <select v-model="method" class="input lg:w-44" :aria-label="t('expenses.fields.paymentMethod')">
          <option value="">{{ t('expenses.allMethods') }}</option>
          <option v-for="m in EXPENSE_METHODS" :key="m" :value="m">{{ t(`expenses.methods.${m}`) }}</option>
        </select>
        <div class="lg:w-72"><DateRangePicker v-model="range" :clearable="false" /></div>
      </div>
    </div>

    <div class="card overflow-hidden">
      <div v-if="isLoading" class="p-8 text-center text-gray-500">{{ t('common.loading') }}</div>
      <div v-else-if="isError" class="p-8 text-center text-danger-600">{{ t('common.genericError') }}</div>
      <div v-else-if="!rows.length" class="p-10 text-center text-gray-500">
        <ReceiptPercentIcon class="mx-auto mb-3 h-12 w-12 text-gray-300" />
        <p>{{ t('expenses.empty') }}</p>
        <button class="btn-primary mt-4 inline-flex items-center gap-2" @click="openAdd"><PlusIcon class="h-4 w-4" /> {{ t('expenses.add') }}</button>
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-gray-200 bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('expenses.fields.date') }}</th>
              <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('expenses.fields.title') }}</th>
              <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('expenses.fields.category') }}</th>
              <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('expenses.fields.paymentMethod') }}</th>
              <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('expenses.fields.amount') }}</th>
              <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="e in rows" :key="e.id" class="hover:bg-gray-50">
              <td class="whitespace-nowrap px-4 py-3 text-gray-600">{{ day(e.date) }}</td>
              <td class="px-4 py-3">
                <p class="font-medium text-gray-900">
                  {{ e.title }}
                  <PaperClipIcon v-if="e.receiptUrl" class="ms-1 inline h-4 w-4 text-gray-400" :aria-label="t('expenses.fields.receipt')" />
                </p>
                <p v-if="e.recipient" class="text-xs text-gray-500">{{ e.recipient }}</p>
              </td>
              <td class="px-4 py-3"><span :class="['rounded-full px-2 py-0.5 text-xs font-medium', CATEGORY_TONE[e.category] || 'bg-gray-100 text-gray-700']">{{ t(`expenses.categories.${e.category}`) }}</span></td>
              <td class="whitespace-nowrap px-4 py-3 text-gray-600">{{ t(`expenses.methods.${e.paymentMethod}`) }}</td>
              <td class="whitespace-nowrap px-4 py-3 text-end font-semibold text-gray-900">{{ formatCurrency(e.amount) }}</td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-end gap-1">
                  <button class="p-2 text-gray-400 hover:text-primary-600" :title="t('common.view')" @click="viewing = e"><EyeIcon class="h-5 w-5" /></button>
                  <button class="p-2 text-gray-400 hover:text-primary-600" :title="t('common.edit')" @click="openEdit(e)"><PencilIcon class="h-5 w-5" /></button>
                  <button class="p-2 text-gray-400 hover:text-danger-600" :title="t('common.delete')" @click="toDelete = e"><TrashIcon class="h-5 w-5" /></button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="meta.totalPages > 1" class="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-sm">
        <p class="text-gray-500">{{ t('reports.pageOf', { page: meta.page, total: meta.totalPages }) }}</p>
        <div class="flex gap-2">
          <button class="btn-secondary px-3 py-1" :disabled="page <= 1" @click="page--">{{ t('common.previous') }}</button>
          <button class="btn-secondary px-3 py-1" :disabled="page >= meta.totalPages" @click="page++">{{ t('common.next') }}</button>
        </div>
      </div>
    </div>

    <!-- Details -->
    <Teleport to="body">
      <div v-if="viewing" class="modal-overlay" @click.self="viewing = null">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="text-lg font-bold text-gray-900">{{ t('expenses.details') }}</h3>
            <button class="rounded p-1 hover:bg-gray-100" :aria-label="t('common.close')" @click="viewing = null"><XMarkIcon class="h-5 w-5" /></button>
          </div>
          <dl class="modal-body divide-y text-sm">
            <div class="flex justify-between gap-4 py-2"><dt class="text-gray-500">{{ t('expenses.fields.title') }}</dt><dd class="text-end font-medium">{{ viewing.title }}</dd></div>
            <div class="flex justify-between gap-4 py-2"><dt class="text-gray-500">{{ t('expenses.fields.amount') }}</dt><dd class="text-end font-semibold">{{ formatCurrency(viewing.amount) }}</dd></div>
            <div class="flex justify-between gap-4 py-2"><dt class="text-gray-500">{{ t('expenses.fields.date') }}</dt><dd class="text-end">{{ day(viewing.date) }}</dd></div>
            <div class="flex justify-between gap-4 py-2"><dt class="text-gray-500">{{ t('expenses.fields.category') }}</dt><dd class="text-end">{{ t(`expenses.categories.${viewing.category}`) }}</dd></div>
            <div class="flex justify-between gap-4 py-2"><dt class="text-gray-500">{{ t('expenses.fields.paymentMethod') }}</dt><dd class="text-end">{{ t(`expenses.methods.${viewing.paymentMethod}`) }}</dd></div>
            <div v-if="viewing.recipient" class="flex justify-between gap-4 py-2"><dt class="text-gray-500">{{ t('expenses.fields.recipient') }}</dt><dd class="text-end">{{ viewing.recipient }}</dd></div>
            <div v-if="viewing.notes" class="py-2"><dt class="text-gray-500">{{ t('expenses.fields.notes') }}</dt><dd class="mt-1 whitespace-pre-line">{{ viewing.notes }}</dd></div>
            <div v-if="viewing.receiptUrl" class="flex justify-between gap-4 py-2">
              <dt class="text-gray-500">{{ t('expenses.fields.receipt') }}</dt>
              <dd><a :href="viewing.receiptUrl" target="_blank" rel="noopener" class="text-primary-600 underline">{{ viewing.receiptName || t('expenses.fields.receiptView') }}</a></dd>
            </div>
          </dl>
          <div class="modal-footer">
            <button class="btn-secondary" @click="viewing = null">{{ t('common.close') }}</button>
            <button class="btn-primary" @click="openEdit(viewing)">{{ t('common.edit') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <ExpenseFormModal :is-open="formOpen" :expense="editing" @close="formOpen = false" @saved="onSaved" />
    <ConfirmModal
      :show="!!toDelete"
      :title="t('common.confirm')"
      :message="t('expenses.confirmDelete')"
      :confirm-text="t('common.delete')"
      :cancel-text="t('common.cancel')"
      :loading="deleteMut.isPending.value"
      type="danger"
      @confirm="deleteMut.mutate(toDelete.id)"
      @cancel="toDelete = null"
    />
    <Toast :show="toast.show" :message="toast.message" :type="toast.type" @close="toast.show = false" />
  </div>
</template>
