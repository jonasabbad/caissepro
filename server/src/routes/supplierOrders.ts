import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { moveCaisse } from '../lib/caisse.js';
import { prisma, Prisma, type Tx } from '../lib/prisma.js';
import { badRequest, notFound } from '../lib/errors.js';
import { num, parseJson, r2, serialize } from '../lib/serialize.js';
import { authed, ok, type Req } from '../lib/route.js';
import { qStr } from '../lib/pagination.js';
import { makeRef } from '../lib/refs.js';
import { moveStock } from '../lib/stock.js';
import { resolveStoreId } from '../lib/tenant.js';
import { createUnit } from './soldUnits.js';

interface UnitDetail {
  imei?: string;
  serialNumber?: string;
  batteryHealth?: number;
  chargeCycles?: number;
  condition?: string;
  storage?: string;
  color?: string;
  purchasePrice?: number;
  salePrice?: number;
  notes?: string;
  addedToInventory?: boolean;
  soldUnitId?: string;
}

interface OrderPayment {
  id: string;
  amount: number;
  note?: string;
  userId?: string;
  userName?: string;
  createdAt: string;
}

const itemSchema = z.object({
  itemType: z.enum(['product', 'unit']).default('product'),
  productId: z.string().optional().nullable(),
  productName: z.string().trim().min(1),
  sku: z.string().optional().nullable(),
  quantityOrdered: z.coerce.number().int().min(1),
  unitCost: z.coerce.number().min(0),
  deviceType: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  defaultSalePrice: z.coerce.number().min(0).optional().nullable(),
});

const orderSchema = z.object({
  supplierId: z.string().min(1, 'Le fournisseur est obligatoire'),
  items: z.array(itemSchema).min(1, 'Ajoutez au moins un article'),
  notes: z.string().optional().nullable(),
});

const include = { items: true } as const;

async function loadOrder(tenantId: string, id: string, tx: Tx | typeof prisma = prisma) {
  const order = await tx.supplierOrder.findFirst({ where: { id, tenantId }, include });
  if (!order) throw notFound('Supplier order', id);
  return order;
}

async function present(order: Awaited<ReturnType<typeof loadOrder>>) {
  const supplier = await prisma.supplier.findUnique({ where: { id: order.supplierId }, select: { id: true, name: true, phone: true } });
  return serialize({ ...order, supplier, payments: parseJson<OrderPayment[]>(order.payments, []) });
}

/** received when every product line is fully received and every device has been added to stock. */
async function refreshStatus(tx: Tx, orderId: string) {
  const order = await tx.supplierOrder.findUniqueOrThrow({ where: { id: orderId }, include });
  if (order.status === 'draft' || order.status === 'cancelled') return;
  const done = order.items.every((i) => i.quantityReceived >= i.quantityOrdered);
  const any = order.items.some((i) => i.quantityReceived > 0);
  await tx.supplierOrder.update({
    where: { id: orderId },
    data: { status: done ? 'received' : any ? 'partial' : 'pending', receivedAt: done ? (order.receivedAt ?? new Date()) : null },
  });
}

async function applyPayment(tx: Tx, orderId: string, amount: number, user: { id: string; name: string }, note?: string) {
  const order = await tx.supplierOrder.findUniqueOrThrow({ where: { id: orderId } });
  const remaining = num(order.amountRemaining);
  const pay = r2(Math.min(amount, remaining));
  if (pay <= 0) return;
  const payments = parseJson<OrderPayment[]>(order.payments, []);
  payments.push({ id: randomUUID(), amount: pay, note, userId: user.id, userName: user.name, createdAt: new Date().toISOString() });
  await tx.supplierOrder.update({
    where: { id: orderId },
    data: { amountPaid: r2(num(order.amountPaid) + pay), amountRemaining: r2(remaining - pay), payments: JSON.stringify(payments) },
  });
  // Supplier payments are paid from the drawer (observed: cash_out "Paiement fournisseur - PO-…").
  await moveCaisse(tx, { tenantId: order.tenantId, storeId: order.storeId, delta: -pay, type: 'cash_out', reason: `Paiement fournisseur - ${order.orderNumber}`, userId: user.id });
}

const userName = (req: Req) => {
  const u = (req as any).user;
  return `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim();
};

export default async function supplierOrderRoutes(app: FastifyInstance) {
  authed(app);

  app.get('/supplier-orders', async (req: Req<unknown, Record<string, string>>) => {
    const query = qStr(req.query.query);
    const where: Prisma.SupplierOrderWhereInput = {
      tenantId: req.auth.tenantId,
      ...(qStr(req.query.status) ? { status: req.query.status } : {}),
      ...(qStr(req.query.supplierId) ? { supplierId: req.query.supplierId } : {}),
    };
    if (query) {
      const suppliers = await prisma.supplier.findMany({ where: { tenantId: req.auth.tenantId, name: { contains: query } }, select: { id: true } });
      where.OR = [{ orderNumber: { contains: query } }, { supplierId: { in: suppliers.map((s) => s.id) } }, { items: { some: { productName: { contains: query } } } }];
    }
    const orders = await prisma.supplierOrder.findMany({ where, include, orderBy: { createdAt: 'desc' } });
    return ok({ orders: await Promise.all(orders.map(present)) });
  });

  app.get('/supplier-orders/:id', async (req: Req<unknown, unknown, { id: string }>) =>
    ok({ order: await present(await loadOrder(req.auth.tenantId, req.params.id)) }),
  );

  app.post('/supplier-orders', async (req: Req<z.infer<typeof orderSchema>>, reply) => {
    const body = orderSchema.parse(req.body);
    const supplier = await prisma.supplier.findFirst({ where: { id: body.supplierId, tenantId: req.auth.tenantId } });
    if (!supplier) throw notFound('Supplier', body.supplierId);
    const total = r2(body.items.reduce((s, i) => s + i.quantityOrdered * i.unitCost, 0));
    const storeId = await resolveStoreId(req.auth.tenantId, req.auth.storeId);
    const order = await prisma.supplierOrder.create({
      data: {
        tenantId: req.auth.tenantId,
        storeId,
        supplierId: supplier.id,
        orderNumber: makeRef('PO'),
        status: 'draft',
        totalAmount: total,
        amountRemaining: total,
        notes: body.notes || null,
        createdBy: req.auth.userId,
        items: {
          create: body.items.map((i) => ({
            itemType: i.itemType,
            productId: i.itemType === 'product' ? (i.productId ?? null) : null,
            productName: i.productName,
            sku: i.sku ?? null,
            quantityOrdered: i.quantityOrdered,
            unitCost: r2(i.unitCost),
            totalCost: r2(i.quantityOrdered * i.unitCost),
            deviceType: i.deviceType ?? null,
            brand: i.brand ?? null,
            deviceModel: i.model ?? null,
            defaultSalePrice: i.defaultSalePrice ?? null,
          })),
        },
      },
      include,
    });
    reply.status(201);
    return ok({ order: await present(order) });
  });

  app.put('/supplier-orders/:id', async (req: Req<Partial<z.infer<typeof orderSchema>>, unknown, { id: string }>) => {
    const order = await loadOrder(req.auth.tenantId, req.params.id);
    const body = orderSchema.partial().parse(req.body);
    if (body.items && order.status !== 'draft') throw badRequest('Seule une commande en brouillon peut être modifiée');
    await prisma.$transaction(async (tx) => {
      if (body.items) {
        await tx.supplierOrderItem.deleteMany({ where: { supplierOrderId: order.id } });
        const total = r2(body.items.reduce((s, i) => s + i.quantityOrdered * i.unitCost, 0));
        await tx.supplierOrder.update({
          where: { id: order.id },
          data: {
            totalAmount: total,
            amountRemaining: r2(total - num(order.amountPaid)),
            items: {
              create: body.items.map((i) => ({
                itemType: i.itemType,
                productId: i.productId ?? null,
                productName: i.productName,
                sku: i.sku ?? null,
                quantityOrdered: i.quantityOrdered,
                unitCost: r2(i.unitCost),
                totalCost: r2(i.quantityOrdered * i.unitCost),
                deviceType: i.deviceType ?? null,
                brand: i.brand ?? null,
                deviceModel: i.model ?? null,
                defaultSalePrice: i.defaultSalePrice ?? null,
              })),
            },
          },
        });
      }
      if (body.notes !== undefined || body.supplierId) {
        await tx.supplierOrder.update({
          where: { id: order.id },
          data: { ...(body.notes !== undefined && { notes: body.notes || null }), ...(body.supplierId && { supplierId: body.supplierId }) },
        });
      }
    });
    return ok({ order: await present(await loadOrder(req.auth.tenantId, order.id)) });
  });

  app.post('/supplier-orders/:id/submit', async (req: Req<unknown, unknown, { id: string }>) => {
    const order = await loadOrder(req.auth.tenantId, req.params.id);
    if (order.status !== 'draft') throw badRequest('Cette commande a déjà été soumise');
    await prisma.supplierOrder.update({ where: { id: order.id }, data: { status: 'pending', orderedAt: new Date() } });
    return ok({ order: await present(await loadOrder(req.auth.tenantId, order.id)) });
  });

  app.post('/supplier-orders/:id/cancel', async (req: Req<unknown, unknown, { id: string }>) => {
    const order = await loadOrder(req.auth.tenantId, req.params.id);
    if (!['draft', 'pending'].includes(order.status)) throw badRequest('Seule une commande non réceptionnée peut être annulée');
    await prisma.supplierOrder.update({ where: { id: order.id }, data: { status: 'cancelled' } });
    return ok({ order: await present(await loadOrder(req.auth.tenantId, order.id)) });
  });

  const receiveSchema = z.object({
    items: z.array(z.object({ itemId: z.string(), quantityReceived: z.coerce.number().int().min(1) })).min(1),
    paymentAmount: z.coerce.number().min(0).optional(),
  });

  /** Receiving product lines adds stock ("purchase" movement) and updates the product cost price. */
  app.post('/supplier-orders/:id/receive', async (req: Req<z.infer<typeof receiveSchema>, unknown, { id: string }>) => {
    const body = receiveSchema.parse(req.body);
    const order = await loadOrder(req.auth.tenantId, req.params.id);
    if (['draft', 'cancelled'].includes(order.status)) throw badRequest("Cette commande ne peut pas être réceptionnée");
    await prisma.$transaction(async (tx) => {
      for (const r of body.items) {
        const item = order.items.find((i) => i.id === r.itemId);
        if (!item) throw notFound('Order item', r.itemId);
        if (item.itemType === 'unit') throw badRequest('Les appareils sont ajoutés au stock un par un');
        const open = item.quantityOrdered - item.quantityReceived;
        if (r.quantityReceived > open) throw badRequest(`Quantité maximale pour « ${item.productName} » : ${open}`);
        if (item.productId) {
          await tx.product.update({ where: { id: item.productId }, data: { costPrice: item.unitCost } });
          await moveStock(tx, {
            tenantId: req.auth.tenantId,
            productId: item.productId,
            delta: r.quantityReceived,
            type: 'purchase',
            reference: order.orderNumber,
            notes: 'Stock received from supplier',
            storeId: order.storeId,
            userId: req.auth.userId,
          });
        }
        await tx.supplierOrderItem.update({ where: { id: item.id }, data: { quantityReceived: item.quantityReceived + r.quantityReceived } });
      }
      if (body.paymentAmount) await applyPayment(tx, order.id, body.paymentAmount, { id: req.auth.userId, name: userName(req) });
      await refreshStatus(tx, order.id);
    });
    return ok({ order: await present(await loadOrder(req.auth.tenantId, order.id)) });
  });

  app.post('/supplier-orders/:id/payment', async (req: Req<{ amount: number; note?: string }, unknown, { id: string }>) => {
    const { amount, note } = z.object({ amount: z.coerce.number().positive(), note: z.string().optional() }).parse(req.body);
    const order = await loadOrder(req.auth.tenantId, req.params.id);
    if (['draft', 'cancelled'].includes(order.status)) throw badRequest('Paiement impossible sur cette commande');
    if (num(order.amountRemaining) <= 0) throw badRequest('Cette commande est déjà payée');
    await prisma.$transaction((tx) => applyPayment(tx, order.id, amount, { id: req.auth.userId, name: userName(req) }, note));
    return ok({ order: await present(await loadOrder(req.auth.tenantId, order.id)) });
  });

  app.patch('/supplier-orders/:id/items/:itemId/units', async (req: Req<{ units: UnitDetail[] }, unknown, { id: string; itemId: string }>) => {
    const order = await loadOrder(req.auth.tenantId, req.params.id);
    const item = order.items.find((i) => i.id === req.params.itemId);
    if (!item || item.itemType !== 'unit') throw notFound('Order item', req.params.itemId);
    const current = parseJson<UnitDetail[]>(item.unitDetails, []);
    const units = (req.body?.units ?? []).slice(0, item.quantityOrdered).map((u, i) => ({
      ...u,
      addedToInventory: current[i]?.addedToInventory ?? false,
      soldUnitId: current[i]?.soldUnitId,
    }));
    await prisma.supplierOrderItem.update({ where: { id: item.id }, data: { unitDetails: JSON.stringify(units) } });
    return ok({ updated: true });
  });

  /** Turns ordered devices into phones in stock (sold units), one per index. */
  async function convertUnits(tx: Tx, req: Req, orderId: string, itemId: string, indexes: number[]) {
    const order = await loadOrder(req.auth.tenantId, orderId, tx);
    if (order.status === 'cancelled') throw badRequest('Commande annulée');
    if (order.status === 'draft') await tx.supplierOrder.update({ where: { id: order.id }, data: { status: 'pending' } });
    const item = order.items.find((i) => i.id === itemId);
    if (!item || item.itemType !== 'unit') throw notFound('Order item', itemId);
    const details = parseJson<UnitDetail[]>(item.unitDetails, []);
    while (details.length < item.quantityOrdered) details.push({});
    let converted = 0;
    for (const idx of indexes) {
      const d = details[idx];
      if (!d || d.addedToInventory) continue;
      const purchase = d.purchasePrice ?? num(item.unitCost);
      const sale = d.salePrice ?? (item.defaultSalePrice != null ? num(item.defaultSalePrice) : purchase);
      const unit = await createUnit(
        tx,
        { tenantId: req.auth.tenantId, userId: req.auth.userId, storeId: order.storeId },
        {
          deviceType: (item.deviceType as any) || 'phone',
          brand: item.brand || item.productName,
          model: item.deviceModel || item.productName,
          storage: d.storage,
          color: d.color,
          condition: d.condition || 'grade_a',
          imei: d.imei || null,
          serialNumber: d.serialNumber || null,
          batteryHealth: d.batteryHealth ?? null,
          chargeCycles: d.chargeCycles ?? null,
          purchasePrice: purchase,
          salePrice: sale,
          notes: d.notes,
          supplierId: order.supplierId,
          supplierOrderId: order.id,
        },
      );
      details[idx] = { ...d, addedToInventory: true, soldUnitId: unit.id };
      converted++;
    }
    const received = details.filter((d) => d.addedToInventory).length;
    await tx.supplierOrderItem.update({ where: { id: item.id }, data: { unitDetails: JSON.stringify(details), quantityReceived: received } });
    await refreshStatus(tx, order.id);
    return converted;
  }

  app.post(
    '/supplier-orders/:id/items/:itemId/convert-units',
    async (req: Req<{ unitIndexes: number[] }, unknown, { id: string; itemId: string }>) => {
      const indexes = z.array(z.number().int().min(0)).parse(req.body?.unitIndexes ?? []);
      const converted = await prisma.$transaction((tx) => convertUnits(tx, req, req.params.id, req.params.itemId, indexes));
      return ok({ converted });
    },
  );

  app.post('/supplier-orders/:id/convert-all-units', async (req: Req<unknown, unknown, { id: string }>) => {
    const order = await loadOrder(req.auth.tenantId, req.params.id);
    const converted = await prisma.$transaction(async (tx) => {
      let n = 0;
      for (const item of order.items.filter((i) => i.itemType === 'unit')) {
        const details = parseJson<UnitDetail[]>(item.unitDetails, []);
        const idx = Array.from({ length: item.quantityOrdered }, (_, i) => i).filter((i) => !details[i]?.addedToInventory);
        n += await convertUnits(tx, req, order.id, item.id, idx);
      }
      return n;
    });
    return ok({ converted });
  });
}
