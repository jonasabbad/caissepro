<script setup>
import { intlLocale } from '@/i18n';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { ArchiveBoxXMarkIcon, ArrowLeftIcon, ArrowUturnLeftIcon, EyeIcon, MagnifyingGlassIcon } from '@heroicons/vue/24/outline';
import { invoicesApi } from '@/api/invoices';
import { formatCurrency } from '@/utils/format';

const { t } = useI18n();
const queryClient = useQueryClient();
const query = ref('');
const page = ref(1);
const limit = ref(20);
const { data, isLoading } = useQuery({
  queryKey: ['invoices', 'archived', query, page, limit],
  queryFn: () => invoicesApi.getAll({ query: query.value || undefined, isArchived: true, page: page.value, limit: limit.value }),
});
const invoices = computed(() => data.value?.invoices || []);
const total = computed(() => data.value?.total || 0);
const totalPages = computed(() => Math.ceil(total.value / limit.value));
const unarchive = useMutation({
  mutationFn: (id) => invoicesApi.unarchive(id),
  onSuccess: () => {
    for (const k of ['invoices', 'quarterly-totals', 'ir-month', 'ir-trimestre', 'ir-year', 'tva-month', 'tva-trimestre', 'tva-year']) queryClient.invalidateQueries({ queryKey: [k] });
  },
});
const formatWhen = (d) => new Date(d).toLocaleDateString(intlLocale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
</script>

<template>
  <div class="space-y-6">
    <div>
      <div class="flex items-center gap-3">
        <RouterLink to="/app/invoices" class="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><ArrowLeftIcon class="w-5 h-5 rtl:rotate-180" /></RouterLink>
        <h1 class="text-2xl font-bold text-gray-900">{{ t('invoices.archived') }}</h1>
      </div>
      <p class="text-gray-500 mt-1">{{ t('invoices.archivedSubtitle') }}</p>
    </div>

    <div class="card p-4">
      <div class="relative">
        <MagnifyingGlassIcon class="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input v-model="query" type="text" :placeholder="t('invoices.search')" class="input ps-10" @input="page = 1" />
      </div>
    </div>

    <div class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
              <th class="px-4 py-3 text-start text-sm font-medium text-gray-500">{{ t('invoices.number') }}</th>
              <th class="px-4 py-3 text-start text-sm font-medium text-gray-500">{{ t('invoices.date') }}</th>
              <th class="px-4 py-3 text-start text-sm font-medium text-gray-500">{{ t('invoices.customer') }}</th>
              <th class="px-4 py-3 text-end text-sm font-medium text-gray-500">{{ t('invoices.subtotalHT') }}</th>
              <th class="px-4 py-3 text-end text-sm font-medium text-gray-500">{{ t('invoices.tvaAmount') }}</th>
              <th class="px-4 py-3 text-end text-sm font-medium text-gray-500">{{ t('invoices.totalTTC') }}</th>
              <th class="px-4 py-3 text-end text-sm font-medium text-gray-500">{{ t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-if="isLoading"><td colspan="7" class="px-4 py-8 text-center text-gray-500">{{ t('common.loading') }}</td></tr>
            <tr v-else-if="!invoices.length">
              <td colspan="7" class="px-4 py-8 text-center text-gray-500">
                <ArchiveBoxXMarkIcon class="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>{{ t('invoices.noArchivedInvoices') }}</p>
              </td>
            </tr>
            <tr v-for="inv in invoices" :key="inv.id" class="hover:bg-gray-50">
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <span class="font-mono font-medium text-gray-900 whitespace-nowrap">{{ inv.invoiceNumber }}</span>
                  <span v-if="inv.type === 'standalone'" class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">{{ t('invoices.types.standalone') }}</span>
                </div>
              </td>
              <td class="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{{ formatWhen(inv.date) }}</td>
              <td class="px-4 py-3">
                <span v-if="inv.customer" class="text-gray-900">{{ inv.customer.fullName }}</span>
                <span v-else class="text-gray-400">{{ t('invoices.walkIn') }}</span>
              </td>
              <td class="px-4 py-3 text-end whitespace-nowrap">{{ formatCurrency(inv.subtotal) }}</td>
              <td class="px-4 py-3 text-end whitespace-nowrap">{{ formatCurrency(inv.taxAmount) }}</td>
              <td class="px-4 py-3 text-end font-medium whitespace-nowrap">{{ formatCurrency(inv.totalAmount) }}</td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-end gap-1">
                  <RouterLink :to="`/app/invoices/${inv.id}/preview`" class="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50" :title="t('invoices.preview')"><EyeIcon class="w-5 h-5" /></RouterLink>
                  <button
                    class="p-2 text-gray-400 hover:text-green-600 rounded-lg hover:bg-green-50"
                    :disabled="unarchive.isPending.value"
                    :title="t('invoices.unarchive')"
                    @click="unarchive.mutate(inv.id)"
                  >
                    <ArrowUturnLeftIcon class="w-5 h-5" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="totalPages > 1" class="flex items-center justify-between px-4 py-3 border-t border-gray-200">
        <p class="text-sm text-gray-500">{{ t('common.showing') }} {{ (page - 1) * limit + 1 }} - {{ Math.min(page * limit, total) }} {{ t('common.of') }} {{ total }}</p>
        <div class="flex gap-2">
          <button class="btn-secondary px-3 py-1 text-sm" :disabled="page === 1" @click="page--">{{ t('common.previous') }}</button>
          <button class="btn-secondary px-3 py-1 text-sm" :disabled="page >= totalPages" @click="page++">{{ t('common.next') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
