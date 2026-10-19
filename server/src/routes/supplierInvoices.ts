import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { moveCaisse } from '../lib/caisse.js';
import { prisma, Prisma, type Tx } from '../lib/prisma.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { num, parseJson, r2, serialize } from '../lib/serialize.js';
import { authed, ok, type Req } from '../lib/route.js';
import { dateRange, pageMeta, pageParams, qStr } from '../lib/pagination.js';
import { moveStock } from '../lib/stock.js';
import { resolveStoreId } from '../lib/tenant.js';
import { invoiceState } from '../lib/suppliers.js';
import { createProduct } from './products.js';

/**
 * Supplier (purchase) invoices.
 * - draft: free to edit, owes nothing, no stock · confirmed: owed and payable, lines can be received into stock · cancelled.
 * - Remaining = total − sum of non-voided payments. A payment cannot exceed the remaining amount.
 * - Cash payments leave the store's cash drawer once (cash_out); card / transfer / cheque do not touch it. A payment
 *   is never deleted: voiding it keeps the record and, for cash, puts the money back (cash_in).
 * - Stock: each line keeps its received quantity, so receiving twice or editing the invoice never adds stock twice.
 *   A line without a product creates it when first received. Purchases are not business expenses: their cost is
 *   counted when the goods are sold (cost price updated on receipt).
 * - From a purchase order: the order keeps its own stock receiving; its debt and earlier payments move to the invoice.
 */

const METHODS = ['cash', 'card', 'bank_transfer', 'check'] as const;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Date invalide');

const itemSchema = z.object({
  id: z.string().optional(),
  productId: z.string().optional().nullable(),
  productName: z.string().trim().min(1, 'Le nom du produit est obligatoire'),
  reference: z.string().trim().optional().nullable(),
  quantity: z.coerce.number().int().min(1, 'La quantité doit être au moins 1'),
  unitCost: z.coerce.number().min(0),
  newRetailPrice: z.coerce.number().min(0).optional().nullable(),
  newCategoryId: z.string().optional().nullable(),
});

const invoiceSchema = z.object({
  supplierId: z.string().min(1, 'Le fournisseur est obligatoire'),
  supplierRef: z.string().trim().optional().nullable(),
  invoiceDate: day,
  dueDate: day.optional().nullable(),
  items: z.array(itemSchema).min(1, 'Ajoutez au moins un article'),
  discount: z.coerce.number().min(0).default(0),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  extraCharges: z.coerce.number().min(0).default(0),
  extraChargesLabel: z.string().trim().optional().nullable(),
  notes: z.string().optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  confirm: z.boolean().optional(),
});
type InvoiceInput = z.infer<typeof invoiceSchema>;

const paymentSchema = z.object({
  amount: z.coerce.number().positive('Le montant doit être positif'),
  method: z.enum(METHODS),
  paidAt: day.optional(),
  reference: z.string().trim().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const include = { items: { orderBy: { position: 'asc' } }, payments: { orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }] as Prisma.SupplierPaymentOrderByWithRelationInput[] }, supplier: true } satisfies Prisma.SupplierInvoiceInclude;
type Loaded = Prisma.SupplierInvoiceGetPayload<{ include: typeof include }>;

const asDate = (s: string) => new Date(`${s.slice(0, 10)}T12:00:00.000Z`);
/** A payment dated today keeps the time it was recorded (history stays in order); another day is set to midday. */
const paymentDate = (s?: string) => (!s || s.slice(0, 10) === new Date().toISOString().slice(0, 10) ? new Date() : asDate(s));

function totals(items: { quantity: number; unitCost: number }[], discount: number, taxRate: number, extra: number) {
  const subtotal = r2(items.reduce((s, i) => s + r2(i.quantity * i.unitCost), 0));
  if (discount > subtotal) throw badRequest('La remise dépasse le sous-total');
  const base = r2(subtotal - discount);
  const taxAmount = r2((base * taxRate) / 100);
  return { subtotal, discount: r2(discount), taxRate, taxAmount, extraCharges: r2(extra), total: r2(base + taxAmount + extra) };
}

async function load(tenantId: string, id: string, tx: Tx | typeof prisma = prisma) {
  const inv = await tx.supplierInvoice.findFirst({ where: { id, tenantId }, include });
  if (!inv) throw notFound('Supplier invoice', id);
  return inv;
}

async function present(inv: Loaded) {
  const order = inv.supplierOrderId
    ? await prisma.supplierOrder.findUnique({ where: { id: inv.supplierOrderId }, select: { id: true, orderNumber: true, status: true } })
    : null;
  return serialize({ ...inv, ...invoiceState(inv), supplierOrder: order });
}

/** FF-2026-0001, numbered per business and per year. */
async function nextNumber(tx: Tx, tenantId: string, date: Date) {
  const prefix = `FF-${date.getUTCFullYear()}-`;
  const last = await tx.supplierInvoice.findFirst({ where: { tenantId, number: { startsWith: prefix } }, orderBy: { number: 'desc' }, select: { number: true } });
  const n = last ? parseInt(last.number.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(n).padStart(4, '0')}`;
}

async function assertProducts(tenantId: string, items: InvoiceInput['items']) {
  const ids = [...new Set(items.map((i) => i.productId).filter((x): x is string => !!x))];
  if (!ids.length) return;
  const n = await prisma.product.count({ where: { tenantId, id: { in: ids } } });
  if (n !== ids.length) throw badRequest('Article invalide');
}

/** Moves the purchase order's payments onto the invoice (they already left the drawer: no new movement). */
async function carryOrderPayments(tx: Tx, inv: { id: string; tenantId: string; supplierId: string; storeId: string | null; supplierOrderId: string | null }, userId: string) {
  if (!inv.supplierOrderId) return 0;
  const order = await tx.supplierOrder.findUnique({ where: { id: inv.supplierOrderId } });
  if (!order) return 0;
  const pays = parseJson<{ amount: number; createdAt: string; note?: string }[]>(order.payments, []);
  for (const p of pays) {
    await tx.supplierPayment.create({
      data: {
        tenantId: inv.tenantId,
        supplierId: inv.supplierId,
        invoiceId: inv.id,
        amount: r2(num(p.amount)),
        method: 'cash',
        paidAt: new Date(p.createdAt),
        reference: order.orderNumber,
        notes: p.note || null,
        fromOrder: true,
        storeId: order.storeId,
        createdBy: userId,
      },
    });
  }
  return r2(pays.reduce((s, p) => s + num(p.amount), 0));
}

async function recomputePaid(tx: Tx, invoiceId: string) {
  const agg = await tx.supplierPayment.aggregate({ where: { invoiceId, voidedAt: null }, _sum: { amount: true } });
  return tx.supplierInvoice.update({ where: { id: invoiceId }, data: { amountPaid: r2(num(agg._sum.amount)) } });
}

export default async function supplierInvoiceRoutes(app: FastifyInstance) {
  authed(app);

  app.get('/supplier-invoices', async (req: Req<unknown, Record<string, string>>) => {
    const q = req.query;
    const query = qStr(q.query);
    const range = dateRange(q.dateFrom, q.dateTo);
    const where: Prisma.SupplierInvoiceWhereInput = {
      tenantId: req.auth.tenantId,
      ...(qStr(q.supplierId) ? { supplierId: q.supplierId } : {}),
      ...(qStr(q.status) ? { status: q.status } : {}),
      ...(range ? { invoiceDate: range } : {}),
      ...(query
        ? {
            OR: [
              { number: { contains: query } },
              { supplierRef: { contains: query } },
              { supplier: { name: { contains: query } } },
              { items: { some: { OR: [{ productName: { contains: query } }, { reference: { contains: query } }] } } },
            ],
          }
        : {}),
    };
    const rows = await prisma.supplierInvoice.findMany({ where, include: { supplier: { select: { id: true, name: true, phone: true } } }, orderBy: [{ invoiceDate: 'desc' }, { number: 'desc' }] });
    let list = rows.map((r) => ({ ...r, ...invoiceState(r) }));
    const ps = qStr(q.paymentStatus);
    if (ps === 'overdue') list = list.filter((r) => r.overdue);
    else if (ps) list = list.filter((r) => r.status === 'confirmed' && r.paymentStatus === ps);
    const counted = list.filter((r) => r.status === 'confirmed');
    const p = pageParams(q, 20);
    return ok({
      invoices: serialize(list.slice(p.skip, p.skip + p.limit)),
      meta: pageMeta(list.length, p),
      totals: {
        count: counted.length,
        total: r2(counted.reduce((s, r) => s + num(r.total), 0)),
        paid: r2(counted.reduce((s, r) => s + num(r.amountPaid), 0)),
        remaining: r2(counted.reduce((s, r) => s + r.remaining, 0)),
        overdue: r2(counted.filter((r) => r.overdue).reduce((s, r) => s + r.remaining, 0)),
      },
    });
  });

  app.get('/supplier-invoices/:id', async (req: Req<unknown, unknown, { id: string }>) => ok({ invoice: await present(await load(req.auth.tenantId, req.params.id)) }));

  app.post('/supplier-invoices', async (req: Req<InvoiceInput>, reply) => {
    const body = invoiceSchema.parse(req.body);
    const tenantId = req.auth.tenantId;
    const supplier = await prisma.supplier.findFirst({ where: { id: body.supplierId, tenantId } });
    if (!supplier) throw notFound('Supplier', body.supplierId);
    await assertProducts(tenantId, body.items);
    const t = totals(body.items, body.discount, body.taxRate, body.extraCharges);
    const storeId = await resolveStoreId(tenantId, req.auth.storeId);
    const invoiceDate = asDate(body.invoiceDate);
    const inv = await prisma.$transaction(async (tx) =>
      tx.supplierInvoice.create({
        data: {
          tenantId,
          storeId,
          supplierId: supplier.id,
          number: await nextNumber(tx, tenantId, invoiceDate),
          supplierRef: body.supplierRef || null,
          status: body.confirm ? 'confirmed' : 'draft',
          confirmedAt: body.confirm ? new Date() : null,
          invoiceDate,
          dueDate: body.dueDate ? asDate(body.dueDate) : null,
          ...t,
          extraChargesLabel: body.extraChargesLabel || null,
          notes: body.notes || null,
          paymentTerms: body.paymentTerms || null,
          createdBy: req.auth.userId,
          items: {
            create: body.items.map((i, position) => ({
              position,
              productId: i.productId || null,
              productName: i.productName,
              reference: i.reference || null,
              quantity: i.quantity,
              unitCost: r2(i.unitCost),
              lineTotal: r2(i.quantity * i.unitCost),
              newRetailPrice: i.productId ? null : (i.newRetailPrice ?? null),
              newCategoryId: i.productId ? null : i.newCategoryId || null,
            })),
          },
        },
      }),
    );
    reply.status(201);
    return ok({ invoice: await present(await load(tenantId, inv.id)) });
  });

  /** Draft from a purchase order: same lines; the order keeps its stock receiving, its debt moves here on confirmation. */
  app.post('/supplier-invoices/from-order/:orderId', async (req: Req<unknown, unknown, { orderId: string }>, reply) => {
    const tenantId = req.auth.tenantId;
    const order = await prisma.supplierOrder.findFirst({ where: { id: req.params.orderId, tenantId }, include: { items: true } });
    if (!order) throw notFound('Supplier order', req.params.orderId);
    if (order.status === 'draft' || order.status === 'cancelled') throw badRequest('Seule une commande soumise peut être facturée');
    const existing = await prisma.supplierInvoice.findFirst({ where: { tenantId, supplierOrderId: order.id, status: { not: 'cancelled' } } });
    if (existing) throw conflict(`Cette commande est déjà facturée (${existing.number})`);
    const items = order.items.map((i) => ({ quantity: i.quantityOrdered, unitCost: num(i.unitCost) }));
    const t = totals(items, 0, 0, 0);
    const now = new Date();
    const inv = await prisma.$transaction(async (tx) =>
      tx.supplierInvoice.create({
        data: {
          tenantId,
          storeId: order.storeId,
          supplierId: order.supplierId,
          number: await nextNumber(tx, tenantId, now),
          supplierOrderId: order.id,
          // Dated like the order by default (its payments came after it); editable before confirming.
          invoiceDate: asDate(order.orderedAt.toISOString()),
          ...t,
          notes: order.notes,
          createdBy: req.auth.userId,
          items: {
            create: order.items.map((i, position) => ({
              position,
              productId: i.productId,
              productName: i.itemType === 'unit' ? [i.brand, i.deviceModel].filter(Boolean).join(' ') || i.productName : i.productName,
              reference: i.sku,
              quantity: i.quantityOrdered,
              unitCost: num(i.unitCost),
              lineTotal: num(i.totalCost),
            })),
          },
        },
      }),
    );
    reply.status(201);
    return ok({ invoice: await present(await load(tenantId, inv.id)) });
  });

  app.put('/supplier-invoices/:id', async (req: Req<InvoiceInput, unknown, { id: string }>) => {
    const tenantId = req.auth.tenantId;
    const inv = await load(tenantId, req.params.id);
    if (inv.status === 'cancelled') throw badRequest('Facture annulée');
    const body = invoiceSchema.omit({ confirm: true }).parse(req.body);
    if (inv.supplierOrderId && body.supplierId !== inv.supplierId) throw badRequest('Le fournisseur d’une facture de commande ne peut pas changer');
    await assertProducts(tenantId, body.items);
    // Lines already (partly) received keep their product and cannot go below what is in stock.
    for (const old of inv.items.filter((i) => i.quantityReceived > 0)) {
      const next = body.items.find((i) => i.id === old.id);
      if (!next) throw badRequest(`« ${old.productName} » est déjà réceptionné : la ligne ne peut pas être supprimée`);
      if (next.quantity < old.quantityReceived) throw badRequest(`« ${old.productName} » : quantité minimale ${old.quantityReceived} (déjà réceptionnée)`);
      if ((next.productId || null) !== old.productId) throw badRequest(`« ${old.productName} » est déjà réceptionné : le produit ne peut pas changer`);
    }
    const t = totals(body.items, body.discount, body.taxRate, body.extraCharges);
    if (t.total < num(inv.amountPaid)) throw badRequest(`Le total ne peut pas être inférieur au montant déjà payé (${num(inv.amountPaid)} DH)`);
    await prisma.$transaction(async (tx) => {
      const keep = new Set(body.items.map((i) => i.id).filter(Boolean));
      await tx.supplierInvoiceItem.deleteMany({ where: { invoiceId: inv.id, id: { notIn: [...keep] as string[] } } });
      for (const [position, i] of body.items.entries()) {
        const data = {
          position,
          productId: i.productId || null,
          productName: i.productName,
          reference: i.reference || null,
          quantity: i.quantity,
          unitCost: r2(i.unitCost),
          lineTotal: r2(i.quantity * i.unitCost),
          newRetailPrice: i.productId ? null : (i.newRetailPrice ?? null),
          newCategoryId: i.productId ? null : i.newCategoryId || null,
        };
        const old = i.id ? inv.items.find((x) => x.id === i.id) : null;
        if (old) await tx.supplierInvoiceItem.update({ where: { id: old.id }, data });
        else await tx.supplierInvoiceItem.create({ data: { ...data, invoiceId: inv.id } });
      }
      await tx.supplierInvoice.update({
        where: { id: inv.id },
        data: {
          supplierId: body.supplierId,
          supplierRef: body.supplierRef || null,
          invoiceDate: asDate(body.invoiceDate),
          dueDate: body.dueDate ? asDate(body.dueDate) : null,
          ...t,
          extraChargesLabel: body.extraChargesLabel || null,
          notes: body.notes || null,
          paymentTerms: body.paymentTerms || null,
        },
      });
    });
    return ok({ invoice: await present(await load(tenantId, inv.id)) });
  });

  app.post('/supplier-invoices/:id/confirm', async (req: Req<unknown, unknown, { id: string }>) => {
    const inv = await load(req.auth.tenantId, req.params.id);
    if (inv.status !== 'draft') throw badRequest('Seule une facture en brouillon peut être confirmée');
    await prisma.$transaction(async (tx) => {
      await tx.supplierInvoice.update({ where: { id: inv.id }, data: { status: 'confirmed', confirmedAt: new Date() } });
      if (await carryOrderPayments(tx, inv, req.auth.userId)) await recomputePaid(tx, inv.id);
    });
    const after = await load(req.auth.tenantId, inv.id);
    if (num(after.amountPaid) > num(after.total)) throw badRequest('Le total ne peut pas être inférieur au montant déjà payé');
    return ok({ invoice: await present(after) });
  });

  /** Cancelling keeps the invoice and its history; it needs no stock received and no payment left (void them first). */
  app.post('/supplier-invoices/:id/cancel', async (req: Req<{ reason?: string }, unknown, { id: string }>) => {
    const inv = await load(req.auth.tenantId, req.params.id);
    if (inv.status === 'cancelled') throw badRequest('Facture annulée');
    if (inv.items.some((i) => i.quantityReceived > 0)) throw badRequest('Des articles ont déjà été réceptionnés : faites un ajustement de stock avant d’annuler');
    if (inv.payments.some((p) => !p.voidedAt && !p.fromOrder)) throw badRequest('Annulez d’abord les paiements de cette facture');
    await prisma.$transaction(async (tx) => {
      // Payments carried from the purchase order go back to it (they stay in the order's own history).
      await tx.supplierPayment.updateMany({ where: { invoiceId: inv.id, fromOrder: true, voidedAt: null }, data: { voidedAt: new Date(), voidReason: 'Facture annulée' } });
      await tx.supplierInvoice.update({
        where: { id: inv.id },
        data: { status: 'cancelled', cancelledAt: new Date(), cancelReason: z.string().optional().parse(req.body?.reason) || null, amountPaid: 0 },
      });
    });
    return ok({ invoice: await present(await load(req.auth.tenantId, inv.id)) });
  });

  const receiveSchema = z.object({ items: z.array(z.object({ itemId: z.string(), quantity: z.coerce.number().int().min(1) })).optional() });

  /** Adds received quantities to stock (purchase movements), at most what is still open on each line. */
  app.post('/supplier-invoices/:id/receive', async (req: Req<z.infer<typeof receiveSchema>, unknown, { id: string }>) => {
    const body = receiveSchema.parse(req.body ?? {});
    const tenantId = req.auth.tenantId;
    const inv = await load(tenantId, req.params.id);
    if (inv.status !== 'confirmed') throw badRequest('Confirmez la facture avant de réceptionner la marchandise');
    if (inv.supplierOrderId) throw badRequest('La marchandise de cette facture est réceptionnée sur sa commande');
    const wanted = body.items ?? inv.items.map((i) => ({ itemId: i.id, quantity: i.quantity - i.quantityReceived })).filter((r) => r.quantity > 0);
    if (!wanted.length) throw badRequest('Tout est déjà réceptionné');
    await prisma.$transaction(async (tx) => {
      for (const r of wanted) {
        // Re-read inside the transaction: two receptions at once can never both add the same pieces.
        const item = await tx.supplierInvoiceItem.findFirst({ where: { id: r.itemId, invoiceId: inv.id } });
        if (!item) throw notFound('Invoice item', r.itemId);
        const open = item.quantity - item.quantityReceived;
        if (r.quantity > open) throw badRequest(`Quantité maximale pour « ${item.productName} » : ${open}`);
        let productId = item.productId;
        if (!productId) {
          const barcode = item.reference && /^\d{8,14}$/.test(item.reference) ? item.reference : undefined;
          const existing = barcode ? await tx.product.findFirst({ where: { tenantId, barcode } }) : null;
          productId =
            existing?.id ??
            (
              await createProduct(tx, tenantId, inv.storeId, req.auth.userId, {
                name: item.productName,
                barcode,
                sku: barcode ? undefined : item.reference || undefined,
                categoryId: item.newCategoryId,
                costPrice: num(item.unitCost),
                retailPrice: item.newRetailPrice != null ? num(item.newRetailPrice) : num(item.unitCost),
                stockQuantity: 0,
              } as any)
            ).id;
          await tx.supplierInvoiceItem.update({ where: { id: item.id }, data: { productId } });
        }
        await tx.product.update({ where: { id: productId }, data: { costPrice: item.unitCost } });
        await moveStock(tx, { tenantId, productId, delta: r.quantity, type: 'purchase', reference: inv.number, notes: 'Stock received from supplier', storeId: inv.storeId, userId: req.auth.userId });
        const done = await tx.supplierInvoiceItem.updateMany({ where: { id: item.id, quantityReceived: item.quantityReceived }, data: { quantityReceived: item.quantityReceived + r.quantity } });
        if (done.count !== 1) throw conflict('Réception déjà en cours, réessayez');
      }
    });
    return ok({ invoice: await present(await load(tenantId, inv.id)) });
  });

  app.post('/supplier-invoices/:id/payments', async (req: Req<z.infer<typeof paymentSchema>, unknown, { id: string }>) => {
    const body = paymentSchema.parse(req.body);
    const tenantId = req.auth.tenantId;
    const inv = await load(tenantId, req.params.id);
    if (inv.status !== 'confirmed') throw badRequest('Confirmez la facture avant de la payer');
    await prisma.$transaction(async (tx) => {
      // Remaining read inside the transaction so two submissions cannot overpay.
      const fresh = await recomputePaid(tx, inv.id);
      const remaining = r2(num(fresh.total) - num(fresh.amountPaid));
      if (remaining <= 0) throw badRequest('Cette facture est déjà payée');
      const amount = r2(body.amount);
      if (amount > remaining) throw badRequest(`Le montant dépasse le reste à payer (${remaining} DH)`);
      const storeId = inv.storeId ?? (await resolveStoreId(tenantId, req.auth.storeId));
      await tx.supplierPayment.create({
        data: {
          tenantId,
          supplierId: inv.supplierId,
          invoiceId: inv.id,
          amount,
          method: body.method,
          paidAt: paymentDate(body.paidAt),
          reference: body.reference || null,
          notes: body.notes || null,
          storeId,
          createdBy: req.auth.userId,
        },
      });
      if (body.method === 'cash') {
        await moveCaisse(tx, { tenantId, storeId, delta: -amount, type: 'cash_out', reason: `Paiement fournisseur - ${inv.number}`, userId: req.auth.userId });
      }
      await recomputePaid(tx, inv.id);
    });
    return ok({ invoice: await present(await load(tenantId, inv.id)) });
  });

  app.post('/supplier-invoices/:id/payments/:paymentId/void', async (req: Req<{ reason?: string }, unknown, { id: string; paymentId: string }>) => {
    const tenantId = req.auth.tenantId;
    const inv = await load(tenantId, req.params.id);
    const p = inv.payments.find((x) => x.id === req.params.paymentId);
    if (!p) throw notFound('Supplier payment', req.params.paymentId);
    if (p.voidedAt) throw badRequest('Paiement déjà annulé');
    if (p.fromOrder) throw badRequest('Ce paiement a été fait sur la commande');
    await prisma.$transaction(async (tx) => {
      const done = await tx.supplierPayment.updateMany({ where: { id: p.id, voidedAt: null }, data: { voidedAt: new Date(), voidReason: z.string().optional().parse(req.body?.reason) || null } });
      if (done.count !== 1) throw badRequest('Paiement déjà annulé');
      if (p.method === 'cash') {
        await moveCaisse(tx, { tenantId, storeId: p.storeId, delta: num(p.amount), type: 'cash_in', reason: `Annulation paiement fournisseur - ${inv.number}`, userId: req.auth.userId });
      }
      await recomputePaid(tx, inv.id);
    });
    return ok({ invoice: await present(await load(tenantId, inv.id)) });
  });

  app.delete('/supplier-invoices/:id', async (req: Req<unknown, unknown, { id: string }>) => {
    const inv = await load(req.auth.tenantId, req.params.id);
    if (inv.status !== 'draft') throw badRequest('Seul un brouillon peut être supprimé ; annulez la facture');
    await prisma.supplierInvoice.delete({ where: { id: inv.id } });
    return ok({ deleted: true });
  });
}
