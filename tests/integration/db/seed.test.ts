import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { seedData } from '../../../prisma/seed-data';
import { seedDatabase } from '../../../prisma/seed-database';

const ids = {
  users: seedData.users.map((u) => u.id),
  groups: seedData.groups.map((g) => g.id),
  memberships: seedData.memberships.map((m) => m.id),
  expenses: seedData.expenses.map((e) => e.id),
  splits: seedData.expenses.flatMap((e) => e.splits.map((s) => s.id)),
  settlements: seedData.settlements.map((s) => s.id),
};

// Every row the seed owns, selected by its fixed id, without updatedAt (Prisma sets it to the write time).
async function readSeededRows() {
  const byId = (list: string[]) => ({ where: { id: { in: list } }, orderBy: { id: 'asc' as const } });
  const [users, groups, memberships, expenses, splits, settlements] = await Promise.all([
    prisma.user.findMany({ ...byId(ids.users), omit: { updatedAt: true } }),
    prisma.group.findMany({ ...byId(ids.groups), omit: { updatedAt: true } }),
    prisma.groupMember.findMany(byId(ids.memberships)),
    prisma.expense.findMany({ ...byId(ids.expenses), omit: { updatedAt: true } }),
    prisma.expenseSplit.findMany(byId(ids.splits)),
    prisma.settlement.findMany({ ...byId(ids.settlements), omit: { updatedAt: true } }),
  ]);
  return { users, groups, memberships, expenses, splits, settlements };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('seedDatabase', () => {
  it('creates every sample row with its fixed id and values', async () => {
    await seedDatabase(prisma);
    const rows = await readSeededRows();

    expect(rows.users).toHaveLength(ids.users.length);
    expect(rows.groups).toHaveLength(ids.groups.length);
    expect(rows.memberships).toHaveLength(ids.memberships.length);
    expect(rows.expenses).toHaveLength(ids.expenses.length);
    expect(rows.splits).toHaveLength(ids.splits.length);
    expect(rows.settlements).toHaveLength(ids.settlements.length);

    for (const expected of seedData.expenses) {
      const expense = rows.expenses.find((e) => e.id === expected.id);
      const splits = rows.splits.filter((s) => s.expenseId === expected.id);

      expect(expense?.amountCents, expected.title).toBe(expected.amountCents);
      expect(expense?.createdAt.toISOString(), expected.title).toBe(expected.createdAt);
      expect(splits.reduce((sum, s) => sum + s.owedCents, 0), expected.title).toBe(expected.amountCents);
    }
  });

  it('can run again without duplicating or changing any row', async () => {
    await seedDatabase(prisma);
    const before = await readSeededRows();

    await seedDatabase(prisma);

    expect(await readSeededRows()).toEqual(before);
  });
});
