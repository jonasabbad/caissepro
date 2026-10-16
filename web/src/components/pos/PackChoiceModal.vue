<script setup>
import { computed, onBeforeUnmount, watch } from 'vue';
import { ArchiveBoxIcon, CubeIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import { formatCurrency } from '@/utils/format';

/** Asks whether a pack product is sold by the piece or by the whole box. Enter = 1 piece. */
const props = defineProps({ isOpen: Boolean, product: Object, unitsInCart: { type: Number, default: 0 } });
const emit = defineEmits(['close', 'unit', 'pack']);

const packSize = computed(() => Number(props.product?.packSize) || 0);
const boxPrice = computed(() => {
  if (!props.product) return 0;
  const p = Number(props.product.packRetailPrice);
  return p > 0 ? p : packSize.value * Number(props.product.retailPrice);
});
const perPiece = computed(() => (packSize.value > 0 ? boxPrice.value / packSize.value : 0));
const free = computed(() => Math.max(0, (props.product?.stockQuantity ?? 0) - props.unitsInCart));
const canUnit = computed(() => free.value >= 1);
const canPack = computed(() => free.value >= packSize.value);
const boxes = computed(() => (packSize.value > 0 ? Math.floor((props.product?.stockQuantity ?? 0) / packSize.value) : 0));
const loose = computed(() => (packSize.value > 0 ? (props.product?.stockQuantity ?? 0) % packSize.value : 0));

function onKey(e) {
  if (props.isOpen && e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    if (canUnit.value) emit('unit');
  }
}
watch(
  () => props.isOpen,
  (open) => (open ? window.addEventListener('keydown', onKey, true) : window.removeEventListener('keydown', onKey, true)),
);
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true));
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen && product" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" @click.self="emit('close')">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div class="flex items-start justify-between p-5 border-b border-gray-100">
          <div>
            <h3 class="text-lg font-semibold text-gray-900">{{ product.name }}</h3>
            <p class="text-sm text-gray-500 mt-0.5">
              Stock : {{ product.stockQuantity }} pièces
              <template v-if="boxes > 0">(≈ {{ boxes }} boîte{{ boxes > 1 ? 's' : '' }}<template v-if="loose > 0"> + {{ loose }}</template>)</template>
            </p>
          </div>
          <button class="p-2 hover:bg-gray-100 rounded-lg" @click="emit('close')"><XMarkIcon class="w-5 h-5 text-gray-400" /></button>
        </div>
        <div class="p-5">
          <p class="text-sm font-medium text-gray-700 mb-3">Vendre :</p>
          <div class="grid grid-cols-2 gap-3">
            <button
              type="button"
              :disabled="!canUnit"
              class="p-5 rounded-lg border-2 text-center flex flex-col items-center gap-1 border-gray-200 hover:border-black transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-200"
              @click="emit('unit')"
            >
              <CubeIcon class="w-6 h-6 text-gray-400" />
              <span class="text-sm font-medium text-gray-900">1 pièce</span>
              <span class="text-lg font-bold text-gray-900">{{ formatCurrency(product.retailPrice) }}</span>
            </button>
            <button
              type="button"
              :disabled="!canPack"
              class="p-5 rounded-lg border-2 text-center flex flex-col items-center gap-1 border-gray-200 hover:border-black transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-200"
              @click="emit('pack')"
            >
              <ArchiveBoxIcon class="w-6 h-6 text-gray-400" />
              <span class="text-sm font-medium text-gray-900">Boîte ×{{ packSize }}</span>
              <span class="text-lg font-bold text-gray-900">{{ formatCurrency(boxPrice) }}</span>
              <span class="text-xs text-gray-500">soit {{ formatCurrency(perPiece) }} / pièce</span>
            </button>
          </div>
          <p v-if="!canPack" class="text-xs text-danger-600 mt-3">Stock insuffisant pour une boîte complète ({{ packSize }} pièces requises).</p>
          <p class="text-xs text-gray-400 mt-3">
            <kbd class="px-1.5 py-0.5 border border-gray-200 rounded text-[10px] font-mono">Entrée</kbd> = 1 pièce
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>
