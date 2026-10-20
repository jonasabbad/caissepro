import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma.js';
import { client, getApp, newTenant } from './helpers.js';

/** A phone: no sign-in, only its device secret (or nothing, to claim one). */
async function phone(token = '') {
  const app = await getApp();
  const call = async (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) => {
    const res = await app.inject({ method, url: `/api/v1${url}`, headers: token ? { 'x-scanner-device': token } : {}, ...(payload ? { payload: payload as any } : {}) });
    return { status: res.statusCode, body: res.json() };
  };
  return { get: (url: string) => call('GET', url), post: (url: string, payload: unknown = {}) => call('POST', url, payload), patch: (url: string, payload: unknown) => call('PATCH', url, payload) };
}

/** Pairs a new phone with `screenId` through a one-time QR code; returns its client and device. */
async function pairPhone(api: { post: (url: string, payload?: unknown) => Promise<{ body: any }> }, screenId: string, name: string) {
  const qr = (await api.post('/scanner/pairings', { screenId })).body.data;
  const claim = await (await phone()).post('/scanner/device/claim', { code: qr.token, name });
  expect(claim.status).toBe(200);
  return { ph: await phone(claim.body.data.token), device: claim.body.data.device, token: claim.body.data.token as string, qr };
}

const events = async (api: any, screenId: string, wait = 0) => (await api.get(`/scanner/screens/${screenId}/events?after=0&wait=${wait}`)).body.data;

describe('phone scanners', () => {
  it('authorizes each phone once with a one-time QR code; phones then reconnect alone and scan to their own computer', async () => {
    const { api, user } = await newTenant();
    const product = (await api.post('/products', { name: 'Câble USB-C', costPrice: 20, retailPrice: 59, stockQuantity: 12, barcode: '6119876543210' })).body.data.product;

    // Two computers of the same business.
    const caisse = (await api.post('/scanner/screens', { name: 'Caisse 1' })).body.data.screen;
    const stock = (await api.post('/scanner/screens', { name: 'Réserve' })).body.data.screen;
    // Registering again with the kept id refreshes the same computer.
    expect((await api.post('/scanner/screens', { id: caisse.id })).body.data.screen).toEqual(caisse);

    const a = await pairPhone(api, caisse.id, 'iPhone de Sara');
    const b = await pairPhone(api, stock.id, 'Samsung réserve');
    expect([a.device.screenId, b.device.screenId]).toEqual([caisse.id, stock.id]);

    // Only hashes are stored; the QR code works once.
    const row = await prisma.scannerDevice.findUnique({ where: { id: a.device.id } });
    expect(row!.tokenHash).not.toContain(a.token);
    const again = await (await phone()).post('/scanner/device/claim', { code: a.qr.token });
    expect([again.status, again.body.error]).toEqual([400, 'PAIRING_USED']);
    expect((await api.get(`/scanner/pairings/${a.qr.pairing.id}`)).body.data).toMatchObject({ status: 'used', device: { id: a.device.id } });

    // "Reopening the app": the secret alone reconnects, with the list of computers to send to.
    const session = (await a.ph.get('/scanner/device/session')).body.data;
    expect(session.device).toMatchObject({ name: 'iPhone de Sara', screenId: caisse.id });
    expect(session.screens.map((s: any) => s.name).sort()).toEqual(['Caisse 1', 'Réserve']);

    // Each computer listens; a scan reaches only the phone's own computer.
    await events(api, caisse.id);
    await events(api, stock.id);
    const scanA = (await a.ph.post('/scanner/device/scan', { code: '6119876543210' })).body.data;
    expect([scanA.sent, scanA.target.name]).toEqual([true, 'Caisse 1']);
    const p = scanA.result.products[0];
    expect([p.id, p.retailPrice, p.stockQuantity]).toEqual([product.id, '59.00', 12]);
    expect(p).not.toHaveProperty('costPrice');
    const gotCaisse = await events(api, caisse.id);
    expect(gotCaisse.events.some((e: any) => e.kind === 'devices')).toBe(true); // a phone was added
    expect(gotCaisse.events.filter((e: any) => e.kind === 'scan').map((e: any) => [e.code, e.deviceName])).toEqual([['6119876543210', 'iPhone de Sara']]);
    expect((await events(api, stock.id)).events.filter((e: any) => e.kind === 'scan')).toEqual([]);

    const scanB = (await b.ph.post('/scanner/device/scan', { code: '4006381333931' })).body.data;
    expect([scanB.sent, scanB.target.name, scanB.result.found]).toEqual([true, 'Réserve', false]);
    expect((await events(api, stock.id)).events.filter((e: any) => e.kind === 'scan').map((e: any) => e.deviceName)).toEqual(['Samsung réserve']);

    // A computer that is not listening: the phone is told, nothing is queued.
    await prisma.scannerScreen.update({ where: { id: stock.id }, data: { lastSeenAt: new Date(Date.now() - 120_000) } });
    const offline = (await b.ph.post('/scanner/device/scan', { code: '6119876543210' })).body.data;
    expect([offline.sent, offline.target.online]).toEqual([false, false]);

    // The phone switches to another computer of the business; not to another business's computer.
    expect((await b.ph.patch('/scanner/device', { screenId: caisse.id })).body.data.device.screenId).toBe(caisse.id);
    const other = await newTenant();
    const foreign = (await other.api.post('/scanner/screens', { name: 'Ailleurs' })).body.data.screen;
    expect((await b.ph.patch('/scanner/device', { screenId: foreign.id })).status).toBe(404);
    expect((await other.api.get(`/scanner/screens/${caisse.id}/events?wait=0`)).status).toBe(404);
    expect((await other.api.patch(`/scanner/devices/${a.device.id}`, { name: 'x' })).status).toBe(404);

    // Device management: list, rename, revoke.
    const list = (await api.get('/scanner/devices')).body.data;
    expect(list.devices.map((d: any) => d.name)).toEqual(['iPhone de Sara', 'Samsung réserve']);
    await api.patch(`/scanner/devices/${a.device.id}`, { name: 'Caisse – iPhone' });
    expect((await a.ph.get('/scanner/device/session')).body.data.device.name).toBe('Caisse – iPhone');
    await api.delete(`/scanner/devices/${b.device.id}`);
    const revoked = await b.ph.get('/scanner/device/session');
    expect([revoked.status, revoked.body.error]).toEqual([401, 'DEVICE_REVOKED']);
    expect((await api.get('/scanner/devices')).body.data.devices.map((d: any) => d.name)).toEqual(['Caisse – iPhone']);

    // The secret opens nothing else.
    const app = await getApp();
    expect((await app.inject({ method: 'GET', url: '/api/v1/products', headers: { 'x-scanner-device': a.token } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/v1/products', headers: { authorization: `Bearer ${a.token}` } })).statusCode).toBe(401);
    expect((await (await phone('x'.repeat(43))).get('/scanner/device/session')).body.error).toBe('DEVICE_UNKNOWN');

    // Expiry (180 days after the last use) and a deactivated authorizing user.
    await prisma.scannerDevice.update({ where: { id: a.device.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await a.ph.get('/scanner/device/session')).body.error).toBe('DEVICE_EXPIRED');
    const c = await pairPhone(api, caisse.id, 'Pixel');
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    expect((await c.ph.post('/scanner/device/scan', { code: '6119876543210' })).body.error).toBe('USER_DISABLED');
    await prisma.user.update({ where: { id: user.id }, data: { isActive: true } });

    // The phone forgets itself.
    expect((await c.ph.post('/scanner/device/disconnect')).status).toBe(200);
    expect((await c.ph.get('/scanner/device/session')).body.error).toBe('DEVICE_REVOKED');
  }, 60_000);

  it('expires QR codes after 10 minutes and limits phone management to its owner or a manager', async () => {
    const { api, tenant } = await newTenant();
    const screen = (await api.post('/scanner/screens', { name: 'Caisse' })).body.data.screen;
    const qr = (await api.post('/scanner/pairings', { screenId: screen.id })).body.data;
    await prisma.scannerPairing.update({ where: { id: qr.pairing.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const late = await (await phone()).post('/scanner/device/claim', { code: qr.token });
    expect([late.status, late.body.error]).toEqual([400, 'PAIRING_EXPIRED']);
    expect((await (await phone()).post('/scanner/device/claim', { code: 'y'.repeat(43) })).body.error).toBe('PAIRING_INVALID');

    // A cashier of the same business sees and manages only the phones they authorized.
    const { device } = await pairPhone(api, screen.id, 'Téléphone du gérant');
    const email = `cashier-${tenant.id.slice(0, 6)}@test.local`;
    await prisma.user.create({ data: { tenantId: tenant.id, email, passwordHash: await bcrypt.hash('secret123', 4), firstName: 'Caissier', roles: JSON.stringify(['cashier']) } });
    const app = await getApp();
    const cashier = client(app, (await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: 'secret123' } })).json().data.tokens.accessToken);
    expect((await cashier.get('/scanner/devices')).body.data.devices).toEqual([]);
    expect((await cashier.delete(`/scanner/devices/${device.id}`)).status).toBe(403);
    const mine = await pairPhone(cashier, screen.id, 'Téléphone caisse');
    expect((await cashier.get('/scanner/devices')).body.data.devices.map((d: any) => d.id)).toEqual([mine.device.id]);
    expect((await api.get('/scanner/devices')).body.data.devices).toHaveLength(2);
  }, 30_000);
});
