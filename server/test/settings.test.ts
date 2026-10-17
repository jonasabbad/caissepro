import { describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { getApp, newTenant } from './helpers.js';

describe('users', () => {
  it('owner manages cashier accounts within the plan limit', async () => {
    const { api, tenant, store } = await newTenant({ plan: 'professionnel' });
    const limit = (await prisma.subscriptionPlan.findUnique({ where: { code: 'professionnel' } }))?.maxUsers ?? null;
    expect((await api.post('/users', { email: 'c1@test.local', firstName: 'Ali', lastName: 'B' })).status).toBe(400);
    const created = await api.post('/users', { email: 'C1@test.local', password: 'secret1', firstName: 'Ali', lastName: 'B', currentStoreId: store.id });
    expect(created.status).toBe(201);
    const user = created.body.data.user;
    expect([user.email, user.roles, user.passwordHash]).toEqual(['c1@test.local', ['cashier'], undefined]);
    expect((await api.post('/users', { email: 'c1@test.local', password: 'secret1', firstName: 'X', lastName: 'Y' })).status).toBe(409);

    // The new cashier can sign in, but cannot manage users.
    const app = await getApp();
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'c1@test.local', password: 'secret1' } });
    expect(login.statusCode).toBe(200);
    const cashierToken = login.json().data.tokens.accessToken;
    expect((await app.inject({ method: 'GET', url: '/api/v1/users', headers: { authorization: `Bearer ${cashierToken}` } })).statusCode).toBe(403);

    const updated = (await api.put(`/users/${user.id}`, { lastName: 'Bennani', roles: ['manager'] })).body.data.user;
    expect([updated.lastName, updated.roles]).toEqual(['Bennani', ['manager']]);
    expect((await api.get('/users')).body.data.users).toHaveLength(2);

    if (limit != null) {
      for (let i = (await prisma.user.count({ where: { tenantId: tenant.id } })); i < limit; i++) {
        await api.post('/users', { email: `x${i}@test.local`, password: 'secret1', firstName: 'X', lastName: 'Y' });
      }
      const over = await api.post('/users', { email: 'over@test.local', password: 'secret1', firstName: 'X', lastName: 'Y' });
      expect(over.status).toBe(403);
    }
    expect((await api.delete(`/users/${user.id}`)).status).toBe(200);
    expect((await api.get(`/users/${user.id}`)).status).toBe(404);
  });
});

describe('settings', () => {
  it('saves business info, legal status, preferences, printing, store, profile and password', async () => {
    const { api, user } = await newTenant();
    expect((await api.patch('/settings/business-info', { rib: '123' })).status).toBe(400);
    await api.patch('/settings/business-info', { ice: '001234567000089', rib: '007 780 0001234567890123 45', invoicePrefix: 'F', invoiceYearFormat: 'YY', invoiceDigits: 3 });
    await api.patch('/settings/legal-status', { legalStatus: 'auto_entrepreneur', flatTaxRate: 0.5 });
    await api.patch('/settings/preferences', { taxRate: 10, locale: 'ar' });
    await api.patch('/settings/printing', { autoPrintReceipt: true, showBrand: false });
    await api.patch('/settings/store', { name: 'Boutique Centre', phone: '0522000000', city: 'Rabat' });
    const s = (await api.get('/settings/tenant')).body.data;
    expect(s.settings.businessInfo).toEqual(
      expect.objectContaining({ ice: '001234567000089', rib: '007780000123456789012345', invoicePrefix: 'F', invoiceYearFormat: 'YY', invoiceDigits: 3, flatTaxRate: 0.5 }),
    );
    expect([s.legalStatus, s.applyTva, s.settings.taxRate, s.settings.locale]).toEqual(['auto_entrepreneur', false, 10, 'ar']);
    expect(s.settings.printingSettings).toEqual({ autoPrintReceipt: true, showBrand: false });
    expect([s.storeName, s.storePhone, s.storeCity]).toEqual(['Boutique Centre', '0522000000', 'Rabat']);

    // Invoice numbering and the flat tax rate flow into invoicing.
    const product = (await api.post('/products', { name: 'Coque', costPrice: 10, retailPrice: 100, stockQuantity: 5 })).body.data.product;
    await api.post('/checkout', { items: [{ productId: product.id, quantity: 1, unitPrice: 100 }], payments: [{ method: 'cash', amount: 100 }] });
    const inv = (await api.get('/invoices')).body.data.invoices[0];
    expect(inv.invoiceNumber).toBe(`F-${String(new Date().getFullYear()).slice(-2)}-001`);
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect((await api.post('/invoices/ir/calculate-period', { dateFrom: today, dateTo: today })).body.data).toEqual(expect.objectContaining({ flatTaxRate: 0.5, irAmount: 0.5 }));

    const profile = (await api.patch('/settings/profile', { firstName: 'Mohamed', lastName: 'A' })).body.data.user;
    expect([profile.firstName, profile.lastName]).toEqual(['Mohamed', 'A']);
    expect((await api.post('/settings/change-password', { currentPassword: 'wrong', newPassword: 'newpass1' })).status).toBe(400);
    expect((await api.post('/settings/change-password', { currentPassword: 'secret123', newPassword: 'newpass1' })).status).toBe(200);
    const app = await getApp();
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: user.email, password: 'newpass1' } });
    expect(login.statusCode).toBe(200);
    expect((await api.get('/settings/team')).body.data.users).toHaveLength(1);
  });
});
