<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import {
  ArrowsRightLeftIcon,
  ArrowUturnLeftIcon,
  BanknotesIcon,
  BoltIcon,
  BookmarkIcon,
  BuildingLibraryIcon,
  CheckCircleIcon,
  CreditCardIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  MinusIcon,
  PlusIcon,
  ShoppingCartIcon,
  TrashIcon,
  UserIcon,
  WrenchScrewdriverIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';
import { useCartStore } from '@/stores/cart';
import { useAuthStore } from '@/stores/auth';
import { authApi } from '@/api/auth';
import { settingsApi } from '@/api/misc';
import { employeesApi } from '@/api/employees';
import { customersApi } from '@/api/customers';
import { productsApi } from '@/api/products';
import { soldUnitsApi, formatImei } from '@/api/soldUnits';
import { transactionsApi } from '@/api/transactions';
import { checkoutApi } from '@/api/checkout';
import { repairsApi } from '@/api/repairs';
import { formatCurrency, hasManagerRole } from '@/utils/format';
import ReceiptModal from '@/components/pos/ReceiptModal.vue';
import ProductDetailsModal from '@/components/pos/ProductDetailsModal.vue';
import PackChoiceModal from '@/components/pos/PackChoiceModal.vue';
import UnitSelectionModal from '@/components/pos/UnitSelectionModal.vue';
import ReturnModal from '@/components/pos/ReturnModal.vue';
import TradeInModal from '@/components/pos/TradeInModal.vue';
import Toast from '@/components/ui/Toast.vue';

/** Keystrokes closer than this (ms) are treated as a barcode scanner, not a person typing. */
const SCAN_KEY_INTERVAL = 60;

const { t } = useI18n();
const cart = useCartStore();
const auth = useAuthStore();
const queryClient = useQueryClient();

const DASHBOARD_KEYS = ['dashboard-kpis', 'dashboard-sales-trend', 'dashboard-top-products', 'dashboard-recent-transactions'];
const invalidate = (...keys) => [...keys, ...DASHBOARD_KEYS].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));

onMounted(async () => {
  try {
    const res = await authApi.getProfile();
    if (res.success && res.data?.user) {
      auth.updateUser(res.data.user);
      cart.setApplyTva(res.data.user.applyTva ?? false);
    }
  } catch {
    if (auth.currentUser?.applyTva !== undefined) cart.setApplyTva(auth.currentUser.applyTva);
  }
});

// ── Sellers ──
const storeId = computed(() => auth.currentUser?.currentStoreId ?? null);
watch(storeId, () => cart.setSelectedEmployee(null));
const { data: sellable, refetch: refetchSellable } = useQuery({
  queryKey: ['employees', 'sellable', storeId],
  queryFn: () => employeesApi.getSellable(),
});
const sellers = computed(() => sellable.value?.employees ?? []);
const hasSellers = computed(() => sellers.value.length > 0);
const isManager = computed(() => hasManagerRole(auth.currentUser?.roles));
const sellerRequired = computed(() => isManager.value && hasSellers.value);
watch(
  sellable,
  (data) => {
    if (!data) return;
    if (!isManager.value) {
      cart.setSelectedEmployee(null);
      return;
    }
    const current = cart.selectedEmployeeId;
    if (current && !data.employees.some((e) => e.id === current)) cart.setSelectedEmployee(null);
    if (!cart.selectedEmployeeId && data.selfEmployeeId) cart.setSelectedEmployee(data.selfEmployeeId);
  },
  { immediate: true },
);
const sellerError = ref('');
function onSellerChange(e) {
  const id = e.target.value;
  cart.setSelectedEmployee(id || null);
  if (id) sellerError.value = '';
}

// ── Screen state ──
const search = ref('');
const showPayment = ref(false);
const amountPaid = ref(0);
const paymentMethod = ref('cash');
const overpayMode = ref('change'); // change | supplement
const saleType = ref('sale'); // sale | credit | reservation
const processing = ref(false);
const paymentError = ref('');
const showReceipt = ref(false);
const lastTransactionNumber = ref('');
const showCustomerModal = ref(false);
const customer = ref(null);
const customerSearch = ref('');
const showNewCustomer = ref(false);
const newCustomer = ref({ firstName: '', lastName: '', phone: '' });
const toast = ref({ show: false, message: '', type: 'error' });
const notify = (message, type = 'error') => (toast.value = { show: true, message, type });

const { data: tenantSettings } = useQuery({ queryKey: ['tenant-settings'], queryFn: () => settingsApi.getTenantSettings(), staleTime: 300_000 });
const autoPrint = computed(() => tenantSettings.value?.settings?.printingSettings?.autoPrintReceipt === true);

const detailedMode = ref(true);
const showDetails = ref(false);
const showPack = ref(false);
const packProduct = ref(null);
const detailsItem = ref(null);
const scanError = ref('');
const searching = ref(false);
let lastKeyAt = 0;
let fastKeys = 0;
let scanTimer = null;

function onSearchInput() {
  const now = Date.now();
  fastKeys = now - lastKeyAt < SCAN_KEY_INTERVAL ? fastKeys + 1 : 1;
  lastKeyAt = now;
  if (fastKeys >= 4) {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      if (Date.now() - lastKeyAt >= 100 && search.value.trim().length >= 4 && !searching.value) lookup();
    }, 150);
  }
}
function onSearchPaste() {
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = setTimeout(() => {
    if (search.value.trim().length >= 4 && !searching.value) lookup();
  }, 100);
}

const showUnitPicker = ref(false);
const unitPickerProduct = ref(null);
const isPhoneSeller = computed(() => auth.activityType === 'phone_seller');

// Reserved-device flows
const showReservedChoice = ref(false);
const reservedChoiceUnit = ref(null);
const showReservedWarning = ref(false);
const reservedWarningUnit = ref(null);
const showCompleteReservation = ref(false);
const completeUnit = ref(null);
const completeAmount = ref(0);
const completeMethod = ref('cash');
const completing = ref(false);
const completeError = ref('');

const showReturnModal = ref(false);
const returning = ref(false);
const returnError = ref('');
const showTradeIn = ref(false);

const receipt = ref({ items: [], subtotal: 0, tax: 0, total: 0, amountPaid: 0, change: 0, paymentMethod: 'cash' });

// ── Data ──
const { data: customersData } = useQuery({
  queryKey: ['customers-for-pos', customerSearch],
  queryFn: () => customersApi.getAll({ query: customerSearch.value, limit: 10 }),
});
const customers = computed(() => customersData.value?.customers || []);
const { data: productsData, isLoading: productsLoading } = useQuery({ queryKey: ['pos-products'], queryFn: () => productsApi.getAll({ limit: 200 }) });
const products = computed(() => productsData.value?.products || []);
const { data: inventoryUnits, isLoading: unitsLoading } = useQuery({
  queryKey: ['pos-inventory-units'],
  queryFn: () => soldUnitsApi.getInventory(),
  enabled: computed(() => isPhoneSeller.value && !cart.isReturnMode),
});
const { data: soldUnitsData, isLoading: soldUnitsLoading } = useQuery({
  queryKey: ['pos-sold-units', search],
  queryFn: () => soldUnitsApi.getSoldItems({ query: search.value, limit: 50 }),
  enabled: computed(() => isPhoneSeller.value && cart.isReturnMode),
});
const { data: soldItemsData, isLoading: soldItemsLoading } = useQuery({
  queryKey: ['pos-sold-items', search],
  queryFn: () => transactionsApi.getSoldItems({ query: search.value, limit: 50 }),
  enabled: computed(() => cart.isReturnMode),
});
const soldUnits = computed(() => soldUnitsData.value?.units || []);
const soldItems = computed(() => soldItemsData.value?.items || []);
const { data: repairsData } = useQuery({ queryKey: ['pos-repairs'], queryFn: () => repairsApi.getAll(), enabled: isPhoneSeller });
const repairsByUnit = computed(() => {
  const m = new Map();
  for (const r of repairsData.value || []) if (r.soldUnitId) m.set(r.soldUnitId, (m.get(r.soldUnitId) || 0) + 1);
  return m;
});

const filteredProducts = computed(() => {
  if (!search.value || search.value.length < 2) return products.value;
  const q = search.value.toLowerCase();
  return products.value.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode?.toLowerCase().includes(q));
});
const filteredUnits = computed(() => {
  if (!inventoryUnits.value) return [];
  if (!search.value || search.value.length < 2) return inventoryUnits.value;
  const q = search.value.toLowerCase();
  return inventoryUnits.value.filter(
    (u) =>
      u.brand.toLowerCase().includes(q) ||
      u.model.toLowerCase().includes(q) ||
      u.imei?.toLowerCase().includes(q) ||
      u.serialNumber?.toLowerCase().includes(q) ||
      u.ref?.toLowerCase().includes(q),
  );
});
const cartOnlyDevices = computed(() => cart.items.length > 0 && cart.items.every((i) => i.soldUnit !== undefined));
const gridLoading = computed(
  () => productsLoading.value || (isPhoneSeller.value && (unitsLoading.value || soldUnitsLoading.value)) || (cart.isReturnMode && soldItemsLoading.value),
);

// ── Adding devices ──
function selectUnit(u) {
  if (u.reservedAt && u.reservedByCustomerId) {
    if (customer.value?.id === u.reservedByCustomerId) openCompleteReservation(u);
    else if (customer.value) {
      reservedWarningUnit.value = u;
      showReservedWarning.value = true;
    } else {
      reservedChoiceUnit.value = u;
      showReservedChoice.value = true;
    }
    return;
  }
  addUnitToCart(u);
}
function openCompleteReservation(u) {
  completeUnit.value = u;
  completeAmount.value = (Number(u.salePrice) || 0) - (Number(u.reservationDeposit) || 0);
  completeMethod.value = 'cash';
  completeError.value = '';
  showCompleteReservation.value = true;
}
function choiceComplete() {
  if (reservedChoiceUnit.value) openCompleteReservation(reservedChoiceUnit.value);
  closeReservedChoice();
}
function choiceSellOther() {
  if (reservedChoiceUnit.value) {
    reservedWarningUnit.value = reservedChoiceUnit.value;
    showReservedWarning.value = true;
  }
  closeReservedChoice();
}
function closeReservedChoice() {
  showReservedChoice.value = false;
  reservedChoiceUnit.value = null;
}
function addUnitToCart(u) {
  cart.addItem(
    {
      id: `unit-${u.id}`,
      name: `${u.brand} ${u.model}`,
      sku: u.imei || u.serialNumber || u.id,
      barcode: u.imei,
      retailPrice: Number(u.salePrice),
      costPrice: Number(u.purchasePrice) + Number(u.repairCost || 0),
      stockQuantity: 1,
      variants: { brand: u.brand, model: u.model, storage: u.storage || '', color: u.color || '' },
    },
    1,
    { id: u.id, imei: u.imei, serialNumber: u.serialNumber, condition: u.condition },
  );
}
function confirmReservedWarning() {
  if (reservedWarningUnit.value) addUnitToCart(reservedWarningUnit.value);
  closeReservedWarning();
}
function closeReservedWarning() {
  showReservedWarning.value = false;
  reservedWarningUnit.value = null;
}
async function confirmCompleteReservation() {
  if (!completeUnit.value?.reservationTransactionId) {
    completeError.value = 'Transaction de réservation introuvable';
    return;
  }
  if (completeAmount.value <= 0) {
    completeError.value = 'Montant invalide';
    return;
  }
  completing.value = true;
  completeError.value = '';
  try {
    await transactionsApi.addPayment(completeUnit.value.reservationTransactionId, { method: completeMethod.value, amount: completeAmount.value });
    showCompleteReservation.value = false;
    completeUnit.value = null;
    invalidate('pos-inventory-units', 'transactions');
    notify('Réservation complétée avec succès', 'success');
  } catch (e) {
    completeError.value = e.response?.data?.message || 'Erreur lors du paiement';
  } finally {
    completing.value = false;
  }
}
function closeCompleteReservation() {
  showCompleteReservation.value = false;
  completeUnit.value = null;
  completeError.value = '';
}

// ── Customers ──
function chooseCustomer(c) {
  customer.value = c;
  cart.setCustomer(c.id);
  closeCustomerModal();
}
function clearCustomer() {
  customer.value = null;
  cart.setCustomer(null);
}
function closeCustomerModal() {
  showCustomerModal.value = false;
  showNewCustomer.value = false;
  newCustomer.value = { firstName: '', lastName: '', phone: '' };
}
const createCustomer = useMutation({
  mutationFn: (payload) => customersApi.create(payload),
  onSuccess: (c) => {
    queryClient.invalidateQueries({ queryKey: ['customers-for-pos'] });
    chooseCustomer(c);
  },
});
function submitNewCustomer() {
  const f = newCustomer.value;
  if (!f.firstName.trim()) return;
  createCustomer.mutate({ firstName: f.firstName.trim(), lastName: f.lastName.trim() || '', phone: f.phone.trim() || undefined });
}

// ── Adding products ──
const isCatalogDevice = (p) => p.variants?.brand && p.variants?.model;
const productSnapshot = (p) => ({
  id: p.id,
  name: p.name,
  sku: p.sku,
  barcode: p.barcode,
  retailPrice: Number(p.retailPrice),
  costPrice: Number(p.costPrice),
  stockQuantity: p.stockQuantity,
  variants: p.variants,
  packSize: p.packSize,
  packCostPrice: p.packCostPrice,
  packRetailPrice: p.packRetailPrice,
});
function selectProduct(p) {
  if (isPhoneSeller.value && isCatalogDevice(p)) {
    unitPickerProduct.value = p;
    showUnitPicker.value = true;
    return;
  }
  if (Number(p.packSize) > 1 && !cart.isReturnMode) {
    packProduct.value = p;
    showPack.value = true;
    return;
  }
  cart.addItem(productSnapshot(p));
}
const packUnitsInCart = computed(() => {
  const p = packProduct.value;
  return p ? cart.items.filter((i) => !i.soldUnit && (i.realProductId ?? i.productId) === p.id).reduce((s, i) => s + i.quantity, 0) : 0;
});
function closePack() {
  showPack.value = false;
  packProduct.value = null;
}
function packChooseUnit() {
  if (packProduct.value) cart.addItem(productSnapshot(packProduct.value));
  closePack();
}
function packChooseBox() {
  const p = packProduct.value;
  if (p && !cart.addPackItem(productSnapshot(p))) scanError.value = `Stock insuffisant pour une boîte complète de ${p.name}`;
  closePack();
}
function onUnitPicked(u) {
  const p = unitPickerProduct.value;
  if (!p) return;
  cart.addItem(
    {
      id: `unit-${u.id}`,
      name: p.name,
      sku: u.imei || u.serialNumber || p.sku,
      barcode: u.imei || p.barcode,
      retailPrice: Number(u.salePrice),
      costPrice: Number(u.purchasePrice) + Number(u.repairCost || 0),
      stockQuantity: 1,
      variants: p.variants,
    },
    1,
    { id: u.id, imei: u.imei, serialNumber: u.serialNumber, condition: u.condition },
  );
  closeUnitPicker();
}
function closeUnitPicker() {
  showUnitPicker.value = false;
  unitPickerProduct.value = null;
}

/** Enter / scanner: exact device REF/IMEI/serial first, then the product search (exact SKU/barcode wins). */
async function lookup() {
  if (searching.value || showPack.value) return;
  const q = search.value.trim();
  if (!q) return;
  searching.value = true;
  scanError.value = '';
  if (scanTimer) {
    clearTimeout(scanTimer);
    scanTimer = null;
  }
  try {
    if (isPhoneSeller.value && inventoryUnits.value) {
      const lq = q.toLowerCase();
      const unit = inventoryUnits.value.find((u) => u.ref?.toLowerCase() === lq || u.imei?.toLowerCase() === lq || u.serialNumber?.toLowerCase() === lq);
      if (unit) {
        search.value = '';
        fastKeys = 0;
        if (detailedMode.value) {
          detailsItem.value = { ...unit, _isUnit: true };
          showDetails.value = true;
        } else selectUnit(unit);
        return;
      }
    }
    const found = (await productsApi.getAll({ query: q, limit: 10 })).products;
    if (!found?.length) {
      scanError.value = `Aucun produit trouvé pour: ${q}`;
      return;
    }
    const p = found.find((x) => x.sku === q || x.barcode === q) || found[0];
    search.value = '';
    fastKeys = 0;
    if (Number(p.packSize) > 1 && !cart.isReturnMode) {
      packProduct.value = p;
      showPack.value = true;
    } else if (detailedMode.value) {
      detailsItem.value = p;
      showDetails.value = true;
    } else selectProduct(p);
  } catch {
    scanError.value = 'Erreur lors de la recherche du produit';
  } finally {
    searching.value = false;
  }
}
function onDetailsAdd(item) {
  if (item._isUnit) selectUnit(item);
  else selectProduct(item);
  closeDetails();
  search.value = '';
}
function closeDetails() {
  showDetails.value = false;
  detailsItem.value = null;
}
const searchInput = ref(null);
function setDetailedMode(v) {
  detailedMode.value = v;
  nextTick(() => searchInput.value?.focus());
}

// ── Returns ──
function toggleReturnMode() {
  cart.setReturnMode(!cart.isReturnMode);
  search.value = '';
  customer.value = null;
}
function syncReturnCustomer() {
  if (cart.returnCustomer && !customer.value) {
    const [first, ...rest] = cart.returnCustomer.name.split(' ');
    customer.value = { id: cart.returnCustomer.id, firstName: first, lastName: rest.join(' ') || '' };
  }
}
function addReturnUnit(u) {
  if (!cart.isEmpty && cart.returnCustomer && u.customerId !== cart.returnCustomer.id) {
    notify(t('returnMode.differentCustomerError'));
    return;
  }
  const id = `return-unit-${u.id}`;
  const name = u.customer ? `${u.customer.firstName} ${u.customer.lastName || ''}`.trim() : undefined;
  const paid = Number(u.paidAmount || u.salePrice);
  cart.addReturnItem({
    productId: id,
    product: { id, name: `${u.brand} ${u.model}`, sku: u.imei || u.serialNumber || u.id, barcode: u.imei, retailPrice: paid, costPrice: Number(u.purchasePrice), stockQuantity: 1 },
    quantity: 1,
    unitPrice: paid,
    discount: 0,
    total: paid,
    profit: 0,
    soldUnitId: u.id,
    soldUnit: { id: u.id, imei: u.imei, serialNumber: u.serialNumber, condition: u.condition },
    originalTransactionId: u.transactionId || '',
    originalAmount: paid,
    refundAmount: paid,
    originalCustomerId: u.customerId,
    originalCustomerName: name,
  });
  syncReturnCustomer();
}
function addReturnItem(it) {
  if (!cart.isEmpty && cart.returnCustomer && it.customerId !== cart.returnCustomer.id) {
    notify(t('returnMode.differentCustomerError'));
    return;
  }
  cart.addReturnItem({
    productId: `return-item-${it.transactionItemId}`,
    product: { id: it.productId, name: it.productName, sku: it.sku, retailPrice: it.unitPrice, costPrice: 0, stockQuantity: it.quantity },
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    discount: 0,
    total: it.totalPrice,
    profit: 0,
    transactionItemId: it.transactionItemId,
    originalTransactionId: it.transactionId,
    originalAmount: it.totalPrice,
    refundAmount: it.totalPrice,
    originalCustomerId: it.customerId,
    originalCustomerName: it.customerName,
  });
  syncReturnCustomer();
}
function openReturnConfirm() {
  returnError.value = '';
  showReturnModal.value = true;
}
async function confirmReturn(refunds) {
  returning.value = true;
  returnError.value = '';
  try {
    const items = cart.items.map((i) => ({
      soldUnitId: i.soldUnitId,
      transactionItemId: i.transactionItemId,
      productId: i.soldUnitId ? undefined : i.product.id,
      productName: i.product.name,
      originalTransactionId: i.originalTransactionId || '',
      originalAmount: i.originalAmount || i.total,
      refundAmount: refunds[i.productId] ?? i.refundAmount ?? i.total,
      quantity: i.quantity,
    }));
    const tx = await checkoutApi.processReturn({ items, customerId: customer.value?.id });
    lastTransactionNumber.value = tx.transactionNumber;
    showReturnModal.value = false;
    cart.setReturnMode(false);
    customer.value = null;
    invalidate('transactions', 'pos-products', 'pos-inventory-units', 'pos-sold-units', 'pos-sold-items');
    notify(`${t('returnMode.returnSuccess')} — ${tx.transactionNumber}`, 'success');
  } catch (e) {
    returnError.value = e.response?.data?.message || t('returnMode.returnError');
    notify(returnError.value);
  } finally {
    returning.value = false;
  }
}

// ── Trade-in ──
function onTradeIn(device) {
  cart.addTradeIn(device);
  showTradeIn.value = false;
  amountPaid.value = cart.totalAfterTradeIn;
}

// ── Payment ──
const amountDue = computed(() => (cart.hasTradeIn ? cart.totalAfterTradeIn : cart.total));
const changeDue = computed(() => Math.max(0, amountPaid.value - amountDue.value));
const isOverpaid = computed(() => saleType.value === 'sale' && amountPaid.value > amountDue.value);
watch(paymentMethod, (m) => (overpayMode.value = m === 'cash' ? 'change' : 'supplement'));

function onAmountInput(e) {
  const v = e.target.value;
  if (v === '') {
    amountPaid.value = 0;
    return;
  }
  const n = Number(v);
  if (Number.isFinite(n)) amountPaid.value = Math.round(n * 100) / 100;
}

function openPayment() {
  if (sellerRequired.value && !cart.selectedEmployeeId) {
    sellerError.value = t('employees.selectSellerRequired');
    return;
  }
  amountPaid.value = cart.hasTradeIn ? cart.totalAfterTradeIn : cart.total;
  saleType.value = 'sale';
  paymentMethod.value = 'cash';
  overpayMode.value = 'change';
  paymentError.value = '';
  showPayment.value = true;
}

/**
 * A plain sale always settles in full: paying less turns the gap into a discount, paying more is either change
 * (not recorded) or a "supplement" that raises the sale total.
 */
async function completePayment() {
  if (sellerRequired.value && !cart.selectedEmployeeId) {
    sellerError.value = t('employees.selectSellerRequired');
    return;
  }
  processing.value = true;
  paymentError.value = '';
  try {
    const items = cart.items.map((i) => ({
      productId: i.realProductId ?? i.productId,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      ...(i.saleMode === 'pack' && { saleMode: 'pack' }),
      ...(i.discount > 0 && { discount: i.discount }),
      ...(i.soldUnitId && { soldUnitId: i.soldUnitId }),
    }));
    const paid = amountPaid.value;
    const payments = paid > 0 ? [{ method: paymentMethod.value, amount: paid }] : [];
    let tx;
    if (cart.hasTradeIn) {
      const due = cart.totalAfterTradeIn;
      const adjust = paid < due || (paid > due && overpayMode.value === 'supplement') ? due - paid : 0;
      tx = (
        await checkoutApi.checkoutWithTradeIn({
          customerId: customer.value?.id,
          employeeId: cart.selectedEmployeeId ?? undefined,
          items,
          type: 'exchange',
          payments,
          discountAmount: adjust === 0 ? undefined : adjust,
          taxRate: cart.applyTva ? cart.taxRate : 0,
          notes: `Reprise: ${cart.tradeInDevices.map((d) => `${d.brand} ${d.model}`).join(', ')}`,
          tradeInDevices: cart.tradeInDevices,
        })
      ).transaction;
    } else {
      const adjust = saleType.value === 'sale' && (paid < cart.total || (paid > cart.total && overpayMode.value === 'supplement')) ? cart.total - paid : 0;
      const discount = cart.discountAmount + adjust;
      tx = await checkoutApi.checkout({
        customerId: customer.value?.id,
        employeeId: cart.selectedEmployeeId ?? undefined,
        items,
        type: saleType.value,
        payments,
        discountAmount: discount === 0 ? undefined : discount,
        taxRate: cart.applyTva ? cart.taxRate : 0,
        notes: saleType.value === 'sale' ? undefined : `Type: ${saleType.value}`,
      });
    }

    const isSale = saleType.value === 'sale';
    const over = isSale && paid > amountDue.value ? paid - amountDue.value : 0;
    const supplement = over > 0 && overpayMode.value === 'supplement';
    const discounted = isSale && !cart.hasTradeIn && paid < cart.total;
    receipt.value = {
      items: cart.items.map((i) => ({
        id: i.productId,
        name: i.saleMode === 'pack' && i.packSize ? `${i.product.name} (boîte ×${i.packSize})` : i.product.name,
        retailPrice: i.product.retailPrice,
        quantity: i.quantity,
        total: i.total,
      })),
      subtotal: cart.subtotal,
      tax: cart.taxAmount,
      total: discounted ? paid : cart.total + (supplement ? over : 0),
      amountPaid: paid,
      change: discounted || supplement ? 0 : changeDue.value,
      paymentMethod: paymentMethod.value,
    };
    lastTransactionNumber.value = tx.transactionNumber;
    showPayment.value = false;
    showReceipt.value = true;
    cart.clear();
    invalidate('transactions', 'pos-products', 'pos-inventory-units');
  } catch (e) {
    const msg = e.response?.data?.message || '';
    if (typeof msg === 'string' && msg.startsWith('Sélectionnez le vendeur')) {
      refetchSellable();
      showPayment.value = false;
      paymentError.value = t('employees.selectSellerRequired');
      sellerError.value = t('employees.selectSellerRequired');
    } else paymentError.value = msg || 'Erreur lors du paiement';
  } finally {
    processing.value = false;
  }
}

const formatSoldAt = (d) =>
  new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d));

const PAY_METHODS = [
  { key: 'cash', label: 'Espèces', icon: BanknotesIcon },
  { key: 'card', label: 'Carte', icon: CreditCardIcon },
  { key: 'bank_transfer', label: 'Virement', icon: BuildingLibraryIcon },
];
const COMPLETE_METHODS = [...PAY_METHODS, { key: 'check', label: 'Chèque', icon: DocumentTextIcon }];

// ── Keyboard: F2 pay, Esc closes the top-most dialog, Ctrl/Cmd+K or "/" focuses search ──
function onKeydown(e) {
  if (e.key === 'F2' && !cart.isEmpty && !showPayment.value && !showReceipt.value) {
    e.preventDefault();
    openPayment();
  }
  if (e.key === 'Escape') {
    if (showPack.value) closePack();
    else if (showUnitPicker.value) closeUnitPicker();
    else if (showDetails.value) closeDetails();
    else if (showReceipt.value) showReceipt.value = false;
    else if (showPayment.value) showPayment.value = false;
    else if (showCustomerModal.value) closeCustomerModal();
  }
  if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !(e.target instanceof HTMLInputElement))) {
    e.preventDefault();
    searchInput.value?.focus();
  }
}
onMounted(() => {
  document.addEventListener('keydown', onKeydown);
  searchInput.value?.focus();
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  if (scanTimer) clearTimeout(scanTimer);
});

const customerName = computed(() => (customer.value ? `${customer.value.firstName} ${customer.value.lastName || ''}`.trim() : undefined));
const cashierName = computed(() => (auth.currentUser ? `${auth.currentUser.firstName} ${auth.currentUser.lastName}` : undefined));
const customerLocked = computed(() => cart.isReturnMode && !cart.isEmpty);
</script>

<template>
  <div class="flex flex-col lg:flex-row gap-4 lg:gap-6 lg:h-[calc(100vh-8rem)] relative">
    <!-- Catalogue -->
    <div class="flex-1 flex flex-col min-h-0">
      <div class="flex items-center justify-between mb-4">
        <div v-if="!cart.isReturnMode" class="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          <button
            :class="['flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all', detailedMode ? 'text-gray-500 hover:text-gray-700' : 'bg-white text-gray-900 shadow-sm']"
            @click="setDetailedMode(false)"
          >
            <BoltIcon class="w-3.5 h-3.5" /> {{ t('pos.quick') }}
          </button>
          <button
            :class="['flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all', detailedMode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700']"
            @click="setDetailedMode(true)"
          >
            <EyeIcon class="w-3.5 h-3.5" /> {{ t('pos.detailed') }}
          </button>
        </div>
        <div v-else />
        <button
          :class="[
            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
            cart.isReturnMode ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200',
          ]"
          :title="cart.isReturnMode ? t('returnMode.active') : t('returnMode.toggle')"
          @click="toggleReturnMode"
        >
          <ArrowUturnLeftIcon class="w-4 h-4" /><span class="hidden sm:inline">{{ t('returnMode.toggle') }}</span>
        </button>
      </div>

      <div v-if="scanError" class="mb-4 p-3 bg-danger-50 border border-danger-200 rounded-lg flex items-center justify-between">
        <span class="text-sm text-danger-700">{{ scanError }}</span>
        <button class="text-danger-500 hover:text-danger-700" @click="scanError = ''"><XMarkIcon class="w-4 h-4" /></button>
      </div>

      <div class="relative mb-4">
        <MagnifyingGlassIcon class="absolute start-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          ref="searchInput"
          v-model="search"
          type="text"
          :placeholder="cart.isReturnMode ? t('returnMode.searchSold') : t('pos.search')"
          :class="['input ps-12 text-lg', cart.isReturnMode && 'border-red-200 focus:border-red-400 focus:ring-red-200']"
          @input="onSearchInput"
          @paste="onSearchPaste"
          @keydown.enter.prevent="lookup"
        />
        <button v-if="search" class="absolute end-4 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded" @click="search = ''">
          <XMarkIcon class="w-5 h-5 text-gray-400" />
        </button>
      </div>

      <div :class="['flex-1 flex flex-col rounded-xl shadow-sm border overflow-hidden min-h-[16rem]', cart.isReturnMode ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200']">
        <div class="flex-1 overflow-y-auto p-4">
          <div v-if="cart.isReturnMode" class="mb-4 p-3 bg-red-100 border border-red-200 rounded-lg">
            <p class="text-sm text-red-700 font-medium">{{ t('returnMode.soldItems') }}</p>
            <p class="text-xs text-red-600">{{ t('returnMode.addItemsToReturn') }}</p>
          </div>

          <div v-if="gridLoading" class="flex items-center justify-center h-32">
            <div :class="['animate-spin rounded-full h-8 w-8 border-b-2', cart.isReturnMode ? 'border-red-600' : 'border-black']" />
          </div>
          <div v-else-if="cart.isReturnMode && !soldItems.length && (!isPhoneSeller || !soldUnits.length)" class="flex flex-col items-center justify-center h-32 text-gray-400">
            <ArrowUturnLeftIcon class="w-12 h-12 mb-2 text-red-300" />
            <p>{{ t('returnMode.noSoldItems') }}</p>
          </div>
          <div v-else-if="!cart.isReturnMode && !filteredProducts.length && (!isPhoneSeller || !filteredUnits.length)" class="flex flex-col items-center justify-center h-32 text-gray-400">
            <p v-if="search">Aucun résultat pour "{{ search }}"</p>
            <p v-else>{{ t('products.noProducts') }}</p>
          </div>

          <!-- Return mode: sold devices + sold product lines -->
          <div v-else-if="cart.isReturnMode" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <template v-if="isPhoneSeller">
              <button
                v-for="u in soldUnits"
                :key="`sold-unit-${u.id}`"
                class="bg-white hover:bg-red-50 rounded-lg p-3 text-start border border-red-200 hover:border-red-400 transition-all"
                @click="addReturnUnit(u)"
              >
                <div class="flex items-start justify-between gap-2 mb-1">
                  <p class="font-medium text-gray-900 text-sm line-clamp-1 flex-1">{{ u.brand }} {{ u.model }}</p>
                  <span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium flex-shrink-0">{{ t('returnMode.deviceTag') }}</span>
                </div>
                <p class="text-xs text-gray-500 font-mono">{{ u.imei ? formatImei(u.imei) : u.serialNumber }}</p>
                <div class="flex items-center gap-2 mt-2">
                  <span v-if="u.storage" class="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">{{ u.storage }}</span>
                </div>
                <p class="font-bold text-red-600 mt-2">{{ formatCurrency(u.salePrice) }}</p>
                <div class="mt-2 pt-2 border-t border-red-100 text-xs text-gray-500">
                  <p v-if="u.customer">{{ u.customer.firstName }} {{ u.customer.lastName || '' }}</p>
                  <p>{{ t('returnMode.soldOn') }}: {{ formatSoldAt(u.soldAt) }}</p>
                </div>
              </button>
            </template>
            <button
              v-for="it in soldItems"
              :key="`sold-item-${it.transactionItemId}`"
              class="bg-white hover:bg-red-50 rounded-lg p-3 text-start border border-red-200 hover:border-red-400 transition-all"
              @click="addReturnItem(it)"
            >
              <div class="flex items-start justify-between gap-2 mb-1">
                <p class="font-medium text-gray-900 text-sm line-clamp-1 flex-1">{{ it.productName }}</p>
                <span v-if="isPhoneSeller" class="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-medium flex-shrink-0">{{ t('returnMode.productTag') }}</span>
              </div>
              <p class="text-xs text-gray-500 font-mono">{{ it.sku }}</p>
              <div class="flex items-center justify-between mt-2">
                <p class="font-bold text-red-600">{{ formatCurrency(it.totalPrice) }}</p>
                <span class="text-xs text-gray-500">x{{ it.quantity }}</span>
              </div>
              <div class="mt-2 pt-2 border-t border-red-100 text-xs text-gray-500">
                <p v-if="it.customerName">{{ it.customerName }}</p>
                <p>{{ t('returnMode.soldOn') }}: {{ formatSoldAt(it.soldAt) }}</p>
              </div>
            </button>
          </div>

          <!-- Sale mode: products + devices in stock -->
          <div v-else class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <button
              v-for="p in filteredProducts"
              :key="p.id"
              class="bg-gray-50 hover:bg-gray-100 rounded-lg p-3 text-start border border-gray-200 hover:border-black transition-all"
              @click="selectProduct(p)"
            >
              <p class="font-medium text-gray-900 text-sm line-clamp-2">{{ p.name }}</p>
              <p class="text-xs text-gray-400 font-mono mt-1">{{ p.sku }}</p>
              <div class="flex items-center justify-between mt-2">
                <p class="font-bold text-black">{{ formatCurrency(p.retailPrice) }}</p>
                <span :class="['text-xs px-1.5 py-0.5 rounded', p.stockQuantity > 5 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700']">{{ p.stockQuantity }}</span>
              </div>
            </button>
            <template v-if="isPhoneSeller">
              <button
                v-for="u in filteredUnits"
                :key="`unit-${u.id}`"
                :class="[
                  'rounded-lg p-3 text-start border transition-all relative',
                  u.reservedAt ? 'bg-purple-50 hover:bg-purple-100 border-purple-200 hover:border-purple-400' : 'bg-blue-50 hover:bg-blue-100 border-blue-200 hover:border-blue-500',
                ]"
                @click="selectUnit(u)"
              >
                <div v-if="u.reservedAt" class="absolute top-2 end-2 px-2 py-0.5 bg-purple-500 text-white text-xs rounded-full font-medium">{{ t('reservation.title') }}</div>
                <div
                  v-if="repairsByUnit.get(u.id)"
                  :class="['absolute top-2 flex items-center gap-1 px-2 py-0.5 bg-amber-500 text-white text-xs rounded-full font-medium', u.reservedAt ? 'end-24' : 'end-2']"
                >
                  <WrenchScrewdriverIcon class="w-3 h-3" /> {{ repairsByUnit.get(u.id) }}
                </div>
                <p class="font-medium text-gray-900 text-sm line-clamp-1">{{ u.brand }} {{ u.model }}</p>
                <p class="text-xs text-gray-500 font-mono mt-1">{{ u.imei ? formatImei(u.imei) : u.serialNumber }}</p>
                <div class="flex items-center gap-2 mt-2">
                  <span v-if="u.storage" class="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">{{ u.storage }}</span>
                  <span :class="['text-xs px-1.5 py-0.5 rounded', u.reservedAt ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700']">{{ t(`soldUnits.conditions.${u.condition}`) }}</span>
                </div>
                <p class="font-bold text-black mt-2">{{ formatCurrency(u.salePrice) }}</p>
                <div v-if="u.reservedAt" class="mt-2 pt-2 border-t border-purple-200 text-xs text-purple-700">
                  <p>{{ t('reservation.reservedBy') }}: {{ u.reservedByCustomer?.firstName }} {{ u.reservedByCustomer?.lastName }}</p>
                  <p v-if="u.reservationDeposit">{{ t('reservation.deposit') }}: {{ formatCurrency(Number(u.reservationDeposit)) }}</p>
                </div>
              </button>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- Cart -->
    <div :class="['w-full lg:w-96 flex flex-col rounded-xl shadow-lg lg:max-h-none', cart.isReturnMode ? 'bg-red-50' : 'bg-white']">
      <div :class="['p-4 border-b flex items-center justify-between', cart.isReturnMode ? 'border-red-200' : 'border-gray-100']">
        <div class="flex items-center gap-2">
          <ArrowUturnLeftIcon v-if="cart.isReturnMode" class="w-5 h-5 text-red-600" />
          <ShoppingCartIcon v-else class="w-5 h-5 text-gray-600" />
          <h2 :class="['font-semibold', cart.isReturnMode ? 'text-red-700' : 'text-gray-900']">{{ cart.isReturnMode ? t('returnMode.toggle') : t('pos.cart') }}</h2>
        </div>
        <span :class="['badge', cart.isReturnMode ? 'bg-red-100 text-red-700' : 'badge-info']">{{ cart.itemCount }}</span>
      </div>

      <button
        :class="['flex items-center gap-3 p-4 border-b border-gray-100 w-full', customerLocked ? 'cursor-not-allowed bg-gray-50' : 'hover:bg-gray-50']"
        @click="!customerLocked && (showCustomerModal = true)"
      >
        <div :class="['w-10 h-10 rounded-full flex items-center justify-center', customer ? 'bg-black text-white' : 'bg-gray-100']">
          <span v-if="customer" class="text-sm font-medium">{{ customer.firstName[0] }}{{ customer.lastName?.[0] || '' }}</span>
          <UserIcon v-else class="w-5 h-5 text-gray-500" />
        </div>
        <div class="text-start flex-1">
          <p class="text-sm font-medium text-gray-900">{{ customer ? `${customer.firstName} ${customer.lastName}` : t('pos.selectCustomer') }}</p>
          <p class="text-xs text-gray-500">
            <template v-if="customerLocked && customer">{{ t('returnMode.originalCustomer') }}</template>
            <template v-else>{{ customer?.phone || t('pos.walkIn') }}</template>
          </p>
        </div>
        <button v-if="customer && !customerLocked" class="p-1 hover:bg-gray-200 rounded" @click.stop="clearCustomer"><XMarkIcon class="w-4 h-4 text-gray-400" /></button>
        <LockClosedIcon v-if="customerLocked && customer" class="w-4 h-4 text-gray-400" />
      </button>

      <div v-if="sellerRequired && !cart.isReturnMode" class="p-4 border-b border-gray-100">
        <label for="pos-employee" class="block text-xs font-medium text-gray-500 mb-1.5">{{ t('employees.seller') }} <span class="text-danger-600">*</span></label>
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0"><UserIcon class="w-5 h-5 text-gray-500" /></div>
          <select id="pos-employee" :value="cart.selectedEmployeeId ?? ''" :class="['input flex-1', { 'border-danger-300 focus:border-danger-400': sellerError }]" @change="onSellerChange">
            <option value="" disabled>{{ t('employees.selectSeller') }}</option>
            <option v-for="e in sellers" :key="e.id" :value="e.id">{{ e.firstName }} {{ e.lastName }}</option>
          </select>
        </div>
        <p v-if="sellerError" class="text-xs text-danger-600 mt-1.5">{{ sellerError }}</p>
      </div>
      <div v-else-if="hasSellers && !isManager && !cart.isReturnMode" class="p-4 border-b border-gray-100">
        <p class="text-xs text-gray-500">{{ t('employees.lockedToOwnAccount') }}</p>
      </div>

      <div class="flex-1 overflow-y-auto p-4 space-y-3 min-h-[8rem] max-h-[50vh] lg:max-h-none">
        <div v-if="cart.isEmpty" :class="['flex flex-col items-center justify-center h-full', cart.isReturnMode ? 'text-red-400' : 'text-gray-400']">
          <ArrowUturnLeftIcon v-if="cart.isReturnMode" class="w-12 h-12 mb-2" />
          <ShoppingCartIcon v-else class="w-12 h-12 mb-2" />
          <p class="font-medium">{{ cart.isReturnMode ? t('returnMode.emptyCartReturn') : t('pos.emptyCart') }}</p>
          <p class="text-sm">{{ cart.isReturnMode ? t('returnMode.addItemsToReturn') : t('pos.addProducts') }}</p>
        </div>
        <div v-for="item in cart.items" :key="item.productId" :class="['rounded-lg p-3', cart.isReturnMode ? 'bg-white border border-red-200' : 'bg-gray-50']">
          <div class="flex items-start justify-between mb-2">
            <div>
              <p class="font-medium text-gray-900 text-sm">{{ item.product.name }}</p>
              <p class="text-xs text-gray-500">{{ item.product.sku }}</p>
              <p v-if="item.saleMode === 'pack'" class="text-xs text-primary-600 font-medium mt-1">
                Boîte ×{{ item.packSize }} · {{ item.quantity / (item.packSize || 1) }} boîte{{ item.quantity / (item.packSize || 1) > 1 ? 's' : '' }} ({{ item.quantity }} pcs)
              </p>
              <p v-if="item.soldUnit" class="text-xs text-primary-600 font-mono mt-1">
                {{ item.soldUnit.imei ? `IMEI: ${formatImei(item.soldUnit.imei)}` : `S/N: ${item.soldUnit.serialNumber}` }}
              </p>
            </div>
            <button class="p-1 text-gray-400 hover:text-danger-500" @click="cart.removeItem(item.productId)"><TrashIcon class="w-4 h-4" /></button>
          </div>
          <div class="flex items-center justify-between">
            <div v-if="item.soldUnit" class="flex items-center gap-2">
              <span class="px-3 py-1.5 rounded-lg bg-gray-200 text-gray-600 text-sm font-medium">x1</span>
              <span class="text-xs text-gray-400">{{ t('pos.uniqueItem') }}</span>
            </div>
            <div v-else class="flex items-center gap-2">
              <button
                class="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-100"
                @click="cart.updateItemQuantity(item.productId, item.quantity - 1)"
              >
                <MinusIcon class="w-4 h-4" />
              </button>
              <span class="w-8 text-center font-medium">{{ item.saleMode === 'pack' ? item.quantity / (item.packSize || 1) : item.quantity }}</span>
              <button
                class="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-100"
                @click="cart.updateItemQuantity(item.productId, item.quantity + 1)"
              >
                <PlusIcon class="w-4 h-4" />
              </button>
            </div>
            <div class="text-end">
              <p class="font-bold text-gray-900">{{ formatCurrency(item.total) }}</p>
              <p :class="['text-xs', item.profit >= 0 ? 'text-success-600' : 'text-danger-600']">{{ item.profit > 0 ? '+' : '' }}{{ formatCurrency(item.profit) }}</p>
            </div>
          </div>
        </div>
      </div>

      <div :class="['border-t p-4 space-y-3', cart.isReturnMode ? 'border-red-200' : 'border-gray-100']">
        <template v-if="cart.isReturnMode">
          <div class="flex items-center justify-between text-sm">
            <span class="text-gray-500">{{ t('returnMode.totalOriginal') }}</span><span class="font-medium">{{ formatCurrency(cart.totalOriginal) }}</span>
          </div>
          <div class="h-px bg-red-200" />
          <div class="flex items-center justify-between">
            <span class="text-lg font-bold text-red-700">{{ t('returnMode.totalToRefund') }}</span>
            <span class="text-2xl font-bold text-red-600">{{ formatCurrency(cart.totalRefund) }}</span>
          </div>
        </template>
        <template v-else>
          <div class="flex items-center justify-between text-sm">
            <span class="text-gray-500">{{ t('pos.subtotal') }}</span><span class="font-medium">{{ formatCurrency(cart.subtotal) }}</span>
          </div>
          <div v-if="cart.applyTva" class="flex items-center justify-between text-sm">
            <span class="text-gray-500">{{ t('pos.tax') }} ({{ cart.taxRate }}%)</span><span class="font-medium">{{ formatCurrency(cart.taxAmount) }}</span>
          </div>
          <div :class="['flex items-center justify-between text-sm', cart.totalProfit >= 0 ? 'text-success-600' : 'text-danger-600']">
            <span>{{ t('pos.profit') }}</span><span class="font-medium">{{ cart.totalProfit > 0 ? '+' : '' }}{{ formatCurrency(cart.totalProfit) }}</span>
          </div>
          <div class="h-px bg-gray-200" />
          <div class="flex items-center justify-between">
            <span class="text-lg font-bold text-gray-900">{{ t('pos.total') }}</span><span class="text-2xl font-bold text-black">{{ formatCurrency(cart.total) }}</span>
          </div>
        </template>
      </div>

      <div :class="['p-4 border-t flex gap-3', cart.isReturnMode ? 'border-red-200' : 'border-gray-100']">
        <button class="btn-secondary flex-1" :disabled="cart.isEmpty && !cart.isReturnMode" @click="cart.isReturnMode ? cart.setReturnMode(false) : cart.clear()">
          {{ cart.isReturnMode ? t('common.cancel') : t('pos.clear') }}
        </button>
        <button
          :class="['flex-1', cart.isReturnMode ? 'btn-primary bg-red-600 hover:bg-red-700' : 'btn-primary']"
          :disabled="cart.isEmpty || returning"
          @click="cart.isReturnMode ? openReturnConfirm() : openPayment()"
        >
          {{ cart.isReturnMode ? t('returnMode.returnToStock') : t('pos.checkout') }}
        </button>
      </div>
    </div>

    <!-- Payment -->
    <Teleport to="body">
      <div v-if="showPayment" class="modal-overlay" @click.self="showPayment = false">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="text-lg font-bold text-gray-900">{{ t('payment.title') }}</h3>
            <button class="p-1 hover:bg-gray-100 rounded" @click="showPayment = false"><XMarkIcon class="w-5 h-5" /></button>
          </div>
          <div class="modal-body space-y-6">
            <div v-if="paymentError" class="bg-danger-50 border border-danger-200 rounded-lg p-3">
              <p class="text-sm text-danger-700">{{ paymentError }}</p>
            </div>
            <div class="text-center">
              <p class="text-sm text-gray-500">{{ t('pos.total') }}</p>
              <p class="text-3xl font-bold text-black">{{ formatCurrency(cart.total) }}</p>
            </div>
            <div v-if="sellerRequired && !cart.selectedEmployeeId" class="bg-danger-50 border border-danger-200 rounded-lg p-3">
              <p class="text-sm text-danger-700">{{ t('employees.selectSellerRequired') }}</p>
            </div>

            <div>
              <label class="label">Type de vente</label>
              <div :class="['grid grid-cols-2 gap-2', isPhoneSeller ? 'sm:grid-cols-4' : 'sm:grid-cols-3']">
                <button
                  :class="[
                    'p-3 rounded-lg border text-center transition-colors text-sm',
                    saleType === 'sale' ? 'border-black bg-gray-100 text-black font-medium' : 'border-gray-200 hover:border-gray-300',
                  ]"
                  @click="saleType = 'sale'"
                >
                  <BanknotesIcon class="w-5 h-5 mx-auto mb-1" /> Vente directe
                </button>
                <button
                  :disabled="!customer"
                  :title="customer ? '' : 'Sélectionnez un client d\'abord'"
                  :class="[
                    'p-3 rounded-lg border text-center transition-colors text-sm',
                    saleType === 'credit'
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                      : customer
                        ? 'border-gray-200 hover:border-gray-300'
                        : 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed',
                  ]"
                  @click="customer && (saleType = 'credit')"
                >
                  <CreditCardIcon class="w-5 h-5 mx-auto mb-1" /> Vente à crédit
                </button>
                <button
                  :disabled="!customer || !cartOnlyDevices"
                  :title="customer ? (cartOnlyDevices ? '' : t('reservation.soldUnitsOnly')) : t('reservation.customerRequired')"
                  :class="[
                    'p-3 rounded-lg border text-center transition-colors text-sm',
                    saleType === 'reservation'
                      ? 'border-purple-500 bg-purple-50 text-purple-700 font-medium'
                      : !customer || !cartOnlyDevices
                        ? 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                        : 'border-gray-200 hover:border-gray-300',
                  ]"
                  @click="customer && cartOnlyDevices && (saleType = 'reservation')"
                >
                  <BookmarkIcon class="w-5 h-5 mx-auto mb-1" /> {{ t('reservation.title') }}
                </button>
                <button
                  v-if="isPhoneSeller"
                  :disabled="!customer"
                  :title="customer ? '' : 'Sélectionnez un client d\'abord'"
                  :class="[
                    'p-3 rounded-lg border text-center transition-colors text-sm',
                    cart.hasTradeIn
                      ? 'border-green-500 bg-green-50 text-green-700 font-medium'
                      : customer
                        ? 'border-gray-200 hover:border-gray-300'
                        : 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed',
                  ]"
                  @click="showTradeIn = true"
                >
                  <ArrowsRightLeftIcon class="w-5 h-5 mx-auto mb-1" /> {{ t('tradeIn.button') }}
                </button>
              </div>
              <p v-if="!customer" class="text-xs text-gray-500 mt-2">Sélectionnez un client pour activer les options crédit, réservation et reprise</p>
              <p v-else-if="!cartOnlyDevices && isPhoneSeller" class="text-xs text-gray-500 mt-2">{{ t('reservation.soldUnitsOnly') }}</p>
            </div>

            <div>
              <label class="label">{{ t('payment.method') }}</label>
              <div class="grid grid-cols-3 gap-2">
                <button
                  v-for="m in PAY_METHODS"
                  :key="m.key"
                  :class="[
                    'p-2 rounded-lg border text-center transition-colors text-xs',
                    paymentMethod === m.key ? 'border-black bg-gray-100 text-black font-medium' : 'border-gray-200 hover:border-gray-300',
                  ]"
                  @click="paymentMethod = m.key"
                >
                  <component :is="m.icon" class="w-5 h-5 mx-auto mb-0.5" /> {{ m.label }}
                </button>
              </div>
            </div>

            <div>
              <label class="label">{{ saleType === 'reservation' ? t('reservation.deposit') : t('payment.amountPaid') }}</label>
              <input :value="amountPaid" type="number" class="input text-2xl text-center font-bold" step="0.01" min="0" @input="onAmountInput" />
              <p v-if="saleType === 'credit'" class="text-xs text-gray-500 mt-1">Acompte versé (le reste sera en crédit client)</p>
              <p v-else-if="saleType === 'reservation'" class="text-xs text-gray-500 mt-1">{{ t('reservation.noDeposit') }} (0 DH minimum)</p>
            </div>

            <div v-if="saleType === 'sale' && !cart.hasTradeIn && amountPaid < cart.total && amountPaid >= 0" class="bg-amber-50 rounded-lg p-4 text-center">
              <p class="text-sm text-amber-700">Remise appliquée</p>
              <p class="text-2xl font-bold text-amber-600">-{{ formatCurrency(cart.total - amountPaid) }}</p>
            </div>
            <div v-else-if="isOverpaid" class="rounded-lg border border-stone-200 bg-white p-3 space-y-3">
              <p class="text-xs font-medium text-stone-500 text-center">Excédent de {{ formatCurrency(amountPaid - amountDue) }} — comment le traiter ?</p>
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  :class="[
                    'rounded-lg border p-3 text-start transition-colors duration-150',
                    overpayMode === 'change' ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300',
                  ]"
                  @click="overpayMode = 'change'"
                >
                  <p :class="['text-xs font-medium', overpayMode === 'change' ? 'text-stone-300' : 'text-stone-500']">Monnaie à rendre</p>
                  <p class="text-lg font-bold">{{ formatCurrency(amountPaid - amountDue) }}</p>
                  <p :class="['text-[11px] mt-1', overpayMode === 'change' ? 'text-stone-400' : 'text-stone-500']">Vente reste à {{ formatCurrency(amountDue) }}</p>
                </button>
                <button
                  type="button"
                  :class="[
                    'rounded-lg border p-3 text-start transition-colors duration-150',
                    overpayMode === 'supplement' ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300',
                  ]"
                  @click="overpayMode = 'supplement'"
                >
                  <p :class="['text-xs font-medium', overpayMode === 'supplement' ? 'text-stone-300' : 'text-stone-500']">Supplément</p>
                  <p class="text-lg font-bold">+{{ formatCurrency(amountPaid - amountDue) }}</p>
                  <p :class="['text-[11px] mt-1', overpayMode === 'supplement' ? 'text-stone-400' : 'text-stone-500']">Vente passe à {{ formatCurrency(amountPaid) }}</p>
                </button>
              </div>
            </div>
            <div v-if="saleType === 'credit' && amountPaid < cart.total" class="bg-blue-50 rounded-lg p-4 text-center">
              <p class="text-sm text-blue-700">Reste à payer (crédit)</p>
              <p class="text-2xl font-bold text-blue-600">{{ formatCurrency(cart.total - amountPaid) }}</p>
            </div>
            <div v-if="saleType === 'reservation'" class="bg-purple-50 rounded-lg p-4 text-center">
              <p class="text-sm text-purple-700">{{ t('reservation.deposit') }}</p>
              <p class="text-2xl font-bold text-purple-600">{{ formatCurrency(amountPaid) }}</p>
              <p class="text-xs text-purple-500 mt-1">L'article sera réservé pour {{ customer?.firstName }} {{ customer?.lastName }}</p>
            </div>

            <div v-if="cart.hasTradeIn" class="rounded-xl border border-green-200 bg-white overflow-hidden">
              <div class="bg-green-50 border-b border-green-100 divide-y divide-green-100">
                <div v-for="(d, i) in cart.tradeInDevices" :key="i" class="px-4 py-3 flex items-start justify-between gap-3">
                  <div class="flex items-start gap-3 min-w-0">
                    <div class="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center shrink-0"><ArrowsRightLeftIcon class="w-5 h-5 text-green-700" /></div>
                    <div class="min-w-0">
                      <p v-if="i === 0" class="text-[11px] font-semibold uppercase tracking-wider text-green-700">{{ t('tradeIn.title') }}</p>
                      <p class="font-medium text-gray-900 truncate">{{ d.brand }} {{ d.model }}</p>
                      <div class="flex flex-wrap items-center gap-1.5 mt-1 text-xs">
                        <span v-if="d.condition" class="px-1.5 py-0.5 rounded bg-white border border-green-200 text-green-700">{{ t(`soldUnits.conditions.${d.condition}`) }}</span>
                        <span v-if="d.storage" class="px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-600">{{ d.storage }}</span>
                        <span v-if="d.color" class="px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-600">{{ d.color }}</span>
                        <span v-if="d.batteryHealth" class="px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-600">🔋 {{ d.batteryHealth }}%</span>
                        <span class="font-semibold text-green-700">{{ formatCurrency(d.tradeInValue) }}</span>
                      </div>
                    </div>
                  </div>
                  <button class="text-xs text-gray-500 hover:text-red-600 font-medium shrink-0" :title="t('common.remove')" @click="cart.removeTradeIn(i)">
                    <XMarkIcon class="w-4 h-4" />
                  </button>
                </div>
                <button
                  class="w-full px-4 py-2.5 flex items-center justify-center gap-1.5 text-sm font-medium text-green-700 hover:bg-green-100 transition-colors"
                  @click="showTradeIn = true"
                >
                  <PlusIcon class="w-4 h-4" /> {{ t('tradeIn.addAnother') }}
                </button>
              </div>
              <div class="px-4 py-3 space-y-1.5 text-sm">
                <div class="flex justify-between text-gray-600"><span>{{ t('tradeIn.cartTotal') }}</span><span class="font-medium text-gray-900">{{ formatCurrency(cart.total) }}</span></div>
                <div class="flex justify-between text-green-700"><span>{{ t('tradeIn.tradeInDeduction') }}</span><span>- {{ formatCurrency(cart.totalTradeInValue) }}</span></div>
                <div v-if="amountPaid < cart.totalAfterTradeIn && amountPaid >= 0" class="flex justify-between text-amber-700">
                  <span>{{ t('pos.discount') }}</span><span>- {{ formatCurrency(cart.totalAfterTradeIn - amountPaid) }}</span>
                </div>
                <div v-else-if="amountPaid > cart.totalAfterTradeIn && overpayMode === 'supplement'" class="flex justify-between text-stone-700">
                  <span>Supplément</span><span>+ {{ formatCurrency(amountPaid - cart.totalAfterTradeIn) }}</span>
                </div>
                <div class="flex items-center justify-between pt-2 mt-1 border-t border-gray-100">
                  <span class="text-sm font-semibold text-gray-900">{{ t('tradeIn.finalAmount') }}</span>
                  <span class="text-xl font-bold text-green-700">
                    {{ formatCurrency(amountPaid > cart.totalAfterTradeIn && overpayMode === 'change' ? cart.totalAfterTradeIn : Math.max(0, amountPaid)) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" :disabled="processing" @click="showPayment = false">{{ t('common.cancel') }}</button>
            <button
              :class="['btn-primary', saleType === 'reservation' && 'bg-purple-600 hover:bg-purple-700']"
              :disabled="processing || (saleType === 'reservation' && amountPaid < 0)"
              @click="completePayment"
            >
              <span v-if="processing" class="flex items-center gap-2"><span class="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Traitement...</span>
              <span v-else>{{ saleType === 'reservation' ? t('reservation.title') : t('payment.complete') }}</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Customer picker -->
    <Teleport to="body">
      <div v-if="showCustomerModal" class="modal-overlay" @click.self="closeCustomerModal">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="text-lg font-bold text-gray-900">{{ t('pos.selectCustomer') }}</h3>
            <button class="p-1 hover:bg-gray-100 rounded" @click="closeCustomerModal"><XMarkIcon class="w-5 h-5" /></button>
          </div>
          <div class="p-4 border-b space-y-3">
            <div class="flex gap-2">
              <div class="relative flex-1">
                <MagnifyingGlassIcon class="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input v-model="customerSearch" type="text" :placeholder="t('customers.search')" class="input ps-10" />
              </div>
              <button :class="['btn-primary shrink-0', showNewCustomer && 'bg-gray-200 text-gray-700 hover:bg-gray-300']" @click="showNewCustomer = !showNewCustomer">
                {{ showNewCustomer ? t('common.cancel') : t('customers.new') }}
              </button>
            </div>
            <div v-if="showNewCustomer" class="bg-gray-50 rounded-lg p-4 space-y-3">
              <div>
                <label class="label">{{ t('customers.firstName') }} *</label>
                <input v-model="newCustomer.firstName" type="text" class="input" :placeholder="t('customers.firstName')" required />
              </div>
              <div>
                <label class="label">{{ t('customers.lastName') }}</label>
                <input v-model="newCustomer.lastName" type="text" class="input" :placeholder="t('customers.lastName')" />
              </div>
              <div>
                <label class="label">{{ t('customers.phone') }}</label>
                <input v-model="newCustomer.phone" type="tel" class="input" :placeholder="t('customers.phone')" />
              </div>
              <button class="btn-primary w-full" :disabled="!newCustomer.firstName.trim() || createCustomer.isPending.value" @click="submitNewCustomer">
                {{ createCustomer.isPending.value ? t('common.loading') : t('customers.create') }}
              </button>
            </div>
          </div>
          <div class="modal-body max-h-80 overflow-y-auto p-0">
            <button v-for="c in customers" :key="c.id" class="w-full flex items-center gap-3 p-4 hover:bg-gray-50 border-b last:border-0" @click="chooseCustomer(c)">
              <div class="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                <span class="text-sm font-medium text-gray-600">{{ c.firstName[0] }}{{ c.lastName?.[0] || '' }}</span>
              </div>
              <div class="flex-1 text-start">
                <p class="font-medium text-gray-900">{{ c.firstName }} {{ c.lastName }}</p>
                <p class="text-sm text-gray-500">{{ c.phone }}</p>
              </div>
              <div v-if="c.balance < 0" class="text-end">
                <p class="text-sm font-medium text-danger-600">{{ formatCurrency(Math.abs(c.balance)) }}</p>
                <p class="text-xs text-gray-400">dette</p>
              </div>
              <CheckCircleIcon v-if="customer?.id === c.id" class="w-5 h-5 text-success-500" />
            </button>
            <p v-if="!customers.length" class="p-4 text-center text-gray-500">{{ t('common.noResults') }}</p>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" @click="closeCustomerModal">{{ t('common.cancel') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <ReceiptModal
      :is-open="showReceipt"
      :transaction-number="lastTransactionNumber"
      :items="receipt.items"
      :subtotal="receipt.subtotal"
      :tax="receipt.tax"
      :total="receipt.total"
      :amount-paid="receipt.amountPaid"
      :change="receipt.change"
      :payment-method="receipt.paymentMethod"
      :customer-name="customerName"
      :store-name="auth.storeName || 'CaissePro'"
      :cashier-name="cashierName"
      :apply-tva="cart.applyTva"
      :auto-print="autoPrint"
      @close="
        showReceipt = false;
        customer = null;
      "
    />
    <ProductDetailsModal :is-open="showDetails" :product="detailsItem" @close="closeDetails" @add-to-cart="onDetailsAdd" />
    <PackChoiceModal :is-open="showPack" :product="packProduct" :units-in-cart="packUnitsInCart" @close="closePack" @unit="packChooseUnit" @pack="packChooseBox" />
    <UnitSelectionModal
      v-if="unitPickerProduct"
      :is-open="showUnitPicker"
      :brand="unitPickerProduct?.variants?.brand || ''"
      :model="unitPickerProduct?.variants?.model || ''"
      :storage="unitPickerProduct?.variants?.storage"
      @close="closeUnitPicker"
      @select="onUnitPicked"
    />
    <ReturnModal :is-open="showReturnModal" :items="cart.items" :customer-name="cart.returnCustomer?.name" @close="showReturnModal = false" @confirm="confirmReturn" />

    <!-- Reserved device, no customer selected: complete it or sell to someone else -->
    <Teleport to="body">
      <div v-if="showReservedChoice && reservedChoiceUnit" class="modal-overlay" @click.self="closeReservedChoice">
        <div class="modal-content max-w-md">
          <div class="modal-header">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center"><BookmarkIcon class="w-5 h-5 text-purple-600" /></div>
              <h3 class="text-lg font-bold text-gray-900">Article réservé</h3>
            </div>
            <button class="p-1 hover:bg-gray-100 rounded" @click="closeReservedChoice"><XMarkIcon class="w-5 h-5" /></button>
          </div>
          <div class="modal-body space-y-4">
            <div class="bg-gray-50 rounded-lg p-4">
              <p class="font-semibold text-gray-900">{{ reservedChoiceUnit.brand }} {{ reservedChoiceUnit.model }}</p>
              <p class="text-sm text-gray-500 font-mono">{{ reservedChoiceUnit.imei ? formatImei(reservedChoiceUnit.imei) : reservedChoiceUnit.serialNumber }}</p>
              <p class="font-bold text-gray-900 mt-1">{{ formatCurrency(reservedChoiceUnit.salePrice) }}</p>
            </div>
            <div class="bg-purple-50 rounded-lg p-4 space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-500">Réservé par</span>
                <span class="font-medium text-gray-900">{{ reservedChoiceUnit.reservedByCustomer?.firstName }} {{ reservedChoiceUnit.reservedByCustomer?.lastName }}</span>
              </div>
              <div v-if="reservedChoiceUnit.reservationDeposit" class="flex justify-between">
                <span class="text-gray-500">Acompte versé</span>
                <span class="font-medium text-purple-700">{{ formatCurrency(Number(reservedChoiceUnit.reservationDeposit)) }}</span>
              </div>
            </div>
            <p class="text-sm text-gray-600">Que souhaitez-vous faire ?</p>
            <div class="space-y-3">
              <button class="w-full p-4 border-2 border-purple-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-colors text-start" @click="choiceComplete">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center"><CheckCircleIcon class="w-5 h-5 text-purple-600" /></div>
                  <div>
                    <p class="font-semibold text-gray-900">Compléter la réservation</p>
                    <p class="text-sm text-gray-500">Le client vient récupérer son article</p>
                  </div>
                </div>
              </button>
              <button class="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-warning-500 hover:bg-warning-50 transition-colors text-start" @click="choiceSellOther">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-full bg-warning-100 flex items-center justify-center"><UserIcon class="w-5 h-5 text-warning-600" /></div>
                  <div>
                    <p class="font-semibold text-gray-900">Vendre à un autre client</p>
                    <p class="text-sm text-gray-500">L'acompte devra être remboursé</p>
                  </div>
                </div>
              </button>
            </div>
          </div>
          <div class="modal-footer"><button class="btn-secondary w-full" @click="closeReservedChoice">Annuler</button></div>
        </div>
      </div>
    </Teleport>

    <!-- Complete a reservation: collect the balance and hand the device over -->
    <Teleport to="body">
      <div v-if="showCompleteReservation && completeUnit" class="modal-overlay" @click.self="closeCompleteReservation">
        <div class="modal-content max-w-md">
          <div class="modal-header">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center"><CheckCircleIcon class="w-5 h-5 text-purple-600" /></div>
              <h3 class="text-lg font-bold text-gray-900">Compléter la réservation</h3>
            </div>
            <button class="p-1 hover:bg-gray-100 rounded" @click="closeCompleteReservation"><XMarkIcon class="w-5 h-5" /></button>
          </div>
          <div class="modal-body space-y-4">
            <div v-if="completeError" class="bg-danger-50 border border-danger-200 rounded-lg p-3"><p class="text-sm text-danger-700">{{ completeError }}</p></div>
            <div class="bg-gray-50 rounded-lg p-4">
              <p class="font-semibold text-gray-900">{{ completeUnit.brand }} {{ completeUnit.model }}</p>
              <p class="text-sm text-gray-500 font-mono">{{ completeUnit.imei ? formatImei(completeUnit.imei) : completeUnit.serialNumber }}</p>
            </div>
            <div>
              <p class="text-sm text-gray-500">Client</p>
              <p class="font-medium text-gray-900">{{ completeUnit.reservedByCustomer?.firstName }} {{ completeUnit.reservedByCustomer?.lastName }}</p>
            </div>
            <div class="bg-purple-50 rounded-lg p-4 space-y-2 text-sm">
              <div class="flex justify-between"><span class="text-gray-500">Prix total</span><span class="font-medium">{{ formatCurrency(completeUnit.salePrice) }}</span></div>
              <div class="flex justify-between">
                <span class="text-gray-500">Acompte payé</span><span class="font-medium text-purple-700">- {{ formatCurrency(Number(completeUnit.reservationDeposit) || 0) }}</span>
              </div>
              <div class="flex justify-between pt-2 border-t border-purple-200">
                <span class="font-semibold text-gray-900">Reste à payer</span>
                <span class="font-bold text-purple-700">{{ formatCurrency(Number(completeUnit.salePrice) - (Number(completeUnit.reservationDeposit) || 0)) }}</span>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Montant</label>
              <div class="relative">
                <input
                  v-model.number="completeAmount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent pe-16"
                />
                <span class="absolute end-3 top-1/2 -translate-y-1/2 text-gray-500">DH</span>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Mode de paiement</label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="m in COMPLETE_METHODS"
                  :key="m.key"
                  type="button"
                  :class="[
                    'p-3 border rounded-lg text-sm font-medium transition-colors flex items-center gap-2',
                    completeMethod === m.key ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 hover:border-gray-300 text-gray-700',
                  ]"
                  @click="completeMethod = m.key"
                >
                  <component :is="m.icon" class="w-5 h-5" /><span>{{ m.label }}</span>
                </button>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" :disabled="completing" @click="closeCompleteReservation">Annuler</button>
            <button class="btn-primary bg-purple-600 hover:bg-purple-700" :disabled="completing || completeAmount <= 0" @click="confirmCompleteReservation">
              <span v-if="completing" class="flex items-center gap-2"><span class="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Traitement...</span>
              <span v-else>Confirmer le paiement</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Selling a device someone else reserved -->
    <Teleport to="body">
      <div v-if="showReservedWarning && reservedWarningUnit" class="modal-overlay" @click.self="closeReservedWarning">
        <div class="modal-content max-w-md">
          <div class="modal-header">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-warning-100 flex items-center justify-center"><ExclamationTriangleIcon class="w-5 h-5 text-warning-600" /></div>
              <h3 class="text-lg font-bold text-gray-900">{{ t('reservation.warningTitle') }}</h3>
            </div>
            <button class="p-1 hover:bg-gray-100 rounded" @click="closeReservedWarning"><XMarkIcon class="w-5 h-5" /></button>
          </div>
          <div class="modal-body space-y-4">
            <div class="bg-gray-50 rounded-lg p-4">
              <p class="font-semibold text-gray-900">{{ reservedWarningUnit.brand }} {{ reservedWarningUnit.model }}</p>
              <p class="text-sm text-gray-500 font-mono">{{ reservedWarningUnit.imei ? formatImei(reservedWarningUnit.imei) : reservedWarningUnit.serialNumber }}</p>
              <p class="font-bold text-gray-900 mt-1">{{ formatCurrency(reservedWarningUnit.salePrice) }}</p>
            </div>
            <div class="bg-warning-50 border border-warning-200 rounded-lg p-4 text-sm text-warning-800">
              <p>
                {{
                  t('reservation.warningMessage', {
                    customer: `${reservedWarningUnit.reservedByCustomer?.firstName} ${reservedWarningUnit.reservedByCustomer?.lastName || ''}`,
                    deposit: formatCurrency(Number(reservedWarningUnit.reservationDeposit) || 0),
                  })
                }}
              </p>
            </div>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-500">{{ t('reservation.reservedBy') }}</span>
                <span class="font-medium">{{ reservedWarningUnit.reservedByCustomer?.firstName }} {{ reservedWarningUnit.reservedByCustomer?.lastName }}</span>
              </div>
              <div v-if="reservedWarningUnit.reservationDeposit" class="flex justify-between">
                <span class="text-gray-500">{{ t('reservation.deposit') }}</span>
                <span class="font-medium">{{ formatCurrency(Number(reservedWarningUnit.reservationDeposit)) }}</span>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" @click="closeReservedWarning">{{ t('common.cancel') }}</button>
            <button class="btn-primary bg-warning-600 hover:bg-warning-700" @click="confirmReservedWarning">{{ t('reservation.continueAnyway') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <TradeInModal :is-open="showTradeIn" :cart-total="cart.total" @close="showTradeIn = false" @confirm="onTradeIn" />
    <Toast :show="toast.show" :message="toast.message" :type="toast.type" @close="toast.show = false" />
  </div>
</template>
