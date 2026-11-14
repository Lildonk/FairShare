import type { Group, User } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { recordAuditEvent } from '@/lib/db/audit-log';
import { prisma, type DbTransaction } from '@/lib/db/prisma';
import {
  cleanupTestData,
  createTestGroup,
  createTestUser,
  deleteAuditEventsAsMaintenance,
} from '../helpers/auth-helpers';

// Issue #8: the audit ledger. AuditEvent rows are append-only, enforced by a database trigger,
// so history stays intact even if application code is wrong.

let alice: User;
let bob: User;
let group: Group;

const dinnerSnapshot = {
  id: 'expense-1',
  title: 'Dinner',
  amountCents: 3000,
  payerId: 'alice',
  splitType: 'EQUAL',
  category: 'General',
  isDisputed: false,
  splits: [
    { userId: 'alice', owedCents: 1500, allocatedBps: null },
    { userId: 'bob', owedCents: 1500, allocatedBps: null },
  ],
};

function createExpense(title = 'Dinner') {
  return prisma.expense.create({
    data: { groupId: group.id, payerId: alice.id, title, amountCents: 3000 },
  });
}

function recordEvent(entityId: string, action: 'EXPENSE_CREATED' | 'EXPENSE_DISPUTED' = 'EXPENSE_CREATED') {
  return prisma.$transaction((tx) =>
    recordAuditEvent(tx, { groupId: group.id, actorId: alice.id, action, entityId, snapshot: dinnerSnapshot }),
  );
}

/** Runs `work` in a transaction that is always rolled back, and returns the error it threw. */
async function errorInRolledBackTransaction(work: (tx: DbTransaction) => Promise<unknown>) {
  const rollback = new Error('rolled back on purpose');
  const error = await prisma
    .$transaction(async (tx) => {
      await work(tx);
      throw rollback;
    })
    .catch((caught: unknown) => caught);
  return error === rollback ? null : error;
}

beforeAll(async () => {
  alice = await createTestUser('AuditAlice');
  bob = await createTestUser('AuditBob');
  group = await createTestGroup('Audit test', [alice.id, bob.id]);
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe('recordAuditEvent', () => {
  it('stores the event with its actor, action, and snapshot in integer cents', async () => {
    const expense = await createExpense();

    const event = await prisma.$transaction((tx) =>
      recordAuditEvent(tx, {
        groupId: group.id,
        actorId: alice.id,
        action: 'EXPENSE_CREATED',
        entityId: expense.id,
        snapshot: { ...dinnerSnapshot, id: expense.id },
      }),
    );

    const stored = await prisma.auditEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(stored).toMatchObject({
      groupId: group.id,
      actorId: alice.id,
      action: 'EXPENSE_CREATED',
      entityId: expense.id,
    });
    expect(stored.snapshot).toEqual({ ...dinnerSnapshot, id: expense.id });
    expect(stored.createdAt).toBeInstanceOf(Date);
  });

  it('saves nothing when the transaction it belongs to fails, so a change and its event go together', async () => {
    const error = await prisma
      .$transaction(async (tx) => {
        const expense = await tx.expense.create({
          data: { groupId: group.id, payerId: alice.id, title: 'Rolled back', amountCents: 500 },
        });
        await recordAuditEvent(tx, {
          groupId: group.id,
          actorId: alice.id,
          action: 'EXPENSE_CREATED',
          entityId: expense.id,
          snapshot: { ...dinnerSnapshot, id: expense.id, title: 'Rolled back' },
        });
        throw new Error('handler failed after the write');
      })
      .catch((caught: unknown) => caught);

    expect(error).toEqual(new Error('handler failed after the write'));
    expect(await prisma.expense.count({ where: { groupId: group.id, title: 'Rolled back' } })).toBe(0);
    expect(
      await prisma.auditEvent.count({ where: { groupId: group.id, snapshot: { path: ['title'], equals: 'Rolled back' } } }),
    ).toBe(0);
  });

  it('rejects a snapshot with fractional cents through the shared client guard', async () => {
    await expect(
      prisma.$transaction((tx) =>
        recordAuditEvent(tx, {
          groupId: group.id,
          actorId: alice.id,
          action: 'EXPENSE_CREATED',
          entityId: 'expense-fraction',
          snapshot: { ...dinnerSnapshot, amountCents: 19.99 },
        }),
      ),
    ).rejects.toThrow(/amountCents must be a whole number/);
  });

  it('keeps the event after the expense it describes is deleted', async () => {
    const expense = await createExpense('Deleted later');
    const event = await recordEvent(expense.id);

    await prisma.expense.delete({ where: { id: expense.id } });

    expect(await prisma.auditEvent.findUnique({ where: { id: event.id } })).not.toBeNull();
  });
});

describe('AuditEvent is append-only', () => {
  it('rejects changing an event', async () => {
    const event = await recordEvent('immutable-1');

    await expect(
      prisma.auditEvent.update({ where: { id: event.id }, data: { action: 'EXPENSE_DELETED' } }),
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.auditEvent.updateMany({ where: { id: event.id }, data: { entityId: 'changed' } }),
    ).rejects.toThrow(/append-only/);
    expect((await prisma.auditEvent.findUniqueOrThrow({ where: { id: event.id } })).action).toBe('EXPENSE_CREATED');
  });

  it('rejects deleting an event', async () => {
    const event = await recordEvent('immutable-2');

    await expect(prisma.auditEvent.delete({ where: { id: event.id } })).rejects.toThrow(/append-only/);
    expect(await prisma.auditEvent.findUnique({ where: { id: event.id } })).not.toBeNull();
  });

  it('rejects emptying the table', async () => {
    // Rolled back either way, so a missing trigger can't wipe a development database.
    const error = await errorInRolledBackTransaction((tx) => tx.$executeRawUnsafe('TRUNCATE "AuditEvent"'));
    expect(String(error)).toMatch(/append-only/);
  });

  it('allows a delete only inside a transaction that turned on the maintenance switch', async () => {
    const kept = await recordEvent('maintenance-1');
    const removed = await recordEvent('maintenance-2');

    await deleteAuditEventsAsMaintenance({ id: removed.id });

    expect(await prisma.auditEvent.findUnique({ where: { id: removed.id } })).toBeNull();
    // SET LOCAL ends with its transaction, so a plain delete afterwards is still rejected.
    await expect(prisma.auditEvent.delete({ where: { id: kept.id } })).rejects.toThrow(/append-only/);
  });

  it('ignores the switch for changes, which are never allowed', async () => {
    const event = await recordEvent('maintenance-3');

    const error = await errorInRolledBackTransaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('fairshare.audit_maintenance', 'on', true)`;
      await tx.auditEvent.update({ where: { id: event.id }, data: { entityId: 'changed' } });
    });
    expect(String(error)).toMatch(/append-only/);
  });
});

describe('history keeps its group and actor', () => {
  it('blocks deleting a group that has audit events', async () => {
    const other = await createTestGroup('Audit restrict', [alice.id]);
    await prisma.$transaction((tx) =>
      recordAuditEvent(tx, {
        groupId: other.id,
        actorId: alice.id,
        action: 'EXPENSE_CREATED',
        entityId: 'restrict-1',
        snapshot: dinnerSnapshot,
      }),
    );

    await expect(prisma.group.delete({ where: { id: other.id } })).rejects.toThrow();
    expect(await prisma.group.findUnique({ where: { id: other.id } })).not.toBeNull();
  });

  it('blocks deleting a user who is the actor of an audit event', async () => {
    const carol = await createTestUser('AuditCarol');
    await prisma.$transaction((tx) =>
      recordAuditEvent(tx, {
        groupId: group.id,
        actorId: carol.id,
        action: 'EXPENSE_CREATED',
        entityId: 'restrict-2',
        snapshot: dinnerSnapshot,
      }),
    );

    await expect(prisma.user.delete({ where: { id: carol.id } })).rejects.toThrow();
    expect(await prisma.user.findUnique({ where: { id: carol.id } })).not.toBeNull();
  });
});
