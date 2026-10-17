<script setup>
import { DEVICE_CATEGORY_SLUGS } from '@/config/categories';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { ArrowLeftIcon } from '@heroicons/vue/24/outline';
import { productsApi, categoriesApi, accessoryCatalogApi } from '@/api/products';
import { useActivity } from '@/composables/useActivity';
import Toast from '@/components/ui/Toast.vue';
import { useAuthStore } from '@/stores/auth';
import { formatCurrency, hasManagerRole } from '@/utils/format';
import ProductImageInput from '@/components/products/ProductImageInput.vue';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const { activityType } = useActivity();
const auth = useAuthStore();

const showVariants = computed(() => activityType.value !== 'phone_seller');
const isClothing = computed(() => activityType.value === 'clothing');

const SIZE_GROUPS = [
  { key: 'letters', sizes: ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', 'Taille unique'] },
  { key: 'numbers', sizes: ['34', '36', '38', '40', '42', '44', '46', '48', '50', '52', '54', '56'] },
  { key: 'jeans', sizes: ['W26', 'W27', 'W28', 'W29', 'W30', 'W31', 'W32', 'W33', 'W34', 'W36', 'W38', 'W40'] },
  { key: 'shoes', sizes: ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'] },
  {
    key: 'kids',
    sizes: ['0-3 mois', '3-6 mois', '6-12 mois', '12-18 mois', '2 ans', '3 ans', '4 ans', '5 ans', '6 ans', '8 ans', '10 ans', '12 ans', '14 ans', '16 ans'],
  },
];
const ALL_SIZES = [...new Set(SIZE_GROUPS.flatMap((g) => g.sizes))];
const COLORS = [
  'Noir', 'Blanc', 'Écru', 'Crème', 'Beige', 'Camel', 'Marron', 'Chocolat', 'Gris', 'Gris clair', 'Anthracite', 'Bleu', 'Bleu ciel',
  'Bleu marine', 'Bleu jean', 'Turquoise', 'Vert', 'Vert olive', 'Kaki', 'Vert bouteille', 'Rouge', 'Bordeaux', 'Rose', 'Rose poudré',
  'Fuchsia', 'Violet', 'Lilas', 'Orange', 'Corail', 'Jaune', 'Moutarde', 'Doré', 'Argenté', 'Multicolore', 'Imprimé',
];
const STORAGE_OPTIONS = ['32GB', '64GB', '128GB', '256GB', '512GB', '1TB'];

const productId = computed(() => route.params.id);
const isEdit = computed(() => !!productId.value);
const fromReceive = route.query.from === 'receive';

const emptyVariants = () => ({ brand: '', model: '', storage: '', color: '', condition: '' });
const form = ref({
  name: '',
  barcode: '',
  costPrice: 0,
  retailPrice: 0,
  stockQuantity: 0,
  minStockLevel: 5,
  categoryId: '',
  sku: '',
  imageUrl: '',
  variants: emptyVariants(),
});
if (!isEdit.value && typeof route.query.barcode === 'string' && route.query.barcode) form.value.barcode = route.query.barcode;

const packEnabled = ref(false);
const pack = ref({ packSize: 10, packCostPrice: 0, packRetailPrice: 0 });
const initialBoxes = ref(0);
const initialPieces = ref(0);
const errors = ref({});
const saving = ref(false);
const toast = ref({ show: false, message: '', type: 'error' });

const { data: product, isLoading } = useQuery({
  queryKey: ['product', productId],
  queryFn: () => productsApi.getById(productId.value),
  enabled: isEdit,
});
const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => categoriesApi.getAll() });
// Quick "New category": created in the database, added to every category list and selected here.
const canManageCategories = computed(() => hasManagerRole(auth.currentUser?.roles));
const newCategory = ref(null);
const creatingCategory = ref(false);
const categoryError = ref('');
async function createCategory() {
  const name = (newCategory.value || '').trim();
  categoryError.value = '';
  if (!name) return (categoryError.value = t('validation.required'));
  creatingCategory.value = true;
  try {
    const c = await categoriesApi.create({ name });
    await queryClient.invalidateQueries({ queryKey: ['categories'] });
    form.value.categoryId = c.id;
    newCategory.value = null;
  } catch (e) {
    categoryError.value = e.response?.data?.message || t('common.genericError');
  } finally {
    creatingCategory.value = false;
  }
}
const PHONE_CATEGORY_SLUGS = DEVICE_CATEGORY_SLUGS;
const visibleCategories = computed(() => {
  if (!categories.value) return [];
  return activityType.value === 'phone_seller' ? categories.value.filter((c) => !PHONE_CATEGORY_SLUGS.includes(c.slug || '')) : categories.value;
});

// ── Quick-add templates (accessories) ──
const { data: templates } = useQuery({ queryKey: ['accessory-catalog'], queryFn: () => accessoryCatalogApi.getTemplates(), staleTime: Infinity });
const categorySlug = computed(() => visibleCategories.value.find((c) => c.id === form.value.categoryId)?.slug || '');
const categoryTemplates = computed(() =>
  !templates.value || !categorySlug.value ? [] : templates.value.filter((tpl) => tpl.categorySlugs.includes(categorySlug.value)),
);
const showTemplateSelect = computed(
  () =>
    !!form.value.categoryId &&
    categoryTemplates.value.length === 0 &&
    ['phone_seller', 'retail'].includes(activityType.value || '') &&
    (templates.value?.length || 0) > 0,
);
const templateKey = ref('');
const selectedTemplate = computed(() => templates.value?.find((tpl) => tpl.key === templateKey.value) || null);
watch(categoryTemplates, (list) => (templateKey.value = list.length === 1 ? list[0].key : ''));
const showQuickAdd = computed(() => categoryTemplates.value.length > 0 || showTemplateSelect.value);

// The generated name is replaced while the user hasn't typed their own.
const lastGeneratedName = ref('');
function regenerateName() {
  const tpl = selectedTemplate.value;
  if (!tpl) return;
  const parts = [tpl.label];
  for (const attr of tpl.attributes) {
    const v = form.value.variants[attr.key];
    if (attr.inName && v) parts.push(v);
  }
  const name = parts.join(' ');
  if (!form.value.name.trim() || form.value.name === lastGeneratedName.value) {
    form.value.name = name;
    lastGeneratedName.value = name;
  }
}
function toggleAttribute(key, value) {
  form.value.variants[key] = form.value.variants[key] === value ? '' : value;
  regenerateName();
}
watch(templateKey, regenerateName);

watch(
  product,
  (p) => {
    if (!p) return;
    form.value = {
      name: p.name,
      barcode: p.barcode || '',
      costPrice: Number(p.costPrice),
      retailPrice: Number(p.retailPrice),
      stockQuantity: p.stockQuantity,
      minStockLevel: p.minStockLevel,
      categoryId: p.categoryId || '',
      sku: p.sku || '',
      imageUrl: p.imageUrl || '',
      variants: p.variants || emptyVariants(),
    };
    packEnabled.value = Number(p.packSize) >= 2;
    pack.value = {
      packSize: Number(p.packSize) || 10,
      packCostPrice: Number(p.packCostPrice) || 0,
      packRetailPrice: Number(p.packRetailPrice) || 0,
    };
  },
  { immediate: true },
);

// ── Pack pricing ──
const packUnitCost = computed(() => {
  if (!packEnabled.value) return null;
  const { packSize, packCostPrice } = pack.value;
  return packSize >= 2 && packCostPrice > 0 ? Math.round((packCostPrice / packSize) * 100) / 100 : null;
});
watch(packUnitCost, (v) => v != null && (form.value.costPrice = v));
const packBoxPrice = computed(() =>
  !packEnabled.value || pack.value.packSize < 2
    ? 0
    : pack.value.packRetailPrice > 0
      ? pack.value.packRetailPrice
      : Math.round(pack.value.packSize * form.value.retailPrice * 100) / 100,
);
const packBoxMargin = computed(() =>
  packBoxPrice.value > 0 && pack.value.packCostPrice > 0 ? Math.round((packBoxPrice.value - pack.value.packCostPrice) * 100) / 100 : 0,
);
const initialTotalPieces = computed(() => initialBoxes.value * pack.value.packSize + initialPieces.value);

// ── Clothing size × colour matrix (new products only) ──
const useMatrix = computed(() => isClothing.value && !isEdit.value);
const selectedSizes = ref([]);
const selectedColors = ref([]);
const customSize = ref('');
const customColor = ref('');
const matrixStock = ref({});
const customSizes = computed(() => selectedSizes.value.filter((s) => !ALL_SIZES.includes(s)));
const sizeOrder = computed(() => [...ALL_SIZES, ...selectedSizes.value.filter((s) => !ALL_SIZES.includes(s))]);
const colorOrder = computed(() => [...COLORS, ...selectedColors.value.filter((c) => !COLORS.includes(c))]);
const toggleIn = (list, v) => {
  const i = list.indexOf(v);
  if (i === -1) list.push(v);
  else list.splice(i, 1);
};
function addCustomSize() {
  const v = customSize.value.trim();
  if (v && !selectedSizes.value.includes(v)) selectedSizes.value.push(v);
  customSize.value = '';
}
function addCustomColor() {
  const v = customColor.value.trim();
  if (v && !selectedColors.value.includes(v)) selectedColors.value.push(v);
  customColor.value = '';
}
const matrixSizes = computed(() => {
  const list = sizeOrder.value.filter((s) => selectedSizes.value.includes(s));
  return list.length ? list : [''];
});
const matrixColors = computed(() => {
  const list = colorOrder.value.filter((c) => selectedColors.value.includes(c));
  return list.length ? list : [''];
});
const hasMatrix = computed(() => useMatrix.value && (selectedSizes.value.length > 0 || selectedColors.value.length > 0));
const matrixCount = computed(() => (hasMatrix.value ? matrixSizes.value.length * matrixColors.value.length : 0));
const cellKey = (color, size) => `${color}|${size}`;

const margin = computed(() => (form.value.retailPrice > 0 ? form.value.retailPrice - form.value.costPrice : 0));
const marginPercent = computed(() => (form.value.retailPrice > 0 ? ((margin.value / form.value.retailPrice) * 100).toFixed(1) : '0.0'));

const saveMutation = useMutation({
  mutationFn: async (values) => {
    const variants = {};
    for (const [k, v] of Object.entries(values.variants)) if (v != null && v !== '') variants[k] = v;
    const payload = {
      ...values,
      imageUrl: values.imageUrl || null,
      variants: Object.keys(variants).length > 0 ? variants : undefined,
      packSize: packEnabled.value ? pack.value.packSize : null,
      packCostPrice: packEnabled.value ? pack.value.packCostPrice : null,
      packRetailPrice: packEnabled.value && pack.value.packRetailPrice > 0 ? pack.value.packRetailPrice : null,
      stockQuantity: !isEdit.value && packEnabled.value ? initialTotalPieces.value : values.stockQuantity,
    };
    if (isEdit.value) return productsApi.update(productId.value, payload);
    if (hasMatrix.value) {
      const group = crypto.randomUUID();
      const list = [];
      for (const color of matrixColors.value) {
        for (const size of matrixSizes.value) {
          const qty = Math.max(0, Math.floor(Number(matrixStock.value[cellKey(color, size)]) || 0));
          list.push({
            ...payload,
            barcode: undefined,
            name: [values.name.trim(), color, size].filter(Boolean).join(' – '),
            variants: { ...variants, ...(color ? { color } : {}), ...(size ? { size } : {}), group },
            stockQuantity: qty,
          });
        }
      }
      return productsApi.createMany(list);
    }
    return productsApi.create(payload);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['products'] });
    router.push(fromReceive ? '/app/products/receive' : '/app/products');
  },
  onError: (e) => {
    if (e.response?.data?.errors) errors.value = e.response.data.errors;
    const msg = e.response?.data?.message;
    if (msg) toast.value = { show: true, message: msg, type: 'error' };
  },
});

function validate() {
  const e = {};
  if (!form.value.name.trim()) e.name = t('validation.required');
  if (!form.value.categoryId) e.categoryId = t('validation.required');
  if (form.value.costPrice < 0) e.costPrice = t('validation.positive');
  if (form.value.retailPrice <= 0) e.retailPrice = t('validation.positive');
  if (form.value.retailPrice < form.value.costPrice) e.retailPrice = t('validation.priceTooLow');
  if (packEnabled.value) {
    if (!Number.isInteger(pack.value.packSize) || pack.value.packSize < 2) e.packSize = t('validation.positive');
    if (pack.value.packCostPrice <= 0) e.packCostPrice = t('validation.positive');
  }
  errors.value = e;
  const valid = Object.keys(e).length === 0;
  if (!valid) toast.value = { show: true, message: t('errors.formValidation'), type: 'error' };
  return valid;
}

async function submit() {
  if (!validate()) return;
  saving.value = true;
  try {
    await saveMutation.mutateAsync(form.value);
  } finally {
    saving.value = false;
  }
}

const chip = (active) =>
  ['rounded-lg border px-3 py-1.5 text-sm', active ? 'border-primary-500 bg-primary-50 font-medium text-primary-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'];
</script>

<template>
  <div class="max-w-7xl px-4 sm:px-6 lg:px-8">
    <div class="mb-6 flex items-center gap-4">
      <RouterLink to="/app/products" class="rounded-lg p-2 hover:bg-gray-100"><ArrowLeftIcon class="h-5 w-5" /></RouterLink>
      <h1 class="text-2xl font-bold text-gray-900">{{ isEdit ? t('products.edit') : t('products.add') }}</h1>
    </div>

    <div v-if="isLoading" class="card p-8 text-center text-gray-500">{{ t('common.loading') }}</div>

    <form v-else class="grid grid-cols-1 gap-6 lg:grid-cols-2" @submit.prevent="submit">
      <div class="space-y-6">
        <!-- General -->
        <div class="card space-y-4 p-6">
          <h2 class="border-b pb-2 text-lg font-semibold text-gray-900">{{ t('products.basicInfo') }}</h2>
          <div class="space-y-4">
            <div>
              <label class="label">{{ t('products.name') }} *</label>
              <input v-model="form.name" type="text" :class="['input', { 'input-error': errors.name }]" />
              <p v-if="errors.name" class="mt-1 text-sm text-danger-600">{{ errors.name }}</p>
            </div>
            <div>
              <label class="label">{{ t('products.category') }} *</label>
              <select v-model="form.categoryId" :class="['input', { 'input-error': errors.categoryId }]">
                <option value="">{{ t('products.noCategory') }}</option>
                <option v-for="c in visibleCategories" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
              <p v-if="errors.categoryId" class="mt-1 text-sm text-danger-600">{{ errors.categoryId }}</p>
              <div v-if="canManageCategories" class="mt-1">
                <div v-if="newCategory !== null" class="flex items-center gap-2">
                  <input v-model="newCategory" type="text" maxlength="80" class="input py-1.5 text-sm" :placeholder="t('categoryAdmin.namePlaceholder')" :aria-label="t('categoryAdmin.name')" @keydown.enter.prevent="createCategory" />
                  <button type="button" class="btn-primary btn-sm" :disabled="creatingCategory" @click="createCategory">{{ t('common.add') }}</button>
                  <button type="button" class="btn-secondary btn-sm" @click="newCategory = null">{{ t('common.cancel') }}</button>
                </div>
                <button v-else type="button" class="text-sm font-medium text-primary-600 hover:underline" @click="newCategory = ''">+ {{ t('categoryAdmin.quickAdd') }}</button>
                <p v-if="categoryError" class="mt-1 text-sm text-danger-600">{{ categoryError }}</p>
              </div>
            </div>
            <ProductImageInput v-model="form.imageUrl" :name="form.name" />
            <p v-if="hasMatrix" class="text-sm text-gray-500">{{ t('products.variantBarcodeHint') }}</p>
            <div v-else>
              <label class="label">{{ t('products.barcode') }}</label>
              <input v-model="form.barcode" type="text" class="input font-mono" @keydown.enter.prevent />
              <p class="mt-1 text-xs text-gray-500">{{ t('products.barcodeAutoHint') }}</p>
            </div>
          </div>
        </div>

        <!-- Pricing -->
        <div class="card space-y-4 p-6">
          <h2 class="border-b pb-2 text-lg font-semibold text-gray-900">{{ t('products.pricing') }}</h2>
          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="label">{{ t('products.costPrice') }} *</label>
                <input
                  v-model.number="form.costPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  :readonly="packEnabled"
                  :class="['input', { 'input-error': errors.costPrice, 'cursor-not-allowed bg-gray-100': packEnabled }]"
                />
                <p v-if="packEnabled" class="mt-1 text-xs text-gray-500">{{ t('products.packUnitCostHint') }}</p>
                <p v-if="errors.costPrice" class="mt-1 text-sm text-danger-600">{{ errors.costPrice }}</p>
              </div>
              <div>
                <label class="label">{{ t('products.retailPrice') }} *</label>
                <input v-model.number="form.retailPrice" type="number" step="0.01" min="0" :class="['input', { 'input-error': errors.retailPrice }]" />
                <p v-if="errors.retailPrice" class="mt-1 text-sm text-danger-600">{{ errors.retailPrice }}</p>
              </div>
            </div>
            <div>
              <label class="label">{{ t('products.margin') }}</label>
              <div class="input flex items-center justify-between bg-gray-50">
                <span class="font-medium text-success-600">{{ formatCurrency(margin) }}</span>
                <span class="text-sm text-gray-500">({{ marginPercent }}%)</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Pack sale -->
        <div class="card space-y-4 p-6">
          <h2 class="border-b pb-2 text-lg font-semibold text-gray-900">{{ t('products.packSale') }}</h2>
          <label class="flex cursor-pointer items-center gap-3">
            <input v-model="packEnabled" type="checkbox" class="h-4 w-4 rounded border-gray-300" />
            <span class="text-sm text-gray-700">{{ t('products.packEnable') }}</span>
          </label>
          <div v-if="packEnabled" class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="label">{{ t('products.packSize') }} *</label>
                <input v-model.number="pack.packSize" type="number" min="2" step="1" :class="['input', { 'input-error': errors.packSize }]" />
                <p v-if="errors.packSize" class="mt-1 text-sm text-danger-600">{{ errors.packSize }}</p>
              </div>
              <div>
                <label class="label">{{ t('products.packCostPrice') }} *</label>
                <input v-model.number="pack.packCostPrice" type="number" min="0" step="0.01" :class="['input', { 'input-error': errors.packCostPrice }]" />
                <p v-if="errors.packCostPrice" class="mt-1 text-sm text-danger-600">{{ errors.packCostPrice }}</p>
              </div>
            </div>
            <div v-if="packUnitCost != null" class="input bg-gray-50 text-sm text-gray-700">
              {{ t('products.packUnitCost') }} :
              <span class="font-medium text-success-600">{{ formatCurrency(packUnitCost) }} {{ t('products.perPiece') }}</span>
            </div>
            <div>
              <label class="label">{{ t('products.packRetailPrice') }}</label>
              <input
                v-model.number="pack.packRetailPrice"
                type="number"
                min="0"
                step="0.01"
                class="input"
                :placeholder="packBoxPrice > 0 ? `${packBoxPrice}` : ''"
              />
              <p class="mt-1 text-xs text-gray-500">{{ t('products.packRetailHint') }}</p>
            </div>
            <div v-if="packBoxMargin !== 0" class="input flex items-center justify-between bg-gray-50 text-sm">
              <span class="text-gray-500">{{ t('products.packBoxMargin') }} ({{ formatCurrency(packBoxPrice) }})</span>
              <span :class="['font-medium', packBoxMargin >= 0 ? 'text-success-600' : 'text-danger-600']">{{ formatCurrency(packBoxMargin) }}</span>
            </div>
          </div>
        </div>

        <!-- Stock -->
        <div class="card space-y-4 p-6">
          <h2 class="border-b pb-2 text-lg font-semibold text-gray-900">{{ t('products.inventory') }}</h2>
          <div v-if="!isEdit && packEnabled && !hasMatrix" class="space-y-2">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="label">{{ t('products.initialBoxes') }}</label>
                <input v-model.number="initialBoxes" type="number" min="0" step="1" class="input" />
              </div>
              <div>
                <label class="label">{{ t('products.initialPieces') }}</label>
                <input v-model.number="initialPieces" type="number" min="0" step="1" class="input" />
              </div>
            </div>
            <p class="text-sm text-gray-500">= <span class="font-medium text-gray-900">{{ initialTotalPieces }}</span> {{ t('products.totalPieces') }}</p>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <p v-if="hasMatrix" class="self-center text-sm text-gray-500">{{ t('products.variantStockHint') }}</p>
            <div v-else-if="isEdit || !packEnabled">
              <label class="label">{{ t('products.stockQuantity') }}</label>
              <input
                v-model.number="form.stockQuantity"
                type="number"
                min="0"
                :readonly="isEdit"
                :title="isEdit ? t('products.stockReadonlyHint') : ''"
                :class="['input', { 'cursor-not-allowed bg-gray-100': isEdit }]"
              />
              <p v-if="isEdit" class="mt-1 text-xs text-gray-500">{{ t('products.stockReadonlyHint') }}</p>
            </div>
            <div>
              <label class="label">{{ t('products.minStockLevel') }}</label>
              <input v-model.number="form.minStockLevel" type="number" min="0" class="input" />
            </div>
          </div>
        </div>
      </div>

      <div v-if="showVariants || showQuickAdd" class="space-y-6">
        <!-- Quick add -->
        <div v-if="showQuickAdd" class="card space-y-4 p-6">
          <h2 class="border-b pb-2 text-lg font-semibold text-gray-900">{{ t('products.quickAdd') }}</h2>
          <div v-if="categoryTemplates.length > 1">
            <label class="label">{{ t('products.quickAddTemplate') }}</label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="tpl in categoryTemplates"
                :key="tpl.key"
                type="button"
                :class="[
                  'rounded-lg border px-3 py-1.5 text-sm font-medium',
                  templateKey === tpl.key ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-700 hover:border-gray-300',
                ]"
                @click="templateKey = templateKey === tpl.key ? '' : tpl.key"
              >
                {{ tpl.label }}
              </button>
            </div>
          </div>
          <div v-else-if="showTemplateSelect">
            <label class="label">{{ t('products.quickAddTemplate') }}</label>
            <select v-model="templateKey" class="input">
              <option value="">-</option>
              <option v-for="tpl in templates" :key="tpl.key" :value="tpl.key">{{ tpl.label }}</option>
            </select>
          </div>
          <template v-if="selectedTemplate">
            <div v-for="attr in selectedTemplate.attributes" :key="attr.key">
              <label class="label">{{ attr.label }}</label>
              <div class="flex flex-wrap gap-2">
                <button v-for="opt in attr.options" :key="opt" type="button" :class="chip(form.variants[attr.key] === opt)" @click="toggleAttribute(attr.key, opt)">
                  {{ opt }}
                </button>
              </div>
            </div>
            <p class="text-xs text-gray-400">{{ t('products.quickAddHint') }}</p>
          </template>
        </div>

        <!-- Variants (non-phone activities) -->
        <div v-if="showVariants" class="card space-y-4 p-6">
          <h2 class="border-b pb-2 text-lg font-semibold text-gray-900">{{ t('products.variants') }}</h2>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label">{{ t('products.brand') }}</label>
              <input v-model="form.variants.brand" type="text" class="input" />
            </div>
            <div v-if="isClothing && !useMatrix">
              <label class="label">{{ t('products.size') }}</label>
              <input v-model="form.variants.size" type="text" class="input" list="clothing-sizes" />
              <datalist id="clothing-sizes"><option v-for="s in ALL_SIZES" :key="s" :value="s" /></datalist>
            </div>
            <div v-if="!isClothing">
              <label class="label">{{ t('products.model') }}</label>
              <input v-model="form.variants.model" type="text" class="input" />
            </div>
            <div v-if="!isClothing">
              <label class="label">{{ t('products.storage') }}</label>
              <select v-model="form.variants.storage" class="input">
                <option value="">-</option>
                <option v-for="s in STORAGE_OPTIONS" :key="s" :value="s">{{ s.replace('GB', ' GB').replace('TB', ' TB') }}</option>
              </select>
            </div>
            <div v-if="!useMatrix">
              <label class="label">{{ t('products.color') }}</label>
              <input v-model="form.variants.color" type="text" class="input" list="clothing-colors" />
              <datalist v-if="isClothing" id="clothing-colors"><option v-for="c in COLORS" :key="c" :value="c" /></datalist>
            </div>
            <div v-if="!isClothing" class="col-span-2">
              <label class="label">{{ t('products.condition') }}</label>
              <select v-model="form.variants.condition" class="input">
                <option value="">-</option>
                <option value="new">{{ t('products.conditions.new') }}</option>
                <option value="like_new">{{ t('products.conditions.likeNew') }}</option>
                <option value="excellent">{{ t('products.conditions.excellent') }}</option>
                <option value="good">{{ t('products.conditions.good') }}</option>
                <option value="fair">{{ t('products.conditions.fair') }}</option>
              </select>
            </div>
          </div>

          <template v-if="useMatrix">
            <div>
              <label class="label">{{ t('products.sizes') }}</label>
              <div class="space-y-3">
                <div v-for="g in [...SIZE_GROUPS, ...(customSizes.length ? [{ key: 'custom', sizes: customSizes }] : [])]" :key="g.key">
                  <p class="mb-1.5 text-xs text-gray-500">{{ t(`products.sizeGroups.${g.key}`) }}</p>
                  <div class="flex flex-wrap gap-2">
                    <button v-for="s in g.sizes" :key="s" type="button" :class="chip(selectedSizes.includes(s))" @click="toggleIn(selectedSizes, s)">{{ s }}</button>
                  </div>
                </div>
              </div>
              <div class="mt-2 flex gap-2">
                <input v-model="customSize" type="text" class="input" :placeholder="t('products.otherSize')" @keydown.enter.prevent="addCustomSize" />
                <button type="button" class="btn-secondary" @click="addCustomSize">+</button>
              </div>
            </div>
            <div>
              <label class="label">{{ t('products.colors') }}</label>
              <div class="flex flex-wrap gap-2">
                <button v-for="c in colorOrder" :key="c" type="button" :class="chip(selectedColors.includes(c))" @click="toggleIn(selectedColors, c)">{{ c }}</button>
              </div>
              <div class="mt-2 flex gap-2">
                <input v-model="customColor" type="text" class="input" :placeholder="t('products.otherColor')" @keydown.enter.prevent="addCustomColor" />
                <button type="button" class="btn-secondary" @click="addCustomColor">+</button>
              </div>
            </div>
            <div v-if="hasMatrix">
              <label class="label">{{ t('products.variantStock') }}</label>
              <div class="overflow-x-auto rounded-lg border border-gray-200">
                <table class="min-w-full text-sm">
                  <thead class="bg-gray-50">
                    <tr>
                      <th class="px-3 py-2" />
                      <th v-for="s in matrixSizes" :key="s" class="px-3 py-2 text-center font-medium text-gray-600">{{ s || '—' }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in matrixColors" :key="c" class="border-t border-gray-100">
                      <td class="whitespace-nowrap px-3 py-2 font-medium text-gray-700">{{ c || '—' }}</td>
                      <td v-for="s in matrixSizes" :key="s" class="px-2 py-1.5">
                        <input v-model.number="matrixStock[cellKey(c, s)]" type="number" min="0" step="1" placeholder="0" class="input w-20 text-center" />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p class="mt-2 text-sm text-gray-500">{{ t('products.variantCount', { count: matrixCount }) }}</p>
            </div>
          </template>
        </div>
      </div>

      <div class="flex items-center justify-end gap-4 pt-4 lg:col-span-2">
        <RouterLink to="/app/products" class="btn-secondary">{{ t('common.cancel') }}</RouterLink>
        <button type="submit" class="btn-primary" :disabled="saving">
          {{ saving ? (isEdit ? t('common.updating') : t('common.creating')) : isEdit ? t('common.update') : t('common.create') }}
        </button>
      </div>
    </form>

    <Toast :show="toast.show" :message="toast.message" :type="toast.type" @close="toast.show = false" />
  </div>
</template>
