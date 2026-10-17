import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { authed, ok } from '../lib/route.js';
import { parseJson } from '../lib/serialize.js';
import { getTenant, resolveStoreId, tenantSettings } from '../lib/tenant.js';

export default async function settingsRoutes(app: FastifyInstance) {
  authed(app);

  app.get('/settings/tenant', async (req) => {
    const tenant = await getTenant(req.auth.tenantId);
    const storeId = await resolveStoreId(tenant.id, req.auth.storeId);
    const store = storeId ? await prisma.store.findUnique({ where: { id: storeId } }) : null;
    return ok({
      settings: { ...tenantSettings(tenant), businessInfo: parseJson(tenant.businessInfo, {}), printingSettings: parseJson(tenant.printing, {}) },
      tenantName: tenant.name,
      storeName: store?.name ?? tenant.name,
      storeAddress: store?.address ?? null,
      storeCity: store?.city ?? null,
      storePhone: store?.phone ?? null,
      legalStatus: tenant.legalStatus,
      applyTva: tenant.applyTva,
      activityType: tenant.activityType,
    });
  });
}
