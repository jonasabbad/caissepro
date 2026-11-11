<script setup>
import { nextTick, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowUturnLeftIcon, CheckIcon, PencilSquareIcon } from '@heroicons/vue/20/solid';
import { useCartStore } from '@/stores/cart';
import { formatCurrency } from '@/utils/format';
import { parsePrice } from '@/utils/posScan';

/**
 * Unit price of a cart line, editable for this sale only (the product keeps its own price): tap, type, Enter.
 * An invalid amount is refused with a message and the line keeps its price.
 */
const props = defineProps({ item: { type: Object, required: true } });
const { t } = useI18n();
const cart = useCartStore();

const editing = ref(false);
const draft = ref('');
const error = ref('');
const input = ref(null);

async function open() {
  if (!cart.canEditPrice(props.item)) return;
  draft.value = String(props.item.unitPrice);
  error.value = '';
  editing.value = true;
  await nextTick();
  input.value?.focus();
  input.value?.select();
}
function save() {
  if (!editing.value) return;
  if (parsePrice(draft.value) == null) {
    error.value = t('pos.priceEdit.invalid');
    input.value?.focus();
    return;
  }
  cart.updateItemPrice(props.item.productId, draft.value);
  editing.value = false;
}
function cancel() {
  editing.value = false;
  error.value = '';
}
// Leaving the field keeps a valid amount and drops an invalid one.
function onBlur() {
  if (parsePrice(draft.value) == null) cancel();
  else save();
}
function reset() {
  cart.resetItemPrice(props.item.productId);
  cancel();
}
</script>

<template>
  <div class="mt-1">
    <form v-if="editing" class="flex items-center gap-1.5" @submit.prevent="save">
      <label :for="`price-${item.productId}`" class="sr-only">{{ t('pos.priceEdit.label', { name: item.product.name }) }}</label>
      <input
        :id="`price-${item.productId}`"
        ref="input"
        v-model="draft"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        dir="ltr"
        :aria-invalid="!!error"
        :aria-describedby="error ? `price-err-${item.productId}` : undefined"
        :class="['input h-9 w-28 px-2 py-1 text-base font-semibold sm:h-8 sm:text-sm', error && 'border-danger-400 focus:border-danger-500 focus:ring-danger-500']"
        @keydown.esc.prevent="cancel"
        @blur="onBlur"
      />
      <span class="text-xs text-gray-500">DH</span>
      <button type="submit" class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gray-900 text-white sm:h-8 sm:w-8" :aria-label="t('common.save')" @mousedown.prevent>
        <CheckIcon class="h-4 w-4" />
      </button>
    </form>
    <p v-if="editing && error" :id="`price-err-${item.productId}`" class="mt-1 text-xs text-danger-600" role="alert">{{ error }}</p>

    <div v-if="!editing" class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
      <button
        v-if="cart.canEditPrice(item)"
        type="button"
        class="group inline-flex items-center gap-1 rounded-md py-0.5 text-gray-600 hover:text-gray-900"
        :title="t('pos.priceEdit.edit')"
        :aria-label="t('pos.priceEdit.label', { name: item.product.name })"
        @click="open"
      >
        <span :class="['font-medium', cart.isPriceChanged(item) && 'text-primary-700']">{{ formatCurrency(item.unitPrice) }}</span>
        <span v-if="item.quantity > 1 && item.saleMode !== 'pack'" class="text-gray-400">× {{ item.quantity }}</span>
        <PencilSquareIcon class="h-3.5 w-3.5 text-gray-400 group-hover:text-gray-700" />
      </button>
      <span v-else class="text-gray-500">{{ formatCurrency(item.unitPrice) }}<template v-if="item.quantity > 1"> × {{ item.quantity }}</template></span>
      <template v-if="cart.isPriceChanged(item)">
        <span class="text-gray-400 line-through" :title="t('pos.priceEdit.original')">{{ formatCurrency(item.product.retailPrice) }}</span>
        <button type="button" class="inline-flex items-center gap-0.5 text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline" @click="reset">
          <ArrowUturnLeftIcon class="h-3 w-3" /> {{ t('pos.priceEdit.reset') }}
        </button>
      </template>
    </div>
  </div>
</template>
