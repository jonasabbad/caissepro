<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import {
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  BanknotesIcon,
  CheckCircleIcon,
  InboxArrowDownIcon,
  NoSymbolIcon,
  PencilIcon,
  PrinterIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';
import { supplierInvoicesApi } from '@/api/supplierInvoices';
import { settingsApi } from '@/api/misc';
import { apiErrorMessage } from '@/api/http';
import { formatCurrency, isoDate, round2 } from '@/utils/format';
import { PAYMENT_METHODS, daysLate, invoiceBadge, shortDay } from '@/utils/supplierInvoice';
import { printSupplierInvoice, supplierInvoicePdf } from '@/utils/supplierDocs';
import ConfirmModal from '@/components/ui/ConfirmModal.vue';
import Toast from '@/components/ui/Toast.vue';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const id = computed(() => route.params.id);

const { data: inv, isLoading, isError, refetch } = useQuery({ queryKey: ['supplier-invoice', id], queryFn: () => supplierInvoicesApi.getById(id.value) });
const { data: settings } = useQuery({ queryKey: ['tenant-settings'], queryFn: () => settingsApi.getTenantSettings(), staleTime: 300_000 });
const toast = ref({ show: false, message: '', type: 'success' });
const notify = (message, type = 'success') => (toast.value = { show: true, message, type });
const busy = ref(false);

/** Runs an action, refreshes everything that shows supplier money or stock, and reports the result. */
async function act(fn, okMessage) {
  busy.value = true;
  try {
    const updated = await fn();
    if (updated) queryClient.setQueryData(['supplier-invoice', id], updated);
    for (const k of ['supplier-invoices', 'suppliers', 'supplier', 'supplier-statement', 'products', 'pos-products', 'dashboard']) queryClient.invalidateQueries({ queryKey: [k] });
    if (okMessage) notify(okMessage);
    return true;
  } catch (e) {
    notify(apiErrorMessage(e), 'error');
    return false;
  } finally {
    busy.value = false;
  }
}

const badge = computed(() => (inv.value ? invoiceBadge(inv.value) : null));
const confirmed = computed(() => inv.value?.status === 'confirmed');
const openLines = computed(() => (inv.value?.items || []).filter((i) => i.quantity > i.quantityReceived));
const canReceive = computed(() => confirmed.value && !inv.value?.supplierOrderId && openLines.value.length > 0);

// ── Receiving ──
const receiveQty = ref({});
watch(inv, (v) => (receiveQty.value = Object.fromEntries((v?.items || []).map((i) => [i.id, Math.max(0, i.quantity - i.quantityReceived)]))), { immediate: true });
async function receiveSelected() {
  const items = Object.entries(receiveQty.value)
    .map(([itemId, q]) => ({ itemId, quantity: Math.floor(Number(q) || 0) }))
    .filter((r) => r.quantity > 0);
  if (items.length) await act(() => supplierInvoicesApi.receive(inv.value.id, items), t('supplierInvoices.receivedToast'));
}
const receiveAll = () => act(() => supplierInvoicesApi.receive(inv.value.id), t('supplierInvoices.receivedToast'));

// ── Payments ──
const payOpen = ref(false);
const pay = ref({ amount: 0, method: 'cash', paidAt: isoDate(), reference: '', notes: '' });
function openPay() {
  pay.value = { amount: inv.value.remaining, method: 'cash', paidAt: isoDate(), reference: '', notes: '' };
  payOpen.value = true;
}
const payAfter = computed(() => round2((inv.value?.remaining || 0) - (Number(pay.value.amount) || 0)));
const payInvalid = computed(() => !(Number(pay.value.amount) > 0) || Number(pay.value.amount) > (inv.value?.remaining || 0) + 0.001);
async function submitPay() {
  if (payInvalid.value) return;
  const done = await act(
    () => supplierInvoicesApi.addPayment(inv.value.id, { ...pay.value, amount: round2(Number(pay.value.amount)), reference: pay.value.reference || null, notes: pay.value.notes || null }),
    t('supplierInvoices.paymentRecorded'),
  );
  if (done) payOpen.value = false;
}
const toVoid = ref(null);
async function voidPayment() {
  const p = toVoid.value;
  toVoid.value = null;
  await act(() => supplierInvoicesApi.voidPayment(inv.value.id, p.id), t('supplierInvoices.paymentVoided'));
}

// ── Status actions ──
const confirmInvoice = () => act(() => supplierInvoicesApi.confirm(inv.value.id), t('supplierInvoices.confirmedToast'));
const askCancel = ref(false);
const cancelReason = ref('');
async function cancelInvoice() {
  askCancel.value = false;
  await act(() => supplierInvoicesApi.cancel(inv.value.id, cancelReason.value || undefined), t('supplierInvoices.cancelledToast'));
}
const askDelete = ref(false);
async function deleteDraft() {
  askDelete.value = false;
  if (await act(() => supplierInvoicesApi.remove(inv.value.id).then(() => null), t('supplierInvoices.deleted'))) router.replace('/app/supplier-invoices');
}

const company = computed(() => ({ name: settings.value?.storeName || settings.value?.tenantName || '' }));
const print = () => printSupplierInvoice(inv.value, company.value);
const pdf = () => supplierInvoicePdf(inv.value).catch((e) => notify(apiErrorMessage(e), 'error'));
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <div v-if="isLoading" class="card p-8 text-center text-gray-500">{{ t('common.loading') }}</div>
    <div v-else-if="isError || !inv" class="card p-8 text-center text-danger-600">
      {{ t('common.genericError') }} <button class="btn-secondary ms-3" @click="refetch()">{{ t('common.retry') }}</button>
    </div>
    <template v-else>
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div class="flex items-start gap-3">
          <button class="rounded-lg p-2 hover:bg-gray-100" :aria-label="t('common.back')" @click="router.push('/app/supplier-invoices')"><ArrowLeftIcon class="h-5 w-5 text-gray-600 rtl:rotate-180" /></button>
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="font-mono text-2xl font-bold text-gray-900">{{ inv.number }}</h1>
              <span :class="['rounded-full px-2.5 py-0.5 text-xs font-medium', badge.cls]">{{ t(badge.key) }}</span>
            </div>
            <p class="mt-1 text-sm text-gray-500">
              <RouterLink :to="`/app/suppliers/${inv.supplierId}`" class="font-medium text-gray-900 hover:underline">{{ inv.supplier?.name }}</RouterLink>
              <template v-if="inv.supplierRef"> · {{ t('supplierInvoices.supplierRef') }} <span class="font-mono">{{ inv.supplierRef }}</span></template>
            </p>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="btn-secondary inline-flex items-center gap-2" @click="print"><PrinterIcon class="h-5 w-5" /> {{ t('supplierInvoices.print') }}</button>
          <button class="btn-secondary inline-flex items-center gap-2" @click="pdf"><ArrowDownTrayIcon class="h-5 w-5" /> {{ t('supplierInvoices.pdf') }}</button>
          <RouterLink v-if="inv.status !== 'cancelled'" :to="`/app/supplier-invoices/${inv.id}/edit`" class="btn-secondary inline-flex items-center gap-2"><PencilIcon class="h-5 w-5" /> {{ t('common.edit') }}</RouterLink>
          <button v-if="inv.status === 'draft'" class="btn-primary inline-flex items-center gap-2" :disabled="busy" @click="confirmInvoice"><CheckCircleIcon class="h-5 w-5" /> {{ t('supplierInvoices.confirm') }}</button>
          <button v-if="inv.status === 'draft'" class="btn-secondary inline-flex items-center gap-2 text-danger-600" :disabled="busy" @click="askDelete = true"><TrashIcon class="h-5 w-5" /> {{ t('supplierInvoices.deleteDraft') }}</button>
          <button v-if="confirmed" class="btn-secondary inline-flex items-center gap-2 text-danger-600" :disabled="busy" @click="askCancel = true"><NoSymbolIcon class="h-5 w-5" /> {{ t('supplierInvoices.cancel') }}</button>
        </div>
      </div>

      <p v-if="inv.status === 'draft'" class="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">{{ t('supplierInvoices.draftHint') }} {{ t('supplierInvoices.confirmHint') }}</p>
      <p v-if="inv.status === 'cancelled'" class="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
        {{ t('supplierInvoices.cancelledOn', { date: shortDay(inv.cancelledAt) }) }}<template v-if="inv.cancelReason"> — {{ inv.cancelReason }}</template>
      </p>

      <!-- Amounts -->
      <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div class="card p-4">
          <p class="text-sm text-gray-500">{{ t('supplierInvoices.totalAmount') }}</p>
          <p class="mt-1 text-2xl font-bold text-gray-900">{{ formatCurrency(inv.total) }}</p>
        </div>
        <div class="card p-4">
          <p class="text-sm text-gray-500">{{ t('supplierInvoices.paid') }}</p>
          <p class="mt-1 text-2xl font-bold text-success-700">{{ formatCurrency(inv.amountPaid) }}</p>
        </div>
        <div class="card p-4">
          <p class="text-sm text-gray-500">{{ t('supplierInvoices.remaining') }}</p>
          <p :class="['mt-1 text-2xl font-bold', confirmed && inv.remaining > 0 ? 'text-danger-600' : 'text-gray-900']">{{ formatCurrency(inv.status === 'cancelled' ? 0 : inv.remaining) }}</p>
        </div>
        <div class="card p-4">
          <p class="text-sm text-gray-500">{{ t('supplierInvoices.dueDate') }}</p>
          <p :class="['mt-1 text-lg font-bold', inv.overdue ? 'text-amber-700' : 'text-gray-900']">{{ inv.dueDate ? shortDay(inv.dueDate) : '—' }}</p>
          <p v-if="inv.overdue" class="text-xs font-medium text-amber-700">{{ t('supplierInvoices.daysLate', { n: daysLate(inv.dueDate) }) }}</p>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
        <!-- Lines + receiving -->
        <div class="card overflow-hidden">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 p-4">
            <h2 class="font-semibold text-gray-900">{{ t('supplierInvoices.items') }}</h2>
            <RouterLink v-if="inv.supplierOrder" :to="`/app/supplier-orders/${inv.supplierOrder.id}`" class="text-sm text-primary-700 hover:underline">
              {{ t('supplierInvoices.receivedOnOrder', { number: inv.supplierOrder.orderNumber }) }}
            </RouterLink>
            <span v-else-if="confirmed && !openLines.length" class="inline-flex items-center gap-1 text-sm font-medium text-success-700"><CheckCircleIcon class="h-4 w-4" /> {{ t('supplierInvoices.fullyReceived') }}</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-4 py-2 text-start font-medium text-gray-500">{{ t('supplierInvoices.product') }}</th>
                  <th class="px-4 py-2 text-end font-medium text-gray-500">{{ t('supplierInvoices.quantity') }}</th>
                  <th class="px-4 py-2 text-end font-medium text-gray-500">{{ t('supplierInvoices.unitCost') }}</th>
                  <th class="px-4 py-2 text-end font-medium text-gray-500">{{ t('supplierInvoices.lineTotal') }}</th>
                  <th v-if="confirmed && !inv.supplierOrderId" class="px-4 py-2 text-end font-medium text-gray-500">{{ t('supplierInvoices.received') }}</th>
                  <th v-if="canReceive" class="w-28 px-4 py-2 text-end font-medium text-gray-500">{{ t('supplierInvoices.toReceive') }}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr v-for="i in inv.items" :key="i.id">
                  <td class="px-4 py-3">
                    <RouterLink v-if="i.productId" :to="`/app/products/${i.productId}`" class="font-medium text-gray-900 hover:underline">{{ i.productName }}</RouterLink>
                    <span v-else class="font-medium text-gray-900">{{ i.productName }} <span class="ms-1 rounded bg-primary-50 px-1.5 py-0.5 text-[10px] font-semibold text-primary-700">{{ t('supplierInvoices.newProduct') }}</span></span>
                    <p v-if="i.reference" class="font-mono text-xs text-gray-500">{{ i.reference }}</p>
                  </td>
                  <td class="px-4 py-3 text-end">{{ i.quantity }}</td>
                  <td class="whitespace-nowrap px-4 py-3 text-end">{{ formatCurrency(i.unitCost) }}</td>
                  <td class="whitespace-nowrap px-4 py-3 text-end font-semibold">{{ formatCurrency(i.lineTotal) }}</td>
                  <td v-if="confirmed && !inv.supplierOrderId" :class="['px-4 py-3 text-end', i.quantityReceived >= i.quantity ? 'text-success-700' : 'text-gray-600']">{{ i.quantityReceived }} / {{ i.quantity }}</td>
                  <td v-if="canReceive" class="px-4 py-2 text-end">
                    <input
                      v-if="i.quantity > i.quantityReceived"
                      v-model.number="receiveQty[i.id]"
                      type="number"
                      min="0"
                      :max="i.quantity - i.quantityReceived"
                      class="input w-20 text-end"
                      :aria-label="t('supplierInvoices.toReceive')"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="canReceive" class="flex flex-col gap-3 border-t border-gray-100 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p class="text-xs text-gray-500">{{ t('supplierInvoices.receiveHint') }}</p>
            <div class="flex shrink-0 gap-2">
              <button class="btn-secondary" :disabled="busy" @click="receiveSelected">{{ t('supplierInvoices.receive') }}</button>
              <button class="btn-primary inline-flex items-center gap-2" :disabled="busy" @click="receiveAll"><InboxArrowDownIcon class="h-5 w-5" /> {{ t('supplierInvoices.receiveAll') }}</button>
            </div>
          </div>
          <div class="space-y-1 border-t border-gray-100 p-4 text-sm">
            <div class="flex justify-between"><span class="text-gray-600">{{ t('supplierInvoices.subtotal') }}</span><span>{{ formatCurrency(inv.subtotal) }}</span></div>
            <div v-if="Number(inv.discount)" class="flex justify-between"><span class="text-gray-600">{{ t('supplierInvoices.discount') }}</span><span>{{ formatCurrency(inv.discount, 'DH', '−') }}</span></div>
            <div v-if="Number(inv.taxAmount)" class="flex justify-between"><span class="text-gray-600">{{ t('supplierInvoices.tax') }} ({{ Number(inv.taxRate) }}%)</span><span>{{ formatCurrency(inv.taxAmount) }}</span></div>
            <div v-if="Number(inv.extraCharges)" class="flex justify-between"><span class="text-gray-600">{{ inv.extraChargesLabel || t('supplierInvoices.extraCharges') }}</span><span>{{ formatCurrency(inv.extraCharges) }}</span></div>
            <div class="flex justify-between border-t border-gray-200 pt-2 text-base font-bold"><span>{{ t('supplierInvoices.total') }}</span><span>{{ formatCurrency(inv.total) }}</span></div>
          </div>
        </div>

        <!-- Details + payments -->
        <div class="space-y-6">
          <div class="card space-y-2 p-4 text-sm">
            <div class="flex justify-between gap-3"><span class="text-gray-500">{{ t('supplierInvoices.invoiceDate') }}</span><span>{{ shortDay(inv.invoiceDate) }}</span></div>
            <div v-if="inv.paymentTerms" class="flex justify-between gap-3"><span class="text-gray-500">{{ t('supplierInvoices.paymentTerms') }}</span><span class="text-end">{{ inv.paymentTerms }}</span></div>
            <div v-if="inv.supplier?.phone" class="flex justify-between gap-3"><span class="text-gray-500">{{ t('suppliers.phone') }}</span><span dir="ltr">{{ inv.supplier.phone }}</span></div>
            <div v-if="inv.supplier?.contactName" class="flex justify-between gap-3"><span class="text-gray-500">{{ t('supplierInvoices.contact') }}</span><span>{{ inv.supplier.contactName }}</span></div>
            <div v-if="inv.notes" class="border-t border-gray-100 pt-2"><p class="text-gray-500">{{ t('supplierInvoices.notes') }}</p><p class="mt-1 whitespace-pre-line">{{ inv.notes }}</p></div>
          </div>

          <div class="card overflow-hidden">
            <div class="flex items-center justify-between border-b border-gray-100 p-4">
              <h2 class="font-semibold text-gray-900">{{ t('supplierInvoices.paymentHistory') }}</h2>
              <button v-if="confirmed && inv.remaining > 0" class="btn-primary btn-sm inline-flex items-center gap-1.5" :disabled="busy" @click="openPay"><BanknotesIcon class="h-4 w-4" /> {{ t('supplierInvoices.addPayment') }}</button>
            </div>
            <ul v-if="inv.payments.length" class="divide-y divide-gray-100">
              <li v-for="p in inv.payments" :key="p.id" :class="['flex items-start justify-between gap-3 p-4 text-sm', p.voidedAt && 'opacity-50']">
                <div>
                  <p :class="['font-semibold', p.voidedAt ? 'text-gray-500 line-through' : 'text-gray-900']">{{ formatCurrency(p.amount) }}</p>
                  <p class="text-xs text-gray-500">
                    {{ shortDay(p.paidAt) }} · {{ t(`supplierInvoices.methods.${p.method}`) }}<template v-if="p.reference"> · {{ p.reference }}</template>
                    <template v-if="p.fromOrder"> · {{ t('supplierInvoices.fromOrder') }}</template>
                  </p>
                  <p v-if="p.voidedAt" class="text-xs font-medium text-danger-600">{{ t('supplierInvoices.voided') }}<template v-if="p.voidReason"> — {{ p.voidReason }}</template></p>
                </div>
                <button v-if="!p.voidedAt && !p.fromOrder && inv.status !== 'cancelled'" class="p-1 text-gray-400 hover:text-danger-600" :title="t('supplierInvoices.voidPayment')" :aria-label="t('supplierInvoices.voidPayment')" @click="toVoid = p">
                  <XMarkIcon class="h-5 w-5" />
                </button>
              </li>
            </ul>
            <p v-else class="p-6 text-center text-sm text-gray-500">{{ t('supplierInvoices.noPayments') }}</p>
          </div>
        </div>
      </div>
    </template>

    <!-- Payment -->
    <Teleport to="body">
      <div v-if="payOpen && inv" class="modal-overlay" @click.self="payOpen = false">
        <div class="modal-content max-w-md">
          <div class="modal-header">
            <h3 class="text-lg font-bold text-gray-900">{{ t('supplierInvoices.addPayment') }}</h3>
            <button class="rounded p-1 hover:bg-gray-100" :aria-label="t('common.close')" @click="payOpen = false"><XMarkIcon class="h-5 w-5" /></button>
          </div>
          <div class="modal-body space-y-4">
            <div class="rounded-lg bg-gray-50 p-3 text-sm">
              <div class="flex justify-between"><span class="text-gray-600">{{ t('supplierInvoices.remaining') }}</span><span class="font-bold">{{ formatCurrency(inv.remaining) }}</span></div>
            </div>
            <div>
              <label class="label" for="pay-amount">{{ t('supplierInvoices.amount') }} *</label>
              <input id="pay-amount" v-model.number="pay.amount" type="number" min="0.01" :max="inv.remaining" step="0.01" class="input text-lg" />
              <button type="button" class="mt-1 text-xs font-medium text-primary-700 hover:underline" @click="pay.amount = inv.remaining">{{ t('supplierInvoices.payAll', { amount: formatCurrency(inv.remaining) }) }}</button>
              <p v-if="payInvalid" class="mt-1 text-xs text-danger-600">{{ t('supplierInvoices.errors.amount') }}</p>
              <p v-else class="mt-1 text-xs text-gray-500">{{ t('supplierInvoices.afterPayment', { amount: formatCurrency(payAfter) }) }}</p>
            </div>
            <div>
              <p class="label">{{ t('supplierInvoices.method') }}</p>
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button
                  v-for="m in PAYMENT_METHODS"
                  :key="m"
                  type="button"
                  :class="['rounded-lg border px-2 py-2 text-sm font-medium', pay.method === m ? 'border-black bg-black text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400']"
                  @click="pay.method = m"
                >
                  {{ t(`supplierInvoices.methods.${m}`) }}
                </button>
              </div>
              <p class="mt-1 text-xs text-gray-500">{{ pay.method === 'cash' ? t('supplierInvoices.cashHint') : t('supplierInvoices.nonCashHint') }}</p>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="label" for="pay-date">{{ t('supplierInvoices.paymentDate') }}</label>
                <input id="pay-date" v-model="pay.paidAt" type="date" class="input" />
              </div>
              <div>
                <label class="label" for="pay-ref">{{ t('customers.reference') }}</label>
                <input id="pay-ref" v-model="pay.reference" class="input" :placeholder="t('supplierInvoices.paymentReference')" />
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" @click="payOpen = false">{{ t('common.cancel') }}</button>
            <button class="btn-primary" :disabled="busy || payInvalid" @click="submitPay">{{ t('customers.confirmPayment') }}</button>
          </div>
        </div>
      </div>

      <div v-if="askCancel" class="modal-overlay" @click.self="askCancel = false">
        <div class="modal-content max-w-md">
          <div class="modal-header"><h3 class="text-lg font-bold text-gray-900">{{ t('supplierInvoices.cancel') }}</h3></div>
          <div class="modal-body space-y-3">
            <p class="text-sm text-gray-600">{{ t('supplierInvoices.cancelConfirm') }}</p>
            <input v-model="cancelReason" class="input" :placeholder="t('supplierInvoices.cancelReason')" :aria-label="t('supplierInvoices.cancelReason')" />
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" @click="askCancel = false">{{ t('common.close') }}</button>
            <button class="btn-primary bg-danger-600 hover:bg-danger-700" :disabled="busy" @click="cancelInvoice">{{ t('supplierInvoices.cancel') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <ConfirmModal
      :show="!!toVoid"
      :title="t('supplierInvoices.voidPayment')"
      :message="t('supplierInvoices.voidConfirm')"
      :confirm-text="t('supplierInvoices.voidPayment')"
      :cancel-text="t('common.close')"
      type="danger"
      @confirm="voidPayment"
      @cancel="toVoid = null"
    />
    <ConfirmModal
      :show="askDelete"
      :title="t('supplierInvoices.deleteDraft')"
      :message="t('supplierInvoices.deleteConfirm')"
      :confirm-text="t('common.delete')"
      :cancel-text="t('common.cancel')"
      type="danger"
      @confirm="deleteDraft"
      @cancel="askDelete = false"
    />
    <Toast :show="toast.show" :message="toast.message" :type="toast.type" @close="toast.show = false" />
  </div>
</template>
