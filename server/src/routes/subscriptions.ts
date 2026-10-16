import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { badRequest, notFound } from '../lib/errors.js';
import { num, parseJson, r2, serialize } from '../lib/serialize.js';
import { authed, ok, type Req } from '../lib/route.js';
import { getTenant } from '../lib/tenant.js';

export async function platformSettings() {
  return (
    (await prisma.platformSettings.findUnique({ where: { id: 'platform' } })) ??
    (await prisma.platformSettings.create({ data: { id: 'platform' } }))
  );
}

interface CustomPricing {
  discountPercent?: number;
  monthlyPrice?: number;
  yearlyPrice?: number;
}

/** Plan with the tenant's negotiated pricing applied. */
function withPricing(plan: any, pricing: CustomPricing | null) {
  const discount = pricing?.discountPercent ?? 0;
  const monthly = pricing?.monthlyPrice ?? num(plan.monthlyPrice) * (1 - discount / 100);
  const yearly = pricing?.yearlyPrice ?? num(plan.yearlyPrice ?? num(plan.monthlyPrice) * 10) * (1 - discount / 100);
  return {
    ...serialize(plan),
    effectiveMonthlyPrice: r2(monthly).toFixed(2),
    effectiveYearlyPrice: r2(yearly).toFixed(2),
    discountPercent: discount,
  };
}

export async function tenantUsage(tenantId: string) {
  const [users, stores, products, stockUnits] = await Promise.all([
    prisma.user.count({ where: { tenantId, isActive: true } }),
    prisma.store.count({ where: { tenantId } }),
    prisma.product.count({ where: { tenantId, status: { not: 'archived' } } }),
    prisma.soldUnit.count({ where: { tenantId, soldAt: null } }),
  ]);
  return { users, stores, products, stockUnits };
}

export async function tenantLimits(tenantId: string) {
  const tenant = await getTenant(tenantId);
  const plan = tenant.plan ? await prisma.subscriptionPlan.findUnique({ where: { code: tenant.plan } }) : null;
  return {
    maxUsers: plan?.maxUsers ?? null,
    maxStores: plan?.maxStores ?? null,
    maxProducts: plan?.maxProducts ?? null,
    maxStockUnits: plan?.maxStockUnits ?? null,
  };
}

export default async function subscriptionRoutes(app: FastifyInstance) {
  authed(app);

  app.get('/subscriptions/status', async (req) => {
    const tenant = await getTenant(req.auth.tenantId);
    const settings = await platformSettings();
    const firstPlan = await prisma.subscriptionPlan.findFirst({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
    return ok({
      subscription: {
        status: tenant.status,
        plan: tenant.plan,
        expiresAt: tenant.subscriptionExpiresAt?.toISOString() ?? null,
        customPricing: parseJson(tenant.customPricing, null),
        autoRenew: tenant.autoRenew,
        platformSettings: {
          paymentGatewayEnabled: settings.paymentGatewayEnabled,
          rib: settings.rib,
          bankName: settings.bankName,
          accountHolderName: settings.accountHolderName,
          firstPlanMonthlyPrice: firstPlan ? num(firstPlan.monthlyPrice).toFixed(2) : '0.00',
        },
      },
    });
  });

  app.get('/subscriptions/usage', async (req) =>
    ok({ usage: await tenantUsage(req.auth.tenantId), limits: await tenantLimits(req.auth.tenantId) }),
  );

  app.get('/subscriptions/plans', async (req) => {
    const tenant = await getTenant(req.auth.tenantId);
    const pricing = parseJson<CustomPricing | null>(tenant.customPricing, null);
    const plans = await prisma.subscriptionPlan.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
    return ok({ plans: plans.map((p) => withPricing(p, pricing)) });
  });

  app.get('/subscriptions/calculate-price', async (req: Req<unknown, { planId?: string; months?: string; isYearly?: string }>) => {
    const tenant = await getTenant(req.auth.tenantId);
    const plan = await prisma.subscriptionPlan.findFirst({
      where: { OR: [{ id: req.query.planId ?? '' }, { code: req.query.planId ?? '' }] },
    });
    if (!plan) throw notFound('Plan', req.query.planId);
    const priced = withPricing(plan, parseJson<CustomPricing | null>(tenant.customPricing, null));
    const isYearly = req.query.isYearly === 'true';
    const months = isYearly ? 12 : Math.max(1, parseInt(req.query.months ?? '1', 10) || 1);
    const baseAmount = isYearly ? num(plan.yearlyPrice ?? num(plan.monthlyPrice) * 10) : num(plan.monthlyPrice) * months;
    const total = isYearly ? num(priced.effectiveYearlyPrice) : num(priced.effectiveMonthlyPrice) * months;
    return ok({
      calculation: {
        planId: plan.id,
        planName: plan.name,
        months,
        isYearly,
        baseAmount: r2(baseAmount),
        discountPercent: priced.discountPercent,
        discountAmount: r2(baseAmount - total),
        totalAmount: r2(total),
      },
    });
  });

  app.get('/subscriptions/payments', async (req) => {
    const payments = await prisma.subscriptionPayment.findMany({
      where: { tenantId: req.auth.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return ok({ payments: serialize(payments) });
  });

  app.get('/subscriptions/payments/:id/verify', async (req: Req<unknown, unknown, { id: string }>) => {
    const payment = await prisma.subscriptionPayment.findFirst({ where: { id: req.params.id, tenantId: req.auth.tenantId } });
    if (!payment) throw notFound('Payment', req.params.id);
    return ok({ payment: serialize(payment) });
  });

  // Online card payment needs a payment-gateway contract; without one, renewals go through bank transfer.
  app.post('/subscriptions/payment-token', async () => {
    const settings = await platformSettings();
    if (!settings.paymentGatewayEnabled) throw badRequest('Le paiement en ligne est désactivé. Utilisez le virement bancaire.');
    throw badRequest("Aucune passerelle de paiement n'est configurée sur ce serveur.");
  });

  app.post('/subscriptions/lifetime-payment', async (req: Req<{ amount?: number }>) => {
    const { amount } = z.object({ amount: z.coerce.number().positive() }).parse(req.body);
    const payment = await prisma.subscriptionPayment.create({
      data: { tenantId: req.auth.tenantId, planCode: 'lifetime', months: 0, amount, method: 'bank_transfer', status: 'pending' },
    });
    return ok({ payment: serialize(payment) });
  });
}
