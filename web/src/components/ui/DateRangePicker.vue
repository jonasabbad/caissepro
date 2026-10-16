<script setup>
// Date range picker (YYYY-MM-DD strings) with quick presets: today, this week, last 30 days, ...
import VueDatePicker from '@vuepic/vue-datepicker';
import '@vuepic/vue-datepicker/dist/main.css';
import { format, parseISO, startOfMonth, endOfMonth, startOfYear, subDays, subMonths } from 'date-fns';
import { fr } from 'date-fns/locale';

const model = defineModel({ type: Array, default: null });
defineProps({
  clearable: { type: Boolean, default: true },
  placeholder: { type: String, default: 'Sélectionner une période' },
});

const iso = (d) => format(d, 'yyyy-MM-dd');
const display = (value) => {
  const f = (d) => format(typeof d === 'string' ? parseISO(d) : d, 'dd/MM/yyyy', { locale: fr });
  if (Array.isArray(value)) {
    const [a, b] = value;
    return a && b ? `${f(a)}  —  ${f(b)}` : a ? f(a) : '';
  }
  return value ? f(value) : '';
};

const today = new Date();
const weekday = today.getDay();
const presets = [
  { label: "Aujourd'hui", value: [iso(today), iso(today)] },
  { label: 'Hier', value: [iso(subDays(today, 1)), iso(subDays(today, 1))] },
  { label: 'Cette semaine', value: [iso(subDays(today, weekday === 0 ? 6 : weekday - 1)), iso(today)] },
  { label: 'Ce mois', value: [iso(startOfMonth(today)), iso(today)] },
  { label: '7 derniers jours', value: [iso(subDays(today, 6)), iso(today)] },
  { label: '30 derniers jours', value: [iso(subDays(today, 29)), iso(today)] },
  { label: 'Mois dernier', value: [iso(startOfMonth(subMonths(today, 1))), iso(endOfMonth(subMonths(today, 1)))] },
  { label: '3 derniers mois', value: [iso(subMonths(today, 3)), iso(today)] },
  { label: 'Cette année', value: [iso(startOfYear(today)), iso(today)] },
];
</script>

<template>
  <div class="date-picker-wrapper">
    <VueDatePicker
      v-model="model"
      range
      :preset-dates="presets"
      :enable-time-picker="false"
      :formats="{ input: display }"
      :format="display"
      select-text="Appliquer"
      cancel-text="Annuler"
      :placeholder="placeholder"
      auto-apply
      teleport
      model-type="yyyy-MM-dd"
      :clearable="clearable"
      hide-input-icon
      :locale="fr"
      :week-start="1"
    >
      <template #preset-date-range-button="{ label, value, presetDate }">
        <button type="button" class="dp-preset-btn" @click="presetDate(value)">{{ label }}</button>
      </template>
    </VueDatePicker>
  </div>
</template>

<style scoped>
.date-picker-wrapper :deep(.dp__input) {
  height: 2.625rem;
  border-radius: 0.5rem;
  border-color: #d1d5db;
  font-size: 0.875rem;
  padding-inline-start: 0.75rem;
}
.dp-preset-btn {
  display: block;
  width: 100%;
  padding: 0.375rem 0.75rem;
  text-align: start;
  font-size: 0.8125rem;
  border-radius: 0.375rem;
  color: #374151;
}
.dp-preset-btn:hover {
  background: #f3f4f6;
}
</style>
