<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { LinkIcon, PencilSquareIcon, PlusIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import { employeesApi } from '@/api/employees';
import { storesApi } from '@/api/misc';

const { t } = useI18n();
const queryClient = useQueryClient();

const showForm = ref(false);
const editing = ref(null);
const saving = ref(false);
const formError = ref('');
const blank = () => ({ firstName: '', lastName: '', storeId: null });
const form = ref(blank());

const { data: employeesData, isLoading } = useQuery({ queryKey: ['employees'], queryFn: () => employeesApi.getAll() });
const { data: stores } = useQuery({ queryKey: ['stores'], queryFn: () => storesApi.getAll() });
const multiStore = computed(() => (stores.value?.length ?? 0) > 1);
const employees = computed(() => employeesData.value ?? []);
const refresh = () => queryClient.invalidateQueries({ queryKey: ['employees'] });

const createMut = useMutation({ mutationFn: (dto) => employeesApi.create(dto), onSuccess: () => (refresh(), closeForm()) });
const updateMut = useMutation({ mutationFn: ({ id, dto }) => employeesApi.update(id, dto), onSuccess: () => (refresh(), closeForm()) });
const deactivateMut = useMutation({ mutationFn: (id) => employeesApi.deactivate(id), onSuccess: refresh });
const reactivateMut = useMutation({ mutationFn: (id) => employeesApi.update(id, { isActive: true }), onSuccess: refresh });
const unlinkMut = useMutation({ mutationFn: (id) => employeesApi.unlinkUser(id), onSuccess: refresh });

function closeForm() {
  showForm.value = false;
  editing.value = null;
  formError.value = '';
  form.value = blank();
}
function openCreate() {
  editing.value = null;
  form.value = blank();
  formError.value = '';
  showForm.value = true;
}
function openEdit(e) {
  editing.value = e;
  form.value = { firstName: e.firstName, lastName: e.lastName, storeId: e.storeId ?? null, commissionRate: e.commissionRate ?? undefined };
  formError.value = '';
  showForm.value = true;
}
async function save() {
  if (!form.value.firstName.trim()) {
    formError.value = t('errors.required');
    return;
  }
  saving.value = true;
  formError.value = '';
  try {
    if (editing.value) await updateMut.mutateAsync({ id: editing.value.id, dto: form.value });
    else await createMut.mutateAsync(form.value);
  } catch (e) {
    formError.value = e?.response?.data?.message ?? t('errors.serverError');
  } finally {
    saving.value = false;
  }
}

const confirmDeactivate = ref(null);
async function doDeactivate() {
  if (!confirmDeactivate.value) return;
  try {
    await deactivateMut.mutateAsync(confirmDeactivate.value.id);
  } finally {
    confirmDeactivate.value = null;
  }
}

// Link a user account so the seller can log in and is preselected at the till.
const linking = ref(null);
const linkUserId = ref('');
const linkError = ref('');
const { data: linkableUsers } = useQuery({
  queryKey: ['employees', 'linkable-users'],
  queryFn: () => employeesApi.getLinkableUsers(),
  enabled: computed(() => !!linking.value),
});
const linkMut = useMutation({
  mutationFn: ({ id, userId }) => employeesApi.linkUser(id, userId),
  onSuccess: () => {
    refresh();
    queryClient.invalidateQueries({ queryKey: ['employees', 'linkable-users'] });
    linking.value = null;
    linkUserId.value = '';
  },
});
function openLink(e) {
  linking.value = e;
  linkUserId.value = '';
  linkError.value = '';
}
async function doLink() {
  if (!linking.value || !linkUserId.value) return;
  linkError.value = '';
  try {
    await linkMut.mutateAsync({ id: linking.value.id, userId: linkUserId.value });
  } catch (e) {
    linkError.value = e?.response?.data?.message ?? t('errors.serverError');
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold text-stone-900">{{ t('employees.title') }}</h1>
        <p class="text-sm text-stone-500 mt-1">{{ t('employees.subtitle') }}</p>
      </div>
      <button
        v-if="!showForm"
        class="px-4 py-2 bg-stone-900 text-white text-sm rounded-lg hover:bg-stone-800 transition-colors duration-150 flex items-center gap-2 self-start"
        @click="openCreate"
      >
        <PlusIcon class="w-4 h-4" /> {{ t('employees.add') }}
      </button>
    </div>

    <div v-if="showForm" class="rounded-xl bg-white border border-stone-200 p-6 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-medium text-stone-900">{{ editing ? t('employees.edit') : t('employees.add') }}</h2>
        <button class="p-1 rounded hover:bg-stone-100 transition-colors duration-150" @click="closeForm"><XMarkIcon class="w-5 h-5 text-stone-500" /></button>
      </div>
      <p v-if="formError" class="text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg p-3">{{ formError }}</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label for="emp-first" class="label">{{ t('employees.firstName') }} *</label>
          <input id="emp-first" v-model="form.firstName" class="input" autocomplete="off" />
        </div>
        <div>
          <label for="emp-last" class="label">{{ t('employees.lastName') }}</label>
          <input id="emp-last" v-model="form.lastName" class="input" autocomplete="off" />
        </div>
        <div v-if="multiStore">
          <label for="emp-store" class="label">{{ t('employees.store') }}</label>
          <select id="emp-store" v-model="form.storeId" class="input">
            <option :value="null">{{ t('employees.allStores') }}</option>
            <option v-for="s in stores" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </div>
      </div>
      <div class="flex justify-end gap-2">
        <button class="px-4 py-2 rounded-lg border border-stone-200 text-stone-600 text-sm hover:border-stone-300 transition-colors duration-150" @click="closeForm">
          {{ t('common.cancel') }}
        </button>
        <button
          class="px-4 py-2 rounded-lg bg-stone-900 text-white text-sm hover:bg-stone-800 transition-colors duration-150 disabled:opacity-50"
          :disabled="saving"
          @click="save"
        >
          {{ t('common.save') }}
        </button>
      </div>
    </div>

    <div class="rounded-xl bg-white border border-stone-200 overflow-hidden">
      <div v-if="isLoading" class="p-8 text-center text-sm text-stone-500">{{ t('common.loading') }}</div>
      <div v-else-if="!employees.length" class="p-10 text-center">
        <p class="text-stone-900 font-medium">{{ t('employees.empty') }}</p>
        <p class="text-sm text-stone-500 mt-1">{{ t('employees.emptyHint') }}</p>
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-stone-50 border-b border-stone-200">
            <tr class="text-start text-stone-500">
              <th class="px-4 py-3 text-start font-medium">{{ t('employees.seller') }}</th>
              <th class="px-4 py-3 text-start font-medium">{{ t('employees.store') }}</th>
              <th class="px-4 py-3 text-start font-medium">{{ t('employees.account') }}</th>
              <th class="px-4 py-3 text-start font-medium">{{ t('employees.status') }}</th>
              <th class="px-4 py-3" />
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-100">
            <tr v-for="e in employees" :key="e.id" :class="!e.isActive && 'opacity-60'">
              <td class="px-4 py-3 font-medium text-stone-900">{{ e.firstName }} {{ e.lastName }}</td>
              <td class="px-4 py-3 text-stone-600">{{ e.store?.name ?? t('employees.allStores') }}</td>
              <td class="px-4 py-3 text-stone-600">
                <div v-if="e.user" class="flex items-center gap-2">
                  <span class="truncate max-w-[200px]">{{ e.user.email }}</span>
                  <button class="text-xs text-stone-400 hover:text-stone-900" @click="unlinkMut.mutate(e.id)">{{ t('employees.unlinkAccount') }}</button>
                </div>
                <button v-else-if="e.isActive" class="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-900" @click="openLink(e)">
                  <LinkIcon class="w-3.5 h-3.5" /> {{ t('employees.linkAccount') }}
                </button>
                <span v-else class="text-xs text-stone-400">{{ t('employees.noAccount') }}</span>
              </td>
              <td class="px-4 py-3">
                <span :class="['inline-flex px-2 py-0.5 rounded text-xs font-medium', e.isActive ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-600']">
                  {{ e.isActive ? t('employees.active') : t('employees.inactive') }}
                </span>
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-end gap-1">
                  <button class="p-1.5 rounded hover:bg-stone-100 transition-colors duration-150" @click="openEdit(e)"><PencilSquareIcon class="w-4 h-4 text-stone-500" /></button>
                  <button
                    v-if="e.isActive"
                    class="px-2 py-1 rounded text-xs text-stone-500 hover:text-stone-900 transition-colors duration-150"
                    @click="confirmDeactivate = e"
                  >
                    {{ t('employees.deactivate') }}
                  </button>
                  <button v-else class="px-2 py-1 rounded text-xs text-stone-500 hover:text-stone-900 transition-colors duration-150" @click="reactivateMut.mutate(e.id)">
                    {{ t('employees.reactivate') }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="linking" class="fixed inset-0 bg-stone-900/50 flex items-center justify-center p-4 z-50" @click.self="linking = null">
        <div class="bg-white rounded-xl border border-stone-200 w-full max-w-md p-6 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-medium text-stone-900">{{ t('employees.linkAccount') }}</h3>
            <button class="p-1 rounded hover:bg-stone-100 transition-colors duration-150" @click="linking = null"><XMarkIcon class="w-5 h-5 text-stone-500" /></button>
          </div>
          <p class="text-sm text-stone-500">{{ t('employees.linkAccountHint') }}</p>
          <select v-if="linkableUsers?.length" v-model="linkUserId" class="input">
            <option value="" disabled>{{ t('employees.linkAccount') }}</option>
            <option v-for="u in linkableUsers" :key="u.id" :value="u.id">{{ u.firstName }} {{ u.lastName }} — {{ u.email }}</option>
          </select>
          <div v-else class="text-sm text-stone-500">{{ t('employees.noLinkableUsers') }}</div>
          <p v-if="linkError" class="text-sm text-danger-600">{{ linkError }}</p>
          <div class="flex justify-end gap-2">
            <button class="px-4 py-2 rounded-lg border border-stone-200 text-stone-600 text-sm hover:border-stone-300 transition-colors duration-150" @click="linking = null">
              {{ t('common.cancel') }}
            </button>
            <button
              class="px-4 py-2 rounded-lg bg-stone-900 text-white text-sm hover:bg-stone-800 transition-colors duration-150 disabled:opacity-50"
              :disabled="!linkUserId || linkMut.isPending.value"
              @click="doLink"
            >
              {{ t('employees.linkAccount') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="confirmDeactivate" class="fixed inset-0 bg-stone-900/50 flex items-center justify-center p-4 z-50" @click.self="confirmDeactivate = null">
        <div class="bg-white rounded-xl border border-stone-200 w-full max-w-md p-6 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-medium text-stone-900">{{ t('employees.deactivate') }}</h3>
            <button class="p-1 rounded hover:bg-stone-100 transition-colors duration-150" @click="confirmDeactivate = null"><XMarkIcon class="w-5 h-5 text-stone-500" /></button>
          </div>
          <p class="text-sm text-stone-600">{{ t('employees.deactivateConfirm') }}</p>
          <div class="flex justify-end gap-2">
            <button class="px-4 py-2 rounded-lg border border-stone-200 text-stone-600 text-sm hover:border-stone-300 transition-colors duration-150" @click="confirmDeactivate = null">
              {{ t('common.cancel') }}
            </button>
            <button
              class="px-4 py-2 rounded-lg bg-stone-900 text-white text-sm hover:bg-stone-800 transition-colors duration-150 disabled:opacity-50"
              :disabled="deactivateMut.isPending.value"
              @click="doDeactivate"
            >
              {{ t('employees.deactivate') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
