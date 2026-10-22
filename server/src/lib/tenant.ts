import { prisma } from './prisma.js';
import { parseJson } from './serialize.js';
import { notFound } from './errors.js';

export interface TenantSettings {
  locale: string;
  taxRate: number;
  currency: string;
  timezone: string;
  lowStockThreshold: number;
  defaultPaymentMethods: string[];
  /** CaissePro Scanner shows the cost (purchase price) next to the selling price. Off: phones never receive it. */
  scannerShowCost: boolean;
}

export const DEFAULT_TENANT_SETTINGS: TenantSettings = {
  locale: 'fr_MA',
  taxRate: 20,
  currency: 'MAD',
  timezone: 'Africa/Casablanca',
  lowStockThreshold: 5,
  defaultPaymentMethods: ['cash', 'card'],
  scannerShowCost: false,
};

export async function getTenant(tenantId: string) {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!t) throw notFound('Tenant', tenantId);
  return t;
}

export function tenantSettings(t: { settings: string }): TenantSettings {
  return { ...DEFAULT_TENANT_SETTINGS, ...parseJson<Partial<TenantSettings>>(t.settings, {}) };
}

/** The store a request acts on: the user's current store, else the tenant's main store. */
export async function resolveStoreId(tenantId: string, preferred: string | null | undefined) {
  if (preferred) {
    const s = await prisma.store.findFirst({ where: { id: preferred, tenantId } });
    if (s) return s.id;
  }
  const main =
    (await prisma.store.findFirst({ where: { tenantId, isMain: true } })) ??
    (await prisma.store.findFirst({ where: { tenantId }, orderBy: { createdAt: 'asc' } }));
  return main?.id ?? null;
}
