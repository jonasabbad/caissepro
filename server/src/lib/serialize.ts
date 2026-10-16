import { Prisma } from '@prisma/client';

// Columns stored as JSON text, decoded on the way out.
const JSON_FIELDS = new Set([
  'variants',
  'extra',
  'roles',
  'enabledModules',
  'settings',
  'businessInfo',
  'printing',
  'payments',
  'allocations',
  'unitDetails',
  'config',
  'features',
  'limits',
  'data',
]);

// Never leave the server.
const HIDDEN_FIELDS = new Set(['passwordHash', 'tokenHash']);

/**
 * Converts Prisma results to the wire format:
 * Decimal -> "12.50", Date -> ISO string, JSON text columns -> parsed values.
 */
export function serialize<T = any>(value: unknown): T {
  return walk(value, '') as T;
}

function walk(v: unknown, key: string): unknown {
  if (v === null || v === undefined) return v ?? null;
  if (Prisma.Decimal.isDecimal(v)) return (v as Prisma.Decimal).toFixed(2);
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map((x) => walk(x, ''));
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (HIDDEN_FIELDS.has(k)) continue;
      if (JSON_FIELDS.has(k) && typeof val === 'string') {
        out[k] = parseJson(val);
      } else {
        out[k] = walk(val, k);
      }
    }
    return out;
  }
  return v;
}

export function parseJson<T = any>(s: string | null | undefined, fallback: T = null as T): T {
  if (s == null || s === '') return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export const toJson = (v: unknown): string | null => (v === undefined || v === null ? null : JSON.stringify(v));

export const num = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return 0;
  if (Prisma.Decimal.isDecimal(v)) return (v as Prisma.Decimal).toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Round to cents. */
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const dec = (n: number | string) => new Prisma.Decimal(typeof n === 'number' ? r2(n) : n);
