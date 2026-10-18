<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useQuery } from '@tanstack/vue-query';
import { ArrowLeftIcon, BanknotesIcon, ClipboardDocumentListIcon, DocumentChartBarIcon, DocumentTextIcon, EnvelopeIcon, MapPinIcon, PencilIcon, PhoneIcon, PlusIcon, ShoppingBagIcon, UserIcon } from '@heroicons/vue/24/outline';
import { suppliersApi } from '@/api/suppliers';
import { formatCurrency, formatDate } from '@/utils/format';
import { statusInfo } from '@/utils/supplierOrderStatus';
import { supplierInvoicesApi } from '@/api/supplierInvoices';
import { invoiceBadge, shortDay } from '@/utils/supplierInvoice';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const supplierId = computed(() => route.params.id);

const { data: supplier, isLoading } = useQuery({ queryKey: ['supplier', supplierId], queryFn: () => suppliersApi.getById(supplierId.value) });
const { data: orders, isLoading: ordersLoading } = useQuery({
  queryKey: ['supplier-orders', supplierId],
  queryFn: () => suppliersApi.getOrders(supplierId.value),
  enabled: computed(() => !!supplierId.value),
});
const { data: invoices, isLoading: invoicesLoading } = useQuery({
  queryKey: ['supplier-invoices', 'supplier', supplierId],
  queryFn: () => supplierInvoicesApi.getAll({ supplierId: supplierId.value, limit: 10 }),
  enabled: computed(() => !!supplierId.value),
});
</script>

<template>
  <div class="max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4">
        <button class="rounded-lg p-2 hover:bg-gray-100" @click="router.back()"><ArrowLeftIcon class="h-5 w-5 text-gray-600 rtl:rotate-180" /></button>
        <div v-if="supplier">
          <h1 class="text-2xl font-bold text-gray-900">{{ supplier.name }}</h1>
          <p class="text-sm text-gray-500">{{ t('suppliers.supplier') }}</p>
        </div>
      </div>
      <div v-if="supplier" class="flex flex-wrap gap-2">
        <RouterLink :to="`/app/suppliers/${supplier.id}/statement`" class="btn-secondary inline-flex items-center gap-2"><DocumentChartBarIcon class="h-5 w-5" /> {{ t('supplierInvoices.statement') }}</RouterLink>
        <RouterLink :to="`/app/supplier-invoices/new?supplierId=${supplier.id}`" class="btn-secondary inline-flex items-center gap-2"><PlusIcon class="h-5 w-5" /> {{ t('suppliers.newInvoice') }}</RouterLink>
        <RouterLink :to="`/app/suppliers/${supplier.id}/edit`" class="btn-secondary inline-flex items-center gap-2"><PencilIcon class="h-5 w-5" /> {{ t('common.edit') }}</RouterLink>
      </div>
    </div>

    <div v-if="isLoading" class="card p-8 text-center"><div class="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-black" /></div>
    <template v-else-if="supplier">
      <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div class="card p-4">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100"><ClipboardDocumentListIcon class="h-5 w-5 text-primary-600" /></div>
            <div>
              <p class="text-sm text-gray-500">{{ t('suppliers.invoicesCount') }} / {{ t('suppliers.orders') }}</p>
              <p class="text-xl font-bold text-gray-900">{{ supplier.invoiceCount || 0 }} / {{ supplier.orderCount || 0 }}</p>
            </div>
          </div>
        </div>
        <div class="card p-4">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-success-100"><ShoppingBagIcon class="h-5 w-5 text-success-600" /></div>
            <div>
              <p class="text-sm text-gray-500">{{ t('suppliers.totalPurchases') }}</p>
              <p class="text-xl font-bold text-gray-900">{{ formatCurrency(supplier.totalPurchases || 0) }}</p>
            </div>
          </div>
        </div>
        <div class="card p-4">
          <div class="flex items-center gap-3">
            <div :class="['flex h-10 w-10 items-center justify-center rounded-full', (supplier.balance || 0) < 0 ? 'bg-danger-100' : 'bg-gray-100']">
              <BanknotesIcon :class="['h-5 w-5', (supplier.balance || 0) < 0 ? 'text-danger-600' : 'text-gray-600']" />
            </div>
            <div>
              <p class="text-sm text-gray-500">{{ t('suppliers.outstanding') }}</p>
              <p :class="['text-xl font-bold', (supplier.balance || 0) < 0 ? 'text-danger-600' : 'text-gray-900']">{{ formatCurrency(Math.abs(supplier.balance || 0)) }}</p>
              <p v-if="supplier.overdue > 0" class="text-xs font-medium text-amber-700">{{ t('suppliers.overdueShort', { amount: formatCurrency(supplier.overdue) }) }}</p>
            </div>
          </div>
        </div>
        <div class="card p-4">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-success-100"><BanknotesIcon class="h-5 w-5 text-success-600" /></div>
            <div>
              <p class="text-sm text-gray-500">{{ t('suppliers.totalPaid') }}</p>
              <p class="text-xl font-bold text-gray-900">{{ formatCurrency(supplier.totalPaid || 0) }}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="card p-6">
        <h2 class="mb-4 font-semibold text-gray-900">{{ t('suppliers.contactInfo') }}</h2>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div class="flex items-center gap-3">
            <PhoneIcon class="h-5 w-5 text-gray-400" />
            <div>
              <p class="text-sm text-gray-500">{{ t('suppliers.phone') }}</p>
              <p class="font-medium">{{ supplier.phone || '-' }}</p>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <EnvelopeIcon class="h-5 w-5 text-gray-400" />
            <div>
              <p class="text-sm text-gray-500">{{ t('suppliers.email') }}</p>
              <p class="font-medium">{{ supplier.email || '-' }}</p>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <UserIcon class="h-5 w-5 text-gray-400" />
            <div>
              <p class="text-sm text-gray-500">{{ t('suppliers.contact') }}</p>
              <p class="font-medium">{{ supplier.contactName || '-' }}</p>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <MapPinIcon class="h-5 w-5 text-gray-400" />
            <div>
              <p class="text-sm text-gray-500">{{ t('suppliers.address') }}</p>
              <p class="font-medium">{{ [supplier.address, supplier.city].filter(Boolean).join(', ') || '-' }}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="card overflow-hidden">
        <div class="flex items-center justify-between border-b border-gray-200 p-4">
          <h2 class="font-semibold text-gray-900">{{ t('suppliers.recentInvoices') }}</h2>
          <RouterLink :to="`/app/supplier-invoices?supplierId=${supplier.id}`" class="text-sm font-medium text-primary-600 hover:text-primary-700">{{ t('common.viewAll') }}</RouterLink>
        </div>
        <div v-if="invoicesLoading" class="p-8 text-center"><div class="mx-auto h-6 w-6 animate-spin rounded-full border-b-2 border-black" /></div>
        <div v-else-if="invoices?.invoices?.length" class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('supplierInvoices.number') }}</th>
                <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('supplierInvoices.invoiceDate') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('supplierInvoices.total') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('supplierInvoices.remaining') }}</th>
                <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('common.status') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="inv in invoices.invoices" :key="inv.id" class="cursor-pointer hover:bg-gray-50" @click="router.push(`/app/supplier-invoices/${inv.id}`)">
                <td class="px-4 py-3 font-mono font-medium text-gray-900">{{ inv.number }}</td>
                <td class="px-4 py-3 text-gray-500">{{ shortDay(inv.invoiceDate) }}</td>
                <td class="px-4 py-3 text-end">{{ formatCurrency(inv.total) }}</td>
                <td :class="['px-4 py-3 text-end', inv.status === 'confirmed' && inv.remaining > 0 ? 'font-medium text-danger-600' : 'text-gray-500']">{{ inv.status === 'cancelled' ? '—' : formatCurrency(inv.remaining) }}</td>
                <td class="px-4 py-3"><span :class="['rounded-full px-2 py-0.5 text-xs font-medium', invoiceBadge(inv).cls]">{{ t(invoiceBadge(inv).key) }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="p-8 text-center text-gray-500">
          <DocumentTextIcon class="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <p>{{ t('suppliers.noInvoices') }}</p>
        </div>
      </div>

      <div class="card overflow-hidden">
        <div class="flex items-center justify-between border-b border-gray-200 p-4">
          <h2 class="font-semibold text-gray-900">{{ t('suppliers.recentOrders') }}</h2>
          <RouterLink :to="`/app/supplier-orders?supplierId=${supplier.id}`" class="text-sm font-medium text-primary-600 hover:text-primary-700">
            {{ t('common.viewAll') }}
          </RouterLink>
        </div>
        <div v-if="ordersLoading" class="p-8 text-center"><div class="mx-auto h-6 w-6 animate-spin rounded-full border-b-2 border-black" /></div>
        <div v-else-if="orders?.length" class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('supplierOrders.order') }}</th>
                <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('supplierOrders.statusHeader') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('supplierOrders.amount') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('supplierOrders.paid') }}</th>
                <th class="px-4 py-3 text-end font-medium text-gray-500">{{ t('supplierOrders.remaining') }}</th>
                <th class="px-4 py-3 text-start font-medium text-gray-500">{{ t('inventoryMovements.date') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="o in orders" :key="o.id" class="cursor-pointer hover:bg-gray-50" @click="router.push(`/app/supplier-orders/${o.id}`)">
                <td class="px-4 py-3 font-medium text-gray-900">{{ o.orderNumber }}</td>
                <td class="px-4 py-3">
                  <span :class="['inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', statusInfo(o.status).badge]">
                    <component :is="statusInfo(o.status).icon" class="h-3 w-3" /> {{ t(statusInfo(o.status).labelKey) }}
                  </span>
                </td>
                <td class="px-4 py-3 text-end">{{ formatCurrency(o.totalAmount) }}</td>
                <td class="px-4 py-3 text-end text-gray-500">{{ formatCurrency(o.amountPaid) }}</td>
                <td :class="['px-4 py-3 text-end', Number(o.amountRemaining) > 0 ? 'font-medium text-danger-600' : 'text-gray-500']">
                  {{ formatCurrency(o.amountRemaining) }}
                </td>
                <td class="px-4 py-3 text-gray-500">{{ formatDate(o.orderedAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="p-8 text-center text-gray-500">
          <ClipboardDocumentListIcon class="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <p>{{ t('suppliers.noOrdersForSupplier') }}</p>
        </div>
      </div>
    </template>
  </div>
</template>
