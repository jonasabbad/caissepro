<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { EyeIcon, EyeSlashIcon, PencilIcon, PlusIcon, TagIcon, TrashIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import { categoriesApi } from '@/api/products';
import { apiErrorMessage } from '@/api/http';
import Toast from '@/components/ui/Toast.vue';

/**
 * Product categories of the business: built-in ones (can be hidden) and the business's own (create, rename, delete).
 * Every change refreshes the shared "categories" query, so product forms, filters and the POS update at once.
 */
const { t } = useI18n();
const queryClient = useQueryClient();
const showHidden = ref(false);
const { data: categories, isLoading } = useQuery({ queryKey: ['categories', 'admin'], queryFn: () => categoriesApi.getAll({ all: true }) });
const list = computed(() => (categories.value || []).filter((c) => showHidden.value || !c.hidden));
const hiddenCount = computed(() => (categories.value || []).filter((c) => c.hidden).length);

const toast = ref({ show: false, message: '', type: 'success' });
const notify = (message, type = 'success') => (toast.value = { show: true, message, type });
const refresh = () => {
  queryClient.invalidateQueries({ queryKey: ['categories'] });
  queryClient.invalidateQueries({ queryKey: ['products'] });
  queryClient.invalidateQueries({ queryKey: ['pos-products'] });
};

// Create / rename
const editor = ref(null); // { id?, name }
const editorError = ref('');
const saving = ref(false);
function openCreate() {
  editor.value = { name: '' };
  editorError.value = '';
}
function openRename(c) {
  editor.value = { id: c.id, name: c.name };
  editorError.value = '';
}
async function saveEditor() {
  const name = editor.value.name.trim();
  if (!name) return (editorError.value = t('validation.required'));
  saving.value = true;
  try {
    if (editor.value.id) await categoriesApi.update(editor.value.id, { name });
    else await categoriesApi.create({ name });
    notify(editor.value.id ? t('categoryAdmin.updated') : t('categoryAdmin.created'));
    editor.value = null;
    refresh();
  } catch (e) {
    editorError.value = apiErrorMessage(e);
  } finally {
    saving.value = false;
  }
}

// Delete (with reassignment when products use the category)
const deleting = ref(null); // { category, moveTo }
const deleteError = ref('');
const targets = computed(() => (categories.value || []).filter((c) => !c.hidden && c.id !== deleting.value?.category.id));
function askDelete(c) {
  deleteError.value = '';
  deleting.value = { category: c, moveTo: '' };
}
async function confirmDelete() {
  const { category, moveTo } = deleting.value;
  if (category.productCount && !moveTo) return (deleteError.value = t('validation.required'));
  saving.value = true;
  try {
    await categoriesApi.remove(category.id, category.productCount ? moveTo : undefined);
    notify(t('categoryAdmin.deleted'));
    deleting.value = null;
    refresh();
  } catch (e) {
    deleteError.value = apiErrorMessage(e);
  } finally {
    saving.value = false;
  }
}

async function toggleHidden(c) {
  try {
    await categoriesApi.setHidden(c.id, !c.hidden);
    refresh();
  } catch (e) {
    notify(apiErrorMessage(e), 'error');
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">{{ t('categoryAdmin.title') }}</h1>
        <p class="mt-1 text-sm text-gray-500">{{ t('categoryAdmin.subtitle') }}</p>
      </div>
      <button class="btn-primary inline-flex items-center gap-2 self-start" @click="openCreate"><PlusIcon class="h-5 w-5" /> {{ t('categoryAdmin.add') }}</button>
    </div>

    <div class="card overflow-hidden">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3 text-sm">
        <p class="text-gray-500">{{ t('categoryAdmin.hideHint') }}</p>
        <label v-if="hiddenCount" class="flex items-center gap-2 text-gray-700"><input v-model="showHidden" type="checkbox" class="rounded" /> {{ t('categoryAdmin.showHidden') }} ({{ hiddenCount }})</label>
      </div>
      <div v-if="isLoading" class="p-8 text-center text-gray-500">{{ t('common.loading') }}</div>
      <div v-else-if="!list.length" class="p-8 text-center text-gray-500">{{ t('categoryAdmin.empty') }}</div>
      <ul v-else class="divide-y divide-gray-100">
        <li v-for="c in list" :key="c.id" :class="['flex items-center gap-3 px-4 py-3', c.hidden && 'opacity-60']">
          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100"><TagIcon class="h-5 w-5 text-gray-500" /></div>
          <div class="min-w-0 flex-1">
            <p class="font-medium text-gray-900">{{ c.name }}</p>
            <p class="text-xs text-gray-500">
              {{ t('categoryAdmin.products', { n: c.productCount }) }} ·
              <span :class="c.builtIn ? 'text-gray-500' : 'text-primary-700'">{{ c.builtIn ? t('categoryAdmin.builtIn') : t('categoryAdmin.custom') }}</span>
              <template v-if="c.hidden"> · {{ t('categoryAdmin.hidden') }}</template>
            </p>
          </div>
          <div class="flex items-center gap-1">
            <template v-if="c.builtIn">
              <button
                class="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                :disabled="!c.hidden && c.productCount > 0"
                :title="c.hidden ? t('categoryAdmin.show') : t('categoryAdmin.hide')"
                @click="toggleHidden(c)"
              >
                <component :is="c.hidden ? EyeIcon : EyeSlashIcon" class="h-4 w-4" /> {{ c.hidden ? t('categoryAdmin.show') : t('categoryAdmin.hide') }}
              </button>
            </template>
            <template v-else>
              <button class="p-2 text-gray-400 hover:text-primary-600" :title="t('common.edit')" @click="openRename(c)"><PencilIcon class="h-5 w-5" /></button>
              <button class="p-2 text-gray-400 hover:text-danger-600" :title="t('common.delete')" @click="askDelete(c)"><TrashIcon class="h-5 w-5" /></button>
            </template>
          </div>
        </li>
      </ul>
    </div>

    <Teleport to="body">
      <div v-if="editor" class="modal-overlay" @click.self="editor = null">
        <form class="modal-content max-w-md" @submit.prevent="saveEditor">
          <div class="modal-header">
            <h3 class="text-lg font-bold text-gray-900">{{ editor.id ? t('categoryAdmin.edit') : t('categoryAdmin.add') }}</h3>
            <button type="button" class="rounded p-1 hover:bg-gray-100" :aria-label="t('common.close')" @click="editor = null"><XMarkIcon class="h-5 w-5" /></button>
          </div>
          <div class="modal-body">
            <label class="label" for="cat-name">{{ t('categoryAdmin.name') }} *</label>
            <input id="cat-name" v-model="editor.name" type="text" maxlength="80" :class="['input', editorError && 'input-error']" :placeholder="t('categoryAdmin.namePlaceholder')" autofocus />
            <p v-if="editorError" class="mt-1 text-sm text-danger-600">{{ editorError }}</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-secondary" @click="editor = null">{{ t('common.cancel') }}</button>
            <button type="submit" class="btn-primary" :disabled="saving">{{ saving ? t('common.saving') : t('common.save') }}</button>
          </div>
        </form>
      </div>

      <div v-if="deleting" class="modal-overlay" @click.self="deleting = null">
        <div class="modal-content max-w-md">
          <div class="modal-header">
            <h3 class="text-lg font-bold text-gray-900">{{ deleting.category.productCount ? t('categoryAdmin.inUseTitle') : t('common.confirm') }}</h3>
            <button class="rounded p-1 hover:bg-gray-100" :aria-label="t('common.close')" @click="deleting = null"><XMarkIcon class="h-5 w-5" /></button>
          </div>
          <div class="modal-body space-y-3 text-sm">
            <template v-if="deleting.category.productCount">
              <p class="text-gray-700">{{ t('categoryAdmin.inUseMessage', { name: deleting.category.name, n: deleting.category.productCount }) }}</p>
              <label class="label" for="cat-move">{{ t('categoryAdmin.moveTo') }} *</label>
              <select id="cat-move" v-model="deleting.moveTo" class="input">
                <option value="" disabled>{{ t('common.select') }}</option>
                <option v-for="c in targets" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
            </template>
            <p v-else class="text-gray-700">{{ t('categoryAdmin.confirmDelete', { name: deleting.category.name }) }}</p>
            <p v-if="deleteError" class="text-danger-600">{{ deleteError }}</p>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" @click="deleting = null">{{ t('common.cancel') }}</button>
            <button class="btn-danger" :disabled="saving" @click="confirmDelete">
              {{ deleting.category.productCount ? t('categoryAdmin.moveAndDelete') : t('common.delete') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Toast :show="toast.show" :message="toast.message" :type="toast.type" @close="toast.show = false" />
  </div>
</template>
