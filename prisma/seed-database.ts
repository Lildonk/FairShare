import type { Db } from '../src/lib/db/prisma';
import { seedData } from './seed-data';

/** Throws in production: the seed creates demo accounts, including an ADMIN, with a known password. */
export function assertSeedingAllowed(env: { NODE_ENV?: string }): void {
  if (env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production database: the seed creates demo accounts with a known password.');
  }
}

/**
 * Writes the sample data in one transaction. Every row is upserted by its fixed id, so running
 * the seed again restores the sample rows without duplicating them or touching other data.
 */
export async function seedDatabase(prisma: Db, env: { NODE_ENV?: string } = process.env): Promise<void> {
  assertSeedingAllowed(env);
  await prisma.$transaction(async (tx) => {
    for (const user of seedData.users) {
      await tx.user.upsert({ where: { id: user.id }, create: user, update: user });
    }

    for (const group of seedData.groups) {
      await tx.group.upsert({ where: { id: group.id }, create: group, update: group });
    }

    for (const membership of seedData.memberships) {
      await tx.groupMember.upsert({
        where: { id: membership.id },
        create: membership,
        update: membership,
      });
    }

    for (const { splits, ...expense } of seedData.expenses) {
      await tx.expense.upsert({ where: { id: expense.id }, create: expense, update: expense });

      for (const split of splits) {
        const row = { ...split, expenseId: expense.id };
        await tx.expenseSplit.upsert({ where: { id: split.id }, create: row, update: row });
      }
    }

    for (const settlement of seedData.settlements) {
      await tx.settlement.upsert({
        where: { id: settlement.id },
        create: settlement,
        update: settlement,
      });
    }
  });
}
