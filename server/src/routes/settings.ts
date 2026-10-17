import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { badRequest, notFound } from '../lib/errors.js';
import { authed, ok, type Req } from '../lib/route.js';
import { parseJson, serialize } from '../lib/serialize.js';
import { getTenant, resolveStoreId, tenantSettings } from '../lib/tenant.js';
import { hashPassword, isManager, verifyPassword } from '../lib/auth.js';
import { forbidden } from '../lib/errors.js';
import { buildProfile } from './auth.js';

const opt = z.string().trim().optional().nullable();
const businessInfoSchema = z
  .object({
    ice: opt,
    rc: opt,
    patente: opt,
    identifiantFiscal: opt,
    taxeProfessionnelle: opt,
    cnss: opt,
    cnie: opt,
    bankName: opt,
    accountHolder: opt,
    accountNumber: opt,
    rib: z
      .string()
      .trim()
      .optional()
      .nullable()
      .refine((v) => !v || /^\d{24}$/.test(v.replace(/\s/g, '')), 'Le RIB doit contenir 24 chiffres'),
    invoicePrefix: z.string().trim().max(10).optional(),
    invoiceYearFormat: z.enum(['YYYY', 'YY', '']).optional(),
    invoiceSeparator: z.string().max(3).optional(),
    invoiceDigits: z.coerce.number().int().min(1).max(8).optional(),
    nextInvoiceNumber: z.coerce.number().int().min(1).optional(),
    phone: opt,
    address: opt,
  })
  .partial();
const LEGAL_STATUSES = ['auto_entrepreneur', 'entreprise_individuelle', 'sarl', 'sarlau', 'sa', 'sas', 'snc', 'cooperative', 'association'] as const;

export default async function settingsRoutes(app: FastifyInstance) {
  authed(app);
  const managersOnly = (req: Req) => {
    if (!isManager(req.auth.roles)) throw forbidden();
  };
  const mergeJson = (current: string | null | undefined, patch: Record<string, unknown>) => {
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    return JSON.stringify({ ...parseJson<Record<string, unknown>>(current, {}), ...clean });
  };

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

  app.get('/settings/team', async (req) => {
    const users = await prisma.user.findMany({
      where: { tenantId: req.auth.tenantId },
      select: { id: true, email: true, firstName: true, lastName: true, roles: true, isActive: true, currentStoreId: true, lastLoginAt: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    return ok({ users: serialize(users) });
  });

  /** Fiscal identifiers, bank details and invoice numbering (stored with the tenant's business info). */
  app.patch('/settings/business-info', async (req: Req<z.infer<typeof businessInfoSchema>>) => {
    managersOnly(req);
    const body = businessInfoSchema.parse(req.body ?? {});
    if (body.rib) body.rib = body.rib.replace(/\s/g, '');
    const tenant = await getTenant(req.auth.tenantId);
    const t = await prisma.tenant.update({ where: { id: tenant.id }, data: { businessInfo: mergeJson(tenant.businessInfo, body) } });
    return ok({ businessInfo: parseJson(t.businessInfo, {}) });
  });

  /**
   * Legal status decides the tax regime: auto-entrepreneurs are outside the scope of TVA and pay a flat income tax
   * (flatTaxRate % of turnover); other statuses invoice with TVA.
   */
  app.patch('/settings/legal-status', async (req: Req<{ legalStatus: string; flatTaxRate?: number }>) => {
    managersOnly(req);
    const body = z
      .object({ legalStatus: z.enum(LEGAL_STATUSES), flatTaxRate: z.coerce.number().min(0).max(30).optional() })
      .parse(req.body ?? {});
    const tenant = await getTenant(req.auth.tenantId);
    const ae = body.legalStatus === 'auto_entrepreneur';
    const t = await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        legalStatus: body.legalStatus,
        applyTva: !ae,
        businessInfo: mergeJson(tenant.businessInfo, ae ? { flatTaxRate: body.flatTaxRate ?? 1 } : {}),
      },
    });
    return ok({ legalStatus: t.legalStatus, applyTva: t.applyTva });
  });

  app.patch('/settings/preferences', async (req: Req<Record<string, unknown>>) => {
    managersOnly(req);
    const body = z
      .object({
        locale: z.enum(['fr', 'en', 'ar', 'fr_MA', 'en_GB', 'ar_MA']).optional(),
        taxRate: z.coerce.number().min(0).max(100).optional(),
        currency: z.string().optional(),
        timezone: z.string().optional(),
        lowStockThreshold: z.coerce.number().int().min(0).optional(),
        defaultPaymentMethods: z.array(z.string()).optional(),
      })
      .parse(req.body ?? {});
    const tenant = await getTenant(req.auth.tenantId);
    const t = await prisma.tenant.update({ where: { id: tenant.id }, data: { settings: mergeJson(tenant.settings, body) } });
    return ok({ settings: tenantSettings(t) });
  });

  app.patch('/settings/printing', async (req: Req<Record<string, unknown>>) => {
    managersOnly(req);
    const body = z
      .object({
        shortenBrandNames: z.boolean().optional(),
        showBrand: z.boolean().optional(),
        simplifyBrand: z.boolean().optional(),
        autoPrintReceipt: z.boolean().optional(),
        brandAbbreviations: z.record(z.string(), z.string()).optional(),
      })
      .parse(req.body ?? {});
    const tenant = await getTenant(req.auth.tenantId);
    const t = await prisma.tenant.update({ where: { id: tenant.id }, data: { printing: mergeJson(tenant.printing, body) } });
    return ok({ printingSettings: parseJson(t.printing, {}) });
  });

  app.patch('/settings/profile', async (req: Req<{ firstName?: string; lastName?: string; locale?: string }>) => {
    const body = z
      .object({ firstName: z.string().trim().min(1).optional(), lastName: z.string().trim().optional(), locale: z.enum(['fr', 'en', 'ar']).optional() })
      .parse(req.body ?? {});
    await prisma.user.update({ where: { id: req.auth.userId }, data: body });
    return ok({ user: await buildProfile(req.auth.userId) });
  });

  app.patch('/settings/store', async (req: Req<{ name?: string; address?: string; city?: string; phone?: string }>) => {
    managersOnly(req);
    const body = z
      .object({ name: z.string().trim().min(1, 'Le nom du magasin est obligatoire').optional(), address: opt, city: opt, phone: opt })
      .parse(req.body ?? {});
    const storeId = await resolveStoreId(req.auth.tenantId, req.auth.storeId);
    if (!storeId) throw notFound('Store', 'current');
    const store = await prisma.store.update({ where: { id: storeId }, data: body });
    return ok({ store: serialize(store) });
  });

  app.post('/settings/change-password', async (req: Req<{ currentPassword: string; newPassword: string }>) => {
    const body = z
      .object({ currentPassword: z.string().min(1), newPassword: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères') })
      .parse(req.body ?? {});
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth.userId } });
    if (!(await verifyPassword(body.currentPassword, user.passwordHash))) throw badRequest('Mot de passe actuel incorrect');
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.newPassword) } });
    return ok({ changed: true });
  });
}
