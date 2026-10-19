import { describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { getApp, newTenant } from './helpers.js';

async function phone(token: string) {
  const app = await getApp();
  const call = async (method: 'GET' | 'POST', url: string, payload?: unknown) => {
    const res = await app.inject({ method, url: `/api/v1${url}`, headers: { 'x-scanner-token': token }, ...(payload ? { payload: payload as any } : {}) });
    return { status: res.statusCode, body: res.json() };
  };
  return { get: (url: string) => call('GET', url), post: (url: string, payload: unknown = {}) => call('POST', url, payload) };
}

describe('phone scanner', () => {
  it('pairs a phone that looks codes up and sends them to the paired screen, with no other access', async () => {
    const { api } = await newTenant();
    const product = (await api.post('/products', { name: 'Câble USB-C', costPrice: 20, retailPrice: 59, stockQuantity: 12, barcode: '6119876543210' })).body.data.product;

    const created = (await api.post('/scanner/pairings')).body.data;
    expect(created.token.length).toBeGreaterThan(40);
    expect(created.pairing).toMatchObject({ active: true, scanCount: 0 });
    expect(Array.isArray(created.lanAddresses)).toBe(true);
    // Only the hash is stored.
    const row = await prisma.scannerPairing.findUnique({ where: { id: created.pairing.id } });
    expect(row!.tokenHash).not.toContain(created.token);

    const ph = await phone(created.token);
    const session = await ph.get('/scanner/phone/session');
    expect(session.status).toBe(200);
    expect(session.body.data.business).toMatch(/^T-/);

    // The screen waits; a scan on the phone wakes it with the code.
    const waiting = api.get(`/scanner/pairings/${created.pairing.id}/events?after=0`);
    await new Promise((r) => setTimeout(r, 50));
    const scan = await ph.post('/scanner/phone/scan', { code: '6119876543210' });
    expect(scan.status).toBe(200);
    const p = scan.body.data.result.products[0];
    expect([p.id, p.name, p.retailPrice, p.stockQuantity]).toEqual([product.id, 'Câble USB-C', '59.00', 12]);
    expect(p).not.toHaveProperty('costPrice');
    const events = (await waiting).body.data;
    expect(events.events.map((e: any) => e.code)).toEqual(['6119876543210']);
    expect(events.pairing.scanCount).toBe(1);

    // Lookup only: nothing is sent to the screen. Unknown code: found = false.
    const unknown = await ph.post('/scanner/phone/scan', { code: '4006381333931', send: false });
    expect([unknown.body.data.result.found, unknown.body.data.sent]).toEqual([false, false]);
    const after = await api.get(`/scanner/pairings/${created.pairing.id}/events?after=${events.last}&boot=${events.boot}&wait=0`);
    expect(after.body.data.events).toEqual([]);
    // Without this server's boot id (it restarted since), the screen gets every queued scan again from the start.
    const fromStart = await api.get(`/scanner/pairings/${created.pairing.id}/events?after=${events.last}&boot=old&wait=0`);
    expect(fromStart.body.data.events.map((e: any) => e.code)).toEqual(['6119876543210']);

    // The token opens nothing else: not as a bearer token, not as the scanner header on other routes.
    const app = await getApp();
    expect((await app.inject({ method: 'GET', url: '/api/v1/products', headers: { authorization: `Bearer ${created.token}` } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/v1/products', headers: { 'x-scanner-token': created.token } })).statusCode).toBe(401);
    expect((await ph.post('/scanner/phone/scan', { code: 'bad code with spaces' })).status).toBe(400);
    expect((await (await phone('x'.repeat(43))).get('/scanner/phone/session')).status).toBe(401);

    // Another user (even in the same business) cannot read this pairing.
    const other = await newTenant();
    expect((await other.api.get(`/scanner/pairings/${created.pairing.id}`)).status).toBe(404);

    // Another screen of the same user pairs its own phone: both links work.
    const otherScreen = (await api.post('/scanner/pairings')).body.data;
    expect((await ph.get('/scanner/phone/session')).status).toBe(200);
    expect((await (await phone(otherScreen.token)).get('/scanner/phone/session')).status).toBe(200);

    // "New QR code" replaces this screen's link only; Disconnect on the screen revokes the new one.
    const second = (await api.post('/scanner/pairings', { replaces: created.pairing.id })).body.data;
    expect((await ph.get('/scanner/phone/session')).status).toBe(401);
    expect((await (await phone(otherScreen.token)).get('/scanner/phone/session')).status).toBe(200);
    const ph2 = await phone(second.token);
    expect((await ph2.get('/scanner/phone/session')).status).toBe(200);
    await api.delete(`/scanner/pairings/${second.pairing.id}`);
    expect((await ph2.post('/scanner/phone/scan', { code: '6119876543210' })).status).toBe(401);
    expect((await api.get(`/scanner/pairings/${second.pairing.id}`)).body.data.pairing.active).toBe(false);

    // Disconnect from the phone, and expiry.
    const third = (await api.post('/scanner/pairings')).body.data;
    const ph3 = await phone(third.token);
    expect((await ph3.post('/scanner/phone/disconnect')).status).toBe(200);
    expect((await ph3.get('/scanner/phone/session')).status).toBe(401);
    const fourth = (await api.post('/scanner/pairings')).body.data;
    await prisma.scannerPairing.update({ where: { id: fourth.pairing.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await (await phone(fourth.token)).get('/scanner/phone/session')).status).toBe(401);
  }, 40_000);
});
