<script setup>
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import {
  ArrowLeftIcon,
  ArrowsRightLeftIcon,
  BanknotesIcon,
  CheckCircleIcon,
  CreditCardIcon,
  DevicePhoneMobileIcon,
  DocumentTextIcon,
  ExclamationCircleIcon,
  PhoneIcon,
  PrinterIcon,
  ShieldCheckIcon,
  UserIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';
import { transactionsApi } from '@/api/transactions';
import { useAuthStore } from '@/stores/auth';
import { formatCurrency } from '@/utils/format';
import ReceiptModal from '@/components/pos/ReceiptModal.vue';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const queryClient = useQueryClient();

const id = computed(() => route.params.id);
const { data: tx, isLoading, refetch } = useQuery({ queryKey: ['transaction', id], queryFn: () => transactionsApi.getById(id.value) });

const remaining = computed(() => Number(tx.value?.amountRemaining) || 0);
const canCollect = computed(() => !!tx.value && remaining.value > 0 && (tx.value.status === 'partial' || tx.value.status === 'pending'));

// Collect the balance of a credit sale / reservation
const showPayment = ref(false);
const form = ref({ amount: 0, method: 'cash', reference: '' });
const paymentError = ref(null);
const resetForm = () => {
  form.value = { amount: 0, method: 'cash', reference: '' };
  paymentError.value = null;
};
const pay = useMutation({
  mutationFn: () => transactionsApi.addPayment(id.value, { method: form.value.method, amount: form.value.amount, reference: form.value.reference || undefined }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['transaction', id] });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    showPayment.value = false;
    resetForm();
    refetch();
  },
  onError: (e) => (paymentError.value = e?.response?.data?.message || e?.message || 'Erreur lors du paiement'),
});
function openPayment() {
  resetForm();
  form.value.amount = remaining.value;
  showPayment.value = true;
}
function submitPayment() {
  paymentError.value = null;
  if (!form.value.amount || form.value.amount <= 0) {
    paymentError.value = 'Montant invalide';
    return;
  }
  if (form.value.method !== 'cash' && !form.value.reference?.trim()) {
    paymentError.value = 'Référence requise pour ce mode de paiement';
    return;
  }
  pay.mutate();
}
const METHODS = [
  { value: 'cash', label: 'Espèces', icon: '💵' },
  { value: 'card', label: 'Carte', icon: '💳' },
  { value: 'bank_transfer', label: 'Virement', icon: '🏦' },
  { value: 'check', label: 'Chèque', icon: '📝' },
];
const METHOD_LABEL = { cash: 'Espèces', card: 'Carte', bank_transfer: 'Virement', check: 'Chèque', credit: 'Crédit' };

const formatLong = (d) =>
  new Date(d).toLocaleDateString('fr-MA', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const STATUS_BADGE = { completed: 'badge-success', pending: 'badge-warning', partial: 'badge-info', cancelled: 'badge-danger', refunded: 'badge-danger' };
const CONDITION_LABEL = { new: 'Neuf', new_no_box: 'Neuf sans boite', grade_a_plus: 'Grade A+', grade_a: 'Grade A', grade_b: 'Grade B', grade_c: 'Grade C' };
const CONDITION_CLASS = {
  new: 'bg-green-100 text-green-800',
  new_no_box: 'bg-green-100 text-green-800',
  grade_a_plus: 'bg-blue-100 text-blue-800',
  grade_a: 'bg-teal-100 text-teal-800',
  grade_b: 'bg-amber-100 text-amber-800',
  grade_c: 'bg-gray-100 text-gray-800',
};
const conditionClass = (c) => CONDITION_CLASS[c] || 'bg-gray-100 text-gray-700';

// The trade-in note duplicates the trade-in card, so it is hidden there.
const showNotes = computed(() => tx.value?.notes && !(tx.value.type === 'exchange' && tx.value.tradeInUnit && tx.value.notes.startsWith('Reprise:')));

const showReceipt = ref(false);
const receiptItems = computed(() =>
  (tx.value?.items || []).map((i) => ({ id: i.id, name: i.productName, retailPrice: Number(i.unitPrice), quantity: i.quantity, total: Number(i.totalPrice) })),
);
const receiptCustomer = computed(() => (tx.value?.customer ? `${tx.value.customer.firstName} ${tx.value.customer.lastName || ''}`.trim() : undefined));
const receiptMethod = computed(() => tx.value?.payments?.[0]?.method || 'cash');
const receiptChange = computed(() => {
  if (!tx.value) return 0;
  const paid = Number(tx.value.amountPaid) || 0;
  const total = Number(tx.value.totalAmount) || 0;
  return paid > total ? paid - total : 0;
});
</script>

<template>
  <div class="max-w-7xl space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div class="flex items-center gap-4">
        <button class="p-2 hover:bg-gray-100 rounded-lg" @click="router.back()"><ArrowLeftIcon class="w-5 h-5 text-gray-600" /></button>
        <div>
          <h1 class="text-2xl font-bold text-gray-900 font-mono">{{ tx?.transactionNumber || '...' }}</h1>
          <p class="text-sm text-gray-500 capitalize">{{ tx ? formatLong(tx.createdAt) : '...' }}</p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <span v-if="tx" :class="['badge text-sm', STATUS_BADGE[tx.status] || 'badge-secondary']">{{ t(`transactions.status.${tx.status}`) }}</span>
        <button class="btn-secondary inline-flex items-center gap-2" @click="tx && (showReceipt = true)"><PrinterIcon class="w-5 h-5" /> {{ t('common.print') }}</button>
      </div>
    </div>

    <div v-if="canCollect && tx" class="bg-amber-50 border border-amber-200 rounded-xl p-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center"><BanknotesIcon class="w-6 h-6 text-amber-600" /></div>
          <div>
            <p class="font-semibold text-amber-900">Montant restant à payer</p>
            <p class="text-2xl font-bold text-amber-700">{{ formatCurrency(remaining) }}</p>
          </div>
        </div>
        <button class="btn-primary inline-flex items-center gap-2" @click="openPayment"><BanknotesIcon class="w-5 h-5" /> Encaisser le paiement</button>
      </div>
    </div>

    <div v-if="isLoading" class="card p-8 text-center">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-black mx-auto" />
      <p class="text-gray-500 mt-2">{{ t('common.loading') }}</p>
    </div>

    <template v-else-if="tx">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="card p-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center"><UserIcon class="w-5 h-5 text-gray-500" /></div>
            <div>
              <p class="text-sm text-gray-500">{{ t('transactions.customer') }}</p>
              <RouterLink v-if="tx.customer" :to="`/app/customers/${tx.customer.id}`" class="font-medium text-gray-900 hover:underline">
                {{ tx.customer.firstName }} {{ tx.customer.lastName }}
              </RouterLink>
              <p v-else class="font-medium text-gray-900">{{ t('transactions.walkIn') }}</p>
              <p v-if="tx.employee" class="text-xs text-stone-500 mt-0.5">{{ t('employees.seller') }}: {{ tx.employee.firstName }} {{ tx.employee.lastName }}</p>
            </div>
          </div>
        </div>
        <div class="card p-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center"><DocumentTextIcon class="w-5 h-5 text-gray-500" /></div>
            <div>
              <p class="text-sm text-gray-500">{{ t('transactions.typeLabel') }}</p>
              <p class="font-medium text-gray-900">{{ t(`transactions.type.${tx.type}`) }}</p>
            </div>
          </div>
        </div>
        <div class="card p-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center"><CreditCardIcon class="w-5 h-5 text-gray-500" /></div>
            <div>
              <p class="text-sm text-gray-500">{{ t('transactions.paid') }}</p>
              <p class="font-medium text-gray-900">{{ formatCurrency(tx.amountPaid) }}</p>
            </div>
          </div>
        </div>
      </div>

      <div v-if="(tx.status === 'partial' || tx.type === 'reservation') && tx.amountRemaining > 0" class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="card p-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center"><BanknotesIcon class="w-5 h-5 text-gray-500" /></div>
            <div><p class="text-sm text-gray-500">Montant total</p><p class="font-semibold text-gray-900">{{ formatCurrency(tx.totalAmount) }}</p></div>
          </div>
        </div>
        <div class="card p-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-success-50 rounded-lg flex items-center justify-center"><CheckCircleIcon class="w-5 h-5 text-success-600" /></div>
            <div><p class="text-sm text-gray-500">Montant payé</p><p class="font-semibold text-success-600">{{ formatCurrency(tx.amountPaid) }}</p></div>
          </div>
        </div>
        <div class="card p-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-danger-50 rounded-lg flex items-center justify-center"><ExclamationCircleIcon class="w-5 h-5 text-danger-600" /></div>
            <div><p class="text-sm text-gray-500">Reste à payer</p><p class="font-semibold text-danger-600">{{ formatCurrency(tx.amountRemaining) }}</p></div>
          </div>
        </div>
      </div>

      <div v-if="showNotes" class="card p-4">
        <p class="text-sm text-gray-600">{{ tx.notes }}</p>
        <div v-if="tx.type === 'return' && tx.amountRemaining < 0" class="mt-3 p-3 bg-success-50 rounded-lg">
          <p class="text-sm font-medium text-success-700">Crédit client: {{ formatCurrency(Math.abs(tx.amountRemaining)) }}</p>
          <p class="text-xs text-success-600">Ce montant est dû au client</p>
        </div>
      </div>

      <div class="card overflow-hidden">
        <div class="p-4 border-b border-gray-200"><h2 class="font-semibold text-gray-900">Articles</h2></div>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-start text-sm font-medium text-gray-500">Produit</th>
                <th class="px-4 py-3 text-end text-sm font-medium text-gray-500">Prix</th>
                <th class="px-4 py-3 text-end text-sm font-medium text-gray-500">Qté</th>
                <th class="px-4 py-3 text-end text-sm font-medium text-gray-500">Total</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <tr v-for="item in tx.items" :key="item.id">
                <td class="px-4 py-3">
                  <p class="font-medium text-gray-900">{{ item.productName }}</p>
                  <p v-if="!item.soldUnit" class="text-sm text-gray-500">{{ item.sku }}</p>
                  <div v-else class="mt-1 space-y-1">
                    <p class="text-xs text-gray-500 font-mono">
                      <span v-if="item.soldUnit.imei">IMEI: {{ item.soldUnit.imei }}</span>
                      <span v-else-if="item.soldUnit.serialNumber">S/N: {{ item.soldUnit.serialNumber }}</span>
                    </p>
                    <p v-if="item.soldUnit.storage || item.soldUnit.ram || item.soldUnit.color" class="text-xs text-gray-500">
                      <span v-if="item.soldUnit.storage">{{ item.soldUnit.storage }}</span>
                      <span v-if="item.soldUnit.ram"> · {{ item.soldUnit.ram }} RAM</span>
                      <span v-if="item.soldUnit.color"> · {{ item.soldUnit.color }}</span>
                    </p>
                    <div class="flex flex-wrap items-center gap-2">
                      <span :class="['inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', conditionClass(item.soldUnit.condition)]">
                        {{ CONDITION_LABEL[item.soldUnit.condition] || item.soldUnit.condition }}
                      </span>
                      <span v-if="item.soldUnit.batteryHealth != null" class="text-xs text-gray-500">Batterie: {{ item.soldUnit.batteryHealth }}%</span>
                      <span v-if="item.soldUnit.hasWarranty && item.soldUnit.warrantyDays" class="inline-flex items-center gap-1 text-xs text-green-700">
                        <ShieldCheckIcon class="w-3 h-3" /> Garantie {{ item.soldUnit.warrantyDays }}j
                      </span>
                    </div>
                  </div>
                </td>
                <td class="px-4 py-3 text-end text-gray-600 whitespace-nowrap">{{ formatCurrency(item.unitPrice) }}</td>
                <td class="px-4 py-3 text-end text-gray-600">{{ item.quantity }}</td>
                <td class="px-4 py-3 text-end font-medium text-gray-900 whitespace-nowrap">{{ formatCurrency(item.totalPrice) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="tx.type === 'exchange' && tx.tradeInUnit" class="card p-4">
        <div class="flex items-center gap-2 mb-4">
          <ArrowsRightLeftIcon class="w-5 h-5 text-gray-500" />
          <h2 class="font-semibold text-gray-900">Appareil repris</h2>
        </div>
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center"><DevicePhoneMobileIcon class="w-5 h-5 text-gray-500" /></div>
            <div>
              <RouterLink :to="`/app/sold-units/${tx.tradeInUnit.id}`" class="font-medium text-gray-900 hover:underline">{{ tx.tradeInUnit.brand }} {{ tx.tradeInUnit.model }}</RouterLink>
              <p v-if="tx.tradeInUnit.storage || tx.tradeInUnit.color" class="text-sm text-gray-500">
                <span v-if="tx.tradeInUnit.storage">{{ tx.tradeInUnit.storage }}</span><span v-if="tx.tradeInUnit.color"> · {{ tx.tradeInUnit.color }}</span>
              </p>
              <p v-if="tx.tradeInUnit.imei" class="text-xs text-gray-500 font-mono">IMEI: {{ tx.tradeInUnit.imei }}</p>
              <div class="mt-1">
                <span :class="['inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', conditionClass(tx.tradeInUnit.condition)]">
                  {{ CONDITION_LABEL[tx.tradeInUnit.condition] || tx.tradeInUnit.condition }}
                </span>
              </div>
            </div>
          </div>
          <div class="text-end">
            <p class="text-sm text-gray-500">Valeur de reprise</p>
            <p class="text-lg font-bold text-green-700">{{ formatCurrency(tx.tradeInUnit.tradeInValue) }}</p>
          </div>
        </div>
        <div v-if="tx.tradeInUnit.tradeInFromCustomer" class="mt-4 pt-4 border-t border-gray-100 flex items-center gap-3">
          <UserIcon class="w-4 h-4 text-gray-400" />
          <span class="text-sm text-gray-700">{{ tx.tradeInUnit.tradeInFromCustomer.firstName }} {{ tx.tradeInUnit.tradeInFromCustomer.lastName }}</span>
          <a
            v-if="tx.tradeInUnit.tradeInFromCustomer.phone"
            :href="`tel:${tx.tradeInUnit.tradeInFromCustomer.phone}`"
            class="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-800"
          >
            <PhoneIcon class="w-3.5 h-3.5" /> {{ tx.tradeInUnit.tradeInFromCustomer.phone }}
          </a>
        </div>
      </div>

      <div class="card p-4">
        <div class="space-y-2">
          <div class="flex justify-between text-sm"><span class="text-gray-500">Sous-total</span><span class="font-medium">{{ formatCurrency(tx.subtotal) }}</span></div>
          <div v-if="tx.taxAmount > 0" class="flex justify-between text-sm"><span class="text-gray-500">TVA (20%)</span><span class="font-medium">{{ formatCurrency(tx.taxAmount) }}</span></div>
          <div v-if="Number(tx.discountAmount) > 0" class="flex justify-between text-sm">
            <span class="text-gray-500">Remise</span><span class="font-medium text-danger-600">-{{ formatCurrency(tx.discountAmount) }}</span>
          </div>
          <div v-else-if="Number(tx.discountAmount) < 0" class="flex justify-between text-sm">
            <span class="text-gray-500">Supplément</span><span class="font-medium text-success-600">+{{ formatCurrency(-Number(tx.discountAmount)) }}</span>
          </div>
          <div class="flex justify-between pt-2 border-t border-gray-200">
            <span class="text-lg font-bold text-gray-900">Total</span><span class="text-lg font-bold text-gray-900">{{ formatCurrency(tx.totalAmount) }}</span>
          </div>
          <div :class="['flex justify-between text-sm', tx.totalProfit > 0 ? 'text-success-600' : tx.totalProfit < 0 ? 'text-danger-600' : 'text-gray-500']">
            <span>Profit</span><span class="font-medium">{{ tx.totalProfit > 0 ? '+' : '' }}{{ formatCurrency(tx.totalProfit) }}</span>
          </div>
        </div>
      </div>

      <div v-if="tx.payments?.length" class="card p-4">
        <h2 class="font-semibold text-gray-900 mb-4">Paiements</h2>
        <div class="space-y-2">
          <div v-for="p in tx.payments" :key="p.id" class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div class="flex items-center gap-3">
              <CreditCardIcon class="w-5 h-5 text-gray-400" />
              <div>
                <span class="font-medium text-gray-900">{{ METHOD_LABEL[p.method] || p.method }}</span>
                <p v-if="p.reference" class="text-xs text-gray-500">{{ p.reference }}</p>
              </div>
            </div>
            <span class="font-medium text-gray-900">{{ formatCurrency(p.amount) }}</span>
          </div>
        </div>
      </div>
    </template>

    <ReceiptModal
      v-if="tx"
      :is-open="showReceipt"
      :transaction-number="tx.transactionNumber"
      :items="receiptItems"
      :subtotal="Number(tx.subtotal) || Number(tx.totalAmount)"
      :tax="Number(tx.taxAmount) || 0"
      :total="Number(tx.totalAmount)"
      :amount-paid="Number(tx.amountPaid) || Number(tx.totalAmount)"
      :change="receiptChange"
      :payment-method="receiptMethod"
      :customer-name="receiptCustomer"
      :store-name="auth.storeName || 'CaissePro'"
      :cashier-name="auth.currentUser ? `${auth.currentUser.firstName} ${auth.currentUser.lastName}` : undefined"
      :date="tx.createdAt"
      @close="showReceipt = false"
    />

    <Teleport to="body">
      <div v-if="showPayment" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" @click.self="showPayment = false">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-md">
          <div class="flex items-center justify-between p-4 border-b">
            <h3 class="text-lg font-bold text-gray-900">Encaisser le paiement</h3>
            <button class="p-1 hover:bg-gray-100 rounded" @click="showPayment = false"><XMarkIcon class="w-5 h-5" /></button>
          </div>
          <form @submit.prevent="submitPayment">
            <div class="p-4 space-y-4">
              <div v-if="paymentError" class="flex items-start gap-2 p-3 bg-danger-50 border border-danger-200 rounded-lg">
                <ExclamationCircleIcon class="w-5 h-5 text-danger-600 flex-shrink-0 mt-0.5" />
                <p class="text-sm text-danger-700">{{ paymentError }}</p>
              </div>
              <div class="bg-gray-50 rounded-lg p-4">
                <p class="text-sm text-gray-600 mb-1">Transaction</p>
                <p class="font-mono font-medium text-gray-900">{{ tx?.transactionNumber }}</p>
                <div class="flex justify-between text-sm mt-3"><span class="text-gray-500">Total</span><span>{{ formatCurrency(tx?.totalAmount || 0) }}</span></div>
                <div class="flex justify-between text-sm"><span class="text-gray-500">Déjà payé</span><span>{{ formatCurrency(tx?.amountPaid || 0) }}</span></div>
                <div class="flex justify-between text-sm mt-1 pt-1 border-t border-gray-200">
                  <span class="text-amber-700 font-medium">Reste à payer</span><span class="font-bold text-amber-700">{{ formatCurrency(remaining) }}</span>
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Montant *</label>
                <div class="relative">
                  <input
                    v-model.number="form.amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    :max="remaining"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent pe-16"
                    required
                  />
                  <span class="absolute end-3 top-1/2 -translate-y-1/2 text-gray-500">DH</span>
                </div>
                <button type="button" class="text-xs text-primary-600 hover:text-primary-800 mt-1" @click="form.amount = remaining">Payer le montant total</button>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Mode de paiement *</label>
                <div class="grid grid-cols-2 gap-2">
                  <button
                    v-for="m in METHODS"
                    :key="m.value"
                    type="button"
                    :class="[
                      'p-3 border rounded-lg text-sm font-medium transition-colors flex items-center gap-2',
                      form.method === m.value ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 hover:border-gray-300 text-gray-700',
                    ]"
                    @click="form.method = m.value"
                  >
                    <span>{{ m.icon }}</span><span>{{ m.label }}</span>
                  </button>
                </div>
              </div>
              <div v-if="form.method !== 'cash'">
                <label class="block text-sm font-medium text-gray-700 mb-1">Référence *</label>
                <input
                  v-model="form.reference"
                  type="text"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                  :placeholder="form.method === 'check' ? 'Numéro du chèque' : 'Référence de la transaction'"
                  required
                />
              </div>
              <div v-if="form.amount > 0" :class="['p-4 rounded-lg', form.amount >= remaining ? 'bg-success-50' : 'bg-gray-50']">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-sm text-gray-600 mb-1">Après ce paiement</p>
                    <p :class="['text-xl font-bold', form.amount >= remaining ? 'text-success-600' : 'text-gray-900']">
                      {{ formatCurrency(Math.max(0, remaining - form.amount)) }} <span class="text-sm font-normal">restant</span>
                    </p>
                  </div>
                  <div v-if="form.amount >= remaining" class="text-success-600 font-medium text-sm">✓ Transaction complète</div>
                </div>
              </div>
            </div>
            <div class="flex justify-end gap-3 p-4 border-t">
              <button type="button" class="btn-secondary" @click="showPayment = false">Annuler</button>
              <button type="submit" class="btn-primary" :disabled="pay.isPending.value || !form.amount || form.amount <= 0">
                <span v-if="pay.isPending.value" class="flex items-center gap-2"><span class="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> Traitement...</span>
                <span v-else>Confirmer le paiement</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>
