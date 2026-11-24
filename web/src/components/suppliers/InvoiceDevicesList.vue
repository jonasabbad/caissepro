<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { DevicePhoneMobileIcon } from '@heroicons/vue/24/outline';
import { formatImei } from '@/api/soldUnits';
import { formatCurrency } from '@/utils/format';

/**
 * The phones and devices bought on a supplier order, on that order's one purchase invoice: each with its own IMEI or
 * serial number, specifications and cost. Sold devices stay listed (the invoice keeps its history).
 */
const props = defineProps({ devices: { type: Array, default: () => [] } });
const { t } = useI18n();
const name = (d) => [d.brand, d.model].filter(Boolean).join(' ');
const specs = (d) => [d.storage, d.ram, d.color].filter(Boolean).join(' · ');
const code = (d) => (d.imei ? formatImei(d.imei) : d.serialNumber || '—');
const total = computed(() => props.devices.reduce((s, d) => s + Number(d.purchasePrice || 0), 0));
</script>

<template>
  <section class="card overflow-hidden" :aria-label="t('supplierInvoices.devices.title')">
    <header class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
      <div class="flex items-center gap-2">
        <DevicePhoneMobileIcon class="h-5 w-5 text-gray-500" />
        <h2 class="font-semibold text-gray-900">{{ t('supplierInvoices.devices.title') }} <span class="text-gray-400">· {{ devices.length }}</span></h2>
      </div>
      <p class="text-xs text-gray-500">{{ t('supplierInvoices.devices.hint') }}</p>
    </header>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 text-xs text-gray-500">
          <tr>
            <th class="px-4 py-2 text-start font-medium">{{ t('supplierInvoices.devices.device') }}</th>
            <th class="px-4 py-2 text-start font-medium">{{ t('supplierInvoices.devices.code') }}</th>
            <th class="px-4 py-2 text-end font-medium">{{ t('supplierInvoices.devices.cost') }}</th>
            <th class="px-4 py-2 text-end font-medium">{{ t('common.status') }}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="d in devices" :key="d.id">
            <td class="px-4 py-2.5">
              <RouterLink :to="`/app/sold-units/${d.id}/edit`" class="font-medium text-gray-900 hover:text-primary-700 hover:underline">{{ name(d) }}</RouterLink>
              <span v-if="specs(d)" class="block text-xs text-gray-500">{{ specs(d) }}</span>
            </td>
            <td class="px-4 py-2.5 font-mono text-xs text-gray-700" dir="ltr">{{ code(d) }}</td>
            <td class="px-4 py-2.5 text-end tabular-nums text-gray-900">{{ formatCurrency(d.purchasePrice) }}</td>
            <td class="px-4 py-2.5 text-end">
              <span :class="['rounded-full px-2 py-0.5 text-[11px] font-medium', d.soldAt ? 'bg-gray-100 text-gray-600' : 'bg-success-50 text-success-700']">
                {{ d.soldAt ? t('supplierInvoices.devices.sold') : t('supplierInvoices.devices.inStock') }}
              </span>
            </td>
          </tr>
        </tbody>
        <tfoot class="border-t border-gray-200 bg-gray-50">
          <tr>
            <td colspan="2" class="px-4 py-2 text-gray-600">{{ t('supplierInvoices.devices.totalCost') }}</td>
            <td class="px-4 py-2 text-end font-semibold tabular-nums text-gray-900">{{ formatCurrency(total) }}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  </section>
</template>
