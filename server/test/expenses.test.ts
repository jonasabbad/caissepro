import { describe, expect, it } from 'vitest';
import { categoryId, newTenant } from './helpers.js';
import { prisma } from '../src/lib/prisma.js';

const today = () => new Date().toISOString().slice(0, 10);
const noon = () => `${today()}T12:00:00.000Z`;

async function drawer(api: any, storeId: string) {
  return Number((await api.get(`/stores/${storeId}/caisse/balance`)).body.data.balance);
}

describe('direct expenses', () => {
  it('creates, edits and deletes expenses with cash drawer reversals and no double counting', async () => {
    const { api, store } = await newTenant();
    const before = await drawer(api, store.id);

    // Validation.
    expect((await api.post('/expenses', { title: 'Loyer', category: 'rent', amount: -5, date: noon(), paymentMethod: 'cash' })).status).toBe(400);
    expect((await api.post('/expenses', { title: '', category: 'rent', amount: 5, date: noon(), paymentMethod: 'cash' })).status).toBe(400);
    expect((await api.post('/expenses', { title: 'X', category: 'stock', amount: 5, date: noon(), paymentMethod: 'cash' })).status).toBe(400);

    const rent = (await api.post('/expenses', { title: 'Loyer octobre', category: 'rent', amount: 3000, date: noon(), paymentMethod: 'bank_transfer', recipient: 'Propriétaire', clientRef: 'form-1' })).body.data.expense;
    const fuel = (await api.post('/expenses', { title: 'Carburant', category: 'transport', amount: 200, date: noon(), paymentMethod: 'cash', clientRef: 'form-2' })).body.data.expense;
    expect(rent.amount).toBe('3000.00');
    // Cash leaves the drawer, transfers do not.
    expect(await drawer(api, store.id)).toBe(before - 200);

    // Re-submitting the same form (same clientRef) does not create a second expense.
    const replay = await api.post('/expenses', { title: 'Carburant', category: 'transport', amount: 200, date: noon(), paymentMethod: 'cash', clientRef: 'form-2' });
    expect(replay.body.data.expense.id).toBe(fuel.id);
    expect(await drawer(api, store.id)).toBe(before - 200);
    // Same description, amount and day from another form → probable duplicate, unless confirmed.
    const dup = await api.post('/expenses', { title: 'carburant', category: 'transport', amount: 200, date: noon(), paymentMethod: 'card' });
    expect(dup.status).toBe(409);

    // Dashboard: direct expenses include the expenses; net profit goes down by the same amount.
    const kpis = (await api.get(`/dashboard/kpis?startDate=${today()}&endDate=${today()}`)).body.data.kpis;
    expect(kpis.profitBreakdown.totals.businessExpenses).toBe(3200);
    expect(kpis.profitBreakdown.totals.directExpenses).toBe(3200);
    expect(kpis.profitBreakdown.totals.netProfit).toBe(-3200);

    // Edit: amount and method change → old cash movement reversed, new one recorded.
    await api.put(`/expenses/${fuel.id}`, { amount: 250 });
    expect(await drawer(api, store.id)).toBe(before - 250);
    await api.put(`/expenses/${fuel.id}`, { paymentMethod: 'card' });
    expect(await drawer(api, store.id)).toBe(before);

    // List: search, category filter, totals, pagination.
    const list = (await api.get('/expenses?query=loyer')).body.data;
    expect(list.expenses.map((e: any) => e.id)).toEqual([rent.id]);
    expect((await api.get('/expenses?category=transport')).body.data.totals.amount).toBe(250);
    expect((await api.get('/expenses?limit=1&page=2')).body.data.meta).toMatchObject({ total: 2, page: 2, totalPages: 2 });
    expect((await api.get(`/expenses?dateFrom=2000-01-01&dateTo=2000-01-02`)).body.data.totals.count).toBe(0);

    // Report.
    const report = (await api.get(`/reports?type=expenses&startDate=${today()}&endDate=${today()}`)).body.data.report;
    expect(report.summary).toMatchObject({ total: 3250, count: 2 });
    expect(report.byCategory[0]).toMatchObject({ key: 'rent', amount: 3000 });
    expect(report.profit.totals.businessExpenses).toBe(3250);

    // Delete: soft delete, excluded everywhere; a cash expense gives the money back to the drawer.
    await api.put(`/expenses/${fuel.id}`, { paymentMethod: 'cash' });
    expect(await drawer(api, store.id)).toBe(before - 250);
    await api.delete(`/expenses/${fuel.id}`);
    expect(await drawer(api, store.id)).toBe(before);
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: fuel.id } })).deletedAt).not.toBeNull();
    expect((await api.get('/expenses')).body.data.totals.amount).toBe(3000);
    const after = (await api.get(`/dashboard/kpis?startDate=${today()}&endDate=${today()}`)).body.data.kpis;
    expect(after.profitBreakdown.totals.businessExpenses).toBe(3000);

    // The drawer history shows each step.
    const moves = (await api.get(`/stores/${store.id}/caisse`)).body.data.movements.map((m: any) => [m.type, Number(m.amount), m.reason]);
    expect(moves.filter((m: any) => String(m[2]).includes('Carburant')).length).toBe(6);
  });

  it('is reserved to managers', async () => {
    const { api } = await newTenant({ roles: ['cashier'] });
    expect((await api.get('/expenses')).status).toBe(403);
    expect((await api.post('/expenses', { title: 'X', category: 'other', amount: 1, date: noon(), paymentMethod: 'cash' })).status).toBe(403);
  });
});

describe('product categories', () => {
  it('creates, renames and safely deletes business categories', async () => {
    const { api, tenant } = await newTenant();
    const other = await newTenant();
    const builtIn = await categoryId('coques-protections');

    const created = await api.post('/categories', { name: 'Montres connectées' });
    expect(created.status).toBe(201);
    const cat = created.body.data.category;
    // Duplicate names (case/accents) refused, including against built-ins.
    expect((await api.post('/categories', { name: 'montres CONNECTÉES' })).status).toBe(409);
    expect((await api.post('/categories', { name: 'coques & protections' })).status).toBe(409);
    expect((await api.post('/categories', { name: '  ' })).status).toBe(400);

    // Visible to this business only.
    expect((await api.get('/categories')).body.data.categories.some((c: any) => c.id === cat.id)).toBe(true);
    expect((await other.api.get('/categories')).body.data.categories.some((c: any) => c.id === cat.id)).toBe(false);
    expect((await other.api.post('/products', { name: 'P', categoryId: cat.id, costPrice: 1, retailPrice: 2 })).status).toBe(400);

    // Usable in products, filters and the POS list.
    const p = (await api.post('/products', { name: 'Montre X', categoryId: cat.id, costPrice: 100, retailPrice: 250, stockQuantity: 3 })).body.data.product;
    expect(p.category.name).toBe('Montres connectées');
    expect((await api.get(`/products?categoryId=${cat.id}`)).body.data.products.map((x: any) => x.id)).toEqual([p.id]);

    // Rename.
    expect((await api.put(`/categories/${cat.id}`, { name: 'Montres' })).body.data.category.name).toBe('Montres');
    expect((await api.get(`/products/${p.id}`)).body.data.product.category.name).toBe('Montres');

    // Built-ins cannot be renamed or deleted, only hidden when unused.
    expect((await api.put(`/categories/${builtIn}`, { name: 'Autre' })).status).toBe(400);
    expect((await api.delete(`/categories/${builtIn}`)).status).toBe(400);
    const audio = await categoryId('chargeurs-cables');
    expect((await api.patch(`/categories/${audio}/visibility`, { hidden: true })).status).toBe(200);
    expect((await api.get('/categories')).body.data.categories.some((c: any) => c.id === audio)).toBe(false);
    expect((await api.get('/categories?all=1')).body.data.categories.find((c: any) => c.id === audio).hidden).toBe(true);
    await api.patch(`/categories/${audio}/visibility`, { hidden: false });

    // In use → refused; with a reassignment → products moved, then deleted; sales history kept.
    await api.post('/checkout', { items: [{ productId: p.id, quantity: 1, unitPrice: 250 }], payments: [{ method: 'cash', amount: 250 }] });
    expect((await api.delete(`/categories/${cat.id}`)).status).toBe(409);
    const del = await api.delete(`/categories/${cat.id}?reassignTo=${builtIn}`);
    expect(del.body.data).toMatchObject({ deleted: true, moved: 1 });
    expect((await api.get(`/products/${p.id}`)).body.data.product.categoryId).toBe(builtIn);
    expect(await prisma.transactionItem.count({ where: { productId: p.id } })).toBe(1);
    expect(await prisma.category.count({ where: { tenantId: tenant.id } })).toBe(0);
  });
});

describe('label template layout', () => {
  it('stores layout settings within limits and returns complete defaults', async () => {
    const { api } = await newTenant();
    const units = (await api.get('/label-templates/__sold_units__')).body.data;
    const tpl = units.template ?? units;
    expect(tpl).toMatchObject({ width: 50, height: 25, paper: 'roll', columns: 1, textPosition: 'above' });
    const saved = (await api.put('/label-templates/__sold_units__', { width: 40, height: 30, columns: 2, gapX: 3, barcodeHeight: 99, paper: 'sheet', align: 'center', paddingX: 'x' })).body.data.template;
    expect(saved).toMatchObject({ width: 40, height: 30, columns: 2, gapX: 3, barcodeHeight: 40, paper: 'sheet', align: 'center', paddingX: 2 });
    expect((await api.get('/label-templates/sold-units/resolve?brand=Apple&deviceType=phone')).body.data.template).toMatchObject({ width: 40, columns: 2 });
    const product = (await api.get(`/label-templates/${await categoryId('coques-protections')}`)).body.data;
    expect(product.template ?? product).toMatchObject({ width: 40, height: 25 });
  });
});
