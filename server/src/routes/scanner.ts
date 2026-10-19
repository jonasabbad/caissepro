import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { badRequest, HttpError, notFound, unauthorized } from '../lib/errors.js';
import { authenticate } from '../lib/auth.js';
import { ok, type Req } from '../lib/route.js';
import { CODE, lookupCode } from './scan.js';

/**
 * Phone as a barcode scanner. A signed-in screen (POS, products…) creates a pairing and shows its link as a QR code;
 * the phone opens the link and scans. The phone never signs in: it holds a random token (only its hash is stored)
 * that allows exactly two things: looking a code up (names, selling prices and stock, never costs) and sending the
 * code to the screen that paired it, which handles it as if it had been scanned there. The token expires after
 * 12 hours, and a new QR code on that screen or Disconnect (on either side) revokes it.
 */

const TTL_MS = 12 * 3600_000;
const WAIT_MS = 25_000;
const MAX_SCANS_PER_MINUTE = 60;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

// Scans waiting for the paired screen (in memory: a scan is only useful to a screen that is open now).
interface ScanEvent { seq: number; code: string; at: string }
interface Channel { events: ScanEvent[]; seq: number; waiters: Set<() => void>; recent: number[] }
const channels = new Map<string, Channel>();
// Changes when the server restarts (queues start again at 1): a screen sending another value starts from 0.
const BOOT = randomBytes(6).toString('hex');
const channel = (id: string) => {
  let c = channels.get(id);
  if (!c) channels.set(id, (c = { events: [], seq: 0, waiters: new Set(), recent: [] }));
  return c;
};
function publish(id: string, code: string) {
  const c = channel(id);
  c.events.push({ seq: ++c.seq, code, at: new Date().toISOString() });
  if (c.events.length > 50) c.events.splice(0, c.events.length - 50);
  for (const w of c.waiters) w();
}
function wake(id: string) {
  for (const w of channels.get(id)?.waiters ?? []) w();
}

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

const isLive = (p: { revokedAt: Date | null; expiresAt: Date }) => !p.revokedAt && p.expiresAt > new Date();

/** The phone's token → its live pairing (and the user who created it, still active). */
async function phonePairing(req: FastifyRequest) {
  const token = req.headers['x-scanner-token'];
  if (typeof token !== 'string' || token.length < 20) throw unauthorized('Lien de scanner invalide ou expiré');
  const pairing = await prisma.scannerPairing.findUnique({ where: { tokenHash: sha256(token) } });
  if (!pairing || !isLive(pairing)) throw unauthorized('Lien de scanner invalide ou expiré');
  const user = await prisma.user.findUnique({ where: { id: pairing.userId } });
  if (!user || !user.isActive || user.tenantId !== pairing.tenantId) throw unauthorized('Lien de scanner invalide ou expiré');
  return { pairing, user };
}

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

export default async function scannerRoutes(app: FastifyInstance) {
  // ── The signed-in screen ──
  await app.register(async (screen) => {
    screen.addHook('preHandler', authenticate);

    const own = async (req: Req<unknown, unknown, { id: string }>) => {
      const p = await prisma.scannerPairing.findFirst({ where: { id: req.params.id, userId: req.auth.userId, tenantId: req.auth.tenantId } });
      if (!p) throw notFound('Appairage');
      return p;
    };
    const view = (p: { id: string; expiresAt: Date; revokedAt: Date | null; lastSeenAt: Date | null; scanCount: number }) => ({
      id: p.id,
      expiresAt: p.expiresAt.toISOString(),
      active: isLive(p),
      lastSeenAt: p.lastSeenAt?.toISOString() ?? null,
      scanCount: p.scanCount,
    });

    /**
     * New pairing for this screen. `replaces`: this screen's previous pairing ("New QR code"), whose link stops
     * working; other screens of the same user keep theirs. The token is returned once, for the QR code.
     */
    screen.post('/scanner/pairings', async (req: Req<{ replaces?: string }>) => {
      const replaces = z.object({ replaces: z.string().uuid().optional().nullable() }).parse(req.body ?? {}).replaces;
      if (replaces) {
        await prisma.scannerPairing.updateMany({ where: { id: replaces, userId: req.auth.userId, revokedAt: null }, data: { revokedAt: new Date() } });
        wake(replaces);
      }
      const token = randomBytes(32).toString('base64url');
      const p = await prisma.scannerPairing.create({
        data: { tenantId: req.auth.tenantId, userId: req.auth.userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + TTL_MS) },
      });
      return ok({ pairing: view(p), token, lanAddresses: lanAddresses() });
    });

    screen.get('/scanner/pairings/:id', async (req: Req<unknown, unknown, { id: string }>) => ok({ pairing: view(await own(req)) }));

    screen.delete('/scanner/pairings/:id', async (req: Req<unknown, unknown, { id: string }>) => {
      const p = await own(req);
      if (!p.revokedAt) await prisma.scannerPairing.update({ where: { id: p.id }, data: { revokedAt: new Date() } });
      wake(p.id);
      channels.delete(p.id);
      return ok({ revoked: true });
    });

    /** Long poll: scans after `after`, waiting up to `wait` seconds (25 at most) for the next one. */
    screen.get('/scanner/pairings/:id/events', async (req: Req<unknown, { after?: string; wait?: string; boot?: string }, { id: string }>) => {
      const p = await own(req);
      const after = req.query.boot === BOOT ? Number(req.query.after ?? 0) || 0 : 0;
      const wait = Math.max(0, Math.min(WAIT_MS, (Number(req.query.wait ?? WAIT_MS / 1000) || 0) * 1000));
      const c = channel(p.id);
      const pending = () => c.events.filter((e) => e.seq > after);
      if (isLive(p) && wait > 0 && !pending().length) {
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
      const fresh = await prisma.scannerPairing.findUnique({ where: { id: p.id } });
      return ok({ events: pending(), last: c.seq, boot: BOOT, pairing: view(fresh ?? p) });
    });
  });

  // ── The phone (token only) ──
  app.get('/scanner/phone/session', async (req) => {
    const { pairing, user } = await phonePairing(req);
    await prisma.scannerPairing.update({ where: { id: pairing.id }, data: { lastSeenAt: new Date() } });
    const [tenant, store] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: pairing.tenantId }, select: { name: true } }),
      user.currentStoreId ? prisma.store.findUnique({ where: { id: user.currentStoreId }, select: { name: true } }) : null,
    ]);
    wake(pairing.id);
    return ok({ business: tenant?.name ?? '', store: store?.name ?? null, pairedBy: user.firstName || null, expiresAt: pairing.expiresAt.toISOString() });
  });

  /** One scan: what CaissePro knows about it, and (unless lookup only) the code sent to the paired screen. */
  app.post('/scanner/phone/scan', async (req) => {
    const { pairing } = await phonePairing(req);
    const body = z.object({ code: z.string().trim(), send: z.boolean().optional().default(true) }).parse(req.body);
    if (!CODE.test(body.code)) throw badRequest('Code invalide');
    const c = channel(pairing.id);
    const now = Date.now();
    c.recent = c.recent.filter((t) => now - t < 60_000);
    if (c.recent.length >= MAX_SCANS_PER_MINUTE) throw new HttpError(429, 'Trop de scans, patientez un instant');
    c.recent.push(now);
    const result = phoneView(await lookupCode(pairing.tenantId, body.code));
    await prisma.scannerPairing.update({ where: { id: pairing.id }, data: { lastSeenAt: new Date(), scanCount: { increment: 1 } } });
    if (body.send) publish(pairing.id, body.code);
    return ok({ result, sent: body.send });
  });

  /** "Disconnect" on the phone: the link stops working. */
  app.post('/scanner/phone/disconnect', async (req) => {
    const { pairing } = await phonePairing(req);
    await prisma.scannerPairing.update({ where: { id: pairing.id }, data: { revokedAt: new Date() } });
    wake(pairing.id);
    return ok({ revoked: true });
  });
}
