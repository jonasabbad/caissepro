<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  UserIcon,
  WrenchScrewdriverIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';
import { repairersApi, repairsApi } from '@/api/repairs';
import { customersApi } from '@/api/customers';
import { soldUnitsApi } from '@/api/soldUnits';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const queryClient = useQueryClient();

const id = computed(() => route.params.id);
const isEdit = computed(() => !!id.value);
const form = ref({ customerId: '', deviceDescription: '', fixedPrice: undefined, soldUnitId: undefined, repairerId: undefined, diagnosticNotes: '', notes: '' });
const repairCost = ref(0);
const submitError = ref('');

// ── Customer ──
const showCustomerPicker = ref(false);
const customerSearch = ref('');
const customer = ref(null);
const showNewCustomer = ref(false);
const newCustomer = ref({ firstName: '', lastName: '', phone: '' });
const { data: customersData } = useQuery({
  queryKey: ['customers-for-repair', customerSearch],
  queryFn: () => customersApi.getAll({ query: customerSearch.value, limit: 10 }),
  enabled: showCustomerPicker,
});
const customers = computed(() => customersData.value?.customers || []);
function pickCustomer(c) {
  customer.value = c;
  form.value.customerId = c.id;
  showCustomerPicker.value = false;
  showNewCustomer.value = false;
  customerSearch.value = '';
}
function clearCustomer() {
  customer.value = null;
  form.value.customerId = '';
}
const createCustomer = useMutation({
  mutationFn: () =>
    customersApi.create({ firstName: newCustomer.value.firstName.trim(), lastName: newCustomer.value.lastName.trim() || undefined, phone: newCustomer.value.phone.trim() || undefined }),
  onSuccess: (c) => {
    queryClient.invalidateQueries({ queryKey: ['customers-for-repair'] });
    pickCustomer(c);
    newCustomer.value = { firstName: '', lastName: '', phone: '' };
  },
});

// ── Repairer ──
const showRepairerPicker = ref(false);
const repairerSearch = ref('');
const repairer = ref(null);
const showNewRepairer = ref(false);
const newRepairer = ref({ name: '', phone: '' });
const { data: repairersData } = useQuery({
  queryKey: ['repairers-for-repair', repairerSearch],
  queryFn: () => repairersApi.getAll({ query: repairerSearch.value }),
  enabled: showRepairerPicker,
});
const repairers = computed(() => repairersData.value || []);
function pickRepairer(r) {
  repairer.value = r;
  form.value.repairerId = r.id;
  showRepairerPicker.value = false;
  showNewRepairer.value = false;
  repairerSearch.value = '';
}
function clearRepairer() {
  repairer.value = null;
  form.value.repairerId = undefined;
}
const createRepairer = useMutation({
  mutationFn: () => repairersApi.create({ name: newRepairer.value.name.trim(), phone: newRepairer.value.phone.trim() || undefined }),
  onSuccess: (r) => {
    queryClient.invalidateQueries({ queryKey: ['repairers-for-repair'] });
    pickRepairer(r);
    newRepairer.value = { name: '', phone: '' };
  },
});

// ── Linked stock device ──
const unitSearch = ref('');
const unitDropdown = ref(false);
const unit = ref(null);
let blurTimer = null;
const { data: unitsData } = useQuery({
  queryKey: ['sold-units-search', unitSearch],
  queryFn: () => soldUnitsApi.getAll({ query: unitSearch.value, inStock: true, limit: 10 }),
  enabled: computed(() => unitSearch.value.length >= 2),
});
const units = computed(() => unitsData.value?.units || []);
function pickUnit(u) {
  unit.value = u;
  form.value.soldUnitId = u.id;
  const parts = [u.brand, u.model];
  if (u.storage) parts.push(u.storage);
  if (u.imei) parts.push(`IMEI: ${u.imei}`);
  else if (u.serialNumber) parts.push(`S/N: ${u.serialNumber}`);
  form.value.deviceDescription = parts.join(' - ');
  unitDropdown.value = false;
  unitSearch.value = '';
}
function clearUnit() {
  unit.value = null;
  form.value.soldUnitId = undefined;
}
const onUnitBlur = () => (blurTimer = setTimeout(() => (unitDropdown.value = false), 200));
function onUnitFocus() {
  if (blurTimer) clearTimeout(blurTimer);
  unitDropdown.value = true;
}
const unitIcon = (u) => (u.deviceType === 'laptop' || u.deviceType === 'macbook' ? ComputerDesktopIcon : DevicePhoneMobileIcon);

const linkedUnitId = computed(() => form.value.soldUnitId);
const { data: unitRepairs } = useQuery({
  queryKey: ['repairs-by-unit', linkedUnitId],
  queryFn: () => repairsApi.getBySoldUnit(linkedUnitId.value),
  enabled: computed(() => !!linkedUnitId.value && !isEdit.value),
});
const activeRepair = computed(() => unitRepairs.value?.find((r) => ['pending', 'in_progress', 'completed'].includes(r.status)) || null);

// Arriving from a device page: /app/repairs/new?unitId=…
const preloadUnitId = computed(() => route.query.unitId);
const { data: preloadUnit } = useQuery({
  queryKey: ['sold-unit-preload', preloadUnitId],
  queryFn: () => soldUnitsApi.getById(preloadUnitId.value),
  enabled: computed(() => !!preloadUnitId.value && !isEdit.value),
});
watch(preloadUnit, (u) => u && !unit.value && pickUnit(u), { immediate: true });

const { data: existing } = useQuery({ queryKey: ['repair', id], queryFn: () => repairsApi.getById(id.value), enabled: isEdit });
watch(
  existing,
  (r) => {
    if (!r) return;
    form.value = {
      customerId: r.customerId,
      deviceDescription: r.deviceDescription,
      fixedPrice: Number(r.fixedPrice) || undefined,
      soldUnitId: r.soldUnitId || undefined,
      repairerId: r.repairerId || undefined,
      diagnosticNotes: r.diagnosticNotes || '',
      notes: r.notes || '',
    };
    if (r.customer) customer.value = r.customer;
    if (r.soldUnit) unit.value = r.soldUnit;
    if (r.repairer) repairer.value = r.repairer;
  },
  { immediate: true },
);

const onError = (e) => (submitError.value = e?.response?.data?.message || t('errors.serverError'));
const create = useMutation({
  mutationFn: (payload) => repairsApi.create(payload),
  onSuccess: async (r) => {
    // The intake cost becomes the first expense of the repair.
    if (repairCost.value > 0) await repairsApi.addExpense(r.id, { description: t('repairs.form.repairCost'), amount: repairCost.value, type: 'part' });
    queryClient.invalidateQueries({ queryKey: ['repairs'] });
    router.push(`/app/repairs/${r.id}`);
  },
  onError,
});
const update = useMutation({
  mutationFn: (payload) => repairsApi.update(id.value, payload),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['repairs'] });
    queryClient.invalidateQueries({ queryKey: ['repair', id.value] });
    router.push(`/app/repairs/${id.value}`);
  },
  onError,
});
const saving = computed(() => create.isPending.value || update.isPending.value);
function submit() {
  submitError.value = '';
  const p = form.value.fixedPrice;
  const payload = { ...form.value, fixedPrice: p == null || p === '' || Number.isNaN(p) ? undefined : Number(p) };
  if (isEdit.value) update.mutate(payload);
  else create.mutate(payload);
}
const back = () => router.push(isEdit.value ? `/app/repairs/${id.value}` : '/app/repairs');
</script>

<template>
  <div class="max-w-3xl space-y-6">
    <div class="flex items-center gap-4">
      <button class="p-2 hover:bg-gray-100 rounded-lg transition-colors" @click="back"><ArrowLeftIcon class="w-5 h-5 text-gray-600" /></button>
      <h1 class="text-2xl font-bold text-gray-900">{{ isEdit ? t('repairs.editRepair') : t('repairs.newRepair') }}</h1>
    </div>

    <form class="card p-6 space-y-6" @submit.prevent="submit">
      <div v-if="submitError" class="bg-danger-50 border border-danger-200 rounded-lg p-3 text-sm text-danger-700">{{ submitError }}</div>

      <div>
        <label class="label">{{ t('repairs.form.client') }} *</label>
        <div v-if="customer" class="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
          <div class="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
            <span class="text-sm font-medium text-green-700">{{ customer.firstName[0] }}{{ customer.lastName?.[0] || '' }}</span>
          </div>
          <div class="flex-1 min-w-0">
            <p class="font-medium text-gray-900">{{ customer.firstName }} {{ customer.lastName || '' }}</p>
            <p v-if="customer.phone" class="text-sm text-gray-500">{{ customer.phone }}</p>
          </div>
          <button type="button" class="p-1 hover:bg-green-100 rounded" @click="clearCustomer"><XMarkIcon class="w-4 h-4 text-green-600" /></button>
        </div>
        <button
          v-else
          type="button"
          class="w-full flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-start"
          @click="showCustomerPicker = true"
        >
          <UserIcon class="w-5 h-5 text-gray-400" /><span class="text-gray-500">{{ t('repairs.form.selectClient') }}</span>
        </button>
      </div>

      <div>
        <label class="label">{{ t('repairs.form.repairer') }}</label>
        <div v-if="repairer" class="flex items-center gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
          <div class="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center"><WrenchScrewdriverIcon class="w-4 h-4 text-orange-600" /></div>
          <div class="flex-1 min-w-0">
            <p class="font-medium text-gray-900">{{ repairer.name }}</p>
            <p v-if="repairer.phone" class="text-sm text-gray-500">{{ repairer.phone }}</p>
          </div>
          <button type="button" class="p-1 hover:bg-orange-100 rounded" @click="clearRepairer"><XMarkIcon class="w-4 h-4 text-orange-600" /></button>
        </div>
        <button
          v-else
          type="button"
          class="w-full flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-start"
          @click="showRepairerPicker = true"
        >
          <WrenchScrewdriverIcon class="w-5 h-5 text-gray-400" /><span class="text-gray-500">{{ t('repairs.form.selectRepairer') }}</span>
        </button>
      </div>

      <div>
        <label class="label">{{ t('repairs.form.linkedUnit') }}</label>
        <div v-if="unit" class="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <component :is="unitIcon(unit)" class="w-5 h-5 text-blue-600 flex-shrink-0" />
          <div class="flex-1 min-w-0">
            <p class="font-medium text-gray-900">{{ unit.brand }} {{ unit.model }}</p>
            <p class="text-xs text-gray-500 truncate">
              <span v-if="unit.ref">Ref: {{ unit.ref }}</span><span v-if="unit.imei"> · IMEI: {{ unit.imei }}</span><span v-if="unit.serialNumber"> · S/N: {{ unit.serialNumber }}</span
              ><span v-if="unit.storage"> · {{ unit.storage }}</span>
            </p>
          </div>
          <button type="button" class="p-1 hover:bg-blue-100 rounded" @click="clearUnit"><XMarkIcon class="w-4 h-4 text-blue-600" /></button>
        </div>
        <div v-else class="relative">
          <MagnifyingGlassIcon class="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input v-model="unitSearch" type="text" class="input ps-10" :placeholder="t('repairs.form.searchUnit')" @focus="onUnitFocus" @blur="onUnitBlur" />
          <div v-if="unitDropdown && units.length" class="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
            <button
              v-for="u in units"
              :key="u.id"
              type="button"
              class="w-full text-start px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0 flex items-center gap-3"
              @mousedown.prevent="pickUnit(u)"
            >
              <component :is="unitIcon(u)" class="w-5 h-5 text-gray-400 flex-shrink-0" />
              <div class="min-w-0">
                <p class="font-medium text-gray-900">{{ u.brand }} {{ u.model }}</p>
                <p class="text-xs text-gray-500 truncate">
                  <span v-if="u.ref">Ref: {{ u.ref }}</span><span v-if="u.imei"> · IMEI: {{ u.imei }}</span><span v-if="u.serialNumber"> · S/N: {{ u.serialNumber }}</span
                  ><span v-if="u.storage"> · {{ u.storage }}</span>
                </p>
              </div>
            </button>
          </div>
          <div
            v-if="unitDropdown && unitSearch.length >= 2 && !units.length"
            class="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg p-4 text-sm text-gray-500 text-center"
          >
            {{ t('repairs.form.noUnitsFound') }}
          </div>
        </div>
        <p class="text-xs text-gray-500 mt-1">{{ t('repairs.form.linkedUnitHint') }}</p>
      </div>

      <div v-if="activeRepair && !isEdit" class="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <ExclamationTriangleIcon class="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p class="text-sm font-medium text-amber-800">{{ t('repairs.form.activeRepairWarning') }}</p>
          <p class="text-sm text-amber-700 font-mono mt-1">{{ activeRepair.repairNumber }}</p>
          <RouterLink :to="`/app/repairs/${activeRepair.id}`" class="text-sm text-amber-700 underline hover:text-amber-900 mt-1 inline-block">{{ t('repairs.viewDetails') }}</RouterLink>
        </div>
      </div>

      <div>
        <label class="label">{{ t('repairs.form.deviceDescription') }} *</label>
        <input v-model="form.deviceDescription" type="text" class="input" required maxlength="255" :placeholder="t('repairs.form.devicePlaceholder')" />
      </div>

      <div>
        <label class="label">{{ t('repairs.form.fixedPrice') }}</label>
        <div class="relative">
          <input v-model.number="form.fixedPrice" type="number" step="0.01" min="0" class="input pe-10" :placeholder="t('repairs.priceNotSet')" />
          <span class="absolute end-3 top-1/2 -translate-y-1/2 text-gray-500">DH</span>
        </div>
        <p class="text-xs text-gray-500 mt-1">{{ t('repairs.form.fixedPriceHint') }}</p>
      </div>

      <div v-if="!isEdit">
        <label class="label">{{ t('repairs.form.repairCost') }}</label>
        <div class="relative">
          <input v-model.number="repairCost" type="number" step="0.01" min="0" class="input pe-10" />
          <span class="absolute end-3 top-1/2 -translate-y-1/2 text-gray-500">DH</span>
        </div>
        <p class="text-xs text-gray-500 mt-1">{{ t('repairs.form.repairCostHint') }}</p>
      </div>

      <div>
        <label class="label">{{ t('repairs.form.diagnosticNotes') }}</label>
        <textarea v-model="form.diagnosticNotes" class="input" rows="3" :placeholder="t('repairs.form.diagnosticPlaceholder')" />
      </div>

      <div class="flex justify-end gap-3 pt-4 border-t border-gray-100">
        <button type="button" class="btn-secondary" @click="back">{{ t('common.cancel') }}</button>
        <button type="submit" class="btn-primary" :disabled="saving || (!!activeRepair && !isEdit) || !form.customerId">
          {{ saving ? t('common.saving') : isEdit ? t('common.save') : t('repairs.createRepair') }}
        </button>
      </div>
    </form>

    <Teleport to="body">
      <div v-if="showCustomerPicker" class="modal-overlay" @click.self="(showCustomerPicker = false), (showNewCustomer = false)">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="text-lg font-bold text-gray-900">{{ t('repairs.form.selectClient') }}</h3>
            <button class="p-1 hover:bg-gray-100 rounded" @click="(showCustomerPicker = false), (showNewCustomer = false)"><XMarkIcon class="w-5 h-5" /></button>
          </div>
          <div class="p-4 border-b space-y-3">
            <div class="flex gap-2">
              <div class="relative flex-1">
                <MagnifyingGlassIcon class="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input v-model="customerSearch" type="text" :placeholder="t('customers.search')" class="input ps-10" />
              </div>
              <button type="button" :class="['btn-primary shrink-0', showNewCustomer && 'bg-gray-200 text-gray-700 hover:bg-gray-300']" @click="showNewCustomer = !showNewCustomer">
                <PlusIcon v-if="!showNewCustomer" class="w-4 h-4 me-1 inline" /> {{ showNewCustomer ? t('common.cancel') : t('customers.new') }}
              </button>
            </div>
            <div v-if="showNewCustomer" class="bg-gray-50 rounded-lg p-4 space-y-3">
              <div><label class="label">{{ t('customers.firstName') }} *</label><input v-model="newCustomer.firstName" type="text" class="input" :placeholder="t('customers.firstName')" /></div>
              <div><label class="label">{{ t('customers.lastName') }}</label><input v-model="newCustomer.lastName" type="text" class="input" :placeholder="t('customers.lastName')" /></div>
              <div><label class="label">{{ t('customers.phone') }}</label><input v-model="newCustomer.phone" type="tel" class="input" :placeholder="t('customers.phone')" /></div>
              <button type="button" class="btn-primary w-full" :disabled="!newCustomer.firstName.trim() || createCustomer.isPending.value" @click="createCustomer.mutate()">
                {{ createCustomer.isPending.value ? t('common.loading') : t('customers.create') }}
              </button>
            </div>
          </div>
          <div class="modal-body max-h-80 overflow-y-auto p-0">
            <button v-for="c in customers" :key="c.id" type="button" class="w-full flex items-center gap-3 p-4 hover:bg-gray-50 border-b last:border-0" @click="pickCustomer(c)">
              <div class="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                <span class="text-sm font-medium text-gray-600">{{ c.firstName[0] }}{{ c.lastName?.[0] || '' }}</span>
              </div>
              <div class="flex-1 text-start">
                <p class="font-medium text-gray-900">{{ c.firstName }} {{ c.lastName }}</p>
                <p class="text-sm text-gray-500">{{ c.phone }}</p>
              </div>
              <CheckCircleIcon v-if="customer?.id === c.id" class="w-5 h-5 text-success-500" />
            </button>
            <p v-if="!customers.length" class="p-4 text-center text-gray-500">{{ t('common.noResults') }}</p>
          </div>
          <div class="modal-footer"><button type="button" class="btn-secondary" @click="(showCustomerPicker = false), (showNewCustomer = false)">{{ t('common.cancel') }}</button></div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="showRepairerPicker" class="modal-overlay" @click.self="(showRepairerPicker = false), (showNewRepairer = false)">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="text-lg font-bold text-gray-900">{{ t('repairs.form.selectRepairer') }}</h3>
            <button class="p-1 hover:bg-gray-100 rounded" @click="(showRepairerPicker = false), (showNewRepairer = false)"><XMarkIcon class="w-5 h-5" /></button>
          </div>
          <div class="p-4 border-b space-y-3">
            <div class="flex gap-2">
              <div class="relative flex-1">
                <MagnifyingGlassIcon class="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input v-model="repairerSearch" type="text" :placeholder="t('repairs.form.searchRepairer')" class="input ps-10" />
              </div>
              <button type="button" :class="['btn-primary shrink-0', showNewRepairer && 'bg-gray-200 text-gray-700 hover:bg-gray-300']" @click="showNewRepairer = !showNewRepairer">
                <PlusIcon v-if="!showNewRepairer" class="w-4 h-4 me-1 inline" /> {{ showNewRepairer ? t('common.cancel') : t('common.add') }}
              </button>
            </div>
            <div v-if="showNewRepairer" class="bg-gray-50 rounded-lg p-4 space-y-3">
              <div><label class="label">{{ t('repairs.form.repairerName') }} *</label><input v-model="newRepairer.name" type="text" class="input" /></div>
              <div><label class="label">{{ t('customers.phone') }}</label><input v-model="newRepairer.phone" type="tel" class="input" /></div>
              <button type="button" class="btn-primary w-full" :disabled="!newRepairer.name.trim() || createRepairer.isPending.value" @click="createRepairer.mutate()">
                {{ createRepairer.isPending.value ? t('common.loading') : t('common.add') }}
              </button>
            </div>
          </div>
          <div class="modal-body max-h-80 overflow-y-auto p-0">
            <button v-for="r in repairers" :key="r.id" type="button" class="w-full flex items-center gap-3 p-4 hover:bg-gray-50 border-b last:border-0" @click="pickRepairer(r)">
              <div class="w-10 h-10 bg-orange-50 rounded-full flex items-center justify-center"><WrenchScrewdriverIcon class="w-4 h-4 text-orange-600" /></div>
              <div class="flex-1 text-start">
                <p class="font-medium text-gray-900">{{ r.name }}</p>
                <p class="text-sm text-gray-500">{{ r.phone }}</p>
              </div>
              <CheckCircleIcon v-if="repairer?.id === r.id" class="w-5 h-5 text-success-500" />
            </button>
            <p v-if="!repairers.length" class="p-4 text-center text-gray-500">{{ t('common.noResults') }}</p>
          </div>
          <div class="modal-footer"><button type="button" class="btn-secondary" @click="(showRepairerPicker = false), (showNewRepairer = false)">{{ t('common.cancel') }}</button></div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
