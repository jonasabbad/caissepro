<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { ArrowLeftIcon, BuildingStorefrontIcon } from '@heroicons/vue/24/outline';
import { suppliersApi } from '@/api/suppliers';
import SupplierFields from '@/components/suppliers/SupplierFields.vue';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const supplierId = computed(() => route.params.id);

const form = ref({ name: '', contactName: '', phone: '', email: '', address: '', city: '' });
const { data: supplier, isLoading } = useQuery({ queryKey: ['supplier', supplierId], queryFn: () => suppliersApi.getById(supplierId.value) });
watch(
  supplier,
  (s) => {
    if (!s) return;
    form.value = { name: s.name, contactName: s.contactName || '', phone: s.phone || '', email: s.email || '', address: s.address || '', city: s.city || '' };
  },
  { immediate: true },
);
const saveMutation = useMutation({
  mutationFn: () => suppliersApi.update(supplierId.value, form.value),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['supplier', supplierId] });
    queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    router.push(`/app/suppliers/${supplierId.value}`);
  },
});
</script>

<template>
  <div class="max-w-3xl space-y-6 px-4 sm:px-6 lg:px-8">
    <div class="flex items-center gap-4">
      <button class="rounded-lg p-2 hover:bg-gray-100" @click="router.back()"><ArrowLeftIcon class="h-5 w-5 text-gray-600 rtl:rotate-180" /></button>
      <h1 class="text-2xl font-bold text-gray-900">{{ t('suppliers.edit') }}</h1>
    </div>
    <div v-if="isLoading" class="card p-8 text-center"><div class="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-black" /></div>
    <form v-else class="space-y-6" @submit.prevent="form.name.trim() && saveMutation.mutate()">
      <div class="card">
        <div class="card-header flex items-center gap-2">
          <BuildingStorefrontIcon class="h-5 w-5 text-gray-600" />
          <h2 class="font-semibold text-gray-900">{{ t('suppliers.supplier') }}</h2>
        </div>
        <div class="card-body"><SupplierFields v-model="form" /></div>
      </div>
      <div class="flex items-center justify-end gap-3">
        <button type="button" class="btn-secondary" @click="router.back()">{{ t('common.cancel') }}</button>
        <button type="submit" class="btn-primary" :disabled="saveMutation.isPending.value || !form.name.trim()">
          {{ saveMutation.isPending.value ? t('common.saving') : t('common.save') }}
        </button>
      </div>
    </form>
  </div>
</template>
