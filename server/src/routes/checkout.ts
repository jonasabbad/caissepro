import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { serialize } from '../lib/serialize.js';
import { authed, ok, type Req } from '../lib/route.js';
import { checkoutSchema, createSale, previewCart, processReturn, returnSchema, tradeInDeviceSchema, type CheckoutInput } from '../lib/sales.js';
import { loadTransaction } from './transactions.js';

const tradeInCheckoutSchema = checkoutSchema.extend({ tradeInDevices: z.array(tradeInDeviceSchema).min(1) });

export default async function checkoutRoutes(app: FastifyInstance) {
  authed(app);

  app.post('/checkout/preview', async (req: Req<CheckoutInput>) => ok({ preview: serialize(await previewCart(req.auth, checkoutSchema.parse(req.body))) }));

  /** Cash sales tell the browser to open the cash drawer (x-cash-drawer header). */
  app.post('/checkout', async (req: Req<CheckoutInput>, reply) => {
    const { transaction, cashIn } = await createSale(req.auth, checkoutSchema.parse(req.body));
    if (cashIn > 0) reply.header('x-cash-drawer', 'open');
    return ok({ transaction: await loadTransaction(req.auth.tenantId, transaction.id) });
  });

  app.post('/checkout/trade-in', async (req: Req<z.infer<typeof tradeInCheckoutSchema>>, reply) => {
    const body = tradeInCheckoutSchema.parse(req.body);
    const { tradeInDevices, ...sale } = body;
    const { transaction, cashIn } = await createSale(req.auth, { ...sale, type: 'exchange' }, { tradeInDevices });
    if (cashIn > 0) reply.header('x-cash-drawer', 'open');
    const tradeInUnits = await prisma.soldUnit.findMany({ where: { tradeInTransactionId: transaction.id } });
    return ok({ transaction: await loadTransaction(req.auth.tenantId, transaction.id), tradeInUnits: serialize(tradeInUnits) });
  });

  app.post('/checkout/return', async (req: Req<z.infer<typeof returnSchema>>, reply) => {
    const transaction = await processReturn(req.auth, returnSchema.parse(req.body));
    reply.header('x-cash-drawer', 'open');
    return ok({ transaction: await loadTransaction(req.auth.tenantId, transaction.id) });
  });
}
