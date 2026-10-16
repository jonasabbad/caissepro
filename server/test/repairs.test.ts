import { describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { newTenant } from './helpers.js';

async function setup() {
  const t = await newTenant();
  const customer = (await t.api.post('/customers', { firstName: 'Walid', lastName: 'A', phone: '0611223344' })).body.data.customer;
  const unit = (
    await t.api.post('/phone-seller/sold-units', { brand: 'Apple', model: 'iPhone 13', condition: 'grade_b', imei: '490154203237518', purchasePrice: 3000, salePrice: 3800 })
  ).body.data.unit;
  return { ...t, customer, unit };
}

describe('repairs', () => {
  it('creates a repair with a REP number, embedded relations and the pending status', async () => {
    const { api, customer } = await setup();
    expect((await api.post('/repairs', { deviceDescription: 'x' })).status).toBe(400);
    const repairer = (await api.post('/repairers', { name: 'Atelier Hassan', phone: '0600' })).body.data.repairer;
    const r = await api.post('/repairs', { customerId: customer.id, deviceDescription: 'iPhone 11 - écran cassé', repairerId: repairer.id, fixedPrice: '' });
    expect(r.status).toBe(201);
    const repair = r.body.data.repair;
    expect(repair.repairNumber).toMatch(/^REP-[0-9A-Z]+-[0-9A-Z]{4}$/);
    expect([repair.status, repair.fixedPrice, repair.totalCost, repair.customer.firstName, repair.repairer.name, repair.creator.firstName]).toEqual([
      'pending', '0.00', '0.00', 'Walid', 'Atelier Hassan', 'Test',
    ]);
    expect((await api.get('/repairs?query=0611')).body.data.repairs).toHaveLength(1);
    expect((await api.get('/repairs?query=écran')).body.data.repairs).toHaveLength(1);
    expect((await api.get('/repairs?status=delivered')).body.data.repairs).toHaveLength(0);
    expect((await api.get('/repairers?query=hass')).body.data.repairers).toHaveLength(1);
  });

  it('enforces the status workflow and requires a price to complete', async () => {
    const { api, customer } = await setup();
    const id = (await api.post('/repairs', { customerId: customer.id, deviceDescription: 'Galaxy A52' })).body.data.repair.id;
    expect((await api.patch(`/repairs/${id}/status`, { status: 'delivered' })).status).toBe(400);
    expect((await api.patch(`/repairs/${id}/status`, { status: 'in_progress' })).body.data.repair.status).toBe('in_progress');
    const noPrice = await api.patch(`/repairs/${id}/status`, { status: 'completed' });
    expect(noPrice.status).toBe(400);
    await api.put(`/repairs/${id}`, { fixedPrice: 250 });
    const done = (await api.patch(`/repairs/${id}/status`, { status: 'completed' })).body.data.repair;
    expect(done.completedAt).not.toBeNull();
    expect((await api.patch(`/repairs/${id}/status`, { status: 'cancelled' })).status).toBe(400);
    const delivered = (await api.patch(`/repairs/${id}/status`, { status: 'delivered' })).body.data.repair;
    expect([delivered.status, delivered.fixedPrice]).toEqual(['delivered', '250.00']);
    expect(delivered.deliveredAt).not.toBeNull();
    // No till side effects: repairs live outside the cash drawer.
    expect(await prisma.caisseMovement.count({ where: { tenantId: delivered.tenantId } })).toBe(0);
    expect((await api.post(`/repairs/${id}/expenses`, { description: 'x', amount: 1 })).status).toBe(400);
  });

  it('expenses roll up into totalCost and into the linked stock device cost', async () => {
    const { api, customer, unit } = await setup();
    const repair = (
      await api.post('/repairs', { customerId: customer.id, deviceDescription: 'iPhone 13 - batterie', soldUnitId: unit.id, fixedPrice: 400 })
    ).body.data.repair;
    expect(repair.soldUnit.imei).toBe('490154203237518');
    // One active repair per device.
    expect((await api.post('/repairs', { customerId: customer.id, deviceDescription: 'again', soldUnitId: unit.id })).status).toBe(409);

    let r = (await api.post(`/repairs/${repair.id}/expenses`, { description: 'Batterie', amount: 150, type: 'part' })).body.data.repair;
    r = (await api.post(`/repairs/${repair.id}/expenses`, { description: 'Pose', amount: 50, type: 'labor' })).body.data.repair;
    expect([r.totalCost, r.expenses.length]).toEqual(['200.00', 2]);
    let u = (await api.get(`/phone-seller/sold-units/${unit.id}`)).body.data.unit;
    expect([u.repairCost, u.profit]).toEqual(['200.00', '600.00']);

    r = (await api.delete(`/repairs/${repair.id}/expenses/${r.expenses[1].id}`)).body.data.repair;
    expect(r.totalCost).toBe('150.00');
    expect((await api.get(`/repairs/by-unit/${unit.id}`)).body.data.repairs).toHaveLength(1);

    // Cancelling drops the cost from the device again.
    await api.patch(`/repairs/${repair.id}/status`, { status: 'cancelled' });
    u = (await api.get(`/phone-seller/sold-units/${unit.id}`)).body.data.unit;
    expect([u.repairCost, u.profit]).toEqual(['0.00', '800.00']);
    // ...and frees the device for a new repair.
    expect((await api.post('/repairs', { customerId: customer.id, deviceDescription: 'again', soldUnitId: unit.id })).status).toBe(201);
  });

  it('device repair cost flows into the POS line cost', async () => {
    const { api, customer, unit } = await setup();
    const repair = (await api.post('/repairs', { customerId: customer.id, deviceDescription: 'x', soldUnitId: unit.id, fixedPrice: 100 })).body.data.repair;
    await api.post(`/repairs/${repair.id}/expenses`, { description: 'Écran', amount: 300 });
    const tx = (await api.post('/checkout', { items: [{ soldUnitId: unit.id, quantity: 1, unitPrice: 3800 }], payments: [{ method: 'cash', amount: 3800 }] })).body.data.transaction;
    expect([tx.totalCost, tx.totalProfit]).toEqual(['3300.00', '500.00']);
  });

  it('deletes a repair', async () => {
    const { api, customer } = await setup();
    const id = (await api.post('/repairs', { customerId: customer.id, deviceDescription: 'x' })).body.data.repair.id;
    expect((await api.delete(`/repairs/${id}`)).status).toBe(200);
    expect((await api.get(`/repairs/${id}`)).status).toBe(404);
  });
});
