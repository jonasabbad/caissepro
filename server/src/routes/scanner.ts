import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { badRequest, forbidden, HttpError, notFound } from '../lib/errors.js';
import { authenticate, isManager } from '../lib/auth.js';
import { ok, type Req } from '../lib/route.js';
import { CODE, lookupCode } from './scan.js';

/**
 * Phones as barcode scanners, for several phones and several computers.
 * - A computer (signed-in browser) registers as a *screen* and long-polls for scans.
 * - A phone is authorized once: the computer shows a one-time QR code (10 minutes, single use); the phone exchanges it
 *   for a *device* secret (32 random bytes, only its SHA-256 is stored) kept on the phone. From then on the phone
 *   reconnects by itself; the authorization lasts 180 days after the last use and ends when it is revoked, when the
 *   user who authorized it is deactivated, or when the phone forgets it.
 * - Each phone sends its scans to the screen it chose (by default the computer that authorized it). The device secret
 *   only allows: looking codes up (names, selling prices, stock; never costs), choosing its screen among this
 *   business's computers, and sending codes to it.
 */

const PAIRING_TTL_MS = 10 * 60_000;
const DEVICE_TTL_MS = 180 * 86400_000;
const WAIT_MS = 25_000;
const ONLINE_MS = 45_000; // a screen polls at least every 25 s
const EVENT_MAX_AGE_MS = 60_000; // a scan not picked up within a minute is dropped (no late surprises in a cart)
const MAX_SCANS_PER_MINUTE = 60;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const secret = () => randomBytes(32).toString('base64url');

// ── Scans waiting for a screen (in memory: a scan is only useful to a screen that is open now) ──
interface ScanEvent { seq: number; kind: 'scan' | 'devices'; code?: string; deviceId?: string; deviceName?: string; at: number }
interface Channel { events: ScanEvent[]; seq: number; waiters: Set<() => void> }
const channels = new Map<string, Channel>();
// Changes when the server restarts (queues start again at 1): a screen sending another value starts from 0.
const BOOT = randomBytes(6).toString('hex');
const channel = (id: string) => {
  let c = channels.get(id);
  if (!c) channels.set(id, (c = { events: [], seq: 0, waiters: new Set() }));
  return c;
};
function publish(screenId: string, e: Omit<ScanEvent, 'seq' | 'at'>) {
  const c = channel(screenId);
  c.events.push({ ...e, seq: ++c.seq, at: Date.now() });
  if (c.events.length > 50) c.events.splice(0, c.events.length - 50);
  for (const w of c.waiters) w();
}
const recentScans = new Map<string, number[]>();

const rank = (a: string) => (a.startsWith('192.168.') ? 0 : a.startsWith('10.') ? 1 : 2);
/** This computer's local-network addresses, so the QR code can point the phone at it instead of "localhost". */
function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a): a is NonNullable<typeof a> => !!a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address)
    .filter((a) => /^(10|172\.(1[6-9]|2\d|3[01])|192\.168)\./.test(a))
    // Home / shop Wi-Fi first; 172.16–31 is often a virtual adapter (WSL, Docker).
    .sort((a, b) => rank(a) - rank(b));
}

/** "iPhone", "iPhone 2"…: names stay distinguishable in the lists (they can be renamed). */
function uniqueName(base: string, taken: string[]) {
  const used = new Set(taken.map((n) => n.toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) if (!used.has(`${base} ${i}`.toLowerCase())) return `${base.slice(0, 36)} ${i}`;
}

const online = (s: { lastSeenAt: Date } | null | undefined) => !!s && Date.now() - s.lastSeenAt.getTime() < ONLINE_MS;
const name = z.string().trim().min(1, 'Le nom est obligatoire').max(40);

async function screensOf(tenantId: string) {
  const [screens, users] = await Promise.all([
    prisma.scannerScreen.findMany({ where: { tenantId, lastSeenAt: { gt: new Date(Date.now() - 30 * 86400_000) } }, orderBy: { lastSeenAt: 'desc' } }),
    prisma.user.findMany({ where: { tenantId }, select: { id: true, firstName: true, lastName: true } }),
  ]);
  const userName = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
  return screens.map((s) => ({ id: s.id, name: s.name, userName: userName.get(s.userId) || null, online: online(s), lastSeenAt: s.lastSeenAt.toISOString() }));
}

// ── Phone authentication ──
const deviceError = (message: string, code: string) => new HttpError(401, message, code);
async function phoneDevice(req: FastifyRequest) {
  const token = req.headers['x-scanner-device'];
  if (typeof token !== 'string' || token.length < 20) throw deviceError('Téléphone non reconnu', 'DEVICE_UNKNOWN');
  const device = await prisma.scannerDevice.findUnique({ where: { tokenHash: sha256(token) } });
  if (!device) throw deviceError('Téléphone non reconnu', 'DEVICE_UNKNOWN');
  if (device.revokedAt) throw deviceError('L’accès de ce téléphone a été retiré', 'DEVICE_REVOKED');
  if (device.expiresAt <= new Date()) throw deviceError('L’autorisation de ce téléphone a expiré', 'DEVICE_EXPIRED');
  const user = await prisma.user.findUnique({ where: { id: device.userId } });
  if (!user || !user.isActive || user.tenantId !== device.tenantId) throw deviceError('Le compte qui a autorisé ce téléphone est désactivé', 'USER_DISABLED');
  return { device, user };
}
/** Marks the phone as seen and moves its expiry forward. */
const touch = (id: string, extra: Record<string, unknown> = {}) =>
  prisma.scannerDevice.update({ where: { id }, data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + DEVICE_TTL_MS), ...extra } });

/** What the phone may see: names, selling prices and stock; never cost prices or customers. */
function phoneView(r: Awaited<ReturnType<typeof lookupCode>>) {
  return {
    code: r.code,
    found: r.found,
    looksLikeImei: r.looksLikeImei,
    products: (r.products as any[]).map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      categoryName: p.category?.name ?? null,
      retailPrice: p.retailPrice,
      stockQuantity: p.stockQuantity,
      packSize: p.packSize,
      packRetailPrice: p.packRetailPrice,
      imageUrl: p.imageUrl,
    })),
    units: r.units,
    modelBarcode: r.modelBarcode ? { brand: r.modelBarcode.brand, model: r.modelBarcode.model, storage: r.modelBarcode.storage, color: r.modelBarcode.color } : null,
    imei: r.imei ? { device: r.imei.device ? { brand: r.imei.device.brand, model: r.imei.device.model } : null } : null,
  };
}

const deviceView = (d: { id: string; name: string; screenId: string | null; userId: string; scanCount: number; lastSeenAt: Date | null; createdAt: Date; expiresAt: Date; userAgent: string | null }) => ({
  id: d.id,
  name: d.name,
  screenId: d.screenId,
  userId: d.userId,
  scanCount: d.scanCount,
  lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
  createdAt: d.createdAt.toISOString(),
  expiresAt: d.expiresAt.toISOString(),
  userAgent: d.userAgent,
});

export default async function scannerRoutes(app: FastifyInstance) {
  // ── Signed-in computer: receive scans, authorize and manage phones ──
  await app.register(async (screen) => {
    screen.addHook('preHandler', authenticate);

    const ownScreen = async (req: FastifyRequest, id: string) => {
      const s = await prisma.scannerScreen.findFirst({ where: { id, tenantId: req.auth.tenantId } });
      if (!s) throw notFound('Ordinateur');
      return s;
    };
    const ownDevice = async (req: FastifyRequest, id: string) => {
      const d = await prisma.scannerDevice.findFirst({ where: { id, tenantId: req.auth.tenantId, revokedAt: null } });
      if (!d) throw notFound('Téléphone');
      if (d.userId !== req.auth.userId && !isManager(req.auth.roles)) throw forbidden();
      return d;
    };

    /** This browser as a receiving computer: created once, then refreshed (the id is kept by the browser). */
    screen.post('/scanner/screens', async (req: Req<{ id?: string; name?: string }>) => {
      const body = z.object({ id: z.string().uuid().optional().nullable(), name: name.optional() }).parse(req.body ?? {});
      const existing = body.id ? await prisma.scannerScreen.findFirst({ where: { id: body.id, tenantId: req.auth.tenantId } }) : null;
      const s = existing
        ? await prisma.scannerScreen.update({ where: { id: existing.id }, data: { userId: req.auth.userId, lastSeenAt: new Date() } })
        : await prisma.scannerScreen.create({
            data: {
              tenantId: req.auth.tenantId,
              userId: req.auth.userId,
              name: uniqueName(body.name || 'Ordinateur', (await prisma.scannerScreen.findMany({ where: { tenantId: req.auth.tenantId }, select: { name: true } })).map((x) => x.name)),
            },
          });
      return ok({ screen: { id: s.id, name: s.name }, lanAddresses: lanAddresses() });
    });

    screen.patch('/scanner/screens/:id', async (req: Req<{ name?: string }, unknown, { id: string }>) => {
      const s = await ownScreen(req, req.params.id);
      const body = z.object({ name }).parse(req.body ?? {});
      const u = await prisma.scannerScreen.update({ where: { id: s.id }, data: { name: body.name } });
      return ok({ screen: { id: u.id, name: u.name } });
    });

    screen.get('/scanner/screens', async (req) => ok({ screens: await screensOf(req.auth.tenantId) }));

    /** Long poll: events after `after`, waiting up to `wait` seconds (25 at most). Also marks the computer online. */
    screen.get('/scanner/screens/:id/events', async (req: Req<unknown, { after?: string; wait?: string; boot?: string }, { id: string }>) => {
      const s = await ownScreen(req, req.params.id);
      await prisma.scannerScreen.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } });
      const after = req.query.boot === BOOT ? Number(req.query.after ?? 0) || 0 : 0;
      const wait = Math.max(0, Math.min(WAIT_MS, (Number(req.query.wait ?? WAIT_MS / 1000) || 0) * 1000));
      const c = channel(s.id);
      const pending = () => c.events.filter((e) => e.seq > after && Date.now() - e.at < EVENT_MAX_AGE_MS);
      if (wait > 0 && !pending().length) {
        await new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timer);
            c.waiters.delete(done);
            resolve();
          };
          const timer = setTimeout(done, wait);
          c.waiters.add(done);
          req.raw.on('close', done);
        });
      }
      return ok({ events: pending().map(({ at, ...e }) => ({ ...e, at: new Date(at).toISOString() })), last: c.seq, boot: BOOT });
    });

    /** One-time QR code to authorize a new phone; its scans will go to `screenId`. The secret is returned once. */
    screen.post('/scanner/pairings', async (req: Req<{ screenId?: string }>) => {
      const body = z.object({ screenId: z.string().uuid().optional().nullable() }).parse(req.body ?? {});
      if (body.screenId) await ownScreen(req, body.screenId);
      const token = secret();
      const p = await prisma.scannerPairing.create({
        data: { tenantId: req.auth.tenantId, userId: req.auth.userId, screenId: body.screenId || null, tokenHash: sha256(token), expiresAt: new Date(Date.now() + PAIRING_TTL_MS) },
      });
      return ok({ pairing: { id: p.id, expiresAt: p.expiresAt.toISOString() }, token, lanAddresses: lanAddresses() });
    });

    screen.get('/scanner/pairings/:id', async (req: Req<unknown, unknown, { id: string }>) => {
      const p = await prisma.scannerPairing.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId, userId: req.auth.userId } });
      if (!p) throw notFound('Code d’appairage');
      const device = p.deviceId ? await prisma.scannerDevice.findUnique({ where: { id: p.deviceId } }) : null;
      return ok({ status: p.usedAt ? 'used' : p.expiresAt <= new Date() ? 'expired' : 'waiting', device: device ? deviceView(device) : null, expiresAt: p.expiresAt.toISOString() });
    });

    /** Authorized phones: all of the business for managers, one's own otherwise. */
    screen.get('/scanner/devices', async (req) => {
      const where = { tenantId: req.auth.tenantId, revokedAt: null, expiresAt: { gt: new Date() }, ...(isManager(req.auth.roles) ? {} : { userId: req.auth.userId }) };
      const [devices, screens, users] = await Promise.all([
        prisma.scannerDevice.findMany({ where, orderBy: { createdAt: 'asc' } }),
        screensOf(req.auth.tenantId),
        prisma.user.findMany({ where: { tenantId: req.auth.tenantId }, select: { id: true, firstName: true, lastName: true } }),
      ]);
      const userName = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
      return ok({ devices: devices.map((d) => ({ ...deviceView(d), authorizedBy: userName.get(d.userId) || null })), screens });
    });

    screen.patch('/scanner/devices/:id', async (req: Req<{ name?: string; screenId?: string | null }, unknown, { id: string }>) => {
      const d = await ownDevice(req, req.params.id);
      const body = z.object({ name: name.optional(), screenId: z.string().uuid().nullable().optional() }).parse(req.body ?? {});
      if (body.screenId) await ownScreen(req, body.screenId);
      const u = await prisma.scannerDevice.update({ where: { id: d.id }, data: { ...(body.name ? { name: body.name } : {}), ...(body.screenId !== undefined ? { screenId: body.screenId } : {}) } });
      return ok({ device: deviceView(u) });
    });

    /** Revoke: the phone loses access at once and has to be authorized again with a new QR code. */
    screen.delete('/scanner/devices/:id', async (req: Req<unknown, unknown, { id: string }>) => {
      const d = await ownDevice(req, req.params.id);
      await prisma.scannerDevice.update({ where: { id: d.id }, data: { revokedAt: new Date() } });
      if (d.screenId) publish(d.screenId, { kind: 'devices' });
      return ok({ revoked: true });
    });
  });

  // ── The phone ──
  /** Exchanges a one-time QR code for this phone's own long-lived secret (returned once). */
  app.post('/scanner/device/claim', async (req: Req<{ code?: string; name?: string; userAgent?: string }>) => {
    const body = z.object({ code: z.string().min(20).max(100), name: z.string().trim().max(40).optional(), userAgent: z.string().max(300).optional() }).parse(req.body ?? {});
    const p = await prisma.scannerPairing.findUnique({ where: { tokenHash: sha256(body.code) } });
    if (!p) throw new HttpError(400, 'Code d’appairage invalide', 'PAIRING_INVALID');
    if (p.usedAt) throw new HttpError(400, 'Ce QR code a déjà servi : affichez-en un nouveau', 'PAIRING_USED');
    if (p.expiresAt <= new Date()) throw new HttpError(400, 'Ce QR code a expiré : affichez-en un nouveau', 'PAIRING_EXPIRED');
    const user = await prisma.user.findUnique({ where: { id: p.userId } });
    if (!user || !user.isActive) throw new HttpError(400, 'Code d’appairage invalide', 'PAIRING_INVALID');
    const token = secret();
    const others = await prisma.scannerDevice.findMany({ where: { tenantId: p.tenantId, revokedAt: null }, select: { name: true } });
    const device = await prisma.$transaction(async (tx) => {
      // Single use, even with two phones scanning the same QR code at once.
      const claimed = await tx.scannerPairing.updateMany({ where: { id: p.id, usedAt: null }, data: { usedAt: new Date() } });
      if (!claimed.count) throw new HttpError(400, 'Ce QR code a déjà servi : affichez-en un nouveau', 'PAIRING_USED');
      const d = await tx.scannerDevice.create({
        data: {
          tenantId: p.tenantId,
          userId: p.userId,
          name: uniqueName(body.name || 'Téléphone', others.map((o) => o.name)),
          tokenHash: sha256(token),
          screenId: p.screenId,
          userAgent: body.userAgent ?? (typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 300) : null),
          lastSeenAt: new Date(),
          expiresAt: new Date(Date.now() + DEVICE_TTL_MS),
        },
      });
      await tx.scannerPairing.update({ where: { id: p.id }, data: { deviceId: d.id } });
      return d;
    });
    if (p.screenId) publish(p.screenId, { kind: 'devices' });
    return ok({ token, device: deviceView(device) });
  });

  app.get('/scanner/device/session', async (req) => {
    const { device, user } = await phoneDevice(req);
    const d = await touch(device.id);
    const [tenant, store, screens] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: d.tenantId }, select: { name: true } }),
      user.currentStoreId ? prisma.store.findUnique({ where: { id: user.currentStoreId }, select: { name: true } }) : null,
      screensOf(d.tenantId),
    ]);
    return ok({ device: deviceView(d), business: tenant?.name ?? '', store: store?.name ?? null, screens });
  });

  /** The phone chooses where its scans go (a computer of this business, or none) and may rename itself. */
  app.patch('/scanner/device', async (req: Req<{ screenId?: string | null; name?: string }>) => {
    const { device } = await phoneDevice(req);
    const body = z.object({ screenId: z.string().uuid().nullable().optional(), name: name.optional() }).parse(req.body ?? {});
    if (body.screenId && !(await prisma.scannerScreen.findFirst({ where: { id: body.screenId, tenantId: device.tenantId } }))) throw notFound('Ordinateur');
    const d = await touch(device.id, { ...(body.screenId !== undefined ? { screenId: body.screenId } : {}), ...(body.name ? { name: body.name } : {}) });
    return ok({ device: deviceView(d) });
  });

  /** One scan: what CaissePro knows about it, and (unless lookup only) the code sent to this phone's computer. */
  app.post('/scanner/device/scan', async (req) => {
    const { device } = await phoneDevice(req);
    const body = z.object({ code: z.string().trim(), send: z.boolean().optional().default(true) }).parse(req.body);
    if (!CODE.test(body.code)) throw badRequest('Code invalide');
    const now = Date.now();
    const recent = (recentScans.get(device.id) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= MAX_SCANS_PER_MINUTE) throw new HttpError(429, 'Trop de scans, patientez un instant');
    recentScans.set(device.id, [...recent, now]);
    const result = phoneView(await lookupCode(device.tenantId, body.code));
    await touch(device.id, { scanCount: { increment: 1 } });
    // Sent only to a computer that is connected now; otherwise the phone says so (nothing is queued for later).
    const target = body.send && device.screenId ? await prisma.scannerScreen.findUnique({ where: { id: device.screenId } }) : null;
    const sent = !!target && online(target);
    if (sent) publish(target!.id, { kind: 'scan', code: body.code, deviceId: device.id, deviceName: device.name });
    return ok({ result, sent, target: target ? { id: target.id, name: target.name, online: online(target) } : null });
  });

  /** "Forget this phone" on the phone itself: its secret stops working. */
  app.post('/scanner/device/disconnect', async (req) => {
    const { device } = await phoneDevice(req);
    await prisma.scannerDevice.update({ where: { id: device.id }, data: { revokedAt: new Date() } });
    if (device.screenId) publish(device.screenId, { kind: 'devices' });
    return ok({ revoked: true });
  });
}
