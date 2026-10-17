<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { PencilSquareIcon, PlusIcon, TrashIcon } from '@heroicons/vue/24/outline';
import { usersApi } from '@/api/users';
import { subscriptionsApi } from '@/api/subscriptions';
import { storesApi } from '@/api/misc';
import { Roles } from '@/config/constants';
import ConfirmModal from '@/components/ui/ConfirmModal.vue';

/** Cashier accounts. The owner account counts towards the plan limit but is not listed here. */
const { t } = useI18n();
const queryClient = useQueryClient();
const showForm = ref(false);
const editing = ref(null);
const saving = ref(false);
const showPassword = ref(false);
const formError = ref('');
const toDelete = ref(null);
const blank = () => ({ email: '', password: '', firstName: '', lastName: '', roles: [Roles.CASHIER], currentStoreId: undefined });
const form = ref(blank());

const { data: users, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => usersApi.getAll() });
const { data: usage } = useQuery({ queryKey: ['subscription-usage'], queryFn: () => subscriptionsApi.getUsage() });
const { data: stores } = useQuery({ queryKey: ['stores'], queryFn: () => storesApi.getAll() });
const seats = computed(() => {
  if (!usage.value?.usage || !usage.value?.limits) return { current: 0, max: 0 };
  return { current: Math.max(0, (usage.value.usage.users || 0) - 1), max: Math.max(0, (usage.value.limits.maxUsers || 0) - 1) };
});
const canAdd = computed(() => seats.value.current < seats.value.max);
const multiStore = computed(() => (stores.value?.length ?? 0) > 1);
const onlyStoreId = computed(() => (stores.value?.length === 1 ? stores.value[0].id : null));
const cashiers = computed(() => (users.value || []).filter((u) => u.roles.includes(Roles.CASHIER)));

const refresh = () => {
  queryClient.invalidateQueries({ queryKey: ['users'] });
  queryClient.invalidateQueries({ queryKey: ['subscription-usage'] });
};
const createMut = useMutation({ mutationFn: (dto) => usersApi.create(dto), onSuccess: () => (refresh(), closeForm()) });
const updateMut = useMutation({ mutationFn: ({ id, dto }) => usersApi.update(id, dto), onSuccess: () => (refresh(), closeForm()) });
const deleteMut = useMutation({ mutationFn: (id) => usersApi.delete(id), onSuccess: () => (refresh(), (toDelete.value = null)) });

function closeForm() {
  showForm.value = false;
  editing.value = null;
  form.value = blank();
  showPassword.value = false;
  formError.value = '';
}
function openCreate() {
  editing.value = null;
  form.value = blank();
  if (onlyStoreId.value) form.value.currentStoreId = onlyStoreId.value;
  formError.value = '';
  showForm.value = true;
}
function openEdit(u) {
  editing.value = u;
  form.value = { email: u.email, password: '', firstName: u.firstName, lastName: u.lastName, roles: u.roles, currentStoreId: u.currentStoreId || onlyStoreId.value || undefined };
  formError.value = '';
  showForm.value = true;
}
async function save() {
  const f = form.value;
  if (!f.email || !f.firstName || !f.lastName) return (formError.value = t('errors.required'));
  if (!f.currentStoreId) return (formError.value = multiStore.value ? 'Le magasin est obligatoire' : 'Erreur : magasin non assigné');
  if (!editing.value && !f.password) return (formError.value = t('users.errors.passwordRequired'));
  const dto = { email: f.email, firstName: f.firstName, lastName: f.lastName, roles: f.roles, currentStoreId: f.currentStoreId, ...(f.password && { password: f.password }) };
  saving.value = true;
  formError.value = '';
  try {
    if (editing.value) await updateMut.mutateAsync({ id: editing.value.id, dto });
    else await createMut.mutateAsync(dto);
  } catch (e) {
    formError.value = e?.response?.data?.message || t('errors.serverError');
  } finally {
    saving.value = false;
  }
}
const roleClass = (r) => (r.includes(Roles.ADMIN) ? 'bg-purple-100 text-purple-700' : r.includes(Roles.MANAGER) ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700');
const roleLabel = (r) => (r.includes(Roles.ADMIN) ? t('users.role.admin') : r.includes(Roles.MANAGER) ? t('users.role.manager') : t('users.role.cashier'));
const inputClass = 'w-full px-3 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900';
</script>

<template>
  <div class="space-y-6 max-w-3xl">
    <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold text-stone-900">{{ t('users.title') }}</h1>
        <p class="text-sm text-stone-500 mt-1">{{ t('users.subtitle') }}</p>
      </div>
      <button
        v-if="!showForm"
        class="px-4 py-2 bg-stone-900 text-white text-sm rounded-lg hover:bg-stone-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 self-start"
        :disabled="!canAdd"
        :title="canAdd ? '' : t('users.limitReached')"
        @click="openCreate"
      >
        <PlusIcon class="w-4 h-4" /> {{ t('users.new') }}
      </button>
    </div>

    <div class="rounded-lg bg-stone-50 border border-stone-200 px-4 py-3">
      <p class="text-sm text-stone-600">
        {{ t('users.usage') }}: <span class="font-semibold text-stone-900">{{ seats.current }}/{{ seats.max }}</span> {{ t('users.usageUnit') }}
      </p>
    </div>

    <div v-if="showForm" class="rounded-xl bg-white border border-stone-200 p-6 space-y-4">
      <p v-if="formError" class="text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg p-3">{{ formError }}</p>
      <div>
        <label class="block text-sm font-medium text-stone-700 mb-1">{{ t('users.form.email') }} *</label>
        <input v-model="form.email" type="email" :class="inputClass" :placeholder="t('users.form.email')" />
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-stone-700 mb-1">{{ t('users.form.firstName') }} *</label>
          <input v-model="form.firstName" type="text" :class="inputClass" :placeholder="t('users.form.firstName')" />
        </div>
        <div>
          <label class="block text-sm font-medium text-stone-700 mb-1">{{ t('users.form.lastName') }} *</label>
          <input v-model="form.lastName" type="text" :class="inputClass" :placeholder="t('users.form.lastName')" />
        </div>
      </div>
      <div>
        <label class="block text-sm font-medium text-stone-700 mb-1">{{ t('users.form.password') }}{{ editing ? '' : ' *' }}</label>
        <div class="relative">
          <input v-model="form.password" :type="showPassword ? 'text' : 'password'" :class="[inputClass, 'pe-10']" :placeholder="t('users.form.password')" autocomplete="new-password" />
          <button type="button" class="absolute end-3 top-2.5 text-stone-500 hover:text-stone-700" @click="showPassword = !showPassword">{{ showPassword ? '🙈' : '👁️' }}</button>
        </div>
      </div>
      <div v-if="multiStore">
        <label class="block text-sm font-medium text-stone-700 mb-1">{{ t('users.form.store') }} *</label>
        <select v-model="form.currentStoreId" :class="inputClass">
          <option :value="undefined">{{ t('users.form.selectStore') }}</option>
          <option v-for="s in stores" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </div>
      <div class="flex gap-2">
        <button class="px-4 py-2 bg-stone-900 text-white text-sm rounded-lg hover:bg-stone-800 disabled:opacity-50" :disabled="saving" @click="save">{{ t('common.save') }}</button>
        <button class="px-4 py-2 border border-stone-200 text-stone-600 text-sm rounded-lg hover:border-stone-300" @click="closeForm">{{ t('common.cancel') }}</button>
      </div>
    </div>

    <div v-if="isLoading" class="text-center text-stone-500 py-8">{{ t('common.loading') }}</div>
    <div v-else-if="cashiers.length" class="space-y-3">
      <div v-for="u in cashiers" :key="u.id" class="bg-white border border-stone-200 rounded-xl p-4 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <h3 class="font-medium text-stone-900">{{ u.firstName }} {{ u.lastName }}</h3>
          <p class="text-sm text-stone-500 truncate">{{ u.email }}</p>
          <div class="flex gap-2 mt-2">
            <span :class="[roleClass(u.roles), 'text-xs px-2 py-1 rounded font-medium']">{{ roleLabel(u.roles) }}</span>
            <span :class="[u.isActive ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-700', 'text-xs px-2 py-1 rounded']">{{ u.isActive ? t('common.active') : t('common.inactive') }}</span>
          </div>
        </div>
        <div class="flex gap-1 shrink-0">
          <button class="p-2 text-stone-600 hover:bg-stone-100 rounded-lg" @click="openEdit(u)"><PencilSquareIcon class="w-5 h-5" /></button>
          <button class="p-2 text-stone-600 hover:bg-red-50 hover:text-red-600 rounded-lg" @click="toDelete = u.id"><TrashIcon class="w-5 h-5" /></button>
        </div>
      </div>
    </div>
    <div v-else class="rounded-xl border border-dashed border-stone-300 p-10 text-center"><p class="text-stone-500">{{ t('users.empty') }}</p></div>

    <ConfirmModal
      :show="!!toDelete"
      :title="t('common.confirm')"
      :message="t('users.confirmDelete')"
      :confirm-text="t('common.delete')"
      :cancel-text="t('common.cancel')"
      :loading="deleteMut.isPending.value"
      type="danger"
      @confirm="deleteMut.mutate(toDelete)"
      @cancel="toDelete = null"
    />
  </div>
</template>
