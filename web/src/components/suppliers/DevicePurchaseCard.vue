<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQuery } from '@tanstack/vue-query';
import { DocumentTextIcon, ShoppingBagIcon } from '@heroicons/vue/24/outline';
import { soldUnitsApi } from '@/api/soldUnits';
import { formatCurrency } from '@/utils/format';
import { shortDay } from '@/utils/supplierInvoice';

/**
 * Purchase traceability of one phone or device: supplier, original supplier order, that order's purchase invoice
 * (one invoice per order, shared by every device bought with it — never one per device), purchase date and this
 * device's own cost. Read-only: the invoice opens complete (with every other item of the order) from here; nothing
 * is generated here. A device with no purchase record shows that, and nothing invented.
 */
const props = defineProps({ unitId: { type: String, required: true } });
const { t } = useI18n();
const id = computed(() => props.unitId);
const { data: p, isLoading } = useQuery({ queryKey: ['device-purchase', id], queryFn: () => soldUnitsApi.purchase(id.value) });
// Not recorded: nothing to show but that. Otherwise only the fields that hold something.
const notRecorded = computed(() => p.value?.source === 'unknown');
</script>

<template>
  <section class="card p-4" :aria-label="t('supplierInvoices.purchase.title')">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 class="flex items-center gap-2 font-semibold text-gray-900">
        <ShoppingBagIcon class="h-5 w-5 text-gray-500" /> {{ t('supplierInvoices.purchase.title') }}
      </h2>
      <RouterLink v-if="p?.invoice" :to="`/app/supplier-invoices/${p.invoice.id}`" class="btn-secondary btn-sm inline-flex items-center gap-1.5">
        <DocumentTextIcon class="h-4 w-4" /> {{ t('supplierInvoices.purchase.openInvoice') }}
      </RouterLink>
    </div>

    <p v-if="isLoading" class="text-sm text-gray-500">{{ t('common.loading') }}</p>
    <p v-else-if="p && notRecorded" class="text-sm text-gray-500">{{ t('supplierInvoices.purchase.notRecorded') }}</p>
    <template v-else-if="p">
      <dl class="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
        <div>
          <dt class="text-xs text-gray-500">{{ p.supplier ? t('supplierInvoices.purchase.supplier') : t('supplierInvoices.purchase.source') }}</dt>
          <dd class="font-medium text-gray-900">
            <RouterLink v-if="p.supplier" :to="`/app/suppliers/${p.supplier.id}`" class="hover:text-primary-700 hover:underline">{{ p.supplier.name }}</RouterLink>
            <template v-else>
              {{ t(`supplierInvoices.purchase.sources.${p.source}`) }}
              <span v-if="p.note" class="block text-xs font-normal text-gray-500">{{ p.note }}</span>
            </template>
          </dd>
        </div>
        <div v-if="p.order">
          <dt class="text-xs text-gray-500">{{ t('supplierInvoices.purchase.order') }}</dt>
          <dd class="font-medium text-gray-900">
            <RouterLink :to="`/app/supplier-orders/${p.order.id}`" class="font-mono hover:text-primary-700 hover:underline" dir="ltr">{{ p.order.orderNumber }}</RouterLink>
          </dd>
        </div>
        <div v-if="p.order">
          <dt class="text-xs text-gray-500">{{ t('supplierInvoices.purchase.invoice') }}</dt>
          <dd class="font-medium text-gray-900">
            <template v-if="p.invoice">
              <RouterLink :to="`/app/supplier-invoices/${p.invoice.id}`" class="font-mono hover:text-primary-700 hover:underline" dir="ltr">{{ p.invoice.number }}</RouterLink>
              <span v-if="p.invoice.supplierRef || p.invoice.status === 'draft'" class="block text-xs font-normal text-gray-500">
                <template v-if="p.invoice.supplierRef">{{ p.invoice.supplierRef }}</template>
                <template v-if="p.invoice.supplierRef && p.invoice.status === 'draft'"> · </template>
                <template v-if="p.invoice.status === 'draft'">{{ t('supplierInvoices.status.draft') }}</template>
              </span>
            </template>
            <span v-else class="text-gray-400">—</span>
          </dd>
        </div>
        <div v-if="p.purchaseDate">
          <dt class="text-xs text-gray-500">{{ t('supplierInvoices.purchase.date') }}</dt>
          <dd class="font-medium tabular-nums text-gray-900">{{ shortDay(p.purchaseDate) }}</dd>
        </div>
        <div v-if="p.purchasePrice != null">
          <dt class="text-xs text-gray-500">{{ t('supplierInvoices.purchase.cost') }}</dt>
          <dd class="font-semibold tabular-nums text-gray-900">{{ formatCurrency(p.purchasePrice) }}</dd>
        </div>
      </dl>
      <p v-if="p.order && !p.invoice" class="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-500">{{ t('supplierInvoices.purchase.noInvoiceYet') }}</p>
      <p v-else-if="!p.order && p.supplier" class="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-500">{{ t('supplierInvoices.purchase.noOrder') }}</p>
      <p v-else-if="!p.order" class="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-500">{{ t('supplierInvoices.purchase.otherNoInvoice') }}</p>
    </template>
  </section>
</template>
