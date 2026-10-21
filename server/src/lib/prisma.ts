import { PrismaClient, Prisma } from '@prisma/client';

// PRISMA_LOG_SLOW_MS=200 logs every database query slower than 200 ms (with its duration), to find slow screens.
const slowMs = Number(process.env.PRISMA_LOG_SLOW_MS) || 0;

export const prisma = slowMs
  ? (() => {
      const client = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
      client.$on('query', (e) => {
        if (e.duration >= slowMs) console.warn(`[slow query ${e.duration} ms] ${e.query.slice(0, 400)}`);
      });
      return client;
    })()
  : new PrismaClient();
export { Prisma };

export type Tx = Prisma.TransactionClient;
