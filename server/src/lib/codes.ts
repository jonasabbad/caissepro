import { randomBytes, randomInt } from 'node:crypto';
import { prisma, type Prisma } from './prisma.js';

type Db = Prisma.TransactionClient | typeof prisma;

/** EAN-13 check digit for the first 12 digits. */
export function ean13CheckDigit(first12: string) {
  const sum = [...first12].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return String((10 - (sum % 10)) % 10);
}

export const isEan13 = (code: string) => /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === code[12];

/**
 * A new product barcode: EAN-13 in the 20–29 "in-store" range (here 20…), which retailers use for their own
 * articles, so it never collides with a manufacturer code. Unique per tenant (also enforced by the database).
 */
export async function generateProductBarcode(db: Db, tenantId: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const body = `20${String(randomInt(0, 10 ** 10)).padStart(10, '0')}`;
    const code = body + ean13CheckDigit(body);
    const clash = await db.product.findFirst({ where: { tenantId, barcode: code }, select: { id: true } });
    if (!clash) return code;
  }
  throw new Error('Could not generate a unique barcode');
}

/** Unguessable token for the public repair-tracking link (22 base64url characters, 128 bits). */
export const newTrackingToken = () => randomBytes(16).toString('base64url');

/**
 * Brings existing data up to the current rules: every product gets a barcode and every repair a tracking token.
 * Idempotent; run at server start.
 */
export async function backfillCodes() {
  const products = await prisma.product.findMany({ where: { OR: [{ barcode: null }, { barcode: '' }] }, select: { id: true, tenantId: true } });
  for (const p of products) {
    await prisma.product.update({ where: { id: p.id }, data: { barcode: await generateProductBarcode(prisma, p.tenantId) } });
  }
  const repairs = await prisma.repair.findMany({ where: { trackingToken: null }, select: { id: true } });
  for (const r of repairs) await prisma.repair.update({ where: { id: r.id }, data: { trackingToken: newTrackingToken() } });
  return { products: products.length, repairs: repairs.length };
}
