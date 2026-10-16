import { z } from 'zod';
import { prisma, type Tx } from './prisma.js';
import { badRequest, notFound } from './errors.js';
import { num, r2 } from './serialize.js';
import { makeRef } from './refs.js';
import { moveStock } from './stock.js';
import { moveCaisse } from './caisse.js';
import { isManager, type AuthContext } from './auth.js';
import { resolveStoreId } from './tenant.js';
import { createUnit } from '../routes/soldUnits.js';

export const paymentSchema = z.object({
  method: z.enum(['cash', 'card', 'bank_transfer', 'check', 'mobile_money', 'credit']).default('cash'),
  amount: z.coerce.number().min(0),
  reference: z.string().optional().nullable(),
});

const saleItemSchema = z.object({
  productId: z.string().optional().nullable(),
  soldUnitId: z.string().optional().nullable(),
  quantity: z.coerce.number().int().min(1),
  unitPrice: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).optional(),
  saleMode: z.enum(['unit', 'pack']).optional(),
});

export const checkoutSchema = z.object({
  customerId: z.string().optional().nullable(),
  employeeId: z.string().optional().nullable(),
  items: z.array(saleItemSchema).min(1, 'Le panier est vide'),
  type: z.enum(['sale', 'credit', 'reservation', 'exchange']).default('sale'),
  payments: z.array(paymentSchema).default([]),
  // Negative = supplement (customer chose to pay more than the total).
  discountAmount: z.coerce.number().optional(),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  notes: z.string().optional().nullable(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const tradeInDeviceSchema = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
  deviceType: z.enum(['phone', 'tablet', 'laptop', 'macbook', 'watch']).default('phone'),
  condition: z.string().default('grade_a'),
  tradeInValue: z.coerce.number().positive(),
  storage: z.string().optional(),
  ram: z.string().optional(),
  color: z.string().optional(),
  imei: z.string().optional(),
  serialNumber: z.string().optional(),
  batteryHealth: z.coerce.number().int().min(0).max(100).optional(),
  estimatedSalePrice: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
});

/** Sellers must be chosen at the till when the shop has employees and a manager account is selling. */
async function assertSeller(auth: AuthContext, storeId: string | null, employeeId?: string | null) {
  if (!isManager(auth.roles)) return;
  const count = await prisma.employee.count({
    where: { tenantId: auth.tenantId, isActive: true, OR: [{ storeId: null }, { storeId: storeId ?? undefined }] },
  });
  if (count > 0 && !employeeId) throw badRequest('Sélectionnez le vendeur qui a réalisé la vente');
}

interface PricedLine {
  productId: string | null;
  soldUnitId: string | null;
  productName: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  discount: number;
  totalPrice: number;
  profit: number;
  saleMode: string | null;
  variants: string | null;
}

async function priceLines(tx: Tx, tenantId: string, items: CheckoutInput['items']) {
  const lines: PricedLine[] = [];
  for (const item of items) {
    if (item.soldUnitId) {
      const unit = await tx.soldUnit.findFirst({ where: { id: item.soldUnitId, tenantId } });
      if (!unit) throw notFound('Sold unit', item.soldUnitId);
      if (unit.soldAt) throw badRequest(`${unit.brand} ${unit.model} est déjà vendu`);
      const cost = num(unit.purchasePrice) + num(unit.repairCost);
      const total = Math.max(0, r2(item.unitPrice - (item.discount ?? 0)));
      lines.push({
        productId: null,
        soldUnitId: unit.id,
        productName: `${unit.brand} ${unit.model}`,
        sku: unit.imei || unit.serialNumber || unit.ref,
        quantity: 1,
        unitPrice: item.unitPrice,
        costPrice: r2(cost),
        discount: item.discount ?? 0,
        totalPrice: total,
        profit: r2(total - cost),
        saleMode: null,
        variants: JSON.stringify({ brand: unit.brand, model: unit.model, storage: unit.storage ?? '', color: unit.color ?? '' }),
      });
      continue;
    }
    if (!item.productId) throw badRequest('Article invalide');
    const product = await tx.product.findFirst({ where: { id: item.productId, tenantId } });
    if (!product) throw notFound('Product', item.productId);
    const cost = num(product.costPrice);
    const total = Math.max(0, r2(item.unitPrice * item.quantity - (item.discount ?? 0)));
    lines.push({
      productId: product.id,
      soldUnitId: null,
      productName: item.saleMode === 'pack' && product.packSize ? `${product.name} (boîte ×${product.packSize})` : product.name,
      sku: product.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      costPrice: cost,
      discount: item.discount ?? 0,
      totalPrice: total,
      profit: r2(total - cost * item.quantity),
      saleMode: item.saleMode ?? null,
      variants: product.variants,
    });
  }
  return lines;
}

function totals(lines: PricedLine[], discountAmount: number, taxRate: number) {
  const subtotal = r2(lines.reduce((s, l) => s + l.totalPrice, 0));
  const taxAmount = r2(((subtotal - discountAmount) * taxRate) / 100);
  const totalAmount = r2(subtotal + taxAmount - discountAmount);
  const totalCost = r2(lines.reduce((s, l) => s + l.costPrice * l.quantity, 0));
  const totalProfit = r2(lines.reduce((s, l) => s + l.profit, 0) - discountAmount);
  return { subtotal, taxAmount, totalAmount, totalCost, totalProfit };
}

/** Totals for the cart without saving anything (POST /checkout/preview). */
export async function previewCart(auth: AuthContext, input: CheckoutInput) {
  const lines = await priceLines(prisma, auth.tenantId, input.items);
  return { items: lines, ...totals(lines, input.discountAmount ?? 0, input.taxRate) };
}

/**
 * Records a sale:
 *  - sale / credit / exchange: stock goes out, phones are marked sold, cash goes in the drawer;
 *  - reservation: phones are put aside for the customer against a deposit (nothing leaves stock yet).
 * Selling a phone reserved by someone else turns that customer's deposit into a refund to pay back.
 */
export async function createSale(
  auth: AuthContext,
  input: CheckoutInput,
  opts: { tradeInDevices?: z.infer<typeof tradeInDeviceSchema>[] } = {},
) {
  const storeId = await resolveStoreId(auth.tenantId, auth.storeId);
  await assertSeller(auth, storeId, input.employeeId);
  const needsCustomer = input.type === 'credit' || input.type === 'reservation' || (opts.tradeInDevices?.length ?? 0) > 0;
  if (needsCustomer && !input.customerId) throw badRequest('Sélectionnez un client');
  if (input.customerId) {
    const c = await prisma.customer.findFirst({ where: { id: input.customerId, tenantId: auth.tenantId } });
    if (!c) throw notFound('Customer', input.customerId);
  }
  if (input.type === 'reservation' && input.items.some((i) => !i.soldUnitId)) {
    throw badRequest('Les réservations ne concernent que les appareils');
  }

  return prisma.$transaction(async (tx) => {
    const lines = await priceLines(tx, auth.tenantId, input.items);
    const discount = input.discountAmount ?? 0;
    const t = totals(lines, discount, input.taxRate);
    const tradeInValue = r2((opts.tradeInDevices ?? []).reduce((s, d) => s + d.tradeInValue, 0));
    const paid = r2(input.payments.reduce((s, p) => s + p.amount, 0));
    const due = Math.max(0, r2(t.totalAmount - tradeInValue));
    const amountPaid = r2(Math.min(paid, due) + tradeInValue);
    const amountRemaining = Math.max(0, r2(t.totalAmount - amountPaid));
    const status = input.type === 'reservation' ? 'pending' : amountRemaining > 0 ? 'partial' : 'completed';
    if (input.type === 'sale' && amountRemaining > 0) {
      throw badRequest('Paiement insuffisant : utilisez la vente à crédit pour laisser un reste à payer');
    }

    const transaction = await tx.transaction.create({
      data: {
        tenantId: auth.tenantId,
        storeId,
        cashierId: auth.userId,
        employeeId: input.employeeId || null,
        customerId: input.customerId || null,
        transactionNumber: makeRef('TRX'),
        type: input.type,
        status,
        subtotal: t.subtotal,
        taxAmount: t.taxAmount,
        taxRate: input.taxRate,
        discountAmount: discount,
        totalAmount: t.totalAmount,
        amountPaid,
        amountRemaining,
        totalCost: t.totalCost,
        totalProfit: t.totalProfit,
        tradeInValue,
        notes: input.notes || null,
        items: {
          create: lines.map((l) => ({
            productId: l.productId,
            soldUnitId: l.soldUnitId,
            productName: l.productName,
            sku: l.sku,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            costPrice: l.costPrice,
            discount: l.discount,
            totalPrice: l.totalPrice,
            profit: l.profit,
            saleMode: l.saleMode,
            variants: l.variants,
          })),
        },
        payments: {
          create: input.payments
            .filter((p) => p.amount > 0)
            .map((p, i, arr) => ({
              method: p.method,
              // Change is never recorded: the last payment is capped so payments add up to what is due.
              amount: i === arr.length - 1 ? r2(p.amount - Math.max(0, paid - due)) : p.amount,
              reference: p.reference ?? null,
            })),
        },
      },
    });

    if (input.type === 'reservation') {
      const unitLines = lines.filter((l) => l.soldUnitId);
      const sum = unitLines.reduce((s, l) => s + l.totalPrice, 0) || 1;
      for (const l of unitLines) {
        await tx.soldUnit.update({
          where: { id: l.soldUnitId! },
          data: {
            reservedAt: new Date(),
            reservedByCustomerId: input.customerId,
            reservationDeposit: r2((amountPaid * l.totalPrice) / sum),
            reservationTransactionId: transaction.id,
          },
        });
      }
    } else {
      for (const l of lines) {
        if (l.soldUnitId) await sellUnit(tx, auth, l.soldUnitId, transaction.id, input.customerId ?? null);
        else if (l.productId) {
          await moveStock(tx, {
            tenantId: auth.tenantId,
            productId: l.productId,
            delta: -l.quantity,
            type: 'sale',
            reference: transaction.transactionNumber,
            notes: 'Product sold',
            storeId,
            userId: auth.userId,
          });
        }
      }
    }

    for (const device of opts.tradeInDevices ?? []) {
      await createUnit(
        tx,
        { tenantId: auth.tenantId, userId: auth.userId, storeId },
        {
          deviceType: device.deviceType,
          brand: device.brand,
          model: device.model,
          storage: device.storage,
          ram: device.ram,
          color: device.color,
          condition: device.condition,
          imei: device.imei || null,
          serialNumber: device.serialNumber || null,
          batteryHealth: device.batteryHealth ?? null,
          purchasePrice: device.tradeInValue,
          salePrice: device.estimatedSalePrice ?? Math.round(device.tradeInValue * 1.3),
          notes: device.notes,
        },
        {
          tradeInAt: new Date(),
          tradeInFromCustomerId: input.customerId,
          tradeInValue: device.tradeInValue,
          tradeInTransactionId: transaction.id,
        },
      );
    }

    const cashIn = r2(
      (await tx.payment.findMany({ where: { transactionId: transaction.id, method: 'cash' } })).reduce((s, p) => s + num(p.amount), 0),
    );
    if (cashIn > 0) {
      await moveCaisse(tx, {
        tenantId: auth.tenantId,
        storeId,
        amount: cashIn,
        type: 'sale',
        reference: transaction.transactionNumber,
        description: input.type === 'reservation' ? 'Acompte réservation' : 'Vente',
        userId: auth.userId,
      });
    }
    return { transaction, cashIn };
  });
}

/** Marks a phone sold; if someone else had reserved it, their deposit becomes a refund to pay back. */
async function sellUnit(tx: Tx, auth: AuthContext, unitId: string, transactionId: string, customerId: string | null) {
  const unit = await tx.soldUnit.findUniqueOrThrow({ where: { id: unitId } });
  if (unit.reservedAt && unit.reservedByCustomerId && unit.reservedByCustomerId !== customerId) {
    const deposit = num(unit.reservationDeposit);
    if (deposit > 0) {
      await tx.reservationRefund.create({
        data: {
          tenantId: auth.tenantId,
          soldUnitId: unit.id,
          customerId: unit.reservedByCustomerId,
          transactionId: unit.reservationTransactionId,
          amount: deposit,
          reason: 'Appareil vendu à un autre client',
        },
      });
    }
    if (unit.reservationTransactionId) {
      await tx.transaction.update({
        where: { id: unit.reservationTransactionId },
        data: { status: 'cancelled', cancelReason: 'Appareil vendu à un autre client', cancelledAt: new Date(), amountRemaining: 0 },
      });
    }
  }
  await tx.soldUnit.update({
    where: { id: unit.id },
    data: {
      soldAt: new Date(),
      transactionId,
      customerId,
      reservedAt: null,
      reservedByCustomerId: null,
      reservationDeposit: null,
      reservationExpiresAt: null,
      reservationTransactionId: null,
      warrantyExpiresAt: unit.hasWarranty && unit.warrantyDays ? new Date(Date.now() + unit.warrantyDays * 86400_000) : null,
    },
  });
}

/**
 * Adds a payment to a sale with a remaining balance (credit sales, reservations).
 * A reservation that becomes fully paid is completed: the phones are handed over (marked sold).
 */
export async function addTransactionPayment(auth: AuthContext, transactionId: string, payment: z.infer<typeof paymentSchema>) {
  return prisma.$transaction(async (tx) => {
    const t = await tx.transaction.findFirst({ where: { id: transactionId, tenantId: auth.tenantId }, include: { items: true } });
    if (!t) throw notFound('Transaction', transactionId);
    if (t.status === 'cancelled') throw badRequest('Transaction annulée');
    const remaining = num(t.amountRemaining);
    if (remaining <= 0) throw badRequest('Cette transaction est déjà réglée');
    const amount = r2(Math.min(payment.amount, remaining));
    if (amount <= 0) throw badRequest('Montant invalide');
    await tx.payment.create({ data: { transactionId: t.id, method: payment.method, amount, reference: payment.reference ?? null } });
    const newRemaining = r2(remaining - amount);
    await tx.transaction.update({
      where: { id: t.id },
      data: {
        amountPaid: r2(num(t.amountPaid) + amount),
        amountRemaining: newRemaining,
        status: newRemaining <= 0 ? 'completed' : t.type === 'reservation' ? 'pending' : 'partial',
      },
    });
    if (newRemaining <= 0 && t.type === 'reservation') {
      for (const item of t.items) if (item.soldUnitId) await sellUnit(tx, auth, item.soldUnitId, t.id, t.customerId);
    }
    if (payment.method === 'cash') {
      await moveCaisse(tx, {
        tenantId: auth.tenantId,
        storeId: t.storeId,
        amount,
        type: t.type === 'reservation' ? 'sale' : 'debt_payment',
        reference: t.transactionNumber,
        description: t.type === 'reservation' ? 'Solde réservation' : 'Paiement crédit',
        userId: auth.userId,
      });
    }
    return { cashIn: payment.method === 'cash' ? amount : 0 };
  });
}

export const returnSchema = z.object({
  customerId: z.string().optional().nullable(),
  items: z
    .array(
      z.object({
        soldUnitId: z.string().optional().nullable(),
        transactionItemId: z.string().optional().nullable(),
        productId: z.string().optional().nullable(),
        productName: z.string(),
        originalTransactionId: z.string().optional().nullable(),
        originalAmount: z.coerce.number().min(0),
        refundAmount: z.coerce.number().min(0),
        quantity: z.coerce.number().int().min(1).default(1),
      }),
    )
    .min(1),
});

/** Customer return: goods come back into stock, phones back into inventory, the refund leaves the drawer. */
export async function processReturn(auth: AuthContext, input: z.infer<typeof returnSchema>) {
  const storeId = await resolveStoreId(auth.tenantId, auth.storeId);
  return prisma.$transaction(async (tx) => {
    const refundTotal = r2(input.items.reduce((s, i) => s + Math.min(i.refundAmount, i.originalAmount), 0));
    const lines: { productId: string | null; soldUnitId: string | null; name: string; sku: string | null; quantity: number; refund: number; cost: number; original: string | null }[] = [];

    for (const item of input.items) {
      const refund = Math.min(item.refundAmount, item.originalAmount);
      if (item.soldUnitId) {
        const unit = await tx.soldUnit.findFirst({ where: { id: item.soldUnitId, tenantId: auth.tenantId } });
        if (!unit) throw notFound('Sold unit', item.soldUnitId);
        if (!unit.soldAt) throw badRequest(`${unit.brand} ${unit.model} n'est pas vendu`);
        await tx.soldUnit.update({
          where: { id: unit.id },
          data: { soldAt: null, returnedAt: new Date(), transactionId: null, customerId: null, warrantyExpiresAt: null },
        });
        const cost = num(unit.purchasePrice) + num(unit.repairCost);
        lines.push({ productId: null, soldUnitId: unit.id, name: `${unit.brand} ${unit.model}`, sku: unit.imei || unit.serialNumber, quantity: 1, refund, cost, original: item.originalTransactionId ?? unit.transactionId });
        continue;
      }
      if (!item.transactionItemId) throw badRequest('Article de vente introuvable');
      const original = await tx.transactionItem.findFirst({
        where: { id: item.transactionItemId, transaction: { tenantId: auth.tenantId } },
      });
      if (!original) throw notFound('Transaction item', item.transactionItemId);
      const returnable = original.quantity - original.returnedQuantity;
      if (item.quantity > returnable) throw badRequest(`Quantité retournable pour « ${original.productName} » : ${returnable}`);
      await tx.transactionItem.update({ where: { id: original.id }, data: { returnedQuantity: original.returnedQuantity + item.quantity } });
      lines.push({
        productId: original.productId,
        soldUnitId: null,
        name: original.productName,
        sku: original.sku,
        quantity: item.quantity,
        refund,
        cost: num(original.costPrice) * item.quantity,
        original: original.transactionId,
      });
    }

    const totalCost = r2(lines.reduce((s, l) => s + l.cost, 0));
    const transaction = await tx.transaction.create({
      data: {
        tenantId: auth.tenantId,
        storeId,
        cashierId: auth.userId,
        customerId: input.customerId || null,
        transactionNumber: makeRef('RET'),
        type: 'return',
        status: 'completed',
        subtotal: refundTotal,
        totalAmount: refundTotal,
        amountPaid: refundTotal,
        totalCost,
        // The sale's profit is lost, but the goods are back: net effect = cost − refund.
        totalProfit: r2(totalCost - refundTotal),
        originalTransactionId: lines[0]?.original ?? null,
        items: {
          create: lines.map((l) => ({
            productId: l.productId,
            soldUnitId: l.soldUnitId,
            productName: l.name,
            sku: l.sku,
            quantity: l.quantity,
            unitPrice: r2(l.refund / l.quantity),
            costPrice: r2(l.cost / l.quantity),
            totalPrice: l.refund,
            profit: r2(l.cost - l.refund),
          })),
        },
        payments: refundTotal > 0 ? { create: [{ method: 'cash', amount: refundTotal }] } : undefined,
      },
    });
    for (const l of lines) {
      if (l.productId) {
        await moveStock(tx, {
          tenantId: auth.tenantId,
          productId: l.productId,
          delta: l.quantity,
          type: 'return',
          reference: transaction.transactionNumber,
          notes: 'Retour client',
          storeId,
          userId: auth.userId,
        });
      }
    }
    if (refundTotal > 0) {
      await moveCaisse(tx, {
        tenantId: auth.tenantId,
        storeId,
        amount: -refundTotal,
        type: 'refund',
        reference: transaction.transactionNumber,
        description: 'Retour client',
        userId: auth.userId,
      });
    }
    return transaction;
  });
}
