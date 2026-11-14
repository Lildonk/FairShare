import { randomUUID } from 'node:crypto';
import type { User } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PATCH as archiveGroup } from '@/app/api/v1/admin/groups/[groupId]/archive/route';
import { GET as listExpenses, POST as createExpense } from '@/app/api/v1/groups/[groupId]/expenses/route';
import { disputedExpenses } from '@/lib/db/admin';
import { prisma } from '@/lib/db/prisma';
import { cleanupTestData, createTestGroup, createTestUser, jsonRequest, sessionCookie } from '../helpers/auth-helpers';

let admin: User;
let alice: User;
let bob: User;

async function archive(groupId: string, user: User | null, cookieOverride?: string) {
  const cookie = cookieOverride ?? (user ? await sessionCookie(user) : undefined);
  const response = await archiveGroup(
    jsonRequest(`/api/v1/admin/groups/${groupId}/archive`, { method: 'PATCH', cookie }),
    { params: Promise.resolve({ groupId }) },
  );
  return { status: response.status, body: await response.json() };
}

const taxi = (payerId: string) => ({
  title: 'Taxi',
  amountCents: 1000,
  payerId,
  splitType: 'EXACT',
  splits: [{ userId: payerId, owedCents: 1000, allocatedBps: null }],
});

beforeAll(async () => {
  [admin, alice, bob] = await Promise.all([
    createTestUser('Admin', { role: 'ADMIN' }),
    createTestUser('Alice'),
    createTestUser('Bob'),
  ]);
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe('PATCH /api/v1/admin/groups/:groupId/archive', () => {
  it('lets an admin archive a group they are not a member of', async () => {
    const group = await createTestGroup('Trip', [alice.id, bob.id]);

    const { status, body } = await archive(group.id, admin);

    expect(status).toBe(200);
    expect(body).toEqual({
      group: { id: group.id, name: group.name, isArchived: true, memberCount: 2, expenseCount: 0, disputedExpenseCount: 0 },
    });
    expect((await prisma.group.findUniqueOrThrow({ where: { id: group.id } })).isArchived).toBe(true);
  });

  it('answers 200 again for a group that is already archived', async () => {
    const group = await createTestGroup('Old trip', [alice.id]);
    await archive(group.id, admin);

    const { status, body } = await archive(group.id, admin);

    expect(status).toBe(200);
    expect(body.group.isArchived).toBe(true);
  });

  it('freezes the ledger: members can still read the expenses but can no longer add one', async () => {
    const group = await createTestGroup('Flat', [alice.id]);
    await archive(group.id, admin);
    const cookie = await sessionCookie(alice);

    // Next.js 15 passes route params as a promise.
    const add = await createExpense(
      jsonRequest(`/api/v1/groups/${group.id}/expenses`, { method: 'POST', body: taxi(alice.id), cookie }),
      { params: Promise.resolve({ groupId: group.id }) },
    );
    const read = await listExpenses(jsonRequest(`/api/v1/groups/${group.id}/expenses`, { cookie }), {
      params: Promise.resolve({ groupId: group.id }),
    });

    expect(add.status).toBe(409);
    expect((await add.json()).code).toBe('group_archived');
    expect(read.status).toBe(200);
  });

  it('answers 403 to a member, even in their own group, and archives nothing', async () => {
    const group = await createTestGroup('Club', [alice.id]);

    const { status, body } = await archive(group.id, alice);

    expect(status).toBe(403);
    expect(body.code).toBe('forbidden');
    expect((await prisma.group.findUniqueOrThrow({ where: { id: group.id } })).isArchived).toBe(false);
  });

  it('answers 403 when the session says ADMIN but the database no longer does', async () => {
    const demoted = await createTestUser('Former admin', { role: 'ADMIN' });
    const cookie = await sessionCookie(demoted);
    await prisma.user.update({ where: { id: demoted.id }, data: { role: 'MEMBER' } });
    const group = await createTestGroup('Book club', [alice.id]);

    const { status } = await archive(group.id, null, cookie);

    expect(status).toBe(403);
  });

  it('answers 404 for an unknown group', async () => {
    const { status, body } = await archive(randomUUID(), admin);

    expect(status).toBe(404);
    expect(body.code).toBe('not_found');
  });

  it('answers 401 without a session', async () => {
    const group = await createTestGroup('Choir', [alice.id]);

    expect((await archive(group.id, null)).status).toBe(401);
  });
});

describe('disputedExpenses', () => {
  it('lists disputed expenses from every group, newest first, with group and payer names', async () => {
    const tahoe = await createTestGroup('Disputes A', [alice.id]);
    const flat = await createTestGroup('Disputes B', [bob.id]);
    const older = await prisma.expense.create({
      data: {
        groupId: tahoe.id,
        payerId: alice.id,
        title: 'Boat rental',
        amountCents: 12050,
        isDisputed: true,
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
        splits: { create: [{ userId: alice.id, owedCents: 12050 }] },
      },
    });
    const newer = await prisma.expense.create({
      data: {
        groupId: flat.id,
        payerId: bob.id,
        title: 'Cleaning',
        amountCents: 500,
        isDisputed: true,
        createdAt: new Date('2026-02-01T10:00:00.000Z'),
        splits: { create: [{ userId: bob.id, owedCents: 500 }] },
      },
    });
    await prisma.expense.create({
      data: {
        groupId: tahoe.id,
        payerId: alice.id,
        title: 'Not disputed',
        amountCents: 100,
        splits: { create: [{ userId: alice.id, owedCents: 100 }] },
      },
    });

    const ours = (await disputedExpenses()).filter((e) => e.groupId === tahoe.id || e.groupId === flat.id);

    expect(ours).toEqual([
      { id: newer.id, title: 'Cleaning', amountCents: 500, groupId: flat.id, groupName: flat.name, payerName: 'Bob', createdAt: '2026-02-01T10:00:00.000Z' },
      { id: older.id, title: 'Boat rental', amountCents: 12050, groupId: tahoe.id, groupName: tahoe.name, payerName: 'Alice', createdAt: '2026-01-01T10:00:00.000Z' },
    ]);
  });
});
