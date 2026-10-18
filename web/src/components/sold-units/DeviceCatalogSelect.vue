<script setup>
import { intlLocale, ltr } from '@/i18n';
// Brand → model → storage / RAM / colour / condition picker backed by the device catalogue.
// Brands and models not in the catalogue can be typed in ("Ajouter « … »").
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQuery } from '@tanstack/vue-query';
import { StarIcon } from '@heroicons/vue/24/solid';
import { StarIcon as StarOutlineIcon } from '@heroicons/vue/24/outline';
import SearchableSelect from '@/components/ui/SearchableSelect.vue';
import { deviceCatalogApi } from '@/api/deviceCatalog';
import { colorHex, isLight } from '@/utils/deviceColors';

const props = defineProps({
  modelValue: { type: Object, required: true },
  disabled: Boolean,
  deviceType: { type: String, default: 'phone' },
  simple: Boolean,
});
const emit = defineEmits(['update:modelValue', 'device-loaded']);
const { t } = useI18n();

const isComputer = computed(() => props.deviceType === 'laptop' || props.deviceType === 'macbook');
const brand = ref(props.modelValue.brand);
const model = ref(props.modelValue.model);
const storage = ref(props.modelValue.storage);
const ram = ref(props.modelValue.ram);
const color = ref(props.modelValue.color);
const condition = ref(props.modelValue.condition);

const { data: brands, isLoading: brandsLoading } = useQuery({
  queryKey: computed(() => ['device-brands', props.deviceType]),
  queryFn: () => deviceCatalogApi.getBrands(props.deviceType),
});
const { data: models, isLoading: modelsLoading } = useQuery({
  queryKey: computed(() => ['device-models', brand.value, props.deviceType]),
  queryFn: () => deviceCatalogApi.getModelsByBrand(brand.value, props.deviceType),
  enabled: computed(() => !!brand.value),
});
const { data: device } = useQuery({
  queryKey: computed(() => ['device-spec', brand.value, model.value, props.deviceType]),
  queryFn: () => deviceCatalogApi.getDevice(brand.value, model.value, props.deviceType),
  enabled: computed(() => !!brand.value && !!model.value),
});

const brandOptions = computed(() => (brands.value || []).map((b) => ({ value: b.name, label: b.name })));
const modelOptions = computed(() => (models.value || []).map((m) => ({ value: m, label: m })));

// Fallback choices when the catalogue has no specs for a model.
const DEFAULTS = {
  phone: { storage: ['64 GB', '128 GB', '256 GB', '512 GB', '1 TB'], ram: [] },
  tablet: { storage: ['64 GB', '128 GB', '256 GB', '512 GB', '1 TB'], ram: ['4 GB', '6 GB', '8 GB', '12 GB', '16 GB'] },
  laptop: { storage: ['128 GB SSD', '256 GB SSD', '512 GB SSD', '1 TB SSD', '2 TB SSD'], ram: ['4 GB', '8 GB', '16 GB', '24 GB', '32 GB', '64 GB'] },
  macbook: { storage: ['256 GB SSD', '512 GB SSD', '1 TB SSD', '2 TB SSD'], ram: ['8 GB', '16 GB', '24 GB', '32 GB', '64 GB'] },
  watch: { storage: ['32 GB', '64 GB'], ram: [] },
};
const storageOptions = computed(() =>
  device.value?.storageOptions?.length ? device.value.storageOptions : (model.value && DEFAULTS[props.deviceType || 'phone']?.storage) || [],
);
const ramOptions = computed(() =>
  device.value?.ramOptions?.length ? device.value.ramOptions : (model.value && DEFAULTS[props.deviceType || 'phone']?.ram) || [],
);
const colorOptions = computed(() => device.value?.colors || []);

// Condition scale, worst → best.
const CONDITIONS = [
  { value: 'grade_c', label: () => t('soldUnits.conditions.gradeC'), bg: 'bg-red-500', text: 'text-red-600' },
  { value: 'grade_b', label: () => t('soldUnits.conditions.gradeB'), bg: 'bg-orange-500', text: 'text-orange-600' },
  { value: 'grade_a', label: () => t('soldUnits.conditions.gradeA'), bg: 'bg-amber-500', text: 'text-amber-600' },
  { value: 'grade_a_plus', label: () => t('soldUnits.conditions.gradeAPlus'), bg: 'bg-lime-500', text: 'text-lime-600' },
  { value: 'new_no_box', label: () => t('soldUnits.conditions.newNoBox'), bg: 'bg-green-500', text: 'text-green-600' },
  { value: 'new', label: () => t('soldUnits.conditions.new'), bg: 'bg-emerald-500', text: 'text-emerald-600' },
];
const hover = ref(null);
const selectedIndex = computed(() => CONDITIONS.findIndex((c) => c.value === condition.value));
const activeIndex = computed(() => (hover.value === null ? selectedIndex.value : hover.value));
const isLit = (i) => i <= activeIndex.value;
const activeCondition = computed(() => CONDITIONS[activeIndex.value] ?? null);

function emitValue() {
  emit('update:modelValue', {
    brand: brand.value,
    model: model.value,
    storage: storage.value,
    ram: ram.value,
    color: color.value,
    condition: condition.value,
  });
}

watch(
  () => props.deviceType,
  () => {
    brand.value = '';
    model.value = '';
    storage.value = '';
    ram.value = '';
    color.value = '';
    emitValue();
  },
);
watch(brand, (v, old) => {
  if (props.disabled || v === old || v === props.modelValue.brand) return;
  model.value = '';
  storage.value = '';
  color.value = '';
  emitValue();
});
watch(model, (v, old) => {
  if (props.disabled || v === old || v === props.modelValue.model) return;
  storage.value = '';
  ram.value = '';
  color.value = '';
  emitValue();
});
watch(device, (d) => {
  emit('device-loaded', d || null);
  if (!d) return;
  if (d.storageOptions.length === 1 && !storage.value) storage.value = d.storageOptions[0];
  if (d.ramOptions.length === 1 && !ram.value) ram.value = d.ramOptions[0];
  if (d.colors.length === 1 && !color.value) color.value = d.colors[0];
  emitValue();
});
watch([storage, ram, color, condition], emitValue);
watch(
  () => props.modelValue,
  (v) => {
    brand.value = v.brand;
    model.value = v.model;
    storage.value = v.storage;
    ram.value = v.ram;
    color.value = v.color;
    condition.value = v.condition;
  },
  { deep: true },
);
onMounted(() => undefined);

const chip = (active) => [
  'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
  active ? 'border-black bg-black text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300',
  props.disabled ? 'cursor-not-allowed opacity-50' : '',
];
</script>

<template>
  <div class="space-y-4">
    <div>
      <label class="label">{{ t('soldUnits.brand') }} *</label>
      <SearchableSelect
        v-model="brand"
        :options="brandOptions"
        :placeholder="t('soldUnits.selectBrand')"
        :disabled="disabled"
        :loading="brandsLoading"
        :allow-custom="!disabled"
      />
    </div>
    <div>
      <label class="label">{{ t('soldUnits.model') }} *</label>
      <SearchableSelect
        v-model="model"
        :options="modelOptions"
        :placeholder="t('soldUnits.selectModel')"
        :disabled="disabled || !brand"
        :loading="modelsLoading && !!brand"
        :allow-custom="!disabled && !!brand"
      />
    </div>

    <div v-if="!simple && storageOptions.length > 0">
      <label class="label">{{ t('soldUnits.storage') }}</label>
      <div class="flex flex-wrap gap-2">
        <button v-for="s in storageOptions" :key="s" type="button" :disabled="disabled" :class="chip(storage === s)" @click="storage = s">{{ s }}</button>
      </div>
    </div>

    <div v-if="!simple && (ramOptions.length > 0 || isComputer)">
      <label class="label">{{ t('soldUnits.ram') }} <span v-if="isComputer" class="text-danger-500">*</span></label>
      <div class="flex flex-wrap gap-2">
        <button v-for="r in ramOptions" :key="r" type="button" :disabled="disabled" :class="chip(ram === r)" @click="ram = r">{{ r }}</button>
      </div>
    </div>

    <div v-if="!simple && colorOptions.length > 0">
      <label class="label">{{ t('soldUnits.color') }}</label>
      <div class="flex flex-wrap gap-3">
        <button
          v-for="c in colorOptions"
          :key="c"
          type="button"
          :disabled="disabled"
          :title="c"
          :class="[
            'relative flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all',
            color === c ? 'border-black ring-2 ring-black ring-offset-2' : 'border-gray-200 hover:border-gray-400',
            disabled && 'cursor-not-allowed opacity-50',
          ]"
          :style="{ backgroundColor: colorHex(c) }"
          @click="color = c"
        >
          <svg v-if="color === c" :class="['h-5 w-5', isLight(colorHex(c)) ? 'text-black' : 'text-white']" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </button>
      </div>
      <p v-if="color" class="mt-2 text-sm text-gray-600">{{ color }}</p>
    </div>

    <div v-if="!simple">
      <label class="label">{{ t('soldUnits.condition') }} *</label>
      <div class="flex flex-col gap-3">
        <div class="flex w-full items-center justify-between" @mouseleave="hover = null">
          <button
            v-for="(c, i) in CONDITIONS"
            :key="c.value"
            type="button"
            :disabled="disabled"
            :class="[
              'flex h-10 w-10 items-center justify-center rounded-full transition-all duration-150',
              isLit(i) ? [CONDITIONS[i].bg, 'scale-110 text-white'] : 'bg-gray-200 text-gray-400 hover:bg-gray-300',
              disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
            ]"
            @click="condition = c.value"
            @mouseenter="hover = i"
          >
            <StarIcon v-if="isLit(i)" class="h-6 w-6" />
            <StarOutlineIcon v-else class="h-6 w-6" />
          </button>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-gray-500">{{ t('soldUnits.conditions.gradeC') }}</span>
          <span v-if="activeCondition" :class="['text-sm font-medium', activeCondition.text]">{{ activeCondition.label() }}</span>
          <span class="text-sm text-gray-500">{{ t('soldUnits.conditions.new') }}</span>
        </div>
      </div>
    </div>

    <div v-if="!simple && device && !device.unknown" class="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="font-medium text-gray-900">{{ device.brand }} {{ device.model }}</p>
          <p class="text-sm text-gray-500">{{ device.year }}</p>
        </div>
        <div v-if="device.basePrice > 0" class="text-end">
          <p class="text-sm text-gray-500">{{ t('soldUnits.basePrice') }}</p>
          <p class="font-bold text-black">{{ ltr(`${new Intl.NumberFormat(intlLocale()).format(device.basePrice)} DH`) }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
