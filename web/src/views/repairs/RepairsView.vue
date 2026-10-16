<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQuery } from '@tanstack/vue-query';
import {
  CheckCircleIcon,
  ClockIcon,
  EyeIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  PrinterIcon,
  QrCodeIcon,
  TruckIcon,
  WrenchScrewdriverIcon,
  XCircleIcon,
} from '@heroicons/vue/24/outline';
import { repairsApi } from '@/api/repairs';
import { useAuthStore } from '@/stores/auth';
import { formatCurrency } from '@/utils/format';
import { printRepairLabel, repairReceiptProps } from '@/utils/repairPrint';
import ReceiptModal from '@/components/pos/ReceiptModal.vue';
import Toast from '@/components/ui/Toast.vue';

const { t } = useI18n();
const auth = useAuthStore();
const query = ref('');
const status = ref('');
const { data: repairs, isLoading } = useQuery({
  queryKey: ['repairs', query, status],
  queryFn: () => repairsApi.getAll({ query: query.value || undefined, status: status.value || undefined }),
});

const formatDay = (d) => new Date(d).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: 'numeric' });
const STATUS = {
  pending: { cls: 'badge-warning', icon: ClockIcon },
  in_progress: { cls: 'badge-info', icon: WrenchScrewdriverIcon },
  completed: { cls: 'badge-success', icon: CheckCircleIcon },
  delivered: { cls: 'badge-secondary', icon: TruckIcon },
  cancelled: { cls: 'badge-danger', icon: XCircleIcon },
};
const activeCount = computed(() => (repairs.value || []).filter((r) => ['pending', 'in_progress', 'completed'].includes(r.status)).length);

const showTicket = ref(false);
const ticketRepair = ref(null);
const ticketProps = computed(() => (ticketRepair.value ? repairReceiptProps(ticketRepair.value, auth.storeName) : null));
async function openTicket(r) {
  ticketRepair.value = await repairsApi.getById(r.id).catch(() => r);
  showTicket.value = true;
}
const labelError = ref(false);
async function printLabel(r) {
  try {
    await printRepairLabel(await repairsApi.getById(r.id).catch(() => r), auth.storeName);
  } catch (e) {
    console.error('Label print failed:', e);
    labelError.value = true;
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">{{ t('repairs.title') }}</h1>
        <p class="text-gray-500 text-sm mt-1">{{ activeCount }} {{ t('repairs.activeRepairs') }}</p>
      </div>
      <RouterLink to="/app/repairs/new" class="btn-primary inline-flex items-center gap-2 self-start"><PlusIcon class="w-5 h-5" /> {{ t('repairs.newRepair') }}</RouterLink>
    </div>

    <div class="card p-4">
      <div class="flex flex-col sm:flex-row gap-4">
        <div class="relative flex-1 max-w-md">
          <MagnifyingGlassIcon class="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input v-model="query" type="text" :placeholder="t('repairs.searchPlaceholder')" class="input ps-10" />
        </div>
        <select v-model="status" class="input sm:w-auto">
          <option value="">{{ t('repairs.allStatus') }}</option>
          <option v-for="s in Object.keys(STATUS)" :key="s" :value="s">{{ t(`repairs.status.${s}`) }}</option>
        </select>
      </div>
    </div>

    <div class="card overflow-hidden">
      <div v-if="isLoading" class="p-8 text-center text-gray-500">{{ t('common.loading') }}</div>
      <div v-else-if="!repairs?.length" class="p-8 text-center text-gray-500">
        <WrenchScrewdriverIcon class="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p>{{ t('repairs.noRepairs') }}</p>
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
              <th class="px-4 py-3 text-start text-sm font-medium text-gray-500">{{ t('repairs.table.repair') }}</th>
              <th class="px-4 py-3 text-start text-sm font-medium text-gray-500">{{ t('repairs.table.client') }}</th>
              <th class="px-4 py-3 text-start text-sm font-medium text-gray-500">{{ t('repairs.table.device') }}</th>
              <th class="px-4 py-3 text-start text-sm font-medium text-gray-500">{{ t('repairs.table.repairer') }}</th>
              <th class="px-4 py-3 text-start text-sm font-medium text-gray-500">{{ t('repairs.table.status') }}</th>
              <th class="px-4 py-3 text-end text-sm font-medium text-gray-500">{{ t('repairs.table.price') }}</th>
              <th class="px-4 py-3 text-end text-sm font-medium text-gray-500">{{ t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="r in repairs" :key="r.id" class="hover:bg-gray-50">
              <td class="px-4 py-3">
                <p class="font-medium text-gray-900 whitespace-nowrap">{{ r.repairNumber }}</p>
                <p class="text-sm text-gray-500">{{ formatDay(r.receivedAt) }}</p>
              </td>
              <td class="px-4 py-3">
                <p class="text-gray-900">{{ r.customer?.firstName }} {{ r.customer?.lastName || '' }}</p>
                <p v-if="r.customer?.phone" class="text-sm text-gray-500">{{ r.customer.phone }}</p>
              </td>
              <td class="px-4 py-3"><p class="text-gray-900 truncate max-w-[200px]">{{ r.deviceDescription }}</p></td>
              <td class="px-4 py-3">
                <p v-if="r.repairer" class="text-gray-900 text-sm">{{ r.repairer.name }}</p>
                <p v-else class="text-gray-400 text-sm">-</p>
              </td>
              <td class="px-4 py-3">
                <span :class="['badge inline-flex items-center gap-1 whitespace-nowrap', STATUS[r.status]?.cls]">
                  <component :is="STATUS[r.status]?.icon" class="w-3.5 h-3.5" /> {{ t(`repairs.status.${r.status}`) }}
                </span>
              </td>
              <td class="px-4 py-3 text-end font-medium text-gray-900 whitespace-nowrap">{{ formatCurrency(r.fixedPrice) }}</td>
              <td class="px-4 py-3 text-end">
                <div class="flex items-center justify-end gap-2">
                  <RouterLink :to="`/app/repairs/${r.id}`" class="p-2 text-gray-400 hover:text-primary-600" :title="t('repairs.viewDetails')"><EyeIcon class="w-5 h-5" /></RouterLink>
                  <button class="p-2 text-gray-400 hover:text-primary-600" :title="t('common.print')" @click="openTicket(r)"><PrinterIcon class="w-5 h-5" /></button>
                  <button class="p-2 text-gray-400 hover:text-primary-600" :title="t('repairs.printLabel')" @click="printLabel(r)"><QrCodeIcon class="w-5 h-5" /></button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <Toast :show="labelError" :message="t('repairs.expenseError')" type="error" @close="labelError = false" />
    <ReceiptModal v-if="ticketProps" v-bind="ticketProps" :is-open="showTicket" @close="showTicket = false" />
  </div>
</template>
