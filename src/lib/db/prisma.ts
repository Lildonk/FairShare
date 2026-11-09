import { PrismaClient } from '@prisma/client';
import { assertIntegerAmounts } from './integer-amounts';

const WRITE_OPERATIONS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
]);

function createPrismaClient() {
  return new PrismaClient().$extends({
    name: 'integer-amounts',
    query: {
      $allModels: {
        $allOperations({ operation, args, query }) {
          if (WRITE_OPERATIONS.has(operation)) assertIntegerAmounts(args);
          return query(args);
        },
      },
    },
  });
}

/** The app's database client: Prisma with the integer-amount guard on every write. */
export type Db = ReturnType<typeof createPrismaClient>;

// Reuse one client across hot reloads in development; otherwise every edit opens a new connection pool.
const globalForPrisma = globalThis as unknown as { prisma?: Db };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
