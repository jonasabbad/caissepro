import { prisma, type Prisma } from './prisma.js';
import { num, r2 } from './serialize.js';

/**
 * Business expenses (rent, salaries, utilities…). They are the only source of "operating" costs in the profit
 * statement, so they must not duplicate what other modules already count:
 *  - goods bought for resale → supplier orders (their cost is counted when the goods are sold, as COGS)
 *  - repair parts, technicians and other repair costs → the repair itself
 *  - moving cash in/out of the drawer (deposits, withdrawals) → cash drawer, not an expense
 */
export const EXPENSE_CATEGORIES = ['rent', 'salaries', 'utilities', 'telecom', 'transport', 'supplies', 'marketing', 'maintenance', 'fees', 'taxes', 'other'] as const;
export const EXPENSE_METHODS = ['cash', 'card', 'bank_transfer'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Non-deleted expenses dated within [from, to] (expense date, not entry date), optionally for one store. */
export const expensesWhere = (tenantId: string, from: Date, to: Date, storeId?: string | null): Prisma.ExpenseWhereInput => ({
  tenantId,
  deletedAt: null,
  date: { gte: from, lte: to },
  ...(storeId ? { storeId } : {}),
});

export async function expensesPnl(tenantId: string, from: Date, to: Date, storeId?: string | null) {
  const rows = await prisma.expense.findMany({ where: expensesWhere(tenantId, from, to, storeId), select: { amount: true, category: true, paymentMethod: true } });
  const byCategory: Record<string, number> = {};
  const byPaymentMethod: Record<string, number> = {};
  for (const e of rows) {
    byCategory[e.category] = r2((byCategory[e.category] ?? 0) + num(e.amount));
    byPaymentMethod[e.paymentMethod] = r2((byPaymentMethod[e.paymentMethod] ?? 0) + num(e.amount));
  }
  return { count: rows.length, total: r2(rows.reduce((s, e) => s + num(e.amount), 0)), byCategory, byPaymentMethod };
}
