<script setup>
// Combobox: type to filter options; optionally accept a value that is not in the list ("Ajouter « … »").
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { CheckIcon, ChevronDownIcon, XMarkIcon } from '@heroicons/vue/24/outline';

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, default: () => [] }, // [{ value, label }]
  placeholder: { type: String, default: '' },
  disabled: Boolean,
  loading: Boolean,
  allowCustom: Boolean,
});
const emit = defineEmits(['update:modelValue']);

const open = ref(false);
const search = ref('');
const inputRef = ref(null);
const rootRef = ref(null);
const listRef = ref(null);
const highlighted = ref(-1);

const selectedLabel = computed(
  () => props.options.find((o) => o.value === props.modelValue)?.label || (props.allowCustom ? props.modelValue : ''),
);
const filtered = computed(() => {
  if (!search.value) return props.options;
  const q = search.value.toLowerCase();
  return props.options.filter((o) => String(o.label).toLowerCase().includes(q));
});
const canCreate = computed(() => {
  if (!props.allowCustom) return false;
  const v = search.value.trim();
  return v ? !props.options.some((o) => String(o.label).toLowerCase() === v.toLowerCase()) : false;
});
watch(filtered, () => (highlighted.value = -1));

function scrollHighlighted() {
  nextTick(() => listRef.value?.children[highlighted.value]?.scrollIntoView({ block: 'nearest' }));
}

function openList() {
  if (props.disabled || open.value) return;
  open.value = true;
  search.value = '';
  highlighted.value = -1;
  nextTick(() => {
    inputRef.value?.focus();
    const i = filtered.value.findIndex((o) => o.value === props.modelValue);
    if (i >= 0) listRef.value?.children[i]?.scrollIntoView({ block: 'nearest' });
  });
}
function close() {
  if (!open.value) return;
  open.value = false;
  search.value = '';
}
function pick(option) {
  emit('update:modelValue', option.value);
  close();
}
function create() {
  const v = search.value.trim();
  if (!v) return;
  emit('update:modelValue', v);
  close();
}
function onTriggerClick(e) {
  if (props.disabled || e.target.closest('.ss-input') || e.target.closest('.ss-clear')) return;
  open.value ? close() : openList();
}
function clear() {
  emit('update:modelValue', '');
}
function onKeydown(e) {
  if (!open.value) {
    if (['Enter', ' ', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      openList();
    }
    return;
  }
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      highlighted.value = Math.min(highlighted.value + 1, filtered.value.length - 1);
      scrollHighlighted();
      break;
    case 'ArrowUp':
      e.preventDefault();
      highlighted.value = Math.max(highlighted.value - 1, 0);
      scrollHighlighted();
      break;
    case 'Enter':
      e.preventDefault();
      if (highlighted.value >= 0 && filtered.value[highlighted.value]) pick(filtered.value[highlighted.value]);
      else if (canCreate.value) create();
      break;
    case 'Escape':
      e.preventDefault();
      close();
      break;
    case 'Tab':
      close();
      break;
  }
}
const onOutside = (e) => rootRef.value && !rootRef.value.contains(e.target) && close();
onMounted(() => document.addEventListener('click', onOutside, true));
onUnmounted(() => document.removeEventListener('click', onOutside, true));
</script>

<template>
  <div ref="rootRef" class="relative">
    <div
      :class="[
        'flex h-[2.625rem] w-full cursor-pointer select-none items-center gap-2 rounded-lg border bg-white px-3 text-sm transition-colors',
        open ? 'border-primary-500 ring-1 ring-primary-500' : 'border-gray-300',
        disabled && 'cursor-not-allowed bg-gray-50 opacity-60',
      ]"
      tabindex="0"
      @click="onTriggerClick"
      @keydown="!open && onKeydown($event)"
    >
      <input
        v-if="open"
        ref="inputRef"
        v-model="search"
        type="text"
        class="ss-input min-w-0 flex-1 border-none bg-transparent p-0 text-sm outline-none focus:ring-0"
        :placeholder="selectedLabel || placeholder || 'Rechercher...'"
        @keydown="onKeydown"
      />
      <span v-else :class="['min-w-0 flex-1 truncate', modelValue ? 'text-gray-900' : 'text-gray-400']">{{ selectedLabel || placeholder || '-' }}</span>
      <div class="flex shrink-0 items-center gap-1 text-gray-400">
        <span v-if="modelValue && !disabled && !open" class="ss-clear rounded p-0.5 hover:bg-gray-100" @click.stop="clear">
          <XMarkIcon class="h-3.5 w-3.5" />
        </span>
        <svg v-if="loading" class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <ChevronDownIcon v-else :class="['h-4 w-4 transition-transform', open && 'rotate-180']" />
      </div>
    </div>
    <Transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-75 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div v-if="open" class="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
        <ul ref="listRef" class="max-h-60 overflow-y-auto py-1 text-sm">
          <li
            v-for="(o, i) in filtered"
            :key="o.value"
            :class="[
              'flex cursor-pointer items-center justify-between px-3 py-2',
              highlighted === i ? 'bg-gray-100' : '',
              modelValue === o.value ? 'font-medium text-gray-900' : 'text-gray-700',
            ]"
            @mousedown.prevent="pick(o)"
            @mouseenter="highlighted = i"
          >
            <span class="truncate">{{ o.label }}</span>
            <CheckIcon v-if="modelValue === o.value" class="h-4 w-4 text-gray-900" />
          </li>
          <li v-if="canCreate" class="cursor-pointer px-3 py-2 font-medium text-primary-700 hover:bg-gray-100" @mousedown.prevent="create">
            Ajouter « {{ search.trim() }} »
          </li>
          <li v-if="filtered.length === 0 && !canCreate" class="px-3 py-2 text-gray-400">Aucun résultat</li>
        </ul>
      </div>
    </Transition>
  </div>
</template>
