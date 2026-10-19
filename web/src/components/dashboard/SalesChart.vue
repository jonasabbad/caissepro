<script setup>
import { formatCurrency } from '@/utils/format';
import { intlLocale } from '@/i18n';
import { computed } from 'vue';
import VueApexCharts from 'vue3-apexcharts';
import { tokenColor } from '@/utils/theme';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

/** Daily sales and profit as two smoothed areas. `data`: [{ date: 'YYYY-MM-DD', sales, profit }]. */
const props = defineProps({ data: { type: Array, default: () => [] } });
const money = (v) => formatCurrency(v);

const options = computed(() => ({
  chart: {
    type: 'area',
    height: 350,
    fontFamily: "'Inter Variable', Inter, 'IBM Plex Sans Arabic', system-ui, sans-serif",
    toolbar: { show: true, tools: { download: true, selection: false, zoom: true, zoomin: true, zoomout: true, pan: false, reset: true } },
    animations: { enabled: true, easing: 'easeinout', speed: 800 },
  },
  // Sales, profit, repairs — from the theme tokens.
  colors: [tokenColor('brand-600'), tokenColor('success-500'), tokenColor('warning-500')],
  fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 90, 100] } },
  dataLabels: { enabled: false },
  stroke: { curve: 'smooth', width: 3 },
  grid: { borderColor: tokenColor('neutral-200'), strokeDashArray: 4, xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } }, padding: { top: 0, right: 0, bottom: 0, left: 10 } },
  xaxis: {
    type: 'category',
    categories: props.data.map((d) => new Date(`${d.date}T00:00:00`).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short' })),
    labels: { style: { colors: tokenColor('neutral-500'), fontSize: '12px', fontWeight: 500 }, rotate: -45 },
    axisBorder: { show: false },
    axisTicks: { show: false },
    tooltip: { enabled: false },
  },
  yaxis: { labels: { style: { colors: tokenColor('neutral-500'), fontSize: '12px', fontWeight: 500 }, formatter: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toFixed(0)) } },
  tooltip: { shared: true, intersect: false, theme: 'light', y: { formatter: money } },
  legend: { position: 'top', horizontalAlign: 'right', fontSize: '13px', fontWeight: 600, markers: { size: 7, strokeWidth: 0 } },
  markers: { size: 0, hover: { size: 6 } },
}));
const series = computed(() => [
  { name: t('dashboard.sales'), data: props.data.map((d) => Number(d.sales) || 0) },
  { name: t('dashboard.profit'), data: props.data.map((d) => Number(d.profit) || 0) },
  { name: t('dashboard.repairs'), data: props.data.map((d) => Number(d.repairRevenue) || 0) },
]);
</script>

<template>
  <div class="w-full"><VueApexCharts type="area" height="320" :options="options" :series="series" /></div>
</template>
