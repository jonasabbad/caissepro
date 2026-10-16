<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import {
  ArrowPathIcon,
  ArrowTrendingDownIcon,
  ArrowTrendingUpIcon,
  BuildingStorefrontIcon,
  ExclamationTriangleIcon,
  PhoneIcon,
  ScaleIcon,
  UsersIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';
import { customersApi } from '@/api/customers';
import { suppliersApi } from '@/api/suppliers';
import { reservationRefundsApi } from '@/api/reservations';
import { useAuthStore } from '@/stores/auth';
import { formatCurrency } from '@/utils/format';

/** Who owes the shop (negative customer balance), whom the shop owes (suppliers), and deposits to give back. */
const { t } = useI18n();
const queryClient = useQueryClient();
const auth = useAuthStore();
const tab = ref('customers');
const isPhoneSeller = computed(() => auth.activityType === 'phone_seller');

// The customer list is paginated here (the original returned everything), so fetch the maximum page.
const { data: customersData, isLoading: customersLoading } = useQuery({ queryKey: ['customers', 'debts'], queryFn: () => customersApi.getAll({ limit: 500 }) });
const { data: suppliersData, isLoading: suppliersLoading } = useQuery({ queryKey: ['suppliers', 'debts'], queryFn: () => suppliersApi.getAll({ limit: 500 }) });
const { data: refundsData, isLoading: refundsLoading } = useQuery({
  queryKey: ['pending-refunds'],
  queryFn: () => reservationRefundsApi.getPending(),
  enabled: isPhoneSeller,
});
const refunds = computed(() => refundsData.value || []);

const debtors = computed(() => (customersData.value?.customers || []).filter((c) => c.balance < 0).sort((a, b) => a.balance - b.balance));
const creditors = computed(() => (suppliersData.value?.suppliers || []).filter((s) => s.balance < 0).sort((a, b) => a.balance - b.balance));
const toReceive = computed(() => debtors.value.reduce((s, c) => s + Math.abs(c.balance), 0));
const toPay = computed(() => creditors.value.reduce((s, x) => s + Math.abs(x.balance), 0));
const refundsDue = computed(() => refunds.value.reduce((s, r) => s + Number(r.depositAmount) - Number(r.refundedAmount), 0));
const net = computed(() => toReceive.value - toPay.value - refundsDue.value);
const initials = (name) =>
  name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

const showRefund = ref(false);
const refund = ref(null);
const refundAmount = ref(0);
const refundNotes = ref('');
const refundError = ref('');
function openRefund(r) {
  refund.value = r;
  refundAmount.value = Number(r.depositAmount) - Number(r.refundedAmount);
  refundNotes.value = '';
  refundError.value = '';
  showRefund.value = true;
}
function closeRefund() {
  showRefund.value = false;
  refund.value = null;
  refundAmount.value = 0;
  refundNotes.value = '';
  refundError.value = '';
}
const recordRefund = useMutation({
  mutationFn: ({ id, amount, notes }) => reservationRefundsApi.recordPayment(id, { amount, notes }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['pending-refunds'] });
    closeRefund();
  },
  onError: (e) => (refundError.value = e.response?.data?.message || t('debts.refundError')),
});
function submitRefund() {
  if (!refund.value || refundAmount.value <= 0) return;
  recordRefund.mutate({ id: refund.value.id, amount: refundAmount.value, notes: refundNotes.value || undefined });
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">{{ t('debts.title') }}</h1>
      <p class="text-gray-500 mt-1">{{ t('debts.subtitle') }}</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="card p-5">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500">{{ t('debts.customerDebts') }}</p>
            <p class="text-2xl font-bold text-success-600 mt-1">{{ formatCurrency(toReceive) }}</p>
            <p class="text-xs text-gray-400 mt-1">{{ debtors.length }} {{ t('debts.debtorCustomers') }}</p>
          </div>
          <div class="w-12 h-12 rounded-full bg-success-100 flex items-center justify-center"><ArrowTrendingUpIcon class="w-6 h-6 text-success-600" /></div>
        </div>
      </div>
      <div class="card p-5">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500">{{ t('debts.supplierDebts') }}</p>
            <p class="text-2xl font-bold text-danger-600 mt-1">{{ formatCurrency(toPay) }}</p>
            <p class="text-xs text-gray-400 mt-1">{{ creditors.length }} {{ t('debts.debtorSuppliers') }}</p>
          </div>
          <div class="w-12 h-12 rounded-full bg-danger-100 flex items-center justify-center"><ArrowTrendingDownIcon class="w-6 h-6 text-danger-600" /></div>
        </div>
      </div>
      <div class="card p-5">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500">{{ t('debts.netPosition') }}</p>
            <p :class="['text-2xl font-bold mt-1', net >= 0 ? 'text-success-600' : 'text-danger-600']">{{ net >= 0 ? '+' : '' }}{{ formatCurrency(net) }}</p>
            <p class="text-xs text-gray-400 mt-1">{{ net >= 0 ? t('debts.toReceive') : t('debts.toPay') }}</p>
          </div>
          <div :class="['w-12 h-12 rounded-full flex items-center justify-center', net >= 0 ? 'bg-success-100' : 'bg-danger-100']">
            <ScaleIcon :class="['w-6 h-6', net >= 0 ? 'text-success-600' : 'text-danger-600']" />
          </div>
        </div>
      </div>
    </div>

    <div class="card overflow-hidden">
      <div class="border-b border-gray-200 overflow-x-auto">
        <nav class="flex">
          <button
            :class="['px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap', tab === 'customers' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700']"
            @click="tab = 'customers'"
          >
            <span class="flex items-center gap-2">
              <UsersIcon class="w-4 h-4" /> {{ t('debts.customersTab') }}
              <span class="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">{{ debtors.length }}</span>
            </span>
          </button>
          <button
            :class="['px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap', tab === 'suppliers' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700']"
            @click="tab = 'suppliers'"
          >
            <span class="flex items-center gap-2">
              <BuildingStorefrontIcon class="w-4 h-4" /> {{ t('debts.suppliersTab') }}
              <span class="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">{{ creditors.length }}</span>
            </span>
          </button>
          <button
            v-if="isPhoneSeller"
            :class="['px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap', tab === 'refunds' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700']"
            @click="tab = 'refunds'"
          >
            <span class="flex items-center gap-2">
              <ArrowPathIcon class="w-4 h-4" /> {{ t('debts.refundsTab') }}
              <span v-if="refunds.length" class="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700">{{ refunds.length }}</span>
            </span>
          </button>
        </nav>
      </div>

      <div v-if="tab === 'customers'">
        <div v-if="customersLoading" class="p-8 text-center text-gray-500">{{ t('common.loading') }}</div>
        <div v-else-if="!debtors.length" class="p-8 text-center text-gray-500">
          <UsersIcon class="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>{{ t('debts.noCustomerDebt') }}</p>
        </div>
        <div v-else class="divide-y divide-gray-100">
          <RouterLink v-for="c in debtors" :key="c.id" :to="`/app/customers/${c.id}`" class="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                <span class="text-sm font-medium text-gray-600">{{ initials(`${c.firstName} ${c.lastName}`) }}</span>
              </div>
              <div>
                <p class="font-medium text-gray-900">{{ c.firstName }} {{ c.lastName }}</p>
                <p v-if="c.phone" class="text-sm text-gray-500 flex items-center gap-1"><PhoneIcon class="w-3.5 h-3.5" /> {{ c.phone }}</p>
              </div>
            </div>
            <div class="text-end">
              <p class="font-bold text-success-600">{{ formatCurrency(Math.abs(c.balance)) }}</p>
              <p class="text-xs text-gray-400">{{ t('debts.toReceive') }}</p>
            </div>
          </RouterLink>
        </div>
      </div>

      <div v-if="tab === 'suppliers'">
        <div v-if="suppliersLoading" class="p-8 text-center text-gray-500">{{ t('common.loading') }}</div>
        <div v-else-if="!creditors.length" class="p-8 text-center text-gray-500">
          <BuildingStorefrontIcon class="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>{{ t('debts.noSupplierDebt') }}</p>
        </div>
        <div v-else class="divide-y divide-gray-100">
          <RouterLink v-for="s in creditors" :key="s.id" :to="`/app/suppliers/${s.id}`" class="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-warning-100 flex items-center justify-center"><BuildingStorefrontIcon class="w-6 h-6 text-warning-600" /></div>
              <div>
                <p class="font-medium text-gray-900">{{ s.name }}</p>
                <p v-if="s.phone" class="text-sm text-gray-500 flex items-center gap-1"><PhoneIcon class="w-3.5 h-3.5" /> {{ s.phone }}</p>
              </div>
            </div>
            <div class="text-end">
              <p class="font-bold text-danger-600">{{ formatCurrency(Math.abs(s.balance)) }}</p>
              <p class="text-xs text-gray-400">{{ t('debts.toPay') }}</p>
            </div>
          </RouterLink>
        </div>
      </div>

      <div v-if="tab === 'refunds' && isPhoneSeller">
        <div v-if="refundsLoading" class="p-8 text-center text-gray-500">{{ t('common.loading') }}</div>
        <div v-else-if="!refunds.length" class="p-8 text-center text-gray-500">
          <ArrowPathIcon class="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>{{ t('debts.noRefunds') }}</p>
        </div>
        <div v-else class="divide-y divide-gray-100">
          <div v-for="r in refunds" :key="r.id" class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-gray-50 transition-colors">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                <span class="text-sm font-medium text-purple-700">{{ initials(`${r.customer?.firstName || ''} ${r.customer?.lastName || ''}`) }}</span>
              </div>
              <div>
                <p class="font-medium text-gray-900">{{ r.customer?.firstName }} {{ r.customer?.lastName }}</p>
                <p class="text-sm text-gray-500">{{ r.soldUnit?.brand }} {{ r.soldUnit?.model }}</p>
                <p v-if="r.customer?.phone" class="text-xs text-gray-400 flex items-center gap-1"><PhoneIcon class="w-3 h-3" /> {{ r.customer.phone }}</p>
              </div>
            </div>
            <div class="flex items-center gap-4">
              <div class="text-end">
                <p class="font-bold text-purple-700">{{ formatCurrency(Number(r.depositAmount) - Number(r.refundedAmount)) }}</p>
                <p class="text-xs text-gray-400">{{ t('debts.remaining') }}</p>
              </div>
              <button class="btn-primary btn-sm bg-purple-600 hover:bg-purple-700" @click="openRefund(r)">{{ t('debts.recordRefund') }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="net < -10000" class="bg-warning-50 border border-warning-200 rounded-xl p-4">
      <div class="flex items-start gap-3">
        <ExclamationTriangleIcon class="w-5 h-5 text-warning-600 mt-0.5" />
        <div>
          <p class="font-medium text-warning-800">{{ t('debts.highDebtWarning') }}</p>
          <p class="text-sm text-warning-700 mt-1">{{ t('debts.highDebtMessage', { amount: formatCurrency(Math.abs(net)) }) }}</p>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showRefund && refund" class="modal-overlay" @click.self="closeRefund">
        <div class="modal-content max-w-md">
          <div class="modal-header">
            <h3 class="text-lg font-bold text-gray-900">{{ t('debts.recordRefund') }}</h3>
            <button class="p-1 hover:bg-gray-100 rounded" @click="closeRefund"><XMarkIcon class="w-5 h-5" /></button>
          </div>
          <div class="modal-body space-y-4">
            <div v-if="refundError" class="bg-danger-50 border border-danger-200 rounded-lg p-3"><p class="text-sm text-danger-700">{{ refundError }}</p></div>
            <div class="bg-gray-50 rounded-lg p-4">
              <p class="font-medium text-gray-900">{{ refund.customer?.firstName }} {{ refund.customer?.lastName }}</p>
              <p class="text-sm text-gray-500">{{ refund.soldUnit?.brand }} {{ refund.soldUnit?.model }}</p>
            </div>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between"><span class="text-gray-500">{{ t('debts.depositPaid') }}</span><span class="font-medium">{{ formatCurrency(Number(refund.depositAmount)) }}</span></div>
              <div class="flex justify-between"><span class="text-gray-500">{{ t('debts.alreadyRefunded') }}</span><span class="font-medium">{{ formatCurrency(Number(refund.refundedAmount)) }}</span></div>
              <div class="flex justify-between pt-2 border-t border-gray-200">
                <span class="font-semibold text-gray-900">{{ t('debts.remaining') }}</span>
                <span class="font-bold text-purple-700">{{ formatCurrency(Number(refund.depositAmount) - Number(refund.refundedAmount)) }}</span>
              </div>
            </div>
            <div>
              <label class="label">{{ t('debts.refundAmount') }}</label>
              <input
                v-model.number="refundAmount"
                type="number"
                class="input text-lg text-center font-bold"
                step="0.01"
                min="0"
                :max="Number(refund.depositAmount) - Number(refund.refundedAmount)"
              />
            </div>
            <div>
              <label class="label">{{ t('customers.notes') }}</label>
              <textarea v-model="refundNotes" class="input" rows="2" :placeholder="t('customers.paymentNotesPlaceholder')" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" @click="closeRefund">{{ t('common.cancel') }}</button>
            <button class="btn-primary bg-purple-600 hover:bg-purple-700" :disabled="recordRefund.isPending.value || refundAmount <= 0" @click="submitRefund">
              <span v-if="recordRefund.isPending.value" class="flex items-center gap-2"><span class="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> {{ t('common.loading') }}</span>
              <span v-else>{{ t('debts.confirmRefund') }}</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
