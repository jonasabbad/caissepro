<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQueryClient } from '@tanstack/vue-query';
import { ArrowLeftIcon, CheckCircleIcon, MagnifyingGlassIcon, MinusIcon, PlusIcon } from '@heroicons/vue/24/outline';
import { productsApi } from '@/api/products';
import { formatCurrency } from '@/utils/format';
import { apiErrorMessage } from '@/api/http';
import { useScanInput } from '@/composables/useScanInput';
import Toast from '@/components/ui/Toast.vue';

const { t } = useI18n();
const queryClient = useQueryClient();

const product = ref(null);
const notFoundCode = ref('');
const boxes = ref(0);
const pieces = ref(0);
const boxCost = ref(0);
const saving = ref(false);
const toast = ref({ show: false, message: '', type: 'success' });
const received = ref([]);

const packSize = computed(() => Number(product.value?.packSize) || 0);
const isPack = computed(() => packSize.value >= 2);
const totalPieces = computed(() => boxes.value * packSize.value + pieces.value);
const unitCost = computed(() => (isPack.value && boxCost.value > 0 ? Math.round((boxCost.value / packSize.value) * 100) / 100 : null));
const sessionTotal = computed(() => received.value.reduce((s, r) => s + r.units, 0));

const { query, inputRef, isProcessing, submit } = useScanInput(async (code) => {
  notFoundCode.value = '';
  const list = (await productsApi.getAll({ query: code, limit: 10 })).products || [];
  const match = list.find((p) => p.sku === code || p.barcode === code) || (list.length === 1 ? list[0] : null);
  if (!match) {
    product.value = null;
    notFoundCode.value = code;
    return;
  }
  product.value = match;
  const size = Number(match.packSize) || 0;
  boxes.value = size >= 2 ? 1 : 0;
  pieces.value = size >= 2 ? 0 : 1;
  boxCost.value = Number(match.packCostPrice) || 0;
});

function cancel() {
  product.value = null;
  notFoundCode.value = '';
}

async function validate() {
  const p = product.value;
  if (!p || totalPieces.value <= 0 || saving.value) return;
  saving.value = true;
  try {
    // The movement note is stored in French so history reads the same in every language.
    const reason =
      boxes.value > 0 ? `Réception commande (${boxes.value} boîte${boxes.value > 1 ? 's' : ''} de ${packSize.value})` : 'Réception commande';
    await productsApi.adjustStock(p.id, totalPieces.value, reason, {
      type: 'purchase',
      packCostPrice: boxes.value > 0 && boxCost.value > 0 ? boxCost.value : undefined,
    });
    received.value.unshift({ name: p.name, units: totalPieces.value, boxes: boxes.value, packSize: packSize.value });
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
    toast.value = { show: true, message: t('products.receiveDone', { name: p.name, count: totalPieces.value }), type: 'success' };
    product.value = null;
  } catch (e) {
    toast.value = { show: true, message: apiErrorMessage(e, t('products.receiveError')), type: 'error' };
  } finally {
    saving.value = false;
    inputRef.value?.focus();
  }
}

const stepper = 'flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-100';
</script>

<template>
  <div class="max-w-3xl space-y-6 px-4 sm:px-6 lg:px-8">
    <div class="flex items-center gap-4">
      <RouterLink to="/app/products" class="rounded-lg p-2 hover:bg-gray-100"><ArrowLeftIcon class="h-5 w-5" /></RouterLink>
      <div>
        <h1 class="text-2xl font-bold text-gray-900">{{ t('products.receive') }}</h1>
        <p class="text-sm text-gray-500">{{ t('products.receiveSubtitle') }}</p>
      </div>
    </div>

    <div class="card p-4">
      <div class="flex gap-3">
        <div class="relative flex-1">
          <MagnifyingGlassIcon class="absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            :placeholder="t('products.receiveScanPlaceholder')"
            class="input w-full ps-10"
            :disabled="isProcessing"
            @keydown.enter.prevent="submit"
          />
        </div>
        <RouterLink to="/app/products/new?from=receive" class="btn-secondary inline-flex items-center gap-2 whitespace-nowrap">
          <PlusIcon class="h-5 w-5" /> {{ t('products.receiveNewProduct') }}
        </RouterLink>
      </div>
    </div>

    <div v-if="notFoundCode" class="card border-danger-200 bg-danger-50 p-6">
      <p class="font-medium text-gray-900">{{ t('products.receiveNotFound', { code: notFoundCode }) }}</p>
      <p class="mt-1 text-sm text-gray-500">{{ t('products.receiveNotFoundHint') }}</p>
      <RouterLink :to="`/app/products/new?barcode=${encodeURIComponent(notFoundCode)}&from=receive`" class="btn-primary mt-4 inline-flex items-center gap-2">
        <PlusIcon class="h-5 w-5" /> {{ t('products.receiveCreate') }}
      </RouterLink>
    </div>

    <div v-if="product" class="card space-y-4 p-6">
      <div class="flex items-start justify-between">
        <div>
          <p class="font-semibold text-gray-900">{{ product.name }}</p>
          <p class="font-mono text-xs text-gray-400">{{ product.sku }}</p>
          <p class="mt-1 text-sm text-gray-500">
            {{ t('products.receiveCurrentStock', { count: product.stockQuantity }) }}
            <template v-if="isPack">{{ t('products.receiveBoxesApprox', { boxes: Math.floor(product.stockQuantity / packSize), size: packSize }) }}</template>
          </p>
        </div>
        <button class="text-sm text-gray-400 hover:text-gray-600" @click="cancel">{{ t('common.cancel') }}</button>
      </div>

      <div class="flex flex-wrap items-center gap-4">
        <div v-if="isPack" class="flex items-center gap-2">
          <span class="text-sm text-gray-600">{{ t('products.receiveBoxes', { size: packSize }) }}</span>
          <button type="button" :class="stepper" @click="boxes = Math.max(0, boxes - 1)"><MinusIcon class="h-4 w-4" /></button>
          <input v-model.number="boxes" type="number" min="0" class="input w-16 text-center font-bold" />
          <button type="button" :class="stepper" @click="boxes += 1"><PlusIcon class="h-4 w-4" /></button>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-sm text-gray-600">{{ t('products.receivePieces') }}</span>
          <button type="button" :class="stepper" @click="pieces = Math.max(0, pieces - 1)"><MinusIcon class="h-4 w-4" /></button>
          <input v-model.number="pieces" type="number" min="0" class="input w-16 text-center font-bold" />
          <button type="button" :class="stepper" @click="pieces += 1"><PlusIcon class="h-4 w-4" /></button>
        </div>
      </div>

      <div v-if="isPack && boxes > 0" class="grid grid-cols-2 items-end gap-4">
        <div>
          <label class="label">{{ t('products.receiveBoxCost') }}</label>
          <input v-model.number="boxCost" type="number" min="0" step="0.01" class="input" />
        </div>
        <p v-if="unitCost != null" class="pb-2 text-sm text-gray-500">
          = <span class="font-medium text-success-600">{{ formatCurrency(unitCost) }}</span> {{ t('products.perPiece') }}
        </p>
      </div>

      <div class="flex items-center justify-between border-t border-gray-100 pt-4">
        <p class="text-sm text-gray-600">
          {{ t('products.receiveTotal') }} <span class="font-bold text-gray-900">{{ t('products.receivePiecesCount', { count: totalPieces }) }}</span>
        </p>
        <button :disabled="totalPieces <= 0 || saving" class="btn-primary inline-flex items-center gap-2" @click="validate">
          <CheckCircleIcon class="h-5 w-5" /> {{ saving ? t('common.saving') : t('products.receiveValidate') }}
        </button>
      </div>
    </div>

    <div v-if="received.length > 0" class="card p-6">
      <div class="mb-3 flex items-center justify-between border-b border-gray-100 pb-2">
        <h2 class="text-sm font-semibold text-gray-900">{{ t('products.receiveSession') }}</h2>
        <span class="text-sm text-gray-500">{{ sessionTotal }} {{ t('products.receivePieces').toLowerCase() }}</span>
      </div>
      <ul class="space-y-2">
        <li v-for="(r, i) in received" :key="i" class="flex items-center justify-between text-sm">
          <span class="text-gray-700"><CheckCircleIcon class="me-1 inline-block h-4 w-4 text-success-500" /> {{ r.name }}</span>
          <span class="text-gray-500">
            <template v-if="r.boxes > 0">{{ r.boxes }} × {{ r.packSize }} · </template>+{{ r.units }}
          </span>
        </li>
      </ul>
    </div>

    <Toast :show="toast.show" :message="toast.message" :type="toast.type" @close="toast.show = false" />
  </div>
</template>
