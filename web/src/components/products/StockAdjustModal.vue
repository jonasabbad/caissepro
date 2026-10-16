<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { PlusIcon, MinusIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import { formatCurrency } from '@/utils/format';

const props = defineProps({ isOpen: Boolean, product: { type: Object, default: null } });
const emit = defineEmits(['close', 'save']);
const { t } = useI18n();

// Stored as the movement note, so the values stay in French whatever the UI language.
const REASONS = [
  ['Inventaire', 'inventory'],
  ['Réception commande', 'receipt'],
  ['Retour client', 'customerReturn'],
  ['Produit endommagé', 'damaged'],
  ['Vol/Perte', 'lost'],
  ['Correction erreur', 'correction'],
  ['Autre', 'other'],
];

const mode = ref('add'); // add | remove | set
const quantity = ref(0);
const reason = ref('');
const unit = ref('pieces'); // pieces | boxes
const boxCost = ref(0);

const packSize = computed(() => Number(props.product?.packSize) || 0);
const isPack = computed(() => packSize.value >= 2);
const showUnitChoice = computed(() => isPack.value && mode.value !== 'set');

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return;
    mode.value = 'add';
    quantity.value = 0;
    reason.value = '';
    unit.value = isPack.value ? 'boxes' : 'pieces';
    boxCost.value = Number(props.product?.packCostPrice) || 0;
  },
);
watch(mode, (m) => m === 'set' && (unit.value = 'pieces'));

const pieces = computed(() => (unit.value === 'boxes' ? quantity.value * packSize.value : quantity.value));
const newStock = computed(() => {
  if (!props.product) return 0;
  if (mode.value === 'add') return props.product.stockQuantity + pieces.value;
  if (mode.value === 'remove') return Math.max(0, props.product.stockQuantity - pieces.value);
  return quantity.value;
});
const receivingBoxes = computed(() => mode.value === 'add' && unit.value === 'boxes');
const newUnitCost = computed(() =>
  receivingBoxes.value && boxCost.value > 0 && packSize.value >= 2 ? Math.round((boxCost.value / packSize.value) * 100) / 100 : null,
);

function save() {
  if (!props.product || quantity.value <= 0) return;
  const boxesNote = `${quantity.value} boîte${quantity.value > 1 ? 's' : ''} de ${packSize.value}`;
  emit('save', {
    productId: props.product.id,
    type: mode.value,
    quantity: mode.value === 'set' ? quantity.value : pieces.value,
    reason: unit.value === 'boxes' ? `${reason.value} (${boxesNote})` : reason.value,
    movementType: mode.value === 'add' && (unit.value === 'boxes' || reason.value === 'Réception commande') ? 'purchase' : 'adjustment',
    packCostPrice: receivingBoxes.value && boxCost.value > 0 ? boxCost.value : undefined,
  });
}

const modeClass = (m, active) =>
  [
    'flex flex-col items-center gap-1 rounded-lg border p-3 text-center',
    mode.value === m ? active : 'border-gray-200 hover:border-gray-300',
  ].join(' ');
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen && product" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" @click.self="emit('close')">
      <div class="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div class="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h3 class="text-lg font-bold text-gray-900">{{ t('products.adjust.title') }}</h3>
            <p class="text-sm text-gray-500">{{ product.name }}</p>
          </div>
          <button class="rounded-lg p-2 hover:bg-gray-100" @click="emit('close')"><XMarkIcon class="h-5 w-5 text-gray-400" /></button>
        </div>

        <form class="space-y-4 p-6" @submit.prevent="save">
          <div class="rounded-lg bg-gray-50 p-4 text-center">
            <p class="text-sm text-gray-500">{{ t('products.adjust.currentStock') }}</p>
            <p class="text-3xl font-bold text-gray-900">{{ product.stockQuantity }}</p>
            <p v-if="isPack" class="mt-1 text-xs text-gray-400">
              {{ t('products.adjust.boxesApprox', { boxes: Math.floor(product.stockQuantity / packSize), size: packSize }) }}
              <template v-if="product.stockQuantity % packSize > 0"> + {{ product.stockQuantity % packSize }}</template>
            </p>
          </div>

          <div>
            <label class="label">{{ t('products.adjust.type') }}</label>
            <div class="grid grid-cols-3 gap-2">
              <button type="button" :class="modeClass('add', 'border-success-500 bg-success-50 text-success-700')" @click="mode = 'add'">
                <PlusIcon class="h-5 w-5" /><span class="text-sm font-medium">{{ t('products.adjust.add') }}</span>
              </button>
              <button type="button" :class="modeClass('remove', 'border-danger-500 bg-danger-50 text-danger-700')" @click="mode = 'remove'">
                <MinusIcon class="h-5 w-5" /><span class="text-sm font-medium">{{ t('products.adjust.remove') }}</span>
              </button>
              <button type="button" :class="modeClass('set', 'border-primary-500 bg-primary-50 text-primary-700')" @click="mode = 'set'">
                <span class="text-lg font-bold">=</span><span class="text-sm font-medium">{{ t('products.adjust.set') }}</span>
              </button>
            </div>
          </div>

          <div v-if="showUnitChoice">
            <label class="label">{{ t('products.adjust.entry') }}</label>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                :class="['rounded-lg border p-2 text-center text-sm font-medium', unit === 'boxes' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 hover:border-gray-300']"
                @click="unit = 'boxes'"
              >
                {{ t('products.adjust.byBox', { size: packSize }) }}
              </button>
              <button
                type="button"
                :class="['rounded-lg border p-2 text-center text-sm font-medium', unit === 'pieces' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 hover:border-gray-300']"
                @click="unit = 'pieces'"
              >
                {{ t('products.adjust.byPiece') }}
              </button>
            </div>
          </div>

          <div>
            <label class="label">{{ unit === 'boxes' && mode !== 'set' ? t('products.adjust.boxCount') : t('products.adjust.quantity') }}</label>
            <input v-model.number="quantity" type="number" min="0" class="input text-center text-xl font-bold" required />
            <p v-if="unit === 'boxes' && quantity > 0 && mode !== 'set'" class="mt-1 text-center text-xs text-gray-500">
              {{ t('products.adjust.equalsPieces', { count: pieces }) }}
            </p>
          </div>

          <div v-if="receivingBoxes">
            <label class="label">{{ t('products.adjust.boxCost') }}</label>
            <input v-model.number="boxCost" type="number" min="0" step="0.01" class="input" />
            <p v-if="newUnitCost != null" class="mt-1 text-xs text-gray-500">
              {{ t('products.adjust.newUnitCost') }}
              <span class="font-medium text-success-600">{{ formatCurrency(newUnitCost) }} {{ t('products.perPiece') }}</span>
            </p>
          </div>

          <div :class="['rounded-lg p-4 text-center', mode === 'remove' ? 'bg-danger-50' : mode === 'add' ? 'bg-success-50' : 'bg-primary-50']">
            <p class="text-sm text-gray-600">{{ t('products.adjust.newStock') }}</p>
            <p :class="['text-3xl font-bold', mode === 'remove' ? 'text-danger-600' : mode === 'add' ? 'text-success-600' : 'text-primary-600']">
              {{ newStock }}
            </p>
          </div>

          <div>
            <label class="label">{{ t('products.adjust.reason') }}</label>
            <select v-model="reason" class="input" required>
              <option value="">{{ t('products.adjust.selectReason') }}</option>
              <option v-for="[value, key] in REASONS" :key="value" :value="value">{{ t(`products.adjust.reasons.${key}`) }}</option>
            </select>
          </div>
        </form>

        <div class="flex gap-3 rounded-b-2xl border-t border-gray-100 bg-gray-50 px-6 py-4">
          <button class="btn-secondary flex-1" @click="emit('close')">{{ t('common.cancel') }}</button>
          <button class="btn-primary flex-1" :disabled="quantity <= 0 || !reason" @click="save">{{ t('common.confirm') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
