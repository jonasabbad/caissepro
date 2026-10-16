<script setup>
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import {
  ArrowLeftIcon,
  ArrowTrendingUpIcon,
  BanknotesIcon,
  CheckCircleIcon,
  ClockIcon,
  CurrencyDollarIcon,
  DevicePhoneMobileIcon,
  PencilSquareIcon,
  PlayIcon,
  PlusIcon,
  PrinterIcon,
  QrCodeIcon,
  TrashIcon,
  TruckIcon,
  WrenchScrewdriverIcon,
  XCircleIcon,
} from '@heroicons/vue/24/outline';
import { repairsApi } from '@/api/repairs';
import { useAuthStore } from '@/stores/auth';
import { formatCurrency } from '@/utils/format';
import { printRepairLabel, repairReceiptProps } from '@/utils/repairPrint';
import ConfirmModal from '@/components/ui/ConfirmModal.vue';
import Toast from '@/components/ui/Toast.vue';
import ReceiptModal from '@/components/pos/ReceiptModal.vue';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const queryClient = useQueryClient();
const auth = useAuthStore();

const id = computed(() => route.params.id);
const { data: repair, isLoading } = useQuery({ queryKey: ['repair', id], queryFn: () => repairsApi.getById(id.value), enabled: computed(() => !!id.value) });
const unitId = computed(() => repair.value?.soldUnitId);
const { data: unitRepairs } = useQuery({
  queryKey: ['repairs-by-unit', unitId],
  queryFn: () => repairsApi.getBySoldUnit(unitId.value),
  enabled: computed(() => !!unitId.value),
});
const otherRepairs = computed(() => (unitRepairs.value || []).filter((r) => r.id !== id.value));

const toast = ref({ show: false, message: '', type: 'success' });
const notify = (message, type = 'success') => (toast.value = { show: true, message, type });
const refresh = () => {
  queryClient.invalidateQueries({ queryKey: ['repair', id.value] });
  queryClient.invalidateQueries({ queryKey: ['repairs'] });
};

const formatWhen = (d) => new Date(d).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const STATUS = {
  pending: { cls: 'bg-amber-100 text-amber-700', icon: ClockIcon },
  in_progress: { cls: 'bg-blue-100 text-blue-700', icon: WrenchScrewdriverIcon },
  completed: { cls: 'bg-green-100 text-green-700', icon: CheckCircleIcon },
  delivered: { cls: 'bg-gray-100 text-gray-700', icon: TruckIcon },
  cancelled: { cls: 'bg-red-100 text-red-700', icon: XCircleIcon },
};
const closed = computed(() => repair.value?.status === 'cancelled' || repair.value?.status === 'delivered');
const margin = computed(() => (repair.value ? Number(repair.value.fixedPrice) - Number(repair.value.totalCost) : 0));
const marginPct = computed(() => (!repair.value || Number(repair.value.fixedPrice) === 0 ? 0 : Math.round((margin.value / Number(repair.value.fixedPrice)) * 100)));

const statusMut = useMutation({
  mutationFn: (s) => repairsApi.updateStatus(id.value, s),
  onSuccess: () => (refresh(), notify(t('repairs.statusUpdated'))),
  onError: (e) => notify(e?.response?.data?.message || t('repairs.statusUpdateError'), 'error'),
});
const actions = computed(() => {
  switch (repair.value?.status) {
    case 'pending':
      return [
        { status: 'in_progress', key: 'startRepair', cls: 'btn-primary', icon: PlayIcon },
        { status: 'cancelled', key: 'cancel', cls: 'btn-ghost text-danger-600 hover:bg-danger-50', icon: XCircleIcon },
      ];
    case 'in_progress':
      return [
        { status: 'completed', key: 'markCompleted', cls: 'btn-success', icon: CheckCircleIcon },
        { status: 'cancelled', key: 'cancel', cls: 'btn-ghost text-danger-600 hover:bg-danger-50', icon: XCircleIcon },
      ];
    case 'completed':
      return [{ status: 'delivered', key: 'markDelivered', cls: 'btn-primary', icon: TruckIcon }];
    default:
      return [];
  }
});

// Expenses
const showExpense = ref(false);
const expense = ref({ description: '', amount: 0, type: 'part' });
const addExpense = useMutation({
  mutationFn: () => repairsApi.addExpense(id.value, expense.value),
  onSuccess: () => {
    refresh();
    showExpense.value = false;
    expense.value = { description: '', amount: 0, type: 'part' };
    notify(t('repairs.expenseAdded'));
  },
  onError: () => notify(t('repairs.expenseError'), 'error'),
});
const confirmExpense = ref(null);
const removeExpense = useMutation({
  mutationFn: (expenseId) => repairsApi.removeExpense(id.value, expenseId),
  onSuccess: () => (refresh(), notify(t('repairs.expenseDeleted'))),
  onError: () => notify(t('repairs.expenseError'), 'error'),
});
function doRemoveExpense() {
  if (confirmExpense.value) removeExpense.mutate(confirmExpense.value);
  confirmExpense.value = null;
}

const confirmDelete = ref(false);
const deleteMut = useMutation({
  mutationFn: () => repairsApi.delete(id.value),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['repairs'] });
    router.push('/app/repairs');
  },
  onError: () => notify(t('repairs.deleteError'), 'error'),
});

// Inline edits
const editingPrice = ref(false);
const priceDraft = ref(undefined);
function startPrice() {
  priceDraft.value = Number(repair.value?.fixedPrice) || undefined;
  editingPrice.value = true;
}
const priceMut = useMutation({
  mutationFn: () => repairsApi.update(id.value, { fixedPrice: Number(priceDraft.value) || 0 }),
  onSuccess: () => {
    refresh();
    editingPrice.value = false;
    notify(t('repairs.priceUpdated'));
  },
  onError: () => notify(t('repairs.expenseError'), 'error'),
});
const editingDiag = ref(false);
const diagDraft = ref('');
function startDiag() {
  diagDraft.value = repair.value?.diagnosticNotes || '';
  editingDiag.value = true;
}
const diagMut = useMutation({
  mutationFn: () => repairsApi.update(id.value, { diagnosticNotes: diagDraft.value }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['repair', id.value] });
    editingDiag.value = false;
    notify(t('repairs.diagnosticUpdated'));
  },
  onError: () => notify(t('repairs.expenseError'), 'error'),
});

const showTicket = ref(false);
const ticketProps = computed(() => (repair.value ? repairReceiptProps(repair.value, auth.storeName) : null));
async function printLabel() {
  if (!repair.value) return;
  try {
    await printRepairLabel(repair.value, auth.storeName);
  } catch (e) {
    console.error('Label print failed:', e);
    notify(t('repairs.expenseError'), 'error');
  }
}
</script>

<template>
  <div class="max-w-7xl space-y-6">
    <div v-if="isLoading" class="card p-8 text-center">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-black mx-auto" />
      <p class="text-gray-500 mt-2">{{ t('common.loading') }}</p>
    </div>

    <template v-else-if="repair">
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <button class="p-2 hover:bg-gray-100 rounded-lg transition-colors" @click="router.push('/app/repairs')"><ArrowLeftIcon class="w-5 h-5 text-gray-600" /></button>
          <div>
            <div class="flex flex-wrap items-center gap-3">
              <h1 class="text-2xl font-bold text-gray-900">{{ repair.repairNumber }}</h1>
              <span :class="['badge text-sm inline-flex items-center gap-1', STATUS[repair.status]?.cls]">
                <component :is="STATUS[repair.status]?.icon" class="w-3.5 h-3.5" /> {{ t(`repairs.status.${repair.status}`) }}
              </span>
            </div>
            <p class="text-sm text-gray-500">{{ repair.customer?.firstName }} {{ repair.customer?.lastName || '' }} · {{ formatWhen(repair.receivedAt) }}</p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button class="btn-secondary inline-flex items-center gap-2" @click="showTicket = true"><PrinterIcon class="w-4 h-4" /> {{ t('common.print') }}</button>
          <button class="btn-secondary inline-flex items-center gap-2" @click="printLabel"><QrCodeIcon class="w-4 h-4" /> {{ t('repairs.printLabel') }}</button>
          <RouterLink v-if="!closed" :to="`/app/repairs/${repair.id}/edit`" class="btn-secondary inline-flex items-center gap-2">
            <PencilSquareIcon class="w-4 h-4" /> {{ t('common.edit') }}
          </RouterLink>
          <button
            v-for="a in actions"
            :key="a.status"
            :class="[a.cls, 'inline-flex items-center gap-2']"
            :disabled="statusMut.isPending.value"
            @click="statusMut.mutate(a.status)"
          >
            <component :is="a.icon" class="w-4 h-4" /> {{ t(`repairs.action.${a.key}`) }}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="card p-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0"><CurrencyDollarIcon class="w-5 h-5 text-gray-600" /></div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <p class="text-sm text-gray-500">{{ t('repairs.fixedPrice') }}</p>
                <button v-if="!editingPrice && !closed" type="button" class="text-xs text-blue-600 hover:text-blue-800" @click="startPrice">
                  {{ Number(repair.fixedPrice) > 0 ? t('common.edit') : t('common.add') }}
                </button>
              </div>
              <div v-if="editingPrice" class="flex items-center gap-2 mt-1">
                <input v-model.number="priceDraft" type="number" step="0.01" min="0" class="input py-1 text-sm" :placeholder="t('repairs.priceNotSet')" />
                <button type="button" class="btn-sm btn-secondary" @click="editingPrice = false">{{ t('common.cancel') }}</button>
                <button type="button" class="btn-sm btn-primary" :disabled="priceMut.isPending.value" @click="priceMut.mutate()">
                  {{ priceMut.isPending.value ? t('common.saving') : t('common.save') }}
                </button>
              </div>
              <p v-else-if="Number(repair.fixedPrice) > 0" class="text-xl font-bold text-gray-900">{{ formatCurrency(repair.fixedPrice) }}</p>
              <p v-else class="text-xl font-bold text-gray-400">{{ t('repairs.priceNotSet') }}</p>
            </div>
          </div>
        </div>
        <div class="card p-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"><BanknotesIcon class="w-5 h-5 text-gray-600" /></div>
            <div>
              <p class="text-sm text-gray-500">{{ t('repairs.totalCost') }}</p>
              <p class="text-xl font-bold text-gray-900">{{ formatCurrency(repair.totalCost) }}</p>
            </div>
          </div>
        </div>
        <div class="card p-4">
          <div class="flex items-center gap-3">
            <div :class="['w-10 h-10 rounded-full flex items-center justify-center', margin >= 0 ? 'bg-success-100' : 'bg-danger-100']">
              <ArrowTrendingUpIcon :class="['w-5 h-5', margin >= 0 ? 'text-success-600' : 'text-danger-600']" />
            </div>
            <div>
              <p class="text-sm text-gray-500">{{ t('repairs.margin') }}</p>
              <p :class="['text-xl font-bold', margin >= 0 ? 'text-success-600' : 'text-danger-600']">
                {{ formatCurrency(margin) }} <span class="text-sm font-normal">({{ marginPct }}%)</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div class="card p-5">
        <h2 class="font-semibold text-gray-900 mb-4">{{ t('repairs.repairInfo') }}</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div v-if="repair.customer">
            <span class="text-gray-500">{{ t('repairs.form.client') }}</span>
            <RouterLink :to="`/app/customers/${repair.customer.id}`" class="block mt-0.5 hover:text-primary-600">
              <p class="font-medium text-gray-900">{{ repair.customer.firstName }} {{ repair.customer.lastName || '' }}</p>
              <p v-if="repair.customer.phone" class="text-gray-500">{{ repair.customer.phone }}</p>
            </RouterLink>
          </div>
          <div v-if="repair.repairer">
            <span class="text-gray-500">{{ t('repairs.form.repairer') }}</span>
            <p class="font-medium text-gray-900 mt-0.5">{{ repair.repairer.name }}</p>
            <p v-if="repair.repairer.phone" class="text-gray-500">{{ repair.repairer.phone }}</p>
          </div>
          <div class="sm:col-span-2">
            <span class="text-gray-500">{{ t('repairs.form.deviceDescription') }}</span>
            <p class="font-medium text-gray-900 mt-0.5">{{ repair.deviceDescription }}</p>
          </div>
          <div v-if="repair.soldUnit" class="sm:col-span-2">
            <span class="text-gray-500">{{ t('repairs.form.linkedUnit') }}</span>
            <RouterLink
              :to="`/app/sold-units/${repair.soldUnit.id}/edit`"
              class="flex items-center gap-2 mt-1 p-2 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors w-fit"
            >
              <DevicePhoneMobileIcon class="w-4 h-4 text-blue-600" />
              <span class="font-medium text-blue-900">{{ repair.soldUnit.brand }} {{ repair.soldUnit.model }}</span>
              <span v-if="repair.soldUnit.ref" class="text-blue-600 text-xs">({{ repair.soldUnit.ref }})</span>
            </RouterLink>
          </div>
          <div class="sm:col-span-2">
            <div class="flex items-center justify-between">
              <span class="text-gray-500">{{ t('repairs.form.diagnosticNotes') }}</span>
              <button v-if="!editingDiag && !closed" type="button" class="text-xs text-blue-600 hover:text-blue-800" @click="startDiag">
                {{ repair.diagnosticNotes ? t('common.edit') : t('common.add') }}
              </button>
            </div>
            <div v-if="editingDiag" class="mt-1 space-y-2">
              <textarea v-model="diagDraft" class="input w-full" rows="3" :placeholder="t('repairs.form.diagnosticPlaceholder')" />
              <div class="flex justify-end gap-2">
                <button type="button" class="btn-sm btn-secondary" @click="editingDiag = false">{{ t('common.cancel') }}</button>
                <button type="button" class="btn-sm btn-primary" :disabled="diagMut.isPending.value" @click="diagMut.mutate()">
                  {{ diagMut.isPending.value ? t('common.saving') : t('common.save') }}
                </button>
              </div>
            </div>
            <p v-else-if="repair.diagnosticNotes" class="text-gray-900 mt-0.5 whitespace-pre-line">{{ repair.diagnosticNotes }}</p>
            <p v-else class="text-gray-400 mt-0.5 italic">{{ t('repairs.noDiagnosticNotes') }}</p>
          </div>
          <div v-if="repair.notes" class="sm:col-span-2">
            <span class="text-gray-500">{{ t('repairs.form.notes') }}</span>
            <p class="text-gray-900 mt-0.5">{{ repair.notes }}</p>
          </div>
          <div v-if="repair.completedAt">
            <span class="text-gray-500">{{ t('repairs.completedAt') }}</span>
            <p class="text-gray-900 mt-0.5">{{ formatWhen(repair.completedAt) }}</p>
          </div>
          <div v-if="repair.deliveredAt">
            <span class="text-gray-500">{{ t('repairs.deliveredAt') }}</span>
            <p class="text-gray-900 mt-0.5">{{ formatWhen(repair.deliveredAt) }}</p>
          </div>
        </div>
      </div>

      <div class="card overflow-hidden">
        <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div class="flex items-center gap-2">
            <h2 class="font-semibold text-gray-900">{{ t('repairs.expenses') }}</h2>
            <span class="text-sm text-gray-500">({{ repair.expenses?.length || 0 }})</span>
          </div>
          <button v-if="!closed" class="btn-sm btn-primary inline-flex items-center gap-1.5" @click="showExpense = true"><PlusIcon class="w-4 h-4" /> {{ t('repairs.addExpense') }}</button>
        </div>
        <div v-if="repair.expenses?.length" class="divide-y divide-gray-100">
          <div v-for="e in repair.expenses" :key="e.id" class="flex items-center gap-4 px-5 py-3">
            <div class="flex-1 min-w-0">
              <p class="font-medium text-gray-900">{{ e.description }}</p>
              <p class="text-xs text-gray-500">{{ t(`repairs.expenseType.${e.type}`) }} · {{ formatWhen(e.createdAt) }}</p>
            </div>
            <p class="font-medium text-gray-900 whitespace-nowrap">{{ formatCurrency(e.amount) }}</p>
            <button v-if="!closed" class="p-1.5 text-gray-400 hover:text-danger-600 transition-colors" @click="confirmExpense = e.id"><TrashIcon class="w-4 h-4" /></button>
          </div>
        </div>
        <div v-else class="px-5 py-8 text-center text-gray-500 text-sm"><p>{{ t('repairs.noExpenses') }}</p></div>
      </div>

      <div v-if="otherRepairs.length" class="card overflow-hidden">
        <div class="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
          <ClockIcon class="w-5 h-5 text-gray-500" />
          <h2 class="font-semibold text-gray-900">{{ t('repairs.repairHistory') }}</h2>
          <span class="text-sm text-gray-500">({{ otherRepairs.length }})</span>
        </div>
        <div class="divide-y divide-gray-100">
          <RouterLink v-for="r in otherRepairs" :key="r.id" :to="`/app/repairs/${r.id}`" class="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
            <div>
              <p class="font-medium text-gray-900">{{ r.deviceDescription }}</p>
              <p class="text-xs text-gray-500">{{ r.repairNumber }} · {{ formatWhen(r.receivedAt) }}<template v-if="r.deliveredAt"> → {{ formatWhen(r.deliveredAt) }}</template></p>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-sm font-medium text-gray-900">{{ formatCurrency(r.fixedPrice) }}</span>
              <span :class="['text-xs px-2 py-1 rounded-full', STATUS[r.status]?.cls]">{{ t(`repairs.status.${r.status}`) }}</span>
            </div>
          </RouterLink>
        </div>
      </div>

      <div class="flex justify-end">
        <button class="btn-ghost text-danger-600 hover:bg-danger-50 inline-flex items-center gap-2" @click="confirmDelete = true">
          <TrashIcon class="w-4 h-4" /> {{ t('repairs.deleteRepair') }}
        </button>
      </div>
    </template>

    <Teleport to="body">
      <div v-if="showExpense" class="modal-overlay" @click.self="showExpense = false">
        <div class="modal-content max-w-md">
          <div class="modal-header"><h3 class="text-lg font-bold text-gray-900">{{ t('repairs.addExpense') }}</h3></div>
          <form @submit.prevent="addExpense.mutate()">
            <div class="modal-body space-y-4">
              <div>
                <label class="label">{{ t('repairs.expenseForm.description') }}</label>
                <input v-model="expense.description" type="text" class="input" required maxlength="255" />
              </div>
              <div>
                <label class="label">{{ t('repairs.expenseForm.amount') }}</label>
                <div class="relative">
                  <input v-model.number="expense.amount" type="number" step="0.01" min="0" class="input pe-10" required />
                  <span class="absolute end-3 top-1/2 -translate-y-1/2 text-gray-500">DH</span>
                </div>
              </div>
              <div>
                <label class="label">{{ t('repairs.expenseForm.type') }}</label>
                <select v-model="expense.type" class="input">
                  <option value="part">{{ t('repairs.expenseType.part') }}</option>
                  <option value="labor">{{ t('repairs.expenseType.labor') }}</option>
                  <option value="other">{{ t('repairs.expenseType.other') }}</option>
                </select>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn-secondary" @click="showExpense = false">{{ t('common.cancel') }}</button>
              <button type="submit" class="btn-primary" :disabled="addExpense.isPending.value">{{ addExpense.isPending.value ? t('common.saving') : t('common.save') }}</button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <ConfirmModal
      :show="!!confirmExpense"
      :title="t('common.confirm')"
      :message="t('repairs.confirmDeleteExpense')"
      :confirm-text="t('common.confirm')"
      :cancel-text="t('common.cancel')"
      type="danger"
      @confirm="doRemoveExpense"
      @cancel="confirmExpense = null"
    />
    <ConfirmModal
      :show="confirmDelete"
      :title="t('common.confirm')"
      :message="t('repairs.confirmDeleteRepair')"
      :confirm-text="t('common.confirm')"
      :cancel-text="t('common.cancel')"
      type="danger"
      @confirm="(confirmDelete = false), deleteMut.mutate()"
      @cancel="confirmDelete = false"
    />
    <Toast :show="toast.show" :message="toast.message" :type="toast.type" @close="toast.show = false" />
    <ReceiptModal v-if="ticketProps" v-bind="ticketProps" :is-open="showTicket" @close="showTicket = false" />
  </div>
</template>
