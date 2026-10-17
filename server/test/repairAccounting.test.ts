import { describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { newTenant } from './helpers.js';

const day = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function setup() {
  const t = await newTenant();
  const screen = (await t.api.post('/products', { name: 'Écran iPhone 11', costPrice: 300, retailPrice: 600, stockQuantity: 5 })).body.data.product;
  const coque = (await t.api.post('/products', { name: 'Coque', costPrice: 10, retailPrice: 50, stockQuantity: 20 })).body.data.product;
  const customer = (await t.api.post('/customers', { firstName: 'Walid', lastName: 'A' })).body.data.customer;
  const hassan = (await t.api.post('/repairers', { name: 'Hassan' })).body.data.repairer;
  const caisse = async () => Number((await prisma.store.findUniqueOrThrow({ where: { id: t.store.id } })).caisseBalance);
  const stock = async (id: string) => (await t.api.get(`/products/${id}`)).body.data.product.stockQuantity;
  return { ...t, screen, coque, customer, hassan, caisse, stock };
}

describe('repair accounting', () => {
  it('computes repair profit from revenue, parts, technician and other costs, and only counts it once paid', async () => {
    const { api, screen, coque, customer, hassan, caisse, stock } = await setup();
    const repair = (await api.post('/repairs', { customerId: customer.id, deviceDescription: 'iPhone 11 - écran', fixedPrice: 900, repairerId: hassan.id })).body.data.repair;

    // Spare part taken from stock: stock decreases and the part is costed at the product cost price.
    let r = (await api.post(`/repairs/${repair.id}/expenses`, { type: 'stock_part', productId: screen.id, quantity: 1 })).body.data.repair;
    expect(await stock(screen.id)).toBe(4);
    const mv = (await api.get(`/inventory-movements?productId=${screen.id}&type=repair`)).body.data.movements[0];
    expect([mv.quantity, mv.reference]).toEqual([-1, repair.repairNumber]);
    expect((await api.post(`/repairs/${repair.id}/expenses`, { type: 'stock_part', productId: screen.id, quantity: 10 })).status).toBe(400);
    // Part bought for the job and the technician, both paid from the drawer; another direct cost.
    await api.post(`/repairs/${repair.id}/expenses`, { type: 'part', description: 'Nappe', amount: 50, paidFromDrawer: true });
    await api.post(`/repairs/${repair.id}/expenses`, { type: 'labor', description: 'Pose', amount: 200, repairerId: hassan.id, paidFromDrawer: true });
    r = (await api.post(`/repairs/${repair.id}/expenses`, { type: 'other', description: 'Colle', amount: 20 })).body.data.repair;
    // 900 − (300 + 50) − 200 − 20 = 330
    expect(r.financials).toEqual(
      expect.objectContaining({ revenue: 900, partsCost: 350, laborCost: 200, otherCost: 20, totalCost: 570, grossProfit: 550, profit: 330, realized: false, amountDue: 900 }),
    );
    expect(r.expenses.find((e: any) => e.type === 'labor').repairer.name).toBe('Hassan');
    expect(await caisse()).toBe(-250);

    // A POS sale the same day: 50 revenue, 40 margin.
    await api.post('/checkout', { items: [{ productId: coque.id, quantity: 1, unitPrice: 50 }], payments: [{ method: 'cash', amount: 50 }] });

    await api.patch(`/repairs/${repair.id}/status`, { status: 'in_progress' });
    await api.patch(`/repairs/${repair.id}/status`, { status: 'completed' });
    // Completed but unpaid: not income yet.
    let k = (await api.get('/dashboard/kpis')).body.data.kpis;
    expect([k.realProfit.total, k.repairs.count]).toEqual([40, 0]);

    expect((await api.post(`/repairs/${repair.id}/payments`, { amount: 100, method: 'card' })).status).toBe(400); // reference required
    r = (await api.post(`/repairs/${repair.id}/payments`, { amount: 400, method: 'cash' })).body.data.repair;
    expect([r.paymentStatus, r.realizedAt, r.financials.amountDue]).toEqual(['partial', null, 500]);
    k = (await api.get('/dashboard/kpis')).body.data.kpis;
    expect(k.realProfit.total).toBe(40); // partly paid: still not income

    r = (await api.post(`/repairs/${repair.id}/payments`, { amount: 600, method: 'cash' })).body.data.repair; // capped at the 500 due
    expect([r.paymentStatus, r.amountPaid, r.financials.realized]).toEqual(['paid', '900.00', true]);
    expect(await caisse()).toBe(-250 + 50 + 400 + 500);
    expect((await api.post(`/repairs/${repair.id}/payments`, { amount: 1, method: 'cash' })).status).toBe(400);

    // Dashboard: net profit = sales margin 40 + repair profit 330.
    k = (await api.get('/dashboard/kpis')).body.data.kpis;
    expect(k.realProfit.total).toBe(370);
    expect(k.repairs).toEqual(expect.objectContaining({ revenue: 900, profit: 330, count: 1 }));
    expect(k.dailySales.total).toBe(50); // sales KPI stays sales-only: repair revenue is not mixed into it
    // Repair costs stay in the repair; direct expenses are business expenses only (none here).
    expect(k.profitBreakdown.totals).toEqual({ revenue: 950, cogs: 10, repairCosts: 570, grossProfit: 370, directExpenses: 0, netProfit: 370, margin: 38.95 });
    const trend = (await api.get('/dashboard/sales-trend?days=7')).body.data.trend.at(-1);
    expect([trend.sales, trend.repairRevenue, trend.repairProfit, trend.profit]).toEqual([50, 900, 330, 370]);

    // Reports: sales report carries the same P&L; repairs report breaks it down.
    const q = `dateFrom=${day()}&dateTo=${day()}`;
    const sales = (await api.get(`/reports?type=sales&${q}`)).body.data.report;
    expect(sales.profit.totals.netProfit).toBe(370);
    expect(sales.summary.totalSales).toBe(50); // no repair revenue counted as a sale
    const rep = (await api.get(`/reports?type=repairs&${q}`)).body.data.report;
    expect(rep.summary).toEqual(expect.objectContaining({ realizedCount: 1, revenue: 900, partsCost: 350, laborCost: 200, otherCost: 20, grossProfit: 550, profit: 330 }));
    expect(rep.byTechnician).toEqual([expect.objectContaining({ name: 'Hassan', count: 1, revenue: 900, laborCost: 200, profit: 330 })]);
    expect((await api.get(`/reports?type=repairs&${q}&repairerId=${hassan.id}`)).body.data.report.repairs).toHaveLength(1);
    expect((await api.get(`/reports?type=repairs&${q}&paymentStatus=unpaid`)).body.data.report.repairs).toHaveLength(0);
    expect((await api.get('/repairs?paymentStatus=paid')).body.data.repairs).toHaveLength(1);

    // Closed: no more costs, no deletion of a paid repair.
    await api.patch(`/repairs/${repair.id}/status`, { status: 'delivered' });
    expect((await api.post(`/repairs/${repair.id}/expenses`, { type: 'other', description: 'x', amount: 1 })).status).toBe(400);
    expect((await api.delete(`/repairs/${repair.id}`)).status).toBe(400);
  });

  it('keeps unpaid and cancelled repairs out of profit and returns their stock parts', async () => {
    const { api, screen, customer, stock } = await setup();
    const unpaid = (await api.post('/repairs', { customerId: customer.id, deviceDescription: 'A', fixedPrice: 500 })).body.data.repair;
    await api.patch(`/repairs/${unpaid.id}/status`, { status: 'in_progress' });
    await api.patch(`/repairs/${unpaid.id}/status`, { status: 'completed' });

    const cancelled = (await api.post('/repairs', { customerId: customer.id, deviceDescription: 'B', fixedPrice: 300 })).body.data.repair;
    await api.post(`/repairs/${cancelled.id}/expenses`, { type: 'stock_part', productId: screen.id, quantity: 2 });
    expect(await stock(screen.id)).toBe(3);
    await api.patch(`/repairs/${cancelled.id}/status`, { status: 'cancelled' });
    expect(await stock(screen.id)).toBe(5);

    const paidThenCancel = (await api.post('/repairs', { customerId: customer.id, deviceDescription: 'C', fixedPrice: 200 })).body.data.repair;
    await api.post(`/repairs/${paidThenCancel.id}/payments`, { amount: 50, method: 'cash' });
    expect((await api.patch(`/repairs/${paidThenCancel.id}/status`, { status: 'cancelled' })).status).toBe(400);

    const k = (await api.get('/dashboard/kpis')).body.data.kpis;
    expect([k.realProfit.total, k.repairs.count]).toEqual([0, 0]);
    const rep = (await api.get(`/reports?type=repairs&dateFrom=${day()}&dateTo=${day()}`)).body.data.report;
    expect(rep.summary).toEqual(expect.objectContaining({ realizedCount: 0, profit: 0, receivedCount: 3, pendingCount: 2, pendingRevenue: 700, collectedNotRealized: 50, cancelledCount: 1 }));
  });

  it('New Repair "Repair Cost": 500 charged, 150 spare parts → profit 350, no business expense, no extra cash movement', async () => {
    const { api, customer, caisse } = await setup();
    // What the New Repair form sends: the repair, then its Repair Cost as a spare-part cost line (not paid from the drawer).
    const repair = (await api.post('/repairs', { customerId: customer.id, deviceDescription: 'Samsung A54 - écran', fixedPrice: 500 })).body.data.repair;
    let r = (await api.post(`/repairs/${repair.id}/expenses`, { type: 'part', description: 'Repair cost', amount: 150 })).body.data.repair;
    expect(r.financials).toEqual(expect.objectContaining({ revenue: 500, partsCost: 150, otherCost: 0, laborCost: 0, profit: 350 }));
    expect(await prisma.expense.count({ where: { tenantId: repair.tenantId } })).toBe(0);
    expect(await caisse()).toBe(0); // the cost does not leave the drawer

    // Not collected yet: no revenue, no profit, no cash.
    await api.patch(`/repairs/${repair.id}/status`, { status: 'in_progress' });
    await api.patch(`/repairs/${repair.id}/status`, { status: 'completed' });
    let k = (await api.get('/dashboard/kpis')).body.data.kpis;
    expect([k.repairs.revenue, k.realProfit.total, k.profitBreakdown.totals.directExpenses]).toEqual([0, 0, 0]);

    r = (await api.post(`/repairs/${repair.id}/payments`, { amount: 500, method: 'cash' })).body.data.repair;
    expect(await caisse()).toBe(500); // only the customer's payment moves the drawer
    k = (await api.get('/dashboard/kpis')).body.data.kpis;
    expect(k.repairs).toEqual(expect.objectContaining({ revenue: 500, profit: 350, count: 1 }));
    expect(k.profitBreakdown.totals).toEqual(expect.objectContaining({ revenue: 500, cogs: 0, repairCosts: 150, grossProfit: 350, directExpenses: 0, netProfit: 350 }));
    const rep = (await api.get(`/reports?type=repairs&dateFrom=${day()}&dateTo=${day()}`)).body.data.report;
    expect(rep.summary).toEqual(expect.objectContaining({ revenue: 500, partsCost: 150, profit: 350 }));
    const exp = (await api.get(`/reports?type=expenses&dateFrom=${day()}&dateTo=${day()}`)).body.data.report;
    expect([exp.summary.total, exp.profit.totals.netProfit]).toEqual([0, 350]);
  });

  it('keeps repair costs in the repair when a device is linked; legacy capitalized repairs keep their treatment', async () => {
    const { api, customer } = await setup();
    const unit = (await api.post('/phone-seller/sold-units', { brand: 'Apple', model: 'iPhone 12', condition: 'grade_a', purchasePrice: 3000, salePrice: 3800 })).body.data.unit;
    const repair = (await api.post('/repairs', { customerId: customer.id, deviceDescription: 'Batterie', soldUnitId: unit.id, fixedPrice: 300 })).body.data.repair;
    const r = (await api.post(`/repairs/${repair.id}/expenses`, { type: 'part', description: 'Batterie', amount: 100 })).body.data.repair;
    expect([r.financials.costsCapitalized, r.financials.profit]).toEqual([false, 200]);
    // The device's cost is not raised, so selling it does not count the 100 again.
    expect((await api.get(`/phone-seller/sold-units/${unit.id}`)).body.data.unit.repairCost).toBe('0.00');
    await api.patch(`/repairs/${repair.id}/status`, { status: 'in_progress' });
    await api.patch(`/repairs/${repair.id}/status`, { status: 'completed' });
    await api.post(`/repairs/${repair.id}/payments`, { amount: 300, method: 'cash' });
    await api.post('/checkout', { items: [{ soldUnitId: unit.id, quantity: 1, unitPrice: 3800 }], payments: [{ method: 'cash', amount: 3800 }] });
    const k = (await api.get('/dashboard/kpis')).body.data.kpis;
    expect([k.realProfit.total, k.repairs.profit]).toEqual([800 + 200, 200]);

    // A repair from before the change (flagged by the data migration) still feeds the device cost, not the repair.
    const unit2 = (await api.post('/phone-seller/sold-units', { brand: 'Apple', model: 'iPhone 11', condition: 'grade_a', purchasePrice: 2000, salePrice: 2600 })).body.data.unit;
    const legacy = (await api.post('/repairs', { customerId: customer.id, deviceDescription: 'Écran', soldUnitId: unit2.id, fixedPrice: 0 })).body.data.repair;
    await prisma.repair.update({ where: { id: legacy.id }, data: { costsCapitalized: true } });
    const lr = (await api.post(`/repairs/${legacy.id}/expenses`, { type: 'labor', description: 'Pose', amount: 100 })).body.data.repair;
    expect([lr.financials.costsCapitalized, lr.financials.capitalizedCost, lr.financials.profit]).toEqual([true, 100, 0]);
    expect((await api.get(`/phone-seller/sold-units/${unit2.id}`)).body.data.unit.repairCost).toBe('100.00');
  });
});
