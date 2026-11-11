import type { Group, User } from '@prisma/client';
import type { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DELETE as deleteExpense, PATCH as updateExpense } from '@/app/api/v1/groups/[groupId]/expenses/[expenseId]/route';
import { POST as createExpense } from '@/app/api/v1/groups/[groupId]/expenses/route';
import { POST as recordPayment } from '@/app/api/v1/groups/[groupId]/settlements/route';
import { PATCH as updateSettlement } from '@/app/api/v1/settlements/[settlementId]/route';
import { prisma } from '@/lib/db/prisma';
import { cleanupTestData, createTestGroup, createTestUser, jsonRequest, sessionCookie } from '../helpers/auth-helpers';

// Issue #8: every write through the #9 endpoints leaves exactly one AuditEvent, written in the same
// transaction, with the signed-in user as the actor. Refused writes leave none.

let alice: User;
let bob: User;
let carol: User;

async function call<P>(
  handler: (request: NextRequest, context: { params: P }) => Promise<Response>,
  method: string,
  url: string,
  params: P,
  user: User,
  body?: unknown,
) {
  const response = await handler(jsonRequest(url, { method, body, cookie: await sessionCookie(user) }), { params });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const expensesUrl = (groupId: string) => `/api/v1/groups/${groupId}/expenses`;

/** A $90.00 EQUAL dinner paid by Alice and split between Alice, Bob, and Carol. */
const dinner = () => ({
  title: 'Dinner',
  amountCents: 9000,
  payerId: alice.id,
  splitType: 'EQUAL',
  splits: [alice, bob, carol].map((u) => ({ userId: u.id, owedCents: 3000, allocatedBps: null })),
});

async function newGroup(name: string): Promise<Group> {
  return createTestGroup(name, [alice.id, bob.id, carol.id]);
}

function eventsFor(groupId: string) {
  return prisma.auditEvent.findMany({ where: { groupId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
}

beforeAll(async () => {
  [alice, bob, carol] = await Promise.all([
    createTestUser('TrailAlice'),
    createTestUser('TrailBob'),
    createTestUser('TrailCarol'),
  ]);
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe('expense writes', () => {
  it('records EXPENSE_CREATED with the new expense as the snapshot', async () => {
    const group = await newGroup('Trail create');
    const created = await call(createExpense, 'POST', expensesUrl(group.id), { groupId: group.id }, alice, dinner());
    expect(created.status).toBe(201);

    const events = await eventsFor(group.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actorId: alice.id, action: 'EXPENSE_CREATED', entityId: created.body.expense.id });
    expect(events[0].snapshot).toEqual(created.body.expense);
  });

  it('records EXPENSE_UPDATED with the replaced expense, and the member who changed it', async () => {
    const group = await newGroup('Trail update');
    const created = await call(createExpense, 'POST', expensesUrl(group.id), { groupId: group.id }, alice, dinner());
    const expenseId = created.body.expense.id;

    const updated = await call(
      updateExpense,
      'PATCH',
      `${expensesUrl(group.id)}/${expenseId}`,
      { groupId: group.id, expenseId },
      bob,
      { ...dinner(), title: 'Dinner and drinks' },
    );
    expect(updated.status).toBe(200);

    const events = await eventsFor(group.id);
    expect(events.map((e) => e.action)).toEqual(['EXPENSE_CREATED', 'EXPENSE_UPDATED']);
    expect(events[1]).toMatchObject({ actorId: bob.id, entityId: expenseId });
    expect(events[1].snapshot).toEqual(updated.body.expense);
  });

  it('records EXPENSE_DELETED with the expense as it was before the delete', async () => {
    const group = await newGroup('Trail delete');
    const created = await call(createExpense, 'POST', expensesUrl(group.id), { groupId: group.id }, alice, dinner());
    const expenseId = created.body.expense.id;

    const removed = await call(
      deleteExpense,
      'DELETE',
      `${expensesUrl(group.id)}/${expenseId}`,
      { groupId: group.id, expenseId },
      carol,
    );
    expect(removed.status).toBe(204);

    const events = await eventsFor(group.id);
    expect(events.map((e) => e.action)).toEqual(['EXPENSE_CREATED', 'EXPENSE_DELETED']);
    expect(events[1]).toMatchObject({ actorId: carol.id, entityId: expenseId });
    expect(events[1].snapshot).toEqual(created.body.expense);
  });

  it('records nothing when the expense is refused', async () => {
    const group = await newGroup('Trail refused');
    const refused = await call(createExpense, 'POST', expensesUrl(group.id), { groupId: group.id }, alice, {
      ...dinner(),
      amountCents: 9001, // the shares add up to 9000
    });
    expect(refused.status).toBe(400);

    expect(await eventsFor(group.id)).toEqual([]);
  });
});

describe('payment writes', () => {
  it('records SETTLEMENT_RECORDED with the stored payment and its status', async () => {
    const group = await newGroup('Trail payment');
    const recorded = await call(
      recordPayment,
      'POST',
      `/api/v1/groups/${group.id}/settlements`,
      { groupId: group.id },
      bob,
      { fromUserId: bob.id, toUserId: alice.id, amountCents: 3000 },
    );
    expect(recorded.status).toBe(201);

    const events = await eventsFor(group.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorId: bob.id,
      action: 'SETTLEMENT_RECORDED',
      entityId: recorded.body.settlement.id,
    });
    expect(events[0].snapshot).toEqual(recorded.body.settlement);
    expect(events[0].snapshot).toMatchObject({ status: 'PENDING' });
  });

  it('records SETTLEMENT_STATUS_CHANGED once, and nothing for a second answer that is refused', async () => {
    const group = await newGroup('Trail confirm');
    const recorded = await call(
      recordPayment,
      'POST',
      `/api/v1/groups/${group.id}/settlements`,
      { groupId: group.id },
      bob,
      { fromUserId: bob.id, toUserId: alice.id, amountCents: 3000 },
    );
    const settlementId = recorded.body.settlement.id;
    const answer = (status: string) =>
      call(updateSettlement, 'PATCH', `/api/v1/settlements/${settlementId}`, { settlementId }, alice, { status });

    const confirmed = await answer('CONFIRMED');
    expect(confirmed.status).toBe(200);
    expect((await answer('DISPUTED')).status).toBe(409);

    const events = await eventsFor(group.id);
    expect(events.map((e) => e.action)).toEqual(['SETTLEMENT_RECORDED', 'SETTLEMENT_STATUS_CHANGED']);
    expect(events[1]).toMatchObject({ actorId: alice.id, entityId: settlementId });
    expect(events[1].snapshot).toEqual(confirmed.body.settlement);
  });
});
