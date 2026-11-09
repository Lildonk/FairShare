import { randomUUID } from 'node:crypto';
import { Prisma, type Group, type User } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db/prisma';

// Every run creates its own users and groups, tagged with a unique run id, and deletes them afterwards.
// It never truncates tables, so it is safe to run against a local development database.
const runId = randomUUID().slice(0, 8);
const groupIds: string[] = [];

let alice: User;
let bob: User;
let group: Group;

function createUser(name: string): Promise<User> {
  return prisma.user.create({
    data: { email: `${name.toLowerCase()}.${runId}@integration.test`, name },
  });
}

async function createGroup(name: string, memberIds: string[]): Promise<Group> {
  const created = await prisma.group.create({
    data: {
      name: `${name} ${runId}`,
      members: { create: memberIds.map((userId) => ({ userId })) },
    },
  });
  groupIds.push(created.id);
  return created;
}

function createExpense(data: Partial<Prisma.ExpenseUncheckedCreateInput> = {}) {
  return prisma.expense.create({
    data: { groupId: group.id, payerId: alice.id, title: 'Groceries', amountCents: 3000, ...data },
  });
}

beforeAll(async () => {
  alice = await createUser('Alice');
  bob = await createUser('Bob');
  group = await createGroup('Schema test', [alice.id, bob.id]);
});

afterAll(async () => {
  // Deleting a group cascades to its members, expenses, splits, and settlements,
  // which releases the users for deletion.
  await prisma.group.deleteMany({ where: { id: { in: groupIds } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `.${runId}@integration.test` } } });
  await prisma.$disconnect();
});

describe('User', () => {
  it('defaults the role to MEMBER and allows no password hash for Google-only accounts', async () => {
    expect(alice.role).toBe('MEMBER');
    expect(alice.passwordHash).toBeNull();
  });

  it('rejects a second account with the same email', async () => {
    await expect(
      prisma.user.create({ data: { email: alice.email, name: 'Alice again' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});

describe('Group', () => {
  it('defaults to USD and not archived, with a unique invite code', async () => {
    const other = await createGroup('Second group', [alice.id]);

    expect(group.currency).toBe('USD');
    expect(group.isArchived).toBe(false);
    expect(group.inviteCode).toBeTruthy();
    expect(other.inviteCode).not.toBe(group.inviteCode);
  });
});

describe('GroupMember', () => {
  it('rejects adding the same user to a group twice', async () => {
    await expect(
      prisma.groupMember.create({ data: { groupId: group.id, userId: alice.id } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});

describe('Expense', () => {
  it('stores the amount as exact integer cents, with EQUAL, General, and not disputed by default', async () => {
    const expense = await createExpense({ amountCents: 1999 });

    expect(expense.amountCents).toBe(1999);
    expect(expense.splitType).toBe('EQUAL');
    expect(expense.category).toBe('General');
    expect(expense.isDisputed).toBe(false);
  });

  it('rejects fractional cents before they reach the database', async () => {
    await expect(createExpense({ amountCents: 19.99 })).rejects.toBeInstanceOf(
      Prisma.PrismaClientValidationError,
    );
  });

  it('rejects a zero or negative amount', async () => {
    await expect(createExpense({ amountCents: 0 })).rejects.toThrow(/Expense_amountCents_check/);
    await expect(createExpense({ amountCents: -500 })).rejects.toThrow(/Expense_amountCents_check/);
  });
});

describe('ExpenseSplit', () => {
  it('rejects two shares for the same user on one expense', async () => {
    const expense = await createExpense();
    await prisma.expenseSplit.create({
      data: { expenseId: expense.id, userId: bob.id, owedCents: 1500 },
    });

    await expect(
      prisma.expenseSplit.create({ data: { expenseId: expense.id, userId: bob.id, owedCents: 1500 } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects a negative share', async () => {
    const expense = await createExpense();

    await expect(
      prisma.expenseSplit.create({ data: { expenseId: expense.id, userId: bob.id, owedCents: -1 } }),
    ).rejects.toThrow(/ExpenseSplit_owedCents_check/);
  });

  it('stores percentages as integer basis points between 0 and 10000', async () => {
    const expense = await createExpense({ splitType: 'PERCENTAGE' });
    const split = await prisma.expenseSplit.create({
      data: { expenseId: expense.id, userId: alice.id, owedCents: 1000, allocatedBps: 3333 },
    });

    expect(split.allocatedBps).toBe(3333);
    await expect(
      prisma.expenseSplit.create({
        data: { expenseId: expense.id, userId: bob.id, owedCents: 2000, allocatedBps: 10_001 },
      }),
    ).rejects.toThrow(/ExpenseSplit_allocatedBps_check/);
    await expect(
      prisma.expenseSplit.create({
        data: { expenseId: expense.id, userId: bob.id, owedCents: 2000, allocatedBps: -1 },
      }),
    ).rejects.toThrow(/ExpenseSplit_allocatedBps_check/);
  });

  it("removes an expense's splits when the expense is deleted", async () => {
    const expense = await createExpense({
      splits: {
        create: [
          { userId: alice.id, owedCents: 1500 },
          { userId: bob.id, owedCents: 1500 },
        ],
      },
    });

    await prisma.expense.delete({ where: { id: expense.id } });

    expect(await prisma.expenseSplit.count({ where: { expenseId: expense.id } })).toBe(0);
  });
});

describe('Settlement', () => {
  it('defaults to PENDING and links the paying and receiving users', async () => {
    const settlement = await prisma.settlement.create({
      data: { groupId: group.id, fromUserId: bob.id, toUserId: alice.id, amountCents: 1500 },
      include: { fromUser: true, toUser: true },
    });

    expect(settlement.status).toBe('PENDING');
    expect(settlement.settledAt).toBeNull();
    expect(settlement.fromUser.name).toBe('Bob');
    expect(settlement.toUser.name).toBe('Alice');
  });

  it('rejects a settlement from a user to themselves', async () => {
    await expect(
      prisma.settlement.create({
        data: { groupId: group.id, fromUserId: bob.id, toUserId: bob.id, amountCents: 1500 },
      }),
    ).rejects.toThrow(/Settlement_fromUserId_toUserId_check/);
  });

  it('rejects a zero amount', async () => {
    await expect(
      prisma.settlement.create({
        data: { groupId: group.id, fromUserId: bob.id, toUserId: alice.id, amountCents: 0 },
      }),
    ).rejects.toThrow(/Settlement_amountCents_check/);
  });

  it('rejects a settlement with an unknown user', async () => {
    await expect(
      prisma.settlement.create({
        data: { groupId: group.id, fromUserId: randomUUID(), toUserId: alice.id, amountCents: 1500 },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });
});

describe('financial history protection', () => {
  it('blocks deleting a user who paid an expense', async () => {
    const payer = await createUser('Payer');
    const trip = await createGroup('Payer trip', [payer.id]);
    await prisma.expense.create({
      data: { groupId: trip.id, payerId: payer.id, title: 'Gas', amountCents: 4200 },
    });

    await expect(prisma.user.delete({ where: { id: payer.id } })).rejects.toThrow();
    expect(await prisma.user.findUnique({ where: { id: payer.id } })).not.toBeNull();
    expect(await prisma.expense.count({ where: { payerId: payer.id } })).toBe(1);
  });

  it('blocks deleting a user who owes a share', async () => {
    const debtor = await createUser('Debtor');
    await prisma.groupMember.create({ data: { groupId: group.id, userId: debtor.id } });
    await createExpense({ splits: { create: [{ userId: debtor.id, owedCents: 3000 }] } });

    await expect(prisma.user.delete({ where: { id: debtor.id } })).rejects.toThrow();
    expect(await prisma.expenseSplit.count({ where: { userId: debtor.id } })).toBe(1);
  });

  it('blocks deleting a user who sent or received a settlement', async () => {
    const sender = await createUser('Sender');
    const receiver = await createUser('Receiver');
    const trip = await createGroup('Settlement trip', [sender.id, receiver.id]);
    await prisma.settlement.create({
      data: { groupId: trip.id, fromUserId: sender.id, toUserId: receiver.id, amountCents: 800 },
    });

    await expect(prisma.user.delete({ where: { id: sender.id } })).rejects.toThrow();
    await expect(prisma.user.delete({ where: { id: receiver.id } })).rejects.toThrow();
    expect(await prisma.settlement.count({ where: { groupId: trip.id } })).toBe(1);
  });

  it('deletes everything in a group when the group itself is deleted', async () => {
    const trip = await createGroup('Deleted trip', [alice.id, bob.id]);
    await prisma.expense.create({
      data: {
        groupId: trip.id,
        payerId: alice.id,
        title: 'Cabin',
        amountCents: 20_000,
        splits: { create: [{ userId: bob.id, owedCents: 20_000 }] },
      },
    });
    await prisma.settlement.create({
      data: { groupId: trip.id, fromUserId: bob.id, toUserId: alice.id, amountCents: 20_000 },
    });

    await prisma.group.delete({ where: { id: trip.id } });

    expect(await prisma.groupMember.count({ where: { groupId: trip.id } })).toBe(0);
    expect(await prisma.expense.count({ where: { groupId: trip.id } })).toBe(0);
    expect(await prisma.expenseSplit.count({ where: { expense: { groupId: trip.id } } })).toBe(0);
    expect(await prisma.settlement.count({ where: { groupId: trip.id } })).toBe(0);
  });
});

describe('indexes', () => {
  it('indexes every foreign key column used for lookups', async () => {
    const indexes = await prisma.$queryRaw<{ tablename: string; indexdef: string }[]>`
      SELECT tablename, indexdef FROM pg_indexes WHERE schemaname = current_schema()
    `;
    const foreignKeys: [table: string, column: string][] = [
      ['GroupMember', 'userId'],
      ['GroupMember', 'groupId'],
      ['Expense', 'groupId'],
      ['Expense', 'payerId'],
      ['ExpenseSplit', 'expenseId'],
      ['ExpenseSplit', 'userId'],
      ['Settlement', 'groupId'],
      ['Settlement', 'fromUserId'],
      ['Settlement', 'toUserId'],
    ];

    for (const [table, column] of foreignKeys) {
      // The column must lead some index on its table, or lookups by it cannot use the index.
      const leadsAnIndex = indexes.some(
        (index) => index.tablename === table && index.indexdef.includes(`USING btree ("${column}"`),
      );
      expect(leadsAnIndex, `${table}.${column}`).toBe(true);
    }
  });
});
