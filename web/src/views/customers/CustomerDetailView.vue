<script setup>
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import {
  ArrowLeftIcon,
  ArrowUturnLeftIcon,
  BanknotesIcon,
  ChatBubbleLeftEllipsisIcon,
  CreditCardIcon,
  EnvelopeIcon,
  ExclamationCircleIcon,
  IdentificationIcon,
  MapPinIcon,
  PencilIcon,
  PhoneIcon,
  ShoppingBagIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';
import { customersApi } from '@/api/customers';
import { transactionsApi } from '@/api/transactions';
import { formatCurrency, formatShortDate, formatDateTime } from '@/utils/format';
import { apiErrorMessage } from '@/api/http';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const customerId = computed(() => route.params.id);

const { data: customer, isLoading } = useQuery({ queryKey: ['customer', customerId], queryFn: () => customersApi.getById(customerId.value) });
const { data: txData } = useQuery({
  queryKey: ['customer-transactions', customerId],
  queryFn: () => transactionsApi.getAll({ customerId: customerId.value, limit: 50 }),
});
const transactions = computed(() => txData.value?.transactions || []);
const { data: paymentsData } = useQuery({ queryKey: ['customer-payments', customerId], queryFn: () => customersApi.getPayments(customerId.value) });
const payments = computed(() => paymentsData.value?.payments || []);

const owes = computed(() => (customer.value?.balance || 0) < 0);
const debt = computed(() => Math.abs(customer.value?.balance || 0));
const hasCredit = computed(() => (customer.value?.balance || 0) > 0);
const credit = computed(() => Math.abs(customer.value?.balance || 0));
const maxAmount = computed(() => (hasCredit.value ? credit.value : debt.value));

// ── Payment / refund modal ──
const modalOpen = ref(false);
const form = ref({ amount: 0, method: 'cash', reference: '', notes: '' });
const error = ref(null);
const newBalance = computed(() => {
  const b = customer.value?.balance || 0;
  const a = form.value.amount || 0;
  return hasCredit.value ? b - a : b + a;
});
const isValid = computed(
  () => !!form.value.amount && form.value.amount > 0 && !!form.value.method && (form.value.method === 'cash' || !!form.value.reference?.trim()),
);
const validationErrors = computed(() => {
  const errs = [];
  if (!form.value.amount || form.value.amount <= 0) errs.push(t('customers.validation.amountRequired'));
  if (form.value.method !== 'cash' && !form.value.reference?.trim()) errs.push(t('customers.validation.referenceRequired'));
  return errs;
});
function resetForm() {
  form.value = { amount: 0, method: 'cash', reference: '', notes: '' };
  error.value = null;
}
function openModal() {
  resetForm();
  if (customer.value && customer.value.balance !== 0) form.value.amount = Math.abs(customer.value.balance);
  modalOpen.value = true;
}
const payMutation = useMutation({
  mutationFn: () =>
    customersApi.addPayment(customerId.value, {
      amount: form.value.amount,
      method: form.value.method,
      reference: form.value.reference || undefined,
      notes: form.value.notes || undefined,
    }),
  onSuccess: () => {
    for (const key of [['customer', customerId], ['customer-payments', customerId], ['customer-transactions', customerId], ['customers'], ['dashboard']]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
    modalOpen.value = false;
    resetForm();
  },
  onError: (e) => (error.value = apiErrorMessage(e, t('customers.paymentError'))),
});
function submit() {
  error.value = null;
  if (!isValid.value) {
    error.value = validationErrors.value[0] || t('customers.validation.invalidForm');
    return;
  }
  payMutation.mutate();
}

const methodLabel = (m) =>
  ({ cash: t('payment.cash'), card: t('payment.card'), bank_transfer: t('payment.transfer'), check: t('payment.check'), mobile_money: t('payment.mobile') })[m] ||
  m;
const statusBadge = (s) => ({ completed: 'badge-success', pending: 'badge-warning', partial: 'badge-info' })[s] || 'badge-secondary';
const METHODS = computed(() => [
  { value: 'cash', label: t('payment.cash'), icon: '💵' },
  { value: 'card', label: t('payment.card'), icon: '💳' },
  { value: 'bank_transfer', label: t('payment.transfer'), icon: '🏦' },
  { value: 'check', label: t('payment.check'), icon: '📝' },
]);
</script>

<template>
  <div class="max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4">
        <button class="rounded-lg p-2 hover:bg-gray-100" @click="router.back()"><ArrowLeftIcon class="h-5 w-5 text-gray-600 rtl:rotate-180" /></button>
        <div v-if="customer">
          <h1 class="text-2xl font-bold text-gray-900">{{ customer.firstName }} {{ customer.lastName }}</h1>
          <p class="text-sm text-gray-500">{{ t('customers.customerSince', { date: formatShortDate(customer.createdAt) }) }}</p>
        </div>
      </div>
      <RouterLink v-if="customer" :to="`/app/customers/${customer.id}/edit`" class="btn-secondary inline-flex items-center gap-2">
        <PencilIcon class="h-5 w-5" /> {{ t('common.edit') }}
      </RouterLink>
    </div>

    <div v-if="isLoading" class="card p-8 text-center"><div class="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-black" /></div>

    <template v-else-if="customer">
      <div v-if="owes" class="card border-danger-200 bg-danger-50 p-4">
        <div class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div class="flex items-center gap-3">
            <div class="flex h-12 w-12 items-center justify-center rounded-full bg-danger-100"><BanknotesIcon class="h-6 w-6 text-danger-600" /></div>
            <div>
              <p class="font-semibold text-danger-900">{{ t('customers.customerOwes') }}</p>
              <p class="text-2xl font-bold text-danger-700">{{ formatCurrency(debt) }}</p>
            </div>
          </div>
          <button class="btn-primary inline-flex items-center gap-2" @click="openModal"><BanknotesIcon class="h-5 w-5" /> {{ t('customers.recordPayment') }}</button>
        </div>
      </div>
      <div v-if="hasCredit" class="card border-amber-200 bg-amber-50 p-4">
        <div class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div class="flex items-center gap-3">
            <div class="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100"><BanknotesIcon class="h-6 w-6 text-amber-600" /></div>
            <div>
              <p class="font-semibold text-amber-900">{{ t('customers.customerCredit') }}</p>
              <p class="text-2xl font-bold text-amber-700">{{ formatCurrency(credit) }}</p>
              <p class="text-sm text-amber-600">{{ t('customers.creditExplanation') }}</p>
            </div>
          </div>
          <button class="btn-primary inline-flex items-center gap-2" @click="openModal"><BanknotesIcon class="h-5 w-5" /> {{ t('customers.recordRefund') }}</button>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div class="card p-4">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-success-100"><ShoppingBagIcon class="h-5 w-5 text-success-600" /></div>
            <div>
              <p class="text-sm text-gray-500">{{ t('customers.totalCollected') }}</p>
              <p class="text-xl font-bold text-gray-900">{{ formatCurrency(customer.totalSpent || 0) }}</p>
            </div>
          </div>
        </div>
        <div v-if="(customer.totalRefunded || 0) > 0" class="card p-4">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100"><ArrowUturnLeftIcon class="h-5 w-5 text-amber-600" /></div>
            <div>
              <p class="text-sm text-gray-500">{{ t('customers.refunds') }}</p>
              <p class="text-xl font-bold text-amber-600">{{ formatCurrency(customer.totalRefunded || 0) }}</p>
            </div>
          </div>
        </div>
        <div class="card p-4">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100"><CreditCardIcon class="h-5 w-5 text-primary-600" /></div>
            <div>
              <p class="text-sm text-gray-500">{{ t('nav.transactions') }}</p>
              <p class="text-xl font-bold text-gray-900">{{ customer.transactionCount || 0 }}</p>
            </div>
          </div>
        </div>
        <div class="card p-4">
          <div class="flex items-center gap-3">
            <div :class="['flex h-10 w-10 items-center justify-center rounded-full', owes ? 'bg-danger-100' : hasCredit ? 'bg-success-100' : 'bg-gray-100']">
              <CreditCardIcon :class="['h-5 w-5', owes ? 'text-danger-600' : hasCredit ? 'text-success-600' : 'text-gray-600']" />
            </div>
            <div>
              <p class="text-sm text-gray-500">{{ hasCredit ? t('customers.creditShort') : t('customers.remainingToPay') }}</p>
              <p :class="['text-xl font-bold', owes ? 'text-danger-600' : hasCredit ? 'text-success-600' : 'text-gray-900']">
                {{ formatCurrency(Math.abs(customer.balance || 0), 'DH', hasCredit ? '+' : '') }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div class="card p-6">
          <h2 class="mb-4 font-semibold text-gray-900">{{ t('customers.contactInfo') }}</h2>
          <div class="space-y-4">
            <div class="flex items-center gap-3">
              <PhoneIcon class="h-5 w-5 text-gray-400" />
              <div>
                <p class="text-sm text-gray-500">{{ t('customers.phone') }}</p>
                <p class="font-medium">{{ customer.phone || '-' }}</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <EnvelopeIcon class="h-5 w-5 text-gray-400" />
              <div>
                <p class="text-sm text-gray-500">{{ t('customers.email') }}</p>
                <p class="font-medium">{{ customer.email || '-' }}</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <MapPinIcon class="h-5 w-5 text-gray-400" />
              <div>
                <p class="text-sm text-gray-500">{{ t('customers.address') }}</p>
                <p class="font-medium">{{ [customer.address, customer.city].filter(Boolean).join(', ') || '-' }}</p>
              </div>
            </div>
            <div v-if="customer.cin" class="flex items-center gap-3">
              <IdentificationIcon class="h-5 w-5 text-gray-400" />
              <div>
                <p class="text-sm text-gray-500">{{ t('customers.cin') }}</p>
                <p class="font-medium">{{ customer.cin }}</p>
              </div>
            </div>
            <div v-if="customer.ice" class="flex items-center gap-3">
              <IdentificationIcon class="h-5 w-5 text-gray-400" />
              <div>
                <p class="text-sm text-gray-500">{{ t('customers.ice') }}</p>
                <p class="font-medium">{{ customer.ice }}</p>
              </div>
            </div>
          </div>
        </div>
        <div v-if="customer.notes" class="card p-6">
          <h2 class="mb-4 flex items-center gap-2 font-semibold text-gray-900">
            <ChatBubbleLeftEllipsisIcon class="h-5 w-5 text-gray-400" /> {{ t('customers.notes') }}
          </h2>
          <p class="whitespace-pre-line text-gray-700">{{ customer.notes }}</p>
        </div>
      </div>

      <div class="card overflow-hidden">
        <div class="border-b border-gray-200 p-4"><h2 class="font-semibold text-gray-900">{{ t('customers.transactionHistory') }}</h2></div>
        <div v-if="transactions.length" class="divide-y divide-gray-100">
          <RouterLink v-for="tx in transactions" :key="tx.id" :to="`/app/transactions/${tx.id}`" class="flex items-center justify-between p-4 hover:bg-gray-50">
            <div>
              <div class="flex items-center gap-2">
                <p class="font-medium text-gray-900">{{ tx.transactionNumber }}</p>
                <span v-if="tx.type === 'reservation'" class="rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700">{{ t('customers.reservationTag') }}</span>
              </div>
              <p class="text-sm text-gray-500">{{ formatShortDate(tx.createdAt) }}</p>
              <p v-if="tx.items?.length" class="mt-0.5 line-clamp-1 text-xs text-gray-400">{{ tx.items.map((i) => i.productName).join(', ') }}</p>
            </div>
            <div class="text-end">
              <p class="font-bold text-gray-900">{{ formatCurrency(tx.totalAmount) }}</p>
              <div v-if="tx.status === 'partial' || (tx.type === 'reservation' && Number(tx.amountRemaining) > 0)" class="mt-0.5 flex items-center justify-end gap-2">
                <span class="text-xs text-success-600">{{ formatCurrency(tx.amountPaid) }} {{ t('customers.paidShort') }}</span>
                <span class="text-xs text-gray-400">·</span>
                <span class="text-xs text-danger-600">{{ formatCurrency(tx.amountRemaining) }} {{ t('customers.dueShort') }}</span>
              </div>
              <span v-else :class="['badge text-xs', statusBadge(tx.status)]">{{ t(`transactions.status.${tx.status}`) }}</span>
            </div>
          </RouterLink>
        </div>
        <div v-else class="p-8 text-center text-gray-500">{{ t('transactions.noTransactions') }}</div>
      </div>

      <div class="card overflow-hidden">
        <div class="flex items-center justify-between border-b border-gray-200 p-4">
          <div class="flex items-center gap-2">
            <BanknotesIcon class="h-5 w-5 text-gray-500" />
            <h2 class="font-semibold text-gray-900">{{ t('customers.paymentHistory') }}</h2>
            <span v-if="payments.length" class="text-sm text-gray-500">({{ payments.length }})</span>
          </div>
        </div>
        <div v-if="payments.length" class="divide-y divide-gray-100">
          <div v-for="p in payments" :key="p.id" class="flex items-center justify-between px-5 py-3">
            <div class="flex items-center gap-3">
              <div
                :class="[
                  'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full',
                  p.source === 'transaction' ? 'bg-blue-50' : p.amount < 0 ? 'bg-amber-50' : 'bg-success-50',
                ]"
              >
                <CreditCardIcon :class="['h-4 w-4', p.source === 'transaction' ? 'text-blue-600' : p.amount < 0 ? 'text-amber-600' : 'text-success-600']" />
              </div>
              <div>
                <p :class="['text-sm font-medium', p.amount < 0 ? 'text-amber-700' : 'text-gray-900']">
                  {{ formatCurrency(Math.abs(p.amount)) }} <span class="ms-1 text-xs font-normal text-gray-400">{{ methodLabel(p.method) }}</span>
                </p>
                <p class="text-xs text-gray-500">{{ formatDateTime(p.createdAt) }}</p>
                <p v-if="p.transactionNumber" class="text-xs text-primary-600">{{ p.transactionNumber }}</p>
              </div>
            </div>
            <div
              :class="[
                'flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium',
                p.source === 'transaction' ? 'bg-blue-100 text-blue-700' : p.amount < 0 ? 'bg-amber-100 text-amber-700' : 'bg-success-100 text-success-700',
              ]"
            >
              {{ p.source === 'transaction' ? t('customers.sourceTransaction') : p.amount < 0 ? t('customers.sourceRefund') : t('customers.sourcePayment') }}
            </div>
          </div>
        </div>
        <div v-else class="p-8 text-center text-gray-500">{{ t('customers.noPayments') }}</div>
      </div>
    </template>

    <Teleport to="body">
      <div v-if="modalOpen" class="modal-overlay" @click.self="modalOpen = false">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="text-lg font-bold text-gray-900">{{ hasCredit ? t('customers.recordRefund') : t('customers.recordPayment') }}</h3>
            <button class="rounded p-1 hover:bg-gray-100" @click="modalOpen = false"><XMarkIcon class="h-5 w-5" /></button>
          </div>
          <form class="flex min-h-0 flex-col" @submit.prevent="submit">
            <div class="modal-body space-y-4">
              <div v-if="error" class="flex items-start gap-3 rounded-lg border border-danger-200 bg-danger-50 p-4">
                <ExclamationCircleIcon class="mt-0.5 h-5 w-5 flex-shrink-0 text-danger-600" />
                <p class="text-sm font-medium text-danger-800">{{ error }}</p>
              </div>
              <div :class="['rounded-lg p-4', hasCredit ? 'bg-amber-50' : 'bg-gray-50']">
                <p :class="['mb-1 text-sm', hasCredit ? 'text-amber-600' : 'text-gray-600']">
                  {{ hasCredit ? t('customers.creditToRefund') : t('customers.currentDebt') }}
                </p>
                <p :class="['text-2xl font-bold', hasCredit ? 'text-amber-700' : 'text-danger-600']">{{ formatCurrency(maxAmount) }}</p>
              </div>
              <div>
                <label class="label">{{ hasCredit ? t('customers.amountToRefund') : t('payment.amount') }} *</label>
                <div class="relative">
                  <input
                    v-model.number="form.amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    :max="maxAmount"
                    :class="['input pe-16', { 'border-danger-500': form.amount <= 0 }]"
                    required
                  />
                  <span class="absolute end-3 top-1/2 -translate-y-1/2 text-gray-500">DH</span>
                </div>
                <div class="mt-2 flex items-center justify-between">
                  <button type="button" class="text-xs text-primary-600 hover:text-primary-800" @click="form.amount = maxAmount">
                    {{ hasCredit ? t('customers.refundAll') : t('customers.payFullAmount') }}
                  </button>
                  <p v-if="form.amount > maxAmount" class="text-xs text-warning-600">
                    {{ hasCredit ? t('customers.amountExceedsCredit') : t('customers.amountExceedsDebt') }}
                  </p>
                </div>
              </div>
              <div>
                <label class="label">{{ t('payment.method') }} *</label>
                <div class="grid grid-cols-2 gap-2">
                  <button
                    v-for="m in METHODS"
                    :key="m.value"
                    type="button"
                    :class="[
                      'flex items-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors',
                      form.method === m.value ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-700 hover:border-gray-300',
                    ]"
                    @click="form.method = m.value"
                  >
                    <span>{{ m.icon }}</span><span>{{ m.label }}</span>
                  </button>
                </div>
              </div>
              <div v-if="form.method !== 'cash'">
                <label class="label">{{ t('customers.reference') }} * <span class="font-normal text-gray-400">({{ t('customers.referenceHelp') }})</span></label>
                <input
                  v-model="form.reference"
                  type="text"
                  :class="['input', { 'border-danger-500': !form.reference?.trim() }]"
                  :placeholder="form.method === 'check' ? t('customers.checkNumberPlaceholder') : t('customers.bankRefPlaceholder')"
                  required
                />
              </div>
              <div>
                <label class="label">{{ t('customers.notes') }} <span class="font-normal text-gray-400">({{ t('common.optional') }})</span></label>
                <textarea v-model="form.notes" class="input" rows="2" :placeholder="t('customers.paymentNotesPlaceholder')" />
              </div>
              <div v-if="form.amount > 0 && customer" :class="['rounded-lg p-4', newBalance === 0 ? 'bg-success-50' : 'bg-gray-50']">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="mb-1 text-sm text-gray-600">{{ t('customers.newBalance') }}</p>
                    <p :class="['text-xl font-bold', newBalance === 0 ? 'text-success-600' : newBalance > 0 ? 'text-amber-600' : 'text-danger-600']">
                      {{ formatCurrency(Math.abs(newBalance)) }}
                      <span v-if="newBalance !== 0" class="text-sm font-normal">({{ newBalance > 0 ? t('customers.creditTag') : t('customers.debtShort') }})</span>
                    </p>
                  </div>
                  <div v-if="newBalance === 0" class="text-sm font-medium text-success-600">
                    ✓ {{ hasCredit ? t('customers.refundComplete') : t('customers.debtCleared') }}
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn-secondary" @click="modalOpen = false">{{ t('common.cancel') }}</button>
              <button type="submit" class="btn-primary" :disabled="payMutation.isPending.value || !isValid">
                <span v-if="payMutation.isPending.value" class="flex items-center gap-2">
                  <span class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> {{ t('common.saving') }}
                </span>
                <span v-else>{{ t('customers.confirmPayment') }}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>
