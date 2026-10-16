<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQuery } from '@tanstack/vue-query';
import {
  ArrowsRightLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  CubeIcon,
  CurrencyDollarIcon,
  DevicePhoneMobileIcon,
  ExclamationTriangleIcon,
  QrCodeIcon,
  ShoppingCartIcon,
  TagIcon,
  TruckIcon,
  WrenchScrewdriverIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';
import { formatCurrency, formatShortDate } from '@/utils/format';
import { repairsApi } from '@/api/repairs';

const props = defineProps({ isOpen: Boolean, product: Object });
const emit = defineEmits(['close', 'addToCart']);
const { t } = useI18n();

const isUnit = computed(() => !!props.product?._isUnit);
const title = computed(() => (!props.product ? '' : isUnit.value ? `${props.product.brand} ${props.product.model}` : props.product.name));
const price = computed(() => (!props.product ? 0 : isUnit.value ? Number(props.product.salePrice) : Number(props.product.retailPrice)));
const cost = computed(() => (!props.product ? 0 : isUnit.value ? Number(props.product.purchasePrice) : Number(props.product.costPrice)));
const profit = computed(() => price.value - cost.value);
const margin = computed(() => (price.value === 0 ? 0 : (profit.value / price.value) * 100));
const lowStock = computed(() => !isUnit.value && !!props.product && props.product.stockQuantity <= (props.product.minStockLevel || 5));
const outOfStock = computed(() => !isUnit.value && props.product?.stockQuantity === 0);
const stockClass = computed(() =>
  outOfStock.value ? 'bg-danger-50 text-danger-700' : lowStock.value ? 'bg-warning-50 text-warning-700' : 'bg-success-50 text-success-700',
);
const groupImei = (s) => s.replace(/(\d{4})(?=\d)/g, '$1 ');

const unitId = computed(() => (isUnit.value ? props.product?.id : null));
const { data: repairsData } = useQuery({
  queryKey: ['repairs-by-unit', unitId],
  queryFn: () => repairsApi.getBySoldUnit(unitId.value),
  enabled: computed(() => !!unitId.value && props.isOpen),
});
const repairs = computed(() => repairsData.value || []);
const REPAIR_STATUS = {
  pending: { cls: 'bg-amber-100 text-amber-700', icon: ClockIcon },
  in_progress: { cls: 'bg-blue-100 text-blue-700', icon: WrenchScrewdriverIcon },
  completed: { cls: 'bg-green-100 text-green-700', icon: CheckCircleIcon },
  delivered: { cls: 'bg-gray-100 text-gray-700', icon: TruckIcon },
  cancelled: { cls: 'bg-red-100 text-red-700', icon: XCircleIcon },
};

function add() {
  if (props.product && !outOfStock.value) emit('addToCart', props.product);
}
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen && product" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/60" @click="emit('close')" />
      <div class="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden">
        <div class="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b z-10">
          <h3 class="text-lg font-bold text-gray-900">{{ isUnit ? "Détails de l'appareil" : 'Détails du produit' }}</h3>
          <button class="p-2 hover:bg-gray-100 rounded-lg transition-colors" @click="emit('close')"><XMarkIcon class="w-5 h-5 text-gray-500" /></button>
        </div>
        <div class="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div v-if="!isUnit && product.imageUrl" class="mb-6">
            <img :src="product.imageUrl" :alt="title" class="w-full h-48 object-cover rounded-xl shadow-md" />
          </div>
          <h4 class="text-2xl font-bold text-gray-900 mb-4">{{ title }}</h4>

          <template v-if="isUnit">
            <div class="grid grid-cols-2 gap-3 mb-6">
              <div class="bg-gray-50 p-4 rounded-xl">
                <div class="flex items-center gap-2 mb-1"><QrCodeIcon class="w-4 h-4 text-gray-400" /><span class="text-xs text-gray-500 uppercase font-medium">REF</span></div>
                <span class="font-semibold text-gray-900 font-mono">{{ product.ref || '-' }}</span>
              </div>
              <div class="bg-gray-50 p-4 rounded-xl">
                <div class="flex items-center gap-2 mb-1">
                  <DevicePhoneMobileIcon class="w-4 h-4 text-gray-400" />
                  <span class="text-xs text-gray-500 uppercase font-medium">{{ product.imei ? 'IMEI' : 'N° Série' }}</span>
                </div>
                <span class="font-semibold text-gray-900 font-mono text-sm">{{ product.imei ? groupImei(product.imei) : product.serialNumber || '-' }}</span>
              </div>
              <div class="bg-primary-50 p-4 rounded-xl">
                <div class="flex items-center gap-2 mb-1"><CurrencyDollarIcon class="w-4 h-4 text-primary-500" /><span class="text-xs text-primary-600 uppercase font-medium">Prix de vente</span></div>
                <span class="text-xl font-bold text-primary-700">{{ formatCurrency(price) }}</span>
              </div>
              <div class="bg-blue-50 p-4 rounded-xl">
                <div class="flex items-center gap-2 mb-1"><CubeIcon class="w-4 h-4 text-blue-500" /><span class="text-xs text-blue-600 uppercase font-medium">État</span></div>
                <span class="text-lg font-bold text-blue-700">{{ t(`soldUnits.conditions.${product.condition}`) }}</span>
              </div>
            </div>

            <div v-if="product.tradeInAt" class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
              <div class="flex items-center gap-2 mb-2">
                <ArrowsRightLeftIcon class="w-5 h-5 text-amber-600" />
                <span class="font-semibold text-amber-800">{{ t('soldUnits.tradeInDevice') }}</span>
              </div>
              <div class="space-y-1 text-sm">
                <p v-if="product.tradeInFromCustomer" class="text-amber-700">
                  <span class="text-amber-500">{{ t('soldUnits.tradeInFrom') }}:</span>
                  {{ product.tradeInFromCustomer.firstName }} {{ product.tradeInFromCustomer.lastName || '' }}
                  <span v-if="product.tradeInFromCustomer.phone" class="text-amber-500"> · {{ product.tradeInFromCustomer.phone }}</span>
                </p>
                <p class="text-amber-700">
                  <span class="text-amber-500">Date:</span>
                  {{ new Date(product.tradeInAt).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: 'numeric' }) }}
                </p>
                <p v-if="product.tradeInValue" class="text-amber-700"><span class="text-amber-500">Valeur:</span> {{ formatCurrency(product.tradeInValue) }}</p>
              </div>
            </div>

            <div class="flex flex-wrap gap-2 mb-6">
              <span v-if="product.storage" class="inline-flex items-center px-3 py-1.5 rounded-lg bg-gray-100 text-sm font-medium text-gray-700">{{ product.storage }}</span>
              <span v-if="product.ram" class="inline-flex items-center px-3 py-1.5 rounded-lg bg-gray-100 text-sm font-medium text-gray-700">{{ product.ram }} RAM</span>
              <span v-if="product.color" class="inline-flex items-center px-3 py-1.5 rounded-lg bg-gray-100 text-sm font-medium text-gray-700">{{ product.color }}</span>
              <span v-if="product.batteryHealth" class="inline-flex items-center px-3 py-1.5 rounded-lg bg-green-50 text-sm font-medium text-green-700">🔋 {{ product.batteryHealth }}%</span>
            </div>

            <div v-if="repairs.length" class="mb-6">
              <div class="flex items-center gap-2 mb-3">
                <WrenchScrewdriverIcon class="w-4 h-4 text-gray-500" />
                <h5 class="text-sm font-semibold text-gray-700">{{ t('repairs.repairHistory') }}</h5>
              </div>
              <div class="space-y-2">
                <RouterLink
                  v-for="r in repairs"
                  :key="r.id"
                  :to="`/app/repairs/${r.id}`"
                  class="block border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors"
                >
                  <div class="flex items-center justify-between gap-2 mb-1">
                    <p class="text-sm font-medium text-gray-900 truncate min-w-0 flex-1">{{ r.deviceDescription }}</p>
                    <span :class="['inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0', REPAIR_STATUS[r.status]?.cls]">
                      <component :is="REPAIR_STATUS[r.status]?.icon" class="w-3 h-3" /> {{ t(`repairs.status.${r.status}`) }}
                    </span>
                  </div>
                  <div class="flex items-center justify-between text-xs text-gray-500">
                    <span>{{ formatShortDate(r.receivedAt) }}<template v-if="r.completedAt"> → {{ formatShortDate(r.completedAt) }}</template></span>
                    <span v-if="Number(r.totalCost) > 0" class="font-medium text-gray-700">{{ formatCurrency(Number(r.totalCost)) }}</span>
                  </div>
                </RouterLink>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="grid grid-cols-2 gap-3 mb-6">
              <div class="bg-gray-50 p-4 rounded-xl">
                <div class="flex items-center gap-2 mb-1"><TagIcon class="w-4 h-4 text-gray-400" /><span class="text-xs text-gray-500 uppercase font-medium">SKU</span></div>
                <span class="font-semibold text-gray-900 font-mono">{{ product.sku }}</span>
              </div>
              <div class="bg-gray-50 p-4 rounded-xl">
                <div class="flex items-center gap-2 mb-1"><QrCodeIcon class="w-4 h-4 text-gray-400" /><span class="text-xs text-gray-500 uppercase font-medium">Code-barres</span></div>
                <span class="font-semibold text-gray-900 font-mono">{{ product.barcode || '-' }}</span>
              </div>
              <div class="bg-primary-50 p-4 rounded-xl">
                <div class="flex items-center gap-2 mb-1"><CurrencyDollarIcon class="w-4 h-4 text-primary-500" /><span class="text-xs text-primary-600 uppercase font-medium">Prix</span></div>
                <span class="text-xl font-bold text-primary-700">{{ formatCurrency(product.retailPrice) }}</span>
              </div>
              <div :class="['p-4 rounded-xl', stockClass]">
                <div class="flex items-center gap-2 mb-1"><CubeIcon class="w-4 h-4" /><span class="text-xs uppercase font-medium">Stock</span></div>
                <div class="flex items-center gap-2">
                  <span class="text-xl font-bold">{{ product.stockQuantity }}</span>
                  <ExclamationTriangleIcon v-if="lowStock" class="w-5 h-5" />
                </div>
              </div>
            </div>
            <div v-if="product.warrantyMonths || product.category" class="grid grid-cols-2 gap-3 mb-6">
              <div v-if="product.warrantyMonths" class="border border-blue-200 bg-blue-50 p-4 rounded-xl">
                <span class="text-xs text-blue-600 uppercase font-medium block mb-1">Garantie</span>
                <span class="font-semibold text-blue-900">{{ product.warrantyMonths }} mois</span>
              </div>
              <div v-if="product.category" class="border border-purple-200 bg-purple-50 p-4 rounded-xl">
                <span class="text-xs text-purple-600 uppercase font-medium block mb-1">Catégorie</span>
                <span class="font-semibold text-purple-900">{{ product.category.name }}</span>
              </div>
            </div>
            <div v-if="product.variants && Object.keys(product.variants).length" class="mb-6">
              <h5 class="text-sm font-semibold text-gray-700 mb-3">Variantes</h5>
              <div class="flex flex-wrap gap-2">
                <div v-for="(v, k) in product.variants" :key="k" class="inline-flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-lg text-sm">
                  <span class="text-gray-500 capitalize">{{ k }}:</span><span class="font-medium text-gray-900">{{ v }}</span>
                </div>
              </div>
            </div>
            <div v-if="outOfStock" class="bg-danger-50 border border-danger-200 rounded-xl p-4 mb-4">
              <div class="flex items-center gap-3">
                <ExclamationTriangleIcon class="w-6 h-6 text-danger-500 flex-shrink-0" />
                <div>
                  <p class="font-medium text-danger-800">Produit en rupture de stock</p>
                  <p class="text-sm text-danger-600">Ce produit ne peut pas être ajouté au panier.</p>
                </div>
              </div>
            </div>
          </template>

          <div class="bg-success-50 p-4 rounded-xl mb-6">
            <div class="flex items-center justify-between">
              <div>
                <span class="text-xs text-success-600 uppercase font-medium">Profit estimé</span>
                <p class="text-xl font-bold text-success-700">{{ formatCurrency(profit) }}</p>
              </div>
              <div class="text-end">
                <span class="text-xs text-success-600 uppercase font-medium">Marge</span>
                <p class="text-xl font-bold text-success-700">{{ margin.toFixed(1) }}%</p>
              </div>
            </div>
          </div>
        </div>
        <div class="sticky bottom-0 bg-gray-50 px-6 py-4 border-t flex gap-3">
          <button class="btn-secondary flex-1" @click="emit('close')">Fermer</button>
          <button class="btn-primary flex-1 inline-flex items-center justify-center gap-2" :disabled="outOfStock" @click="add">
            <ShoppingCartIcon class="w-5 h-5" /> Ajouter au panier
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
