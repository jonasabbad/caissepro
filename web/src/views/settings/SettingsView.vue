<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import {
  BuildingStorefrontIcon,
  DevicePhoneMobileIcon,
  DocumentTextIcon,
  GlobeAltIcon,
  LockClosedIcon,
  PrinterIcon,
  TagIcon,
  UserCircleIcon,
} from '@heroicons/vue/24/outline';
import { settingsApi } from '@/api/misc';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';
import { currentLocale } from '@/i18n';
import { getSavedPrinter, isQzAvailable, listPrinters, printHtml, setSavedPrinter } from '@/services/printer';
import {
  getDrawerBaudRate,
  getDrawerCommand,
  isCashDrawerPaired,
  isCashDrawerSupported,
  openCashDrawer,
  pairCashDrawer,
  saveDrawerSettings,
  unpairCashDrawer,
} from '@/services/cashDrawer';
import { receiptHtml } from '@/utils/receipt';
import { BRAND_ABBREVIATIONS, deviceDisplayName } from '@/utils/labelRenderer';
import { useRoute } from 'vue-router';
import Toast from '@/components/ui/Toast.vue';
import ScannerDevicesManager from '@/components/scan/ScannerDevicesManager.vue';

const { t } = useI18n();
const auth = useAuthStore();
const queryClient = useQueryClient();
const toast = ref({ show: false, message: '', type: 'success' });
const ok = (message) => (toast.value = { show: true, message, type: 'success' });
const fail = (message) => (toast.value = { show: true, message, type: 'error' });
const errMsg = (e, fallback) => e?.response?.data?.message || fallback;

const { data: settings, isLoading } = useQuery({ queryKey: ['tenant-settings'], queryFn: () => settingsApi.getTenantSettings() });
const route = useRoute();
const tab = ref(typeof route.query.tab === 'string' ? route.query.tab : 'profile');
const TABS = [
  { id: 'profile', icon: UserCircleIcon, label: 'settings.profile' },
  { id: 'store', icon: BuildingStorefrontIcon, label: 'settings.store' },
  { id: 'invoices', icon: DocumentTextIcon, label: 'settings.invoices' },
  { id: 'localization', icon: GlobeAltIcon, label: 'settings.localization' },
  { id: 'printing', icon: PrinterIcon, label: 'settings.printing' },
  { id: 'scanners', icon: DevicePhoneMobileIcon, label: 'scan.devices.settingsTab' },
  { id: 'security', icon: LockClosedIcon, label: 'settings.security' },
];

// ── Forms, filled from GET /settings/tenant ──
const profile = ref({ firstName: auth.currentUser?.firstName || '', lastName: auth.currentUser?.lastName || '' });
const store = ref({ name: '', address: '', city: '', phone: '', taxRate: 20 });
const legal = ref({ legalStatus: '', flatTaxRate: 1 });
const business = ref({
  invoicePrefix: 'FAC',
  invoiceYearFormat: 'YYYY',
  invoiceSeparator: '-',
  invoiceDigits: 4,
  nextInvoiceNumber: 1,
  ice: '',
  rc: '',
  patente: '',
  identifiantFiscal: '',
  taxeProfessionnelle: '',
  cnss: '',
  cnie: '',
  bankName: '',
  accountHolder: '',
  accountNumber: '',
  rib: '',
});
const printing = ref({ shortenBrandNames: false, showBrand: true, simplifyBrand: false, autoPrintReceipt: false });
const localization = ref({ language: currentLocale(), dateFormat: 'DD/MM/YYYY' });
const password = ref({ currentPassword: '', newPassword: '', confirmPassword: '' });

watch(
  settings,
  (s) => {
    if (!s) return;
    store.value = { name: s.storeName || '', address: s.storeAddress || '', city: s.storeCity || '', phone: s.storePhone || '', taxRate: s.settings?.taxRate || 20 };
    const b = s.settings?.businessInfo || {};
    legal.value = { legalStatus: s.legalStatus || '', flatTaxRate: b.flatTaxRate ?? 1 };
    for (const k of ['ice', 'rc', 'patente', 'identifiantFiscal', 'taxeProfessionnelle', 'cnss', 'cnie', 'bankName', 'accountHolder', 'accountNumber', 'rib']) business.value[k] = b[k] || '';
    business.value.invoicePrefix = b.invoicePrefix || 'FAC';
    business.value.invoiceYearFormat = b.invoiceYearFormat ?? 'YYYY';
    business.value.invoiceSeparator = b.invoiceSeparator ?? '-';
    business.value.invoiceDigits = b.invoiceDigits || 4;
    business.value.nextInvoiceNumber = b.nextInvoiceNumber || 1;
    const p = s.settings?.printingSettings || {};
    printing.value = { shortenBrandNames: p.shortenBrandNames ?? false, showBrand: p.showBrand ?? true, simplifyBrand: p.simplifyBrand ?? false, autoPrintReceipt: p.autoPrintReceipt ?? false };
  },
  { immediate: true },
);
const refreshSettings = () => queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });

const LEGAL = ['auto_entrepreneur', 'entreprise_individuelle', 'sarl', 'sarlau', 'sa', 'sas', 'snc', 'cooperative', 'association'];
const isAE = computed(() => legal.value.legalStatus === 'auto_entrepreneur');
const invoicePreview = computed(() => {
  const b = business.value;
  const year = b.invoiceYearFormat === 'YY' ? String(new Date().getFullYear()).slice(-2) : b.invoiceYearFormat === 'YYYY' ? String(new Date().getFullYear()) : '';
  const sep = b.invoiceSeparator ?? '-';
  return [b.invoicePrefix || 'FAC', year, String(b.nextInvoiceNumber || 1).padStart(b.invoiceDigits || 4, '0')].filter(Boolean).join(sep);
});

// RIB: 24 digits; the first three are the bank code (Bank Al-Maghrib codes of the main banks).
const BANK_CODES = {
  'Attijariwafa Bank': ['007'],
  'BMCE Bank of Africa': ['011'],
  BMCI: ['013'],
  'Crédit du Maroc': ['021'],
  'Société Générale Maroc': ['022'],
  'Crédit Agricole du Maroc': ['225'],
  'CIH Bank': ['230'],
  'Al Barid Bank': ['310'],
  'Bank Al-Maghrib': ['001'],
  'Citibank Maghreb': ['028'],
  'Banque Populaire': ['101', '105', '109', '117', '127', '133', '140', '143', '145', '148', '149', '150', '155', '157', '159', '164', '169', '172', '175', '178', '181', '190', '195', '197'],
  'Banque Centrale Populaire': ['190'],
  'UMNIA Bank': [],
  'Bank Assafa': [],
  'BTI Bank': [],
  'CFG Bank': [],
  'Arab Bank Maroc': [],
};
const ribError = computed(() => {
  const rib = business.value.rib.replace(/\s/g, '');
  const bank = business.value.bankName;
  if (!rib) return null;
  if (!/^\d{24}$/.test(rib)) return t('settings.ribLength');
  const codes = BANK_CODES[bank];
  if (!codes?.length) return null;
  return codes.includes(rib.slice(0, 3))
    ? null
    : t('settings.ribPrefix', { codes: codes.length > 3 ? `${codes.slice(0, 3).join(', ')}...` : codes.join(` ${t('settings.or')} `), bank });
});

// ── Saves ──
const profileMut = useMutation({
  mutationFn: (p) => settingsApi.updateProfile(p),
  onSuccess: (d) => (d?.user && auth.updateUser(d.user), ok(t('settings.saved'))),
  onError: (e) => fail(errMsg(e, t('settings.saveError'))),
});
const savingStore = ref(false);
async function saveStore() {
  savingStore.value = true;
  try {
    await settingsApi.updateStore({ name: store.value.name, address: store.value.address, city: store.value.city, phone: store.value.phone });
    await settingsApi.updatePreferences({ taxRate: store.value.taxRate });
    refreshSettings();
    auth.updateUser({ storeName: store.value.name });
    ok(t('settings.saved'));
  } catch (e) {
    fail(errMsg(e, t('settings.saveError')));
  } finally {
    savingStore.value = false;
  }
}
const savingLegal = ref(false);
async function saveLegal() {
  savingLegal.value = true;
  try {
    await settingsApi.updateLegalStatus({ legalStatus: legal.value.legalStatus, flatTaxRate: legal.value.flatTaxRate || 1 });
    refreshSettings();
    try {
      const res = await authApi.getProfile();
      if (res.success && res.data?.user) auth.updateUser(res.data.user);
    } catch {
      /* profile refresh is best effort */
    }
    ok(t('settings.saved'));
  } catch (e) {
    fail(errMsg(e, t('settings.saveError')));
  } finally {
    savingLegal.value = false;
  }
}
const businessMut = useMutation({
  mutationFn: (p) => settingsApi.updateBusinessInfo(p),
  onSuccess: () => (refreshSettings(), ok(t('settings.saved'))),
  onError: (e) => fail(errMsg(e, t('settings.saveError'))),
});
function saveBusiness() {
  if (ribError.value) return fail(ribError.value);
  businessMut.mutate({ ...business.value, rib: business.value.rib.replace(/\s/g, '') });
}
const prefsMut = useMutation({
  mutationFn: (p) => settingsApi.updatePreferences(p),
  onSuccess: () => (refreshSettings(), ok(t('settings.saved'))),
  onError: (e) => fail(errMsg(e, t('settings.saveError'))),
});
function saveLocalization() {
  auth.setLanguage(localization.value.language);
  prefsMut.mutate({ locale: localization.value.language });
}
const passwordMut = useMutation({
  mutationFn: (p) => settingsApi.changePassword(p),
  onSuccess: () => ((password.value = { currentPassword: '', newPassword: '', confirmPassword: '' }), ok(t('settings.passwordChanged'))),
  onError: (e) => fail(errMsg(e, t('settings.passwordError'))),
});
function changePassword() {
  const p = password.value;
  if (p.newPassword !== p.confirmPassword) return fail(t('settings.passwordMismatch'));
  if (p.newPassword.length < 6) return fail(t('settings.passwordTooShort'));
  passwordMut.mutate({ currentPassword: p.currentPassword, newPassword: p.newPassword });
}

// ── Labels: how device names are printed ──
const ABBREVIATIONS = BRAND_ABBREVIATIONS;
const brandMode = computed({
  get: () => (!printing.value.showBrand ? 'none' : printing.value.simplifyBrand ? 'simplify' : printing.value.shortenBrandNames ? 'abbreviate' : 'full'),
  set: (m) => {
    printing.value.showBrand = m !== 'none';
    printing.value.simplifyBrand = m === 'simplify';
    printing.value.shortenBrandNames = m === 'abbreviate';
  },
});
// Same function as the stickers, so this preview is exactly what is printed.
const labelName = (name) => deviceDisplayName(name, { ...printing.value, brandAbbreviations: ABBREVIATIONS });
const BRAND_MODES = [
  { id: 'full', label: 'settings.brandFull', help: 'settings.brandFullHelp' },
  { id: 'simplify', label: 'settings.brandSimplify', help: 'settings.brandSimplifyHelp' },
  { id: 'abbreviate', label: 'settings.brandAbbreviate', help: 'settings.brandAbbreviateHelp' },
  { id: 'none', label: 'settings.brandNone', help: 'settings.brandNoneHelp' },
];
const PREVIEW_NAMES = ['Apple iPhone 15 Pro Max', 'Samsung Galaxy S24 Ultra', 'Xiaomi Redmi Note 13'];
const savingPrinting = ref(false);
async function savePrinting() {
  savingPrinting.value = true;
  try {
    await settingsApi.updatePrintingSettings({ ...printing.value, brandAbbreviations: ABBREVIATIONS });
    refreshSettings();
    ok(t('settings.saved'));
  } catch (e) {
    fail(errMsg(e, t('settings.saveError')));
  } finally {
    savingPrinting.value = false;
  }
}

// ── Receipt printer (QZ Tray) ──
const qzState = ref('unknown'); // unknown | connected | unavailable
const printers = ref([]);
const printer = ref(getSavedPrinter() || '');
const detecting = ref(false);
const testing = ref(false);
async function detectPrinters() {
  detecting.value = true;
  try {
    if (!(await isQzAvailable())) {
      qzState.value = 'unavailable';
      printers.value = [];
      return;
    }
    qzState.value = 'connected';
    printers.value = await listPrinters();
    if (!printers.value.includes(printer.value)) printer.value = '';
    if (!printer.value && printers.value.length) printer.value = printers.value.find((p) => /pos|thermal|receipt|80mm|xp-?|xprinter/i.test(p)) || printers.value[0];
  } catch {
    qzState.value = 'unavailable';
    printers.value = [];
  } finally {
    detecting.value = false;
  }
}
function savePrinter() {
  if (!printer.value) return fail(t('settings.selectPrinter'));
  setSavedPrinter(printer.value);
  ok(t('settings.printerSaved'));
}
async function testPrinter() {
  if (!printer.value) return fail(t('settings.selectPrinter'));
  testing.value = true;
  try {
    const html = receiptHtml({
      transactionNumber: 'TEST-0001',
      docLabel: t('settings.testTicket'),
      footerNote: t('settings.testTicketNote'),
      date: new Date().toISOString(),
      cashierName: auth.currentUser?.firstName || t('settings.cashierFallback'),
      storeName: store.value.name || 'POS CAISSE',
      storeAddress: store.value.address || undefined,
      storePhone: store.value.phone || undefined,
      items: [{ name: t('settings.testItem'), quantity: 1, unitPrice: 100, total: 100 }],
      subtotal: 100,
      taxAmount: 0,
      discount: 0,
      total: 100,
      paymentMethod: 'cash',
      amountPaid: 100,
      change: 0,
    });
    await printHtml(html, { widthMm: 80, printerName: printer.value });
    ok(t('settings.testSent'));
  } catch (e) {
    fail(t('settings.printFailed', { error: e?.message || t('settings.printerUnreachable') }));
  } finally {
    testing.value = false;
  }
}

// ── Cash drawer (Web Serial) ──
const drawerSupported = isCashDrawerSupported();
const drawerPaired = ref(isCashDrawerPaired());
const drawerCommand = ref(getDrawerCommand());
const drawerBaud = ref(getDrawerBaudRate());
const pairing = ref(false);
const kicking = ref(false);
async function pairDrawer() {
  pairing.value = true;
  try {
    saveDrawerSettings(drawerCommand.value, drawerBaud.value);
    await pairCashDrawer();
    drawerPaired.value = true;
    ok(t('settings.drawerPairedToast'));
  } catch (e) {
    fail(e?.name === 'NotFoundError' ? t('settings.noPortSelected') : t('settings.drawerFailed', { error: e?.message || t('settings.portUnreachable') }));
  } finally {
    pairing.value = false;
  }
}
async function testDrawer() {
  kicking.value = true;
  try {
    saveDrawerSettings(drawerCommand.value, drawerBaud.value);
    await openCashDrawer();
    ok(t('settings.drawerPulseSent'));
  } catch (e) {
    fail(t('settings.drawerFailed', { error: e?.message || t('settings.portUnreachable') }));
  } finally {
    kicking.value = false;
  }
}
async function unpairDrawer() {
  await unpairCashDrawer();
  drawerPaired.value = false;
  ok(t('settings.drawerDisabled'));
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold text-gray-900">{{ t('settings.title') }}</h1>
    <div class="flex flex-col lg:flex-row gap-6">
      <nav class="lg:w-56 shrink-0 flex lg:flex-col gap-1 overflow-x-auto">
        <button
          v-for="tb in TABS"
          :key="tb.id"
          :class="['flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap', tab === tb.id ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100']"
          @click="tab = tb.id"
        >
          <component :is="tb.icon" class="w-5 h-5" /> {{ t(tb.label) }}
        </button>
        <RouterLink to="/app/settings/label-templates" class="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 whitespace-nowrap">
          <TagIcon class="w-5 h-5" /> {{ t('labelTemplates.title') }}
        </RouterLink>
      </nav>

      <div class="flex-1 min-w-0">
        <div v-if="isLoading" class="card p-8 text-center text-gray-500">{{ t('common.loading') }}</div>

        <!-- Profile -->
        <div v-else-if="tab === 'profile'" class="card p-6 space-y-4 max-w-2xl">
          <h2 class="text-lg font-semibold text-gray-900">{{ t('settings.profile') }}</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label class="label">{{ t('settings.firstName') }}</label><input v-model="profile.firstName" class="input" /></div>
            <div><label class="label">{{ t('settings.lastName') }}</label><input v-model="profile.lastName" class="input" /></div>
          </div>
          <div>
            <label class="label">{{ t('settings.email') }}</label>
            <input :value="auth.currentUser?.email" class="input bg-gray-50" disabled />
            <p class="text-xs text-gray-500 mt-1">{{ t('settings.emailCannotChange') }}</p>
          </div>
          <button class="btn-primary" :disabled="profileMut.isPending.value" @click="profileMut.mutate({ ...profile })">{{ t('common.save') }}</button>
        </div>

        <!-- Store -->
        <div v-else-if="tab === 'store'" class="card p-6 space-y-4 max-w-2xl">
          <h2 class="text-lg font-semibold text-gray-900">{{ t('settings.store') }}</h2>
          <div><label class="label">{{ t('settings.storeName') }}</label><input v-model="store.name" class="input" /></div>
          <div><label class="label">{{ t('settings.storeAddress') }}</label><input v-model="store.address" class="input" /></div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label class="label">{{ t('settings.storeCity') }}</label><input v-model="store.city" class="input" /></div>
            <div>
              <label class="label">{{ t('settings.storePhone') }}</label><input v-model="store.phone" class="input" />
              <p class="text-xs text-gray-500 mt-1">{{ t('settings.phoneFormat') }}</p>
            </div>
          </div>
          <div class="sm:w-1/2"><label class="label">{{ t('settings.taxRate') }} (%)</label><input v-model.number="store.taxRate" type="number" min="0" max="100" class="input" /></div>
          <button class="btn-primary" :disabled="savingStore" @click="saveStore">{{ t('common.save') }}</button>
        </div>

        <!-- Invoices -->
        <div v-else-if="tab === 'invoices'" class="space-y-6 max-w-3xl">
          <div class="card p-6 space-y-4">
            <div>
              <h2 class="text-lg font-semibold text-gray-900">{{ t('settings.legalStatus') }}</h2>
              <p class="text-sm text-gray-500">{{ t('settings.legalStatusHelp') }}</p>
            </div>
            <select v-model="legal.legalStatus" class="input">
              <option value="" disabled>{{ t('settings.selectLegalStatus') }}</option>
              <option v-for="s in LEGAL" :key="s" :value="s">{{ t(`settings.legalStatusOptions.${s}`) }}</option>
            </select>
            <template v-if="isAE">
              <div class="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">{{ t('settings.autoEntrepreneurInfo') }}</div>
              <div class="sm:w-1/2">
                <label class="label">{{ t('settings.flatTaxRate') }}</label>
                <input v-model.number="legal.flatTaxRate" type="number" step="0.1" min="0" max="30" class="input" />
                <p class="text-xs text-gray-500 mt-1">{{ t('settings.flatTaxRateHelp') }}</p>
              </div>
            </template>
            <button class="btn-primary" :disabled="savingLegal || !legal.legalStatus" @click="saveLegal">{{ t('common.save') }}</button>
          </div>

          <div class="card p-6 space-y-4">
            <div>
              <h2 class="text-lg font-semibold text-gray-900">{{ t('settings.invoiceNumbering') }}</h2>
              <p class="text-sm text-gray-500">{{ t('settings.invoiceNumberingHelp') }}</p>
            </div>
            <div class="rounded-lg bg-gray-50 border border-gray-200 p-3">
              <p class="text-xs text-gray-500">{{ t('settings.invoicePreview') }}</p>
              <p class="font-mono text-lg font-semibold">{{ invoicePreview }}</p>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><label class="label">{{ t('settings.invoicePrefix') }}</label><input v-model="business.invoicePrefix" class="input" placeholder="Ex: FAC, INV, F" maxlength="10" /></div>
              <div>
                <label class="label">{{ t('settings.invoiceSeparator') }}</label>
                <select v-model="business.invoiceSeparator" class="input"><option value="-">{{ t('settings.separatorDash') }}</option><option value="/">{{ t('settings.separatorSlash') }}</option><option value="_">{{ t('settings.separatorUnderscore') }}</option><option value="">{{ t('settings.none') }}</option></select>
              </div>
              <div>
                <label class="label">{{ t('settings.invoiceYearFormat') }}</label>
                <select v-model="business.invoiceYearFormat" class="input"><option value="YYYY">YYYY</option><option value="YY">YY</option><option value="">{{ t('settings.none') }}</option></select>
              </div>
              <div><label class="label">{{ t('settings.invoiceDigits') }}</label><input v-model.number="business.invoiceDigits" type="number" min="1" max="8" class="input" /></div>
            </div>
            <div class="sm:w-1/2">
              <label class="label">{{ t('settings.nextInvoiceNumber') }}</label>
              <input v-model.number="business.nextInvoiceNumber" type="number" min="1" class="input" />
              <p class="text-xs text-gray-500 mt-1">{{ t('settings.nextInvoiceNumberHelp') }}</p>
            </div>
          </div>

          <div class="card p-6 space-y-4">
            <div>
              <h2 class="text-lg font-semibold text-gray-900">{{ t('settings.companyInfo') }}</h2>
              <p class="text-sm text-gray-500">{{ t('settings.companyInfoHelp') }}</p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label class="label">ICE</label><input v-model="business.ice" class="input font-mono" inputmode="numeric" maxlength="15" /><p class="text-xs text-gray-500 mt-1">{{ t('settings.iceHelp') }}</p></div>
              <div><label class="label">RC</label><input v-model="business.rc" class="input" /><p class="text-xs text-gray-500 mt-1">{{ t('settings.rcHelp') }}</p></div>
              <div><label class="label">Patente</label><input v-model="business.patente" class="input" /></div>
              <div><label class="label">IF</label><input v-model="business.identifiantFiscal" class="input" /><p class="text-xs text-gray-500 mt-1">{{ t('settings.ifHelp') }}</p></div>
              <div><label class="label">TP</label><input v-model="business.taxeProfessionnelle" class="input" /><p class="text-xs text-gray-500 mt-1">{{ t('settings.tpHelp') }}</p></div>
              <div><label class="label">CNSS</label><input v-model="business.cnss" class="input" /></div>
              <div v-if="isAE" class="sm:col-span-2">
                <label class="label">CNIE</label><input v-model="business.cnie" class="input" placeholder="AB123456" />
                <p class="text-xs text-gray-500 mt-1">{{ t('settings.cnieHelp') }}</p>
              </div>
            </div>
          </div>

          <div class="card p-6 space-y-4">
            <div>
              <h2 class="text-lg font-semibold text-gray-900">{{ t('settings.bankingInfo') }}</h2>
              <p class="text-sm text-gray-500">{{ t('settings.bankingInfoHelp') }}</p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="label">{{ t('settings.bankName') }}</label>
                <select v-model="business.bankName" class="input"><option value="">—</option><option v-for="b in Object.keys(BANK_CODES)" :key="b" :value="b">{{ b }}</option></select>
              </div>
              <div><label class="label">{{ t('settings.accountHolder') }}</label><input v-model="business.accountHolder" class="input" :placeholder="t('settings.accountHolderPlaceholder')" /></div>
              <div><label class="label">{{ t('settings.accountNumber') }}</label><input v-model="business.accountNumber" class="input" /></div>
              <div>
                <label class="label">RIB</label><input v-model="business.rib" class="input font-mono" inputmode="numeric" maxlength="29" />
                <p :class="['text-xs mt-1', ribError ? 'text-danger-600' : 'text-gray-500']">{{ ribError || t('settings.ribHelp') }}</p>
              </div>
            </div>
          </div>
          <button class="btn-primary" :disabled="businessMut.isPending.value" @click="saveBusiness">{{ t('common.save') }}</button>
        </div>

        <!-- Localization -->
        <div v-else-if="tab === 'localization'" class="card p-6 space-y-4 max-w-2xl">
          <h2 class="text-lg font-semibold text-gray-900">{{ t('settings.localization') }}</h2>
          <div>
            <label class="label">{{ t('settings.language') }}</label>
            <select v-model="localization.language" class="input"><!-- i18n-ignore: language names --><option value="fr">Français</option><option value="en">English</option><option value="ar">العربية</option></select>
          </div>
          <div>
            <label class="label">{{ t('settings.dateFormat') }}</label>
            <select v-model="localization.dateFormat" class="input"><option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option></select>
          </div>
          <button class="btn-primary" :disabled="prefsMut.isPending.value" @click="saveLocalization">{{ t('common.save') }}</button>
        </div>

        <!-- Printing -->
        <div v-else-if="tab === 'printing'" class="space-y-6 max-w-3xl">
          <div class="card p-6 space-y-4">
            <div>
              <h2 class="text-lg font-semibold text-gray-900">{{ t('settings.labelSettings') }}</h2>
              <p class="text-sm text-gray-500">{{ t('settings.labelSettingsHelp') }}</p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                v-for="m in BRAND_MODES"
                :key="m.id"
                :class="['p-4 rounded-lg border-2 text-start transition-colors', brandMode === m.id ? 'border-black bg-gray-50' : 'border-gray-200 hover:border-gray-300']"
                @click="brandMode = m.id"
              >
                <p class="font-medium text-gray-900">{{ t(m.label) }}</p>
                <p class="text-xs text-gray-500 mt-1">{{ t(m.help) }}</p>
              </button>
            </div>
            <div class="rounded-lg bg-gray-50 p-4">
              <p class="text-xs text-gray-500 mb-2">{{ t('settings.labelPreview') }}</p>
              <div class="space-y-1">
                <div v-for="n in PREVIEW_NAMES" :key="n" class="flex items-center justify-between text-sm">
                  <span class="text-gray-500">{{ n }}</span><span class="font-mono font-semibold text-gray-900">{{ labelName(n) }}</span>
                </div>
              </div>
            </div>
            <div v-if="brandMode === 'abbreviate'">
              <p class="text-xs font-medium text-gray-500 mb-2">{{ t('settings.brandAbbreviations') }}</p>
              <div class="flex flex-wrap gap-2">
                <span v-for="(abbr, series) in ABBREVIATIONS" :key="series" class="px-2 py-1 rounded bg-gray-100 text-xs">{{ series }} → <strong>{{ abbr }}</strong></span>
              </div>
            </div>
            <label class="flex items-start gap-3 pt-2 border-t border-gray-100 cursor-pointer">
              <input v-model="printing.autoPrintReceipt" type="checkbox" class="mt-1 rounded" />
              <span>
                <span class="font-medium text-gray-900">{{ t('settings.autoPrintReceipt') }}</span>
                <span class="block text-xs text-gray-500">{{ t('settings.autoPrintReceiptHint') }}</span>
              </span>
            </label>
            <button class="btn-primary" :disabled="savingPrinting" @click="savePrinting">{{ t('common.save') }}</button>
          </div>

          <div class="card p-6 space-y-4">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="text-lg font-semibold text-gray-900">{{ t('settings.printer') }}</h2>
                <p class="text-sm text-gray-500">QZ Tray</p>
              </div>
              <span v-if="qzState === 'connected'" class="text-xs px-2 py-1 rounded bg-green-100 text-green-700">{{ t('settings.qzConnected') }}</span>
            </div>
            <p v-if="qzState === 'unavailable'" class="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">{{ t('settings.qzMissing') }}</p>
            <div class="flex flex-col sm:flex-row gap-2">
              <button class="btn-secondary" :disabled="detecting" @click="detectPrinters">{{ detecting ? t('settings.detecting') : t('settings.detectPrinters') }}</button>
              <select v-model="printer" class="input flex-1" :disabled="!printers.length">
                <option value="">{{ t('settings.choosePrinter') }}</option>
                <option v-for="p in printers" :key="p" :value="p">{{ p }}</option>
              </select>
            </div>
            <div class="flex flex-wrap gap-2">
              <button class="btn-primary" :disabled="!printer" @click="savePrinter">{{ t('settings.save') }}</button>
              <button class="btn-secondary" :disabled="!printer || testing" @click="testPrinter">{{ testing ? t('settings.printingTest') : t('settings.testPrint') }}</button>
            </div>
          </div>

          <div class="card p-6 space-y-4">
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-lg font-semibold text-gray-900">{{ t('settings.drawer') }}</h2>
              <span v-if="drawerPaired" class="text-xs px-2 py-1 rounded bg-green-100 text-green-700">{{ t('settings.drawerPaired') }}</span>
            </div>
            <p v-if="!drawerSupported" class="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">{{ t('settings.serialUnsupported') }}</p>
            <template v-else>
              <div class="flex flex-wrap gap-2">
                <button v-if="!drawerPaired" class="btn-primary" :disabled="pairing" @click="pairDrawer">{{ pairing ? 'Ouverture…' : t('settings.connectDrawer') }}</button>
                <template v-else>
                  <button class="btn-secondary" :disabled="kicking" @click="testDrawer">{{ kicking ? 'Ouverture…' : t('settings.testDrawer') }}</button>
                  <button class="btn-ghost text-danger-600" @click="unpairDrawer">{{ t('settings.disconnect') }}</button>
                </template>
              </div>
              <details class="text-sm">
                <summary class="cursor-pointer text-gray-600">{{ t('settings.advanced') }}</summary>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                  <div><label class="label">{{ t('settings.command') }}</label><input v-model="drawerCommand" class="input font-mono" /></div>
                  <div>
                    <label class="label">{{ t('settings.baud') }}</label>
                    <select v-model.number="drawerBaud" class="input"><option v-for="b in [9600, 19200, 38400, 57600, 115200]" :key="b" :value="b">{{ b }}</option></select>
                  </div>
                </div>
              </details>
            </template>
          </div>
        </div>

        <!-- Phone scanners -->
        <div v-else-if="tab === 'scanners'" class="card p-6 space-y-4 max-w-2xl">
          <div>
            <h2 class="text-lg font-semibold text-gray-900">{{ t('scan.devices.settingsTab') }}</h2>
            <p class="mt-1 text-sm text-gray-500">{{ t('scan.devices.settingsIntro') }}</p>
          </div>
          <ScannerDevicesManager />
        </div>

        <!-- Security -->
        <div v-else-if="tab === 'security'" class="card p-6 space-y-4 max-w-2xl">
          <h2 class="text-lg font-semibold text-gray-900">{{ t('settings.changePassword') }}</h2>
          <div><label class="label">{{ t('settings.currentPassword') }}</label><input v-model="password.currentPassword" type="password" class="input" autocomplete="current-password" /></div>
          <div><label class="label">{{ t('settings.newPassword') }}</label><input v-model="password.newPassword" type="password" class="input" autocomplete="new-password" /></div>
          <div><label class="label">{{ t('settings.confirmPassword') }}</label><input v-model="password.confirmPassword" type="password" class="input" autocomplete="new-password" /></div>
          <button class="btn-primary" :disabled="passwordMut.isPending.value || !password.currentPassword || !password.newPassword" @click="changePassword">{{ t('settings.changePassword') }}</button>
        </div>
      </div>
    </div>
    <Toast :show="toast.show" :message="toast.message" :type="toast.type" @close="toast.show = false" />
  </div>
</template>
