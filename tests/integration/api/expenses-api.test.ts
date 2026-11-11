import { randomUUID } from 'node:crypto';
import type { Expense, Group, User } from '@prisma/client';
import type { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DELETE as deleteExpense, PATCH as updateExpense } from '@/app/api/v1/groups/[groupId]/expenses/[expenseId]/route';
import { GET as listExpenses, POST as createExpense } from '@/app/api/v1/groups/[groupId]/expenses/route';
import { buildExpenseDraft, type ExpenseFormState, type NewExpense } from '@/components/add-expense/expense-draft';
import { prisma } from '@/lib/db/prisma';
import { cleanupTestData, createTestGroup, createTestUser, jsonRequest, sessionCookie } from '../helpers/auth-helpers';

let alice: User;
let bob: User;
let carol: User;
let dave: User; // in no group here
let trip: Group;
let other: Group; // alice is in both trip and other
let archived: Group;
let archivedExpense: Expense;

async function call<P>(
  handler: (request: NextRequest, context: { params: P }) => Promise<Response>,
  method: string,
  url: string,
  params: P,
  user?: User,
  body?: unknown,
) {
  const cookie = user ? await sessionCookie(user) : undefined;
  const response = await handler(jsonRequest(url, { method, body, cookie }), { params });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const url = (groupId: string, expenseId?: string) =>
  `/api/v1/groups/${groupId}/expenses${expenseId ? `/${expenseId}` : ''}`;
const post = (groupId: string, body: unknown, user: User | undefined = alice) =>
  call(createExpense, 'POST', url(groupId), { groupId }, user, body);
const list = (groupId: string, user: User | undefined = alice) => call(listExpenses, 'GET', url(groupId), { groupId }, user);
const patch = (groupId: string, expenseId: string, body: unknown, user: User | undefined = alice) =>
  call(updateExpense, 'PATCH', url(groupId, expenseId), { groupId, expenseId }, user, body);
const remove = (groupId: string, expenseId: string, user: User | undefined = alice) =>
  call(deleteExpense, 'DELETE', url(groupId, expenseId), { groupId, expenseId }, user);

const byUser = <T extends { userId: string }>(rows: T[]) =>
  [...rows].sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));

/** What the add-expense dialog would submit for this form. */
function fromDialog(form: Partial<ExpenseFormState>): NewExpense {
  const members = [alice, bob, carol].map(({ id, name }) => ({ id, name }));
  const draft = buildExpenseDraft(
    {
      description: 'Dinner',
      amount: '100.00',
      payerId: alice.id,
      splitType: 'EQUAL',
      participantIds: [alice.id, bob.id, carol.id],
      exactInputs: {},
      percentInputs: {},
      ...form,
    },
    members,
  );
  if (!draft.expense) throw new Error(`invalid test form: ${JSON.stringify(draft.errors)}`);
  return draft.expense;
}

/** A valid EXACT expense to vary in the validation tests. */
const taxi = () => ({
  title: 'Taxi',
  amountCents: 3000,
  payerId: alice.id,
  splitType: 'EXACT',
  splits: [
    { userId: alice.id, owedCents: 1500, allocatedBps: null },
    { userId: bob.id, owedCents: 1500, allocatedBps: null },
  ],
});

beforeAll(async () => {
  [alice, bob, carol, dave] = await Promise.all([
    createTestUser('Alice'),
    createTestUser('Bob'),
    createTestUser('Carol'),
    createTestUser('Dave'),
  ]);
  trip = await createTestGroup('Trip', [alice.id, bob.id, carol.id]);
  other = await createTestGroup('Other', [alice.id, bob.id]);
  archived = await createTestGroup('Old trip', [alice.id, bob.id]);
  archivedExpense = await prisma.expense.create({
    data: {
      groupId: archived.id,
      payerId: alice.id,
      title: 'Old dinner',
      amountCents: 1000,
      splitType: 'EXACT',
      splits: { create: [{ userId: alice.id, owedCents: 1000 }] },
    },
  });
  await prisma.group.update({ where: { id: archived.id }, data: { isArchived: true } });
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe('POST /api/v1/groups/:groupId/expenses', () => {
  it('saves an EQUAL expense exactly as the add-expense dialog submits it', async () => {
    const payload = fromDialog({});

    const { status, body } = await post(trip.id, payload);

    expect(status).toBe(201);
    expect(body).toEqual({
      expense: {
        id: expect.any(String),
        groupId: trip.id,
        title: 'Dinner',
        amountCents: 10000,
        payerId: alice.id,
        splitType: 'EQUAL',
        category: 'General',
        isDisputed: false,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        splits: byUser(payload.splits),
      },
    });
    // The payer takes the leftover cent: 3334 + 3333 + 3333.
    expect(body.expense.splits.find((s: { userId: string }) => s.userId === alice.id).owedCents).toBe(3334);
    const saved = await prisma.expenseSplit.findMany({ where: { expenseId: body.expense.id } });
    expect(saved.reduce((sum, s) => sum + s.owedCents, 0)).toBe(10000);
  });

  it('saves a PERCENTAGE expense from the dialog, with its basis points', async () => {
    const payload = fromDialog({
      amount: '99.99',
      splitType: 'PERCENTAGE',
      percentInputs: { [alice.id]: '50', [bob.id]: '25', [carol.id]: '25' },
    });

    const { status, body } = await post(trip.id, payload);

    expect(status).toBe(201);
    expect(body.expense.splits).toEqual(byUser(payload.splits));
    expect(body.expense.splits.map((s: { allocatedBps: number }) => s.allocatedBps).sort()).toEqual([2500, 2500, 5000]);
  });

  it('saves an EXACT expense from the dialog', async () => {
    const payload = fromDialog({
      amount: '30.00',
      splitType: 'EXACT',
      participantIds: [alice.id, bob.id],
      exactInputs: { [alice.id]: '10.00', [bob.id]: '20.00' },
    });

    const { status, body } = await post(trip.id, payload);

    expect(status).toBe(201);
    expect(body.expense.splits).toEqual(byUser(payload.splits));
  });

  it('saves an ITEMIZED expense whose shares add up to the total', async () => {
    const { status, body } = await post(trip.id, {
      title: 'Receipt',
      amountCents: 3870,
      payerId: bob.id,
      splitType: 'ITEMIZED',
      category: 'Food',
      splits: [
        { userId: alice.id, owedCents: 1935, allocatedBps: null },
        { userId: bob.id, owedCents: 1935, allocatedBps: null },
      ],
    });

    expect(status).toBe(201);
    expect(body.expense).toMatchObject({ splitType: 'ITEMIZED', category: 'Food', payerId: bob.id });
  });

  it('ignores fields the client may not set, such as isDisputed and groupId', async () => {
    const { status, body } = await post(trip.id, { ...taxi(), isDisputed: true, groupId: other.id, id: 'chosen' });

    expect(status).toBe(201);
    expect(body.expense).toMatchObject({ isDisputed: false, groupId: trip.id });
    expect(body.expense.id).not.toBe('chosen');
  });

  it.each([
    ['the title is blank', { title: '  ' }, 'title'],
    ['the title is too long', { title: 'x'.repeat(201) }, 'title'],
    ['the category is too long', { category: 'x'.repeat(51) }, 'category'],
    ['the amount is fractional', { amountCents: 3000.5 }, 'amountCents'],
    ['the amount is zero', { amountCents: 0 }, 'amountCents'],
    ['splitType is unknown', { splitType: 'RANDOM' }, 'splitType'],
    ['there are no splits', { splits: [] }, 'splits'],
  ])('answers 400 when %s', async (_case, change, field) => {
    const { status, body } = await post(trip.id, { ...taxi(), ...change });

    expect(status).toBe(400);
    expect(body.code).toBe('invalid_input');
    expect(body.fields).toHaveProperty([field]);
  });

  it('answers 400 when the payer is not in the group', async () => {
    const { status, body } = await post(trip.id, { ...taxi(), payerId: dave.id });

    expect(status).toBe(400);
    expect(body.fields).toHaveProperty(['payerId']);
  });

  it('answers 400 when a split names someone outside the group', async () => {
    const expense = taxi();
    expense.splits[1].userId = dave.id;

    const { status, body } = await post(trip.id, expense);

    expect(status).toBe(400);
    expect(body.fields).toHaveProperty(['splits[1].userId']);
  });

  it('answers 400 when a member appears twice', async () => {
    const expense = taxi();
    expense.splits[1].userId = alice.id;

    const { status, body } = await post(trip.id, expense);

    expect(status).toBe(400);
    expect(body.fields).toHaveProperty(['splits']);
  });

  it('answers 400 when a share is fractional', async () => {
    const expense = taxi();
    expense.splits[0].owedCents = 1499.5;

    const { status, body } = await post(trip.id, expense);

    expect(status).toBe(400);
    expect(body.fields).toHaveProperty(['splits[0].owedCents']);
  });

  it('answers 400 when the shares do not add up to the amount', async () => {
    const expense = taxi();
    expense.splits[1].owedCents = 1499;

    const { status, body } = await post(trip.id, expense);

    expect(status).toBe(400);
    expect(body.fields).toHaveProperty(['splits']);
  });

  it('answers 400 when an EQUAL split is not the equal split of the amount', async () => {
    const expense = { ...taxi(), splitType: 'EQUAL' };
    expense.splits[0].owedCents = 2000;
    expense.splits[1].owedCents = 1000;

    const { status, body } = await post(trip.id, expense);

    expect(status).toBe(400);
    expect(body.fields).toHaveProperty(['splits']);
  });

  it('answers 400 when PERCENTAGE cents do not match their basis points', async () => {
    const { status, body } = await post(trip.id, {
      ...taxi(),
      splitType: 'PERCENTAGE',
      splits: [
        { userId: alice.id, owedCents: 2000, allocatedBps: 5000 },
        { userId: bob.id, owedCents: 1000, allocatedBps: 5000 },
      ],
    });

    expect(status).toBe(400);
    expect(body.fields).toHaveProperty(['splits']);
  });

  it('answers 400 when a PERCENTAGE split has no basis points', async () => {
    const { status, body } = await post(trip.id, { ...taxi(), splitType: 'PERCENTAGE' });

    expect(status).toBe(400);
    expect(body.fields).toHaveProperty(['splits[0].allocatedBps']);
  });

  it('answers 400 when basis points come with a split that is not PERCENTAGE', async () => {
    const expense = taxi();
    (expense.splits[0] as { allocatedBps: number | null }).allocatedBps = 5000;

    const { status, body } = await post(trip.id, expense);

    expect(status).toBe(400);
    expect(body.fields).toHaveProperty(['splits[0].allocatedBps']);
  });

  it('answers 401 without a session', async () => {
    const { status } = await post(trip.id, taxi(), undefined);

    expect(status).toBe(401);
  });

  it('gives a non-member the same 404 as a group that does not exist', async () => {
    const notTheirs = await post(trip.id, taxi(), dave);
    const unknown = await post(randomUUID(), taxi(), dave);

    expect(notTheirs.status).toBe(404);
    expect(notTheirs.body).toEqual(unknown.body);
  });

  it('answers 409 for an archived group, and saves nothing', async () => {
    const before = await prisma.expense.count({ where: { groupId: archived.id } });

    const { status, body } = await post(archived.id, { ...taxi(), splits: [{ userId: alice.id, owedCents: 3000, allocatedBps: null }] });

    expect(status).toBe(409);
    expect(body.code).toBe('group_archived');
    expect(await prisma.expense.count({ where: { groupId: archived.id } })).toBe(before);
  });
});

describe('GET /api/v1/groups/:groupId/expenses', () => {
  it('lists only this group’s expenses, oldest first, with splits sorted by member', async () => {
    const group = await createTestGroup('Ordered', [alice.id, bob.id]);
    const first = await post(group.id, { ...taxi(), title: 'First' });
    const second = await post(group.id, { ...taxi(), title: 'Second' });

    const { status, body } = await list(group.id);

    expect(status).toBe(200);
    expect(body.expenses).toEqual([first.body.expense, second.body.expense]);
    expect(body.expenses[0].splits).toEqual(byUser(body.expenses[0].splits));
  });

  it('still lists an archived group’s expenses', async () => {
    const { status, body } = await list(archived.id);

    expect(status).toBe(200);
    expect(body.expenses.map((e: { id: string }) => e.id)).toEqual([archivedExpense.id]);
  });

  it('gives a non-member the same 404 as a group that does not exist', async () => {
    const notTheirs = await list(trip.id, dave);
    const unknown = await list(randomUUID(), dave);

    expect(notTheirs.status).toBe(404);
    expect(notTheirs.body).toEqual(unknown.body);
  });

  it('answers 401 without a session', async () => {
    expect((await list(trip.id, undefined)).status).toBe(401);
  });
});

describe('PATCH /api/v1/groups/:groupId/expenses/:expenseId', () => {
  it('replaces the expense and its splits', async () => {
    const created = await post(trip.id, taxi());
    const replacement = fromDialog({ amount: '45.00', payerId: bob.id, participantIds: [bob.id, carol.id] });

    const { status, body } = await patch(trip.id, created.body.expense.id, replacement);

    expect(status).toBe(200);
    expect(body.expense).toMatchObject({ id: created.body.expense.id, title: 'Dinner', amountCents: 4500, payerId: bob.id, splitType: 'EQUAL' });
    expect(body.expense.splits).toEqual(byUser(replacement.splits));
    expect(await prisma.expenseSplit.count({ where: { expenseId: created.body.expense.id, userId: alice.id } })).toBe(0);
  });

  it('answers 400 for an invalid replacement and leaves the expense as it was', async () => {
    const created = await post(trip.id, taxi());
    const invalid = taxi();
    invalid.splits[1].owedCents = 1;

    const { status } = await patch(trip.id, created.body.expense.id, invalid);

    expect(status).toBe(400);
    const { body } = await list(trip.id);
    expect(body.expenses.find((e: { id: string }) => e.id === created.body.expense.id)).toEqual(created.body.expense);
  });

  it('answers 404 for an expense that belongs to another group', async () => {
    const created = await post(trip.id, taxi());

    const { status, body } = await patch(other.id, created.body.expense.id, taxi());

    expect(status).toBe(404);
    expect(body.code).toBe('not_found');
  });

  it('gives a non-member the same 404 as a group that does not exist', async () => {
    const created = await post(trip.id, taxi());

    const notTheirs = await patch(trip.id, created.body.expense.id, taxi(), dave);
    const unknown = await patch(randomUUID(), created.body.expense.id, taxi(), dave);

    expect(notTheirs.status).toBe(404);
    expect(notTheirs.body).toEqual(unknown.body);
  });

  it('answers 409 in an archived group', async () => {
    const { status, body } = await patch(archived.id, archivedExpense.id, { ...taxi(), splits: [{ userId: alice.id, owedCents: 3000, allocatedBps: null }] });

    expect(status).toBe(409);
    expect(body.code).toBe('group_archived');
  });

  it('answers 401 without a session', async () => {
    expect((await patch(trip.id, randomUUID(), taxi(), undefined)).status).toBe(401);
  });
});

describe('DELETE /api/v1/groups/:groupId/expenses/:expenseId', () => {
  it('deletes the expense and its splits', async () => {
    const created = await post(trip.id, taxi());

    const { status, body } = await remove(trip.id, created.body.expense.id);

    expect(status).toBe(204);
    expect(body).toBeNull();
    expect(await prisma.expense.count({ where: { id: created.body.expense.id } })).toBe(0);
    expect(await prisma.expenseSplit.count({ where: { expenseId: created.body.expense.id } })).toBe(0);
  });

  it('answers 404 for an unknown expense', async () => {
    const { status, body } = await remove(trip.id, randomUUID());

    expect(status).toBe(404);
    expect(body.code).toBe('not_found');
  });

  it('gives a non-member the same 404 as a group that does not exist', async () => {
    const created = await post(trip.id, taxi());

    const notTheirs = await remove(trip.id, created.body.expense.id, dave);
    const unknown = await remove(randomUUID(), created.body.expense.id, dave);

    expect(notTheirs.status).toBe(404);
    expect(notTheirs.body).toEqual(unknown.body);
    expect(await prisma.expense.count({ where: { id: created.body.expense.id } })).toBe(1);
  });

  it('answers 409 in an archived group, and keeps the expense', async () => {
    const { status } = await remove(archived.id, archivedExpense.id);

    expect(status).toBe(409);
    expect(await prisma.expense.count({ where: { id: archivedExpense.id } })).toBe(1);
  });
});
