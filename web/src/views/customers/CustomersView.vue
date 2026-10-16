<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import {
  BanknotesIcon,
  BookmarkIcon,
  ExclamationCircleIcon,
  EyeIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  TrashIcon,
  UsersIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';
import { customersApi } from '@/api/customers';
import { reservationRefundsApi } from '@/api/reservations';
import { formatCurrency } from '@/utils/format';
import { apiErrorMessage } from '@/api/http';
import CustomerFields from '@/components/customers/CustomerFields.vue';
import ConfirmModal from '@/components/ui/ConfirmModal.vue';

const { t } = useI18n();
const queryClient = useQueryClient();

const search = ref('');
const page = ref(1);
const pageSize = ref(20);
watch(search, () => (page.value = 1));

const { data, isLoading } = useQuery({
  queryKey: ['customers', search, page, pageSize],
  queryFn: () => customersApi.getAll({ query: search.value, page: page.value, limit: pageSize.value }),
});
const { data: pendingRefunds } = useQuery({ queryKey: ['pending-refunds'], queryFn: () => reservationRefundsApi.getPending() });
const refundsFor = (customerId) => (pendingRefunds.value || []).filter((r) => r.customerId === customerId);

const customers = computed(() => data.value?.customers || []);
const total = computed(() => data.value?.total || 0);
const totalPages = computed(() => Math.ceil(total.value / pageSize.value));

const filter = ref('all');
const filtered = computed(() => {
  const list = customers.value;
  if (filter.value === 'owes') return list.filter((c) => c.balance < 0);
  if (filter.value === 'refund') return list.filter((c) => c.pendingRefundAmount > 0);
  if (filter.value === 'reservation') return list.filter((c) => c.reservationCount > 0);
  return list;
});
const counts = computed(() => ({
  all: customers.value.length,
  owes: customers.value.filter((c) => c.balance < 0).length,
  refund: customers.value.filter((c) => c.pendingRefundAmount > 0).length,
  reservation: customers.value.filter((c) => c.reservationCount > 0).length,
}));

// ── Create / edit modal ──
const emptyForm = () => ({ firstName: '', lastName: '', phone: '', email: '', cin: '', ice: '', address: '', city: '', notes: '' });
const formOpen = ref(false);
const editing = ref(null);
const form = ref(emptyForm());
function openCreate() {
  form.value = emptyForm();
  editing.value = null;
  formOpen.value = true;
}
function openEdit(c) {
  editing.value = c;
  form.value = {
    firstName: c.firstName,
    lastName: c.lastName,
    phone: c.phone || '',
    email: c.email || '',
    cin: c.cin || '',
    ice: c.ice || '',
    address: c.address || '',
    city: c.city || '',
    notes: c.notes || '',
  };
  formOpen.value = true;
}
const saveMutation = useMutation({
  mutationFn: () => (editing.value ? customersApi.update(editing.value.id, form.value) : customersApi.create(form.value)),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['customers'] });
    formOpen.value = false;
    form.value = emptyForm();
    editing.value = null;
  },
});
const save = () => form.value.firstName.trim() && saveMutation.mutate();

// ── Delete ──
const confirmOpen = ref(false);
const pendingDelete = ref(null);
const deleteMutation = useMutation({
  mutationFn: (id) => customersApi.delete(id),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customers'] }),
});
function askDelete(id) {
  pendingDelete.value = id;
  confirmOpen.value = true;
}
function confirmDelete() {
  if (pendingDelete.value) deleteMutation.mutate(pendingDelete.value);
  confirmOpen.value = false;
  pendingDelete.value = null;
}

// ── Reservation deposit refund ──
const refundOpen = ref(false);
const refund = ref(null);
const refundAmount = ref(0);
const refundNotes = ref('');
const refundError = ref('');
function openRefund(r) {
  if (!r) return;
  refund.value = r;
  refundAmount.value = Number(r.depositAmount) - Number(r.refundedAmount);
  refundNotes.value = '';
  refundError.value = '';
  refundOpen.value = true;
}
function closeRefund() {
  refundOpen.value = false;
  refund.value = null;
}
const refundMutation = useMutation({
  mutationFn: ({ id, amount, notes }) => reservationRefundsApi.recordPayment(id, { amount, notes }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['pending-refunds'] });
    queryClient.invalidateQueries({ queryKey: ['customers'] });
    closeRefund();
  },
  onError: (e) => (refundError.value = apiErrorMessage(e, t('customers.refundModal.error'))),
});
function submitRefund() {
  if (!refund.value || refundAmount.value <= 0) return;
  refundMutation.mutate({ id: refund.value.id, amount: refundAmount.value, notes: refundNotes.value || undefined });
}

const pill = (active, on, off) => ['rounded-full px-3 py-1.5 text-sm font-medium transition-colors', active ? on : off];
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <h1 class="text-2xl font-bold text-gray-900">{{ t('nav.customers') }}</h1>
      <button class="btn-primary inline-flex items-center gap-2" @click="openCreate"><PlusIcon class="h-5 w-5" /> {{ t('customers.add') }}</button>
    </div>

    <div class="card space-y-4 p-4">
      <div class="relative max-w-md">
        <MagnifyingGlassIcon class="absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <input v-model="search" type="text" :placeholder="t('customers.search')" class="input ps-10" />
      </div>
      <div class="flex flex-wrap gap-2">
        <button :class="pill(filter === 'all', 'bg-gray-900 text-white', 'bg-gray-100 text-gray-700 hover:bg-gray-200')" @click="filter = 'all'">
          {{ t('customers.filters.all') }}
          <span :class="['ms-1 rounded-full px-1.5 py-0.5 text-xs', filter === 'all' ? 'bg-gray-700' : 'bg-gray-200']">{{ counts.all }}</span>
        </button>
        <button :class="pill(filter === 'owes', 'bg-danger-600 text-white', 'bg-danger-50 text-danger-700 hover:bg-danger-100')" @click="filter = 'owes'">
          {{ t('customers.filters.owes') }}
          <span v-if="counts.owes > 0" :class="['ms-1 rounded-full px-1.5 py-0.5 text-xs', filter === 'owes' ? 'bg-danger-500' : 'bg-danger-100']">{{ counts.owes }}</span>
        </button>
        <button :class="pill(filter === 'refund', 'bg-amber-600 text-white', 'bg-amber-50 text-amber-700 hover:bg-amber-100')" @click="filter = 'refund'">
          {{ t('customers.filters.refund') }}
          <span v-if="counts.refund > 0" :class="['ms-1 rounded-full px-1.5 py-0.5 text-xs', filter === 'refund' ? 'bg-amber-500' : 'bg-amber-100']">{{ counts.refund }}</span>
        </button>
        <button
          :class="pill(filter === 'reservation', 'bg-purple-600 text-white', 'bg-purple-50 text-purple-700 hover:bg-purple-100')"
          @click="filter = 'reservation'"
        >
          {{ t('customers.filters.reservation') }}
          <span v-if="counts.reservation > 0" :class="['ms-1 rounded-full px-1.5 py-0.5 text-xs', filter === 'reservation' ? 'bg-purple-500' : 'bg-purple-100']">
            {{ counts.reservation }}
          </span>
        </button>
      </div>
    </div>

    <div v-if="isLoading" class="card p-8 text-center text-gray-500">{{ t('common.loading') }}</div>
    <div v-else-if="customers.length === 0" class="card p-8 text-center text-gray-500">
      <UsersIcon class="mx-auto mb-3 h-12 w-12 text-gray-300" />
      <p>{{ t('customers.noCustomers') }}</p>
    </div>
    <div v-else-if="filtered.length > 0" class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      <div v-for="c in filtered" :key="c.id" class="card p-4">
        <div class="mb-3 flex items-start justify-between">
          <div class="flex items-center gap-3">
            <div class="flex h-12 w-12 items-center justify-center rounded-full bg-primary-100">
              <span class="text-lg font-medium text-primary-700">{{ c.firstName?.[0] }}{{ c.lastName?.[0] }}</span>
            </div>
            <div>
              <p class="font-medium text-gray-900">{{ c.firstName }} {{ c.lastName }}</p>
              <p v-if="c.phone" class="flex items-center gap-1 text-sm text-gray-500"><PhoneIcon class="h-4 w-4" /> {{ c.phone }}</p>
            </div>
          </div>
          <div class="flex gap-1">
            <RouterLink :to="`/app/customers/${c.id}`" class="p-1.5 text-gray-400 hover:text-primary-600"><EyeIcon class="h-4 w-4" /></RouterLink>
            <button class="p-1.5 text-gray-400 hover:text-primary-600" @click="openEdit(c)"><PencilIcon class="h-4 w-4" /></button>
            <button class="p-1.5 text-gray-400 hover:text-danger-600" @click="askDelete(c.id)"><TrashIcon class="h-4 w-4" /></button>
          </div>
        </div>
        <div v-if="c.reservationCount > 0" class="mb-2 flex items-center gap-2 rounded-lg bg-purple-50 p-2">
          <BookmarkIcon class="h-5 w-5 text-purple-600" />
          <span class="font-medium text-purple-700">{{ t('customers.reservationsInProgress', { count: c.reservationCount }) }}</span>
        </div>
        <div v-if="c.balance < 0" class="mb-2 flex items-center gap-2 rounded-lg bg-danger-50 p-2">
          <BanknotesIcon class="h-5 w-5 text-danger-600" />
          <span class="font-medium text-danger-700">{{ t('customers.owes') }}: {{ formatCurrency(Math.abs(c.balance)) }}</span>
        </div>
        <div v-if="c.balance > 0" class="mb-2 flex items-center gap-2 rounded-lg bg-amber-50 p-2">
          <BanknotesIcon class="h-5 w-5 text-amber-600" />
          <span class="font-medium text-amber-700">{{ t('customers.toRefund', { amount: formatCurrency(c.balance) }) }}</span>
        </div>
        <div v-if="c.pendingRefundAmount > 0" class="mb-2 flex items-center justify-between gap-2 rounded-lg bg-amber-50 p-2">
          <div class="flex items-center gap-2">
            <BanknotesIcon class="h-5 w-5 text-amber-600" />
            <span class="font-medium text-amber-700">{{ t('customers.depositToRefund', { amount: formatCurrency(c.pendingRefundAmount) }) }}</span>
          </div>
          <button class="rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-amber-700" @click.prevent="openRefund(refundsFor(c.id)[0])">
            {{ t('customers.refund') }}
          </button>
        </div>
        <div class="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 text-sm text-gray-500">
          <span>{{ c.transactionCount || 0 }} {{ t('customers.transactions') }}</span>
          <span>{{ formatCurrency(c.totalSpent || 0) }}</span>
        </div>
      </div>
    </div>
    <div v-else class="card p-8 text-center text-gray-500">
      <UsersIcon class="mx-auto mb-3 h-12 w-12 text-gray-300" />
      <p>{{ t(`customers.emptyFilters.${filter}`) }}</p>
      <button class="mt-3 text-sm font-medium text-primary-600 hover:text-primary-800" @click="filter = 'all'">{{ t('customers.emptyFilters.showAll') }}</button>
    </div>

    <div v-if="totalPages > 1" class="flex items-center justify-between">
      <p class="text-sm text-gray-500">
        {{ t('common.showing') }} {{ (page - 1) * pageSize + 1 }} - {{ Math.min(page * pageSize, total) }} {{ t('common.of') }} {{ total }}
      </p>
      <div class="flex gap-2">
        <button :disabled="page === 1" class="btn-secondary px-3 py-1 text-sm" @click="page--">{{ t('common.previous') }}</button>
        <button :disabled="page >= totalPages" class="btn-secondary px-3 py-1 text-sm" @click="page++">{{ t('common.next') }}</button>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="formOpen" class="modal-overlay" @click.self="formOpen = false">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="text-lg font-bold text-gray-900">{{ editing ? t('customers.edit') : t('customers.add') }}</h3>
            <button class="rounded p-1 hover:bg-gray-100" @click="formOpen = false"><XMarkIcon class="h-5 w-5" /></button>
          </div>
          <form class="flex min-h-0 flex-col" @submit.prevent="save">
            <div class="modal-body"><CustomerFields v-model="form" /></div>
            <div class="modal-footer">
              <button type="button" class="btn-secondary" @click="formOpen = false">{{ t('common.cancel') }}</button>
              <button type="submit" class="btn-primary" :disabled="saveMutation.isPending.value">
                {{
                  saveMutation.isPending.value
                    ? editing
                      ? t('common.updating')
                      : t('common.creating')
                    : editing
                      ? t('common.update')
                      : t('common.create')
                }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <ConfirmModal
      :show="confirmOpen"
      :title="t('common.confirm')"
      :message="t('customers.confirmDelete')"
      :confirm-text="t('common.delete')"
      :cancel-text="t('common.cancel')"
      type="danger"
      @confirm="confirmDelete"
      @cancel="confirmOpen = false"
    />

    <Teleport to="body">
      <div v-if="refundOpen && refund" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="closeRefund">
        <div class="w-full max-w-md rounded-lg bg-white shadow-xl">
          <div class="flex items-center justify-between border-b border-gray-200 p-4">
            <h3 class="text-lg font-bold text-gray-900">{{ t('customers.refundModal.title') }}</h3>
            <button class="rounded p-1 hover:bg-gray-100" @click="closeRefund"><XMarkIcon class="h-5 w-5" /></button>
          </div>
          <div class="space-y-4 p-4">
            <div v-if="refundError" class="flex items-start gap-3 rounded-lg border border-danger-200 bg-danger-50 p-4">
              <ExclamationCircleIcon class="mt-0.5 h-5 w-5 flex-shrink-0 text-danger-600" />
              <p class="text-sm font-medium text-danger-800">{{ refundError }}</p>
            </div>
            <div class="rounded-lg bg-gray-50 p-4">
              <p class="font-medium text-gray-900">{{ refund.customer?.firstName }} {{ refund.customer?.lastName }}</p>
              <p class="mt-1 text-sm text-gray-600">
                {{ refund.soldUnit?.brand }} {{ refund.soldUnit?.model }}
                <span v-if="refund.soldUnit?.storage" class="text-gray-400">· {{ refund.soldUnit.storage }}</span>
              </p>
              <div class="mt-2 flex justify-between border-t border-gray-200 pt-2 text-sm">
                <span class="text-gray-500">{{ t('customers.refundModal.initialDeposit') }}</span>
                <span class="font-medium">{{ formatCurrency(refund.depositAmount) }}</span>
              </div>
              <div v-if="Number(refund.refundedAmount) > 0" class="flex justify-between text-sm">
                <span class="text-gray-500">{{ t('customers.refundModal.alreadyRefunded') }}</span>
                <span class="font-medium text-success-600">{{ formatCurrency(refund.refundedAmount) }}</span>
              </div>
              <div class="mt-2 flex justify-between border-t border-gray-200 pt-2 text-sm">
                <span class="font-medium text-amber-700">{{ t('customers.refundModal.remaining') }}</span>
                <span class="font-bold text-amber-700">{{ formatCurrency(Number(refund.depositAmount) - Number(refund.refundedAmount)) }}</span>
              </div>
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700">{{ t('customers.refundModal.amount') }}</label>
              <div class="relative">
                <input
                  v-model.number="refundAmount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  :max="Number(refund.depositAmount) - Number(refund.refundedAmount)"
                  class="w-full rounded-lg border border-gray-300 px-3 py-2 pe-16 focus:border-transparent focus:ring-2 focus:ring-amber-500"
                  required
                />
                <span class="absolute end-3 top-1/2 -translate-y-1/2 text-gray-500">DH</span>
              </div>
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700">{{ t('customers.refundModal.notes') }}</label>
              <textarea
                v-model="refundNotes"
                rows="2"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-amber-500"
                :placeholder="t('customers.refundModal.notesPlaceholder')"
              />
            </div>
          </div>
          <div class="flex items-center justify-end gap-2 border-t border-gray-200 p-4">
            <button class="btn-secondary" @click="closeRefund">{{ t('common.cancel') }}</button>
            <button
              class="rounded-lg bg-amber-600 px-4 py-2 font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
              :disabled="refundMutation.isPending.value || refundAmount <= 0"
              @click="submitRefund"
            >
              <span v-if="refundMutation.isPending.value" class="flex items-center gap-2">
                <span class="h-4 w-4 animate-spin rounded-full border-b-2 border-white" /> {{ t('common.loading') }}
              </span>
              <span v-else>{{ t('customers.refundModal.confirm') }}</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
