<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQueryClient } from '@tanstack/vue-query';
import { ArrowPathIcon, BanknotesIcon, BuildingLibraryIcon, CreditCardIcon, PaperClipIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import { EXPENSE_CATEGORIES, EXPENSE_METHODS, expensesApi } from '@/api/expenses';
import { compressImage } from '@/utils/image';
import { isoDate } from '@/utils/format';

/**
 * Add / edit a direct expense. A new form gets an idempotency key, so a double click or a retried request creates
 * one expense; a probable duplicate (same day, amount and description) asks for confirmation.
 */
const props = defineProps({ isOpen: Boolean, expense: { type: Object, default: null } });
const emit = defineEmits(['close', 'saved']);
const { t } = useI18n();
const queryClient = useQueryClient();

const METHOD_ICONS = { cash: BanknotesIcon, card: CreditCardIcon, bank_transfer: BuildingLibraryIcon };
const blank = () => ({ title: '', category: 'other', amount: null, date: isoDate(), paymentMethod: 'cash', recipient: '', notes: '', receiptUrl: '', receiptName: '' });
const form = ref(blank());
const errors = ref({});
const serverError = ref('');
const duplicate = ref('');
const saving = ref(false);
const uploading = ref(false);
let clientRef = '';

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return;
    errors.value = {};
    serverError.value = '';
    duplicate.value = '';
    clientRef = crypto.randomUUID();
    const e = props.expense;
    form.value = e
      ? {
          title: e.title,
          category: e.category,
          amount: Number(e.amount),
          date: isoDate(e.date),
          paymentMethod: e.paymentMethod,
          recipient: e.recipient || '',
          notes: e.notes || '',
          receiptUrl: e.receiptUrl || '',
          receiptName: e.receiptName || '',
        }
      : blank();
  },
  { immediate: true },
);
const isEdit = computed(() => !!props.expense);

function validate() {
  const f = form.value;
  const e = {};
  if (!f.title.trim()) e.title = t('expenses.errors.title');
  if (!(Number(f.amount) > 0)) e.amount = t('expenses.errors.amount');
  if (!f.date) e.date = t('expenses.errors.date');
  errors.value = e;
  return !Object.keys(e).length;
}

async function onReceipt(ev) {
  const file = ev.target.files?.[0];
  ev.target.value = '';
  if (!file) return;
  errors.value = { ...errors.value, receipt: undefined };
  const isPdf = file.type === 'application/pdf';
  if ((!isPdf && !file.type.startsWith('image/')) || file.size > 5 * 1024 * 1024 * (isPdf ? 1 : 4)) {
    errors.value = { ...errors.value, receipt: t('expenses.errors.receipt') };
    return;
  }
  uploading.value = true;
  try {
    // Photos are resized (still readable) so receipts stay light; PDFs are sent as they are.
    const dataUrl = isPdf
      ? await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.onerror = rej;
          r.readAsDataURL(file);
        })
      : await compressImage(file, { maxSize: 1600, quality: 0.8 });
    form.value.receiptUrl = await expensesApi.uploadReceipt(dataUrl);
    form.value.receiptName = file.name.slice(0, 200);
  } catch (e) {
    errors.value = { ...errors.value, receipt: e.response?.data?.message || t('expenses.errors.receipt') };
  } finally {
    uploading.value = false;
  }
}

async function submit(confirmDuplicate = false) {
  serverError.value = '';
  if (!validate()) return;
  const f = form.value;
  const payload = {
    title: f.title.trim(),
    category: f.category,
    amount: Math.round(Number(f.amount) * 100) / 100,
    // Midday local time, so the day never shifts with the time zone.
    date: new Date(`${f.date}T12:00:00`).toISOString(),
    paymentMethod: f.paymentMethod,
    recipient: f.recipient.trim() || null,
    notes: f.notes.trim() || null,
    receiptUrl: f.receiptUrl || null,
    receiptName: f.receiptName || null,
    ...(confirmDuplicate && { confirmDuplicate: true }),
  };
  saving.value = true;
  try {
    const saved = isEdit.value ? await expensesApi.update(props.expense.id, payload) : await expensesApi.create({ ...payload, clientRef });
    // Totals shown elsewhere follow at once: expenses list, dashboard, reports and the cash drawer.
    for (const k of ['expenses', 'dashboard-kpis', 'dashboard-store-breakdown', 'report', 'caisse']) queryClient.invalidateQueries({ queryKey: [k] });
    emit('saved', saved, isEdit.value);
  } catch (e) {
    if (e.response?.status === 409) duplicate.value = e.response.data.message;
    else serverError.value = e.response?.data?.message || t('common.genericError');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="modal-overlay" @click.self="emit('close')">
      <div class="modal-content max-w-xl">
        <div class="modal-header">
          <h3 class="text-lg font-bold text-gray-900">{{ isEdit ? t('expenses.edit') : t('expenses.add') }}</h3>
          <button class="rounded p-1 hover:bg-gray-100" :aria-label="t('common.close')" @click="emit('close')"><XMarkIcon class="h-5 w-5" /></button>
        </div>
        <form class="modal-body space-y-4" novalidate @submit.prevent="submit()">
          <p class="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">{{ t('expenses.notHere') }}</p>
          <div v-if="serverError" class="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{{ serverError }}</div>
          <div v-if="duplicate" class="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <p class="font-medium">{{ t('expenses.duplicateTitle') }}</p>
            <p>{{ t('expenses.duplicateMessage', { message: duplicate }) }}</p>
            <div class="flex gap-2">
              <button type="button" class="btn-secondary btn-sm" @click="duplicate = ''">{{ t('common.cancel') }}</button>
              <button type="button" class="btn-primary btn-sm" :disabled="saving" @click="submit(true)">{{ t('expenses.duplicateConfirm') }}</button>
            </div>
          </div>

          <div>
            <label class="label" for="exp-title">{{ t('expenses.fields.title') }} *</label>
            <input id="exp-title" v-model="form.title" type="text" maxlength="200" :class="['input', errors.title && 'input-error']" :placeholder="t('expenses.fields.titlePlaceholder')" />
            <p v-if="errors.title" class="mt-1 text-xs text-danger-600">{{ errors.title }}</p>
          </div>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label class="label" for="exp-category">{{ t('expenses.fields.category') }} *</label>
              <select id="exp-category" v-model="form.category" class="input">
                <option v-for="c in EXPENSE_CATEGORIES" :key="c" :value="c">{{ t(`expenses.categories.${c}`) }}</option>
              </select>
            </div>
            <div>
              <label class="label" for="exp-amount">{{ t('expenses.fields.amount') }} *</label>
              <input id="exp-amount" v-model.number="form.amount" type="number" min="0.01" step="0.01" inputmode="decimal" :class="['input', errors.amount && 'input-error']" />
              <p v-if="errors.amount" class="mt-1 text-xs text-danger-600">{{ errors.amount }}</p>
            </div>
            <div>
              <label class="label" for="exp-date">{{ t('expenses.fields.date') }} *</label>
              <input id="exp-date" v-model="form.date" type="date" :class="['input', errors.date && 'input-error']" />
              <p v-if="errors.date" class="mt-1 text-xs text-danger-600">{{ errors.date }}</p>
            </div>
            <div>
              <label class="label" for="exp-recipient">{{ t('expenses.fields.recipient') }}</label>
              <input id="exp-recipient" v-model="form.recipient" type="text" maxlength="200" class="input" :placeholder="t('expenses.fields.recipientPlaceholder')" />
            </div>
          </div>
          <div>
            <p class="label">{{ t('expenses.fields.paymentMethod') }} *</p>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="m in EXPENSE_METHODS"
                :key="m"
                type="button"
                :aria-pressed="form.paymentMethod === m"
                :class="['rounded-lg border p-2 text-center text-sm transition-colors', form.paymentMethod === m ? 'border-black bg-gray-100 font-medium text-black' : 'border-gray-200 hover:border-gray-300']"
                @click="form.paymentMethod = m"
              >
                <component :is="METHOD_ICONS[m]" class="mx-auto mb-0.5 h-5 w-5" /> {{ t(`expenses.methods.${m}`) }}
              </button>
            </div>
            <p v-if="form.paymentMethod === 'cash'" class="mt-1 text-xs text-gray-500">{{ t('expenses.cashHint') }}</p>
          </div>
          <div>
            <label class="label" for="exp-notes">{{ t('expenses.fields.notes') }}</label>
            <textarea id="exp-notes" v-model="form.notes" rows="2" maxlength="2000" class="input" />
          </div>
          <div>
            <p class="label">{{ t('expenses.fields.receipt') }}</p>
            <div class="flex flex-wrap items-center gap-2">
              <label class="btn-secondary btn-sm cursor-pointer">
                <ArrowPathIcon v-if="uploading" class="h-4 w-4 animate-spin" /><PaperClipIcon v-else class="h-4 w-4" />
                {{ t('expenses.fields.receiptChoose') }}
                <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" class="hidden" :disabled="uploading" @change="onReceipt" />
              </label>
              <template v-if="form.receiptUrl">
                <a :href="form.receiptUrl" target="_blank" rel="noopener" class="truncate text-sm text-primary-600 underline">{{ form.receiptName || t('expenses.fields.receiptView') }}</a>
                <button type="button" class="text-sm text-danger-600 hover:underline" @click="form.receiptUrl = ''; form.receiptName = ''">{{ t('expenses.fields.receiptRemove') }}</button>
              </template>
            </div>
            <p :class="['mt-1 text-xs', errors.receipt ? 'text-danger-600' : 'text-gray-500']">{{ errors.receipt || t('expenses.fields.receiptHint') }}</p>
          </div>
          <button type="submit" class="hidden" />
        </form>
        <div class="modal-footer">
          <button class="btn-secondary" :disabled="saving" @click="emit('close')">{{ t('common.cancel') }}</button>
          <button class="btn-primary" :disabled="saving || uploading" @click="submit()">{{ saving ? t('common.saving') : t('common.save') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
