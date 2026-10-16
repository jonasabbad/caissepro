<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { ArrowLeftIcon, UserIcon } from '@heroicons/vue/24/outline';
import { customersApi } from '@/api/customers';
import CustomerFields from '@/components/customers/CustomerFields.vue';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const customerId = computed(() => route.params.id);

const form = ref({ firstName: '', lastName: '', phone: '', email: '', cin: '', ice: '', address: '', city: '', notes: '' });
const { data: customer, isLoading } = useQuery({ queryKey: ['customer', customerId], queryFn: () => customersApi.getById(customerId.value) });
watch(
  customer,
  (c) => {
    if (!c) return;
    form.value = {
      firstName: c.firstName,
      lastName: c.lastName || '',
      phone: c.phone || '',
      email: c.email || '',
      cin: c.cin || '',
      ice: c.ice || '',
      address: c.address || '',
      city: c.city || '',
      notes: c.notes || '',
    };
  },
  { immediate: true },
);

const saveMutation = useMutation({
  mutationFn: () => customersApi.update(customerId.value, form.value),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['customer', customerId] });
    queryClient.invalidateQueries({ queryKey: ['customers'] });
    router.push(`/app/customers/${customerId.value}`);
  },
});
const submit = () => form.value.firstName.trim() && saveMutation.mutate();
</script>

<template>
  <div class="max-w-3xl space-y-6 px-4 sm:px-6 lg:px-8">
    <div class="flex items-center gap-4">
      <button class="rounded-lg p-2 hover:bg-gray-100" @click="router.back()"><ArrowLeftIcon class="h-5 w-5 text-gray-600 rtl:rotate-180" /></button>
      <div class="flex-1">
        <h1 class="text-2xl font-bold text-gray-900">{{ t('customers.edit') }}</h1>
        <p class="text-sm text-gray-500">{{ t('customers.editCustomerDetails') }}</p>
      </div>
    </div>
    <div v-if="isLoading" class="card p-8 text-center">
      <div class="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-black" />
      <p class="mt-2 text-gray-500">{{ t('common.loading') }}</p>
    </div>
    <form v-else class="space-y-6" @submit.prevent="submit">
      <div class="card">
        <div class="card-header">
          <div class="flex items-center gap-2">
            <UserIcon class="h-5 w-5 text-gray-600" />
            <h2 class="font-semibold text-gray-900">{{ t('customers.basicInfo') }}</h2>
          </div>
        </div>
        <div class="card-body"><CustomerFields v-model="form" detailed /></div>
      </div>
      <div class="flex items-center justify-end gap-3">
        <button type="button" class="btn-secondary" @click="router.back()">{{ t('common.cancel') }}</button>
        <button type="submit" class="btn-primary" :disabled="saveMutation.isPending.value || !form.firstName.trim()">
          {{ saveMutation.isPending.value ? t('common.saving') : t('common.save') }}
        </button>
      </div>
    </form>
  </div>
</template>
