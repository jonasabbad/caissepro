<script setup>
import { intlLocale } from '@/i18n';
import { computed, ref } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { ArrowDownCircleIcon, ArrowUpCircleIcon, BanknotesIcon, ClockIcon, InboxIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import { caisseApi, CaisseMovementType as T } from '@/api/caisse';
import { useAuthStore } from '@/stores/auth';
import { formatCurrency } from '@/utils/format';
import { useI18n } from 'vue-i18n';
import { DEPOSIT_REASONS, OTHER_REASON, WITHDRAW_REASONS, reasonLabel } from '@/utils/caisseReason';
import DateRangePicker from '@/components/ui/DateRangePicker.vue';

const { t } = useI18n();
const auth = useAuthStore();
const queryClient = useQueryClient();
const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const range = ref([today, today]);
const startDate = computed(() => range.value?.[0] || today);
const endDate = computed(() => range.value?.[1] || today);
const storeId = computed(() => auth.currentStoreId);

const { data, isLoading } = useQuery({
  queryKey: ['caisse', storeId, startDate, endDate],
  queryFn: () => caisseApi.getCaisse(storeId.value, { startDate: startDate.value, endDate: endDate.value }),
  enabled: computed(() => !!storeId.value),
  refetchInterval: 30_000,
});

const mode = ref(null); // 'in' | 'out'
const amount = ref(0);
const reason = ref('');
const customReason = ref('');
const finalReason = computed(() => (reason.value === OTHER_REASON ? customReason.value : reason.value));
function open(m) {
  amount.value = 0;
  reason.value = '';
  customReason.value = '';
  mode.value = m;
}
const save = useMutation({
  mutationFn: ({ kind, value, why }) => (kind === 'in' ? caisseApi.recordCashIn(storeId.value, value, why) : caisseApi.recordCashOut(storeId.value, value, why)),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['caisse'] });
    mode.value = null;
  },
});
function submit() {
  if (amount.value <= 0 || !finalReason.value) return;
  save.mutate({ kind: mode.value, value: amount.value, why: finalReason.value });
}

const isIn = (type, amt) => (type === T.ADJUSTMENT ? amt > 0 : [T.CASH_IN, T.SALE].includes(type));
const tone = (type, amt) => {
  if (type === T.ADJUSTMENT) return amt > 0 ? 'text-success-600 bg-success-50' : amt < 0 ? 'text-danger-600 bg-danger-50' : 'text-blue-600 bg-blue-50';
  if ([T.CASH_IN, T.SALE].includes(type)) return 'text-success-600 bg-success-50';
  if ([T.CASH_OUT, T.RETURN_REFUND, T.RESERVATION_REFUND].includes(type)) return 'text-danger-600 bg-danger-50';
  return 'text-gray-600 bg-gray-50';
};
const when = (d) => new Intl.DateTimeFormat(intlLocale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d));
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-900">{{ t('cashDrawer.title') }}</h1>
      <p class="text-gray-500 mt-1">{{ t('cashDrawer.subtitle') }}</p>
    </div>

    <div v-if="isLoading" class="flex justify-center py-12"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-black" /></div>
    <template v-else>
      <div class="rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 text-white p-6 shadow-lg">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div class="flex items-center gap-4">
            <div class="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center"><BanknotesIcon class="w-7 h-7" /></div>
            <div>
              <p class="text-blue-100 text-sm font-medium">{{ t('cashDrawer.balance') }}</p>
              <p class="text-3xl font-bold">{{ formatCurrency(data?.balance || 0) }}</p>
            </div>
          </div>
          <div class="flex gap-2">
            <button class="flex items-center gap-2 px-4 py-3 bg-white/20 hover:bg-white/30 rounded-xl transition-colors font-medium" @click="open('in')">
              <ArrowDownCircleIcon class="w-5 h-5" /> {{ t('cashDrawer.deposit') }}
            </button>
            <button class="flex items-center gap-2 px-4 py-3 bg-white/20 hover:bg-white/30 rounded-xl transition-colors font-medium" @click="open('out')">
              <ArrowUpCircleIcon class="w-5 h-5" /> {{ t('cashDrawer.withdraw') }}
            </button>
          </div>
        </div>
        <div v-if="data?.dailySummary" class="grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-white/20">
          <div>
            <p class="text-blue-200 text-xs">{{ t('cashDrawer.inPeriod') }}</p>
            <p class="text-lg font-semibold">+{{ formatCurrency(data.dailySummary.totalIn) }}</p>
          </div>
          <div>
            <p class="text-blue-200 text-xs">{{ t('cashDrawer.outPeriod') }}</p>
            <p class="text-lg font-semibold">-{{ formatCurrency(data.dailySummary.totalOut) }}</p>
          </div>
        </div>
      </div>

      <div class="card p-5">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h3 class="font-semibold text-gray-900 flex items-center gap-2"><ClockIcon class="w-5 h-5" /> {{ t('cashDrawer.history') }}</h3>
          <div class="w-full sm:w-64"><DateRangePicker v-model="range" :clearable="false" /></div>
        </div>
        <div v-if="data?.movements?.length" class="space-y-2">
          <div v-for="m in data.movements" :key="m.id" class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <div :class="['w-10 h-10 rounded-lg flex items-center justify-center shrink-0', tone(m.type, Number(m.amount))]">
              <component :is="isIn(m.type, Number(m.amount)) ? ArrowDownCircleIcon : ArrowUpCircleIcon" class="w-5 h-5" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-medium text-gray-900 truncate">{{ m.reason ? reasonLabel(m.reason) : t(`cashDrawer.types.${m.type}`) }}</p>
              <p class="text-xs text-gray-500">{{ when(m.createdAt) }} <span v-if="m.transactionNumber">• {{ m.transactionNumber }}</span></p>
            </div>
            <div class="text-end shrink-0">
              <p :class="['font-semibold', isIn(m.type, Number(m.amount)) ? 'text-success-600' : 'text-danger-600']">
                {{ isIn(m.type, Number(m.amount)) ? '+' : '-' }}{{ formatCurrency(Math.abs(Number(m.amount))) }}
              </p>
              <p class="text-xs text-gray-400">{{ t('cashDrawer.balanceAfter', { amount: formatCurrency(Number(m.balanceAfter)) }) }}</p>
            </div>
          </div>
        </div>
        <div v-else class="text-center py-10 text-gray-500">
          <InboxIcon class="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>{{ t('cashDrawer.noMovements') }}</p>
        </div>
      </div>
    </template>

    <Teleport to="body">
      <div v-if="mode" class="modal-overlay" @click.self="mode = null">
        <div class="modal-content max-w-md">
          <div class="modal-header">
            <div class="flex items-center gap-3">
              <div :class="['w-10 h-10 rounded-full flex items-center justify-center', mode === 'in' ? 'bg-success-100' : 'bg-danger-100']">
                <ArrowDownCircleIcon v-if="mode === 'in'" class="w-6 h-6 text-success-600" />
                <ArrowUpCircleIcon v-else class="w-6 h-6 text-danger-600" />
              </div>
              <h3 class="text-lg font-bold text-gray-900">{{ mode === 'in' ? t('cashDrawer.depositTitle') : t('cashDrawer.withdrawTitle') }}</h3>
            </div>
            <button class="p-1 hover:bg-gray-100 rounded" @click="mode = null"><XMarkIcon class="w-5 h-5" /></button>
          </div>
          <div class="modal-body space-y-4">
            <div>
              <label class="label">{{ mode === 'in' ? t('cashDrawer.amountIn') : t('cashDrawer.amountOut') }}</label>
              <div class="relative">
                <input v-model.number="amount" type="number" class="input text-2xl text-center font-bold pe-16" step="0.01" min="0" placeholder="0.00" />
                <span class="absolute end-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">DH</span>
              </div>
              <p v-if="mode === 'out'" class="text-xs text-gray-500 mt-1">{{ t('cashDrawer.currentBalance', { amount: formatCurrency(data?.balance || 0) }) }}</p>
            </div>
            <div>
              <label class="label">{{ t('cashDrawer.reason') }} <span class="text-red-500">*</span></label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="r in mode === 'in' ? DEPOSIT_REASONS : WITHDRAW_REASONS"
                  :key="r"
                  :class="[
                    'p-2 text-sm rounded-lg border transition-colors',
                    reason === r
                      ? mode === 'in'
                        ? 'border-success-500 bg-success-50 text-success-700 font-medium'
                        : 'border-danger-500 bg-danger-50 text-danger-700 font-medium'
                      : 'border-gray-200 hover:border-gray-300',
                  ]"
                  @click="reason = r"
                >
                  {{ reasonLabel(r) }}
                </button>
              </div>
              <input v-if="reason === OTHER_REASON" v-model="customReason" type="text" class="input mt-2" :placeholder="t('cashDrawer.reasonPlaceholder')" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" @click="mode = null">{{ t('common.cancel') }}</button>
            <button
              :class="['btn text-white inline-flex items-center gap-2', mode === 'in' ? 'bg-success-600 hover:bg-success-700' : 'bg-danger-600 hover:bg-danger-700']"
              :disabled="save.isPending.value || amount <= 0 || !finalReason"
              @click="submit"
            >
              {{ save.isPending.value ? t('common.saving') : mode === 'in' ? t('cashDrawer.deposit') : t('cashDrawer.withdraw') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
