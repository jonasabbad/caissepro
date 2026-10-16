<script setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { BuildingStorefrontIcon, EyeIcon, MagnifyingGlassIcon, PencilIcon, PhoneIcon, PlusIcon, TrashIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import { suppliersApi } from '@/api/suppliers';
import { formatCurrency } from '@/utils/format';
import SupplierFields from '@/components/suppliers/SupplierFields.vue';
import ConfirmModal from '@/components/ui/ConfirmModal.vue';

const { t } = useI18n();
const queryClient = useQueryClient();
const search = ref('');
const { data, isLoading } = useQuery({ queryKey: ['suppliers', search], queryFn: () => suppliersApi.getAll({ query: search.value }) });

const emptyForm = () => ({ name: '', contactName: '', phone: '', email: '', address: '', city: '' });
const formOpen = ref(false);
const editing = ref(null);
const form = ref(emptyForm());
function openCreate() {
  form.value = emptyForm();
  editing.value = null;
  formOpen.value = true;
}
function openEdit(s) {
  editing.value = s;
  form.value = { name: s.name, contactName: s.contactName || '', phone: s.phone || '', email: s.email || '', address: s.address || '', city: s.city || '' };
  formOpen.value = true;
}
const saveMutation = useMutation({
  mutationFn: () => (editing.value ? suppliersApi.update(editing.value.id, form.value) : suppliersApi.create(form.value)),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    formOpen.value = false;
  },
});
const save = () => form.value.name.trim() && saveMutation.mutate();

const confirmOpen = ref(false);
const pendingDelete = ref(null);
const deleteMutation = useMutation({ mutationFn: (id) => suppliersApi.delete(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }) });
function confirmDelete() {
  if (pendingDelete.value) deleteMutation.mutate(pendingDelete.value);
  confirmOpen.value = false;
  pendingDelete.value = null;
}
const th = 'px-4 py-3 text-start text-sm font-medium text-gray-500';
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <h1 class="text-2xl font-bold text-gray-900">{{ t('nav.suppliers') }}</h1>
      <button class="btn-primary inline-flex items-center gap-2" @click="openCreate"><PlusIcon class="h-5 w-5" /> {{ t('suppliers.add') }}</button>
    </div>
    <div class="card p-4">
      <div class="relative max-w-md">
        <MagnifyingGlassIcon class="absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <input v-model="search" type="text" :placeholder="t('suppliers.search')" class="input ps-10" />
      </div>
    </div>
    <div class="card overflow-hidden">
      <div v-if="isLoading" class="p-8 text-center text-gray-500">{{ t('common.loading') }}</div>
      <div v-else-if="data?.suppliers?.length" class="overflow-x-auto">
        <table class="w-full">
          <thead class="border-b border-gray-200 bg-gray-50">
            <tr>
              <th :class="th">{{ t('suppliers.supplier') }}</th>
              <th :class="th">{{ t('suppliers.contact') }}</th>
              <th :class="th">{{ t('suppliers.balance') }}</th>
              <th :class="th">{{ t('suppliers.orders') }}</th>
              <th :class="[th, 'text-end']">{{ t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="s in data.suppliers" :key="s.id" class="hover:bg-gray-50">
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100"><BuildingStorefrontIcon class="h-5 w-5 text-primary-600" /></div>
                  <div>
                    <p class="font-medium text-gray-900">{{ s.name }}</p>
                    <p v-if="s.city" class="text-sm text-gray-500">{{ s.city }}</p>
                  </div>
                </div>
              </td>
              <td class="px-4 py-3">
                <p v-if="s.contactName" class="text-gray-900">{{ s.contactName }}</p>
                <p v-if="s.phone" class="flex items-center gap-1 text-sm text-gray-500"><PhoneIcon class="h-4 w-4" /> {{ s.phone }}</p>
              </td>
              <td class="px-4 py-3">
                <span v-if="s.balance < 0" class="font-medium text-danger-600">{{ formatCurrency(Math.abs(s.balance)) }}</span>
                <span v-else class="text-gray-400">-</span>
              </td>
              <td class="px-4 py-3 text-gray-500">{{ s.orderCount || 0 }}</td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-end gap-1">
                  <RouterLink :to="`/app/suppliers/${s.id}`" class="p-2 text-gray-400 hover:text-primary-600"><EyeIcon class="h-5 w-5" /></RouterLink>
                  <button class="p-2 text-gray-400 hover:text-primary-600" @click="openEdit(s)"><PencilIcon class="h-5 w-5" /></button>
                  <button
                    class="p-2 text-gray-400 hover:text-danger-600"
                    @click="
                      pendingDelete = s.id;
                      confirmOpen = true;
                    "
                  >
                    <TrashIcon class="h-5 w-5" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="p-8 text-center text-gray-500">
        <BuildingStorefrontIcon class="mx-auto mb-3 h-12 w-12 text-gray-300" />
        <p>{{ t('suppliers.noSuppliers') }}</p>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="formOpen" class="modal-overlay" @click.self="formOpen = false">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="text-lg font-bold text-gray-900">{{ editing ? t('suppliers.edit') : t('suppliers.add') }}</h3>
            <button class="rounded p-1 hover:bg-gray-100" @click="formOpen = false"><XMarkIcon class="h-5 w-5" /></button>
          </div>
          <form class="flex min-h-0 flex-col" @submit.prevent="save">
            <div class="modal-body"><SupplierFields v-model="form" /></div>
            <div class="modal-footer">
              <button type="button" class="btn-secondary" @click="formOpen = false">{{ t('common.cancel') }}</button>
              <button type="submit" class="btn-primary" :disabled="saveMutation.isPending.value">
                {{
                  saveMutation.isPending.value
                    ? editing
                      ? t('common.updating')
                      : t('common.creating')
                    : editing
                      ? t('common.update')
                      : t('common.create')
                }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
    <ConfirmModal
      :show="confirmOpen"
      :title="t('common.confirm')"
      :message="t('suppliers.confirmDelete')"
      :confirm-text="t('common.delete')"
      :cancel-text="t('common.cancel')"
      type="danger"
      @confirm="confirmDelete"
      @cancel="confirmOpen = false"
    />
  </div>
</template>
