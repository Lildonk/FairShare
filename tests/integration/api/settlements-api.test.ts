import { randomUUID } from 'node:crypto';
import type { Group, Settlement, User } from '@prisma/client';
import type { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET as getSettlements, POST as recordPayment } from '@/app/api/v1/groups/[groupId]/settlements/route';
import { PATCH as updateSettlement } from '@/app/api/v1/settlements/[settlementId]/route';
import { prisma } from '@/lib/db/prisma';
import { cleanupTestData, createTestGroup, createTestUser, jsonRequest, sessionCookie } from '../helpers/auth-helpers';

let alice: User;
let bob: User;
let carol: User;
let dave: User; // in no group here
let archived: Group;
let archivedPayment: Settlement;

async function call<P>(
  handler: (request: NextRequest, context: { params: Promise<P> }) => Promise<Response>,
  method: string,
  url: string,
  params: P,
  user?: User | null,
  body?: unknown,
) {
  const cookie = user ? await sessionCookie(user) : undefined;
  // Next.js 15 passes route params as a promise.
  const response = await handler(jsonRequest(url, { method, body, cookie }), { params: Promise.resolve(params) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const board = (groupId: string, user: User | null = alice) =>
  call(getSettlements, 'GET', `/api/v1/groups/${groupId}/settlements`, { groupId }, user);
const record = (groupId: string, body: unknown, user: User | null) =>
  call(recordPayment, 'POST', `/api/v1/groups/${groupId}/settlements`, { groupId }, user, body);
const setStatus = (settlementId: string, body: unknown, user: User | null) =>
  call(updateSettlement, 'PATCH', `/api/v1/settlements/${settlementId}`, { settlementId }, user, body);

const ordinal = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byUser = <T extends { userId: string }>(rows: T[]) => [...rows].sort((a, b) => ordinal(a.userId, b.userId));
const byPayer = <T extends { fromUserId: string }>(rows: T[]) => [...rows].sort((a, b) => ordinal(a.fromUserId, b.fromUserId));
const balanceOf = (body: { balances: { userId: string; balanceCents: number }[] }, user: User) =>
  body.balances.find((b) => b.userId === user.id)?.balanceCents;

/** A fresh group where Alice paid $90.00 for all three: Bob and Carol owe her $30.00 each. */
async function flat(): Promise<Group> {
  const group = await createTestGroup('Flat', [alice.id, bob.id, carol.id]);
  await prisma.expense.create({
    data: {
      groupId: group.id,
      payerId: alice.id,
      title: 'Groceries',
      amountCents: 9000,
      splitType: 'EQUAL',
      splits: { create: [alice, bob, carol].map((u) => ({ userId: u.id, owedCents: 3000 })) },
    },
  });
  return group;
}

const bobPaysAlice = () => ({ fromUserId: bob.id, toUserId: alice.id, amountCents: 3000 });

beforeAll(async () => {
  [alice, bob, carol, dave] = await Promise.all([
    createTestUser('Alice'),
    createTestUser('Bob'),
    createTestUser('Carol'),
    createTestUser('Dave'),
  ]);
  archived = await createTestGroup('Old flat', [alice.id, bob.id]);
  archivedPayment = await prisma.settlement.create({
    data: { groupId: archived.id, fromUserId: bob.id, toUserId: alice.id, amountCents: 500 },
  });
  await prisma.group.update({ where: { id: archived.id }, data: { isArchived: true } });
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe('GET /api/v1/groups/:groupId/settlements', () => {
  it('returns each member’s balance, the transfers that settle them, and recorded payments', async () => {
    const group = await flat();

    const { status, body } = await board(group.id);

    expect(status).toBe(200);
    expect(body.balances).toEqual(
      byUser([
        { userId: alice.id, balanceCents: 6000 },
        { userId: bob.id, balanceCents: -3000 },
        { userId: carol.id, balanceCents: -3000 },
      ]),
    );
    expect(byPayer(body.transfers)).toEqual(
      byPayer([
        { fromUserId: bob.id, toUserId: alice.id, amountCents: 3000 },
        { fromUserId: carol.id, toUserId: alice.id, amountCents: 3000 },
      ]),
    );
    expect(body.settlements).toEqual([]);
  });

  it('still works for an archived group', async () => {
    const { status, body } = await board(archived.id);

    expect(status).toBe(200);
    expect(body.settlements.map((s: { id: string }) => s.id)).toEqual([archivedPayment.id]);
  });

  it('gives a non-member the same 404 as a group that does not exist', async () => {
    const group = await flat();

    const notTheirs = await board(group.id, dave);
    const unknown = await board(randomUUID(), dave);

    expect(notTheirs.status).toBe(404);
    expect(notTheirs.body).toEqual(unknown.body);
  });

  it('answers 401 without a session', async () => {
    expect((await board(archived.id, null)).status).toBe(401);
  });
});

describe('POST /api/v1/groups/:groupId/settlements', () => {
  it('records a payment as pending when the payer records it, so balances wait for the receiver', async () => {
    const group = await flat();

    const { status, body } = await record(group.id, { ...bobPaysAlice(), notes: 'Venmo' }, bob);

    expect(status).toBe(201);
    expect(body.settlement).toEqual({
      id: expect.any(String),
      groupId: group.id,
      fromUserId: bob.id,
      toUserId: alice.id,
      amountCents: 3000,
      status: 'PENDING',
      notes: 'Venmo',
      settledAt: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(balanceOf((await board(group.id)).body, bob)).toBe(-3000);
  });

  it('confirms a payment at once when the receiver records it', async () => {
    const group = await flat();

    const { status, body } = await record(group.id, { fromUserId: carol.id, toUserId: alice.id, amountCents: 3000 }, alice);

    expect(status).toBe(201);
    expect(body.settlement.status).toBe('CONFIRMED');
    expect(body.settlement.settledAt).toEqual(expect.any(String));
    const after = (await board(group.id)).body;
    expect(balanceOf(after, carol)).toBe(0);
    expect(balanceOf(after, alice)).toBe(3000);
    expect(after.transfers).toEqual([{ fromUserId: bob.id, toUserId: alice.id, amountCents: 3000 }]);
  });

  it('answers 403 when someone records a payment between two other members', async () => {
    const group = await flat();

    const { status, body } = await record(group.id, bobPaysAlice(), carol);

    expect(status).toBe(403);
    expect(body.code).toBe('forbidden');
    expect(await prisma.settlement.count({ where: { groupId: group.id } })).toBe(0);
  });

  it.each([
    ['someone pays themselves', () => ({ toUserId: bob.id }), 'toUserId'],
    ['the payer is outside the group', () => ({ fromUserId: dave.id }), 'fromUserId'],
    ['the receiver is outside the group', () => ({ toUserId: dave.id }), 'toUserId'],
    ['the amount is fractional', () => ({ amountCents: 10.5 }), 'amountCents'],
    ['the amount is zero', () => ({ amountCents: 0 }), 'amountCents'],
    ['the notes are too long', () => ({ notes: 'x'.repeat(501) }), 'notes'],
  ])('answers 400 when %s', async (_case, change, field) => {
    const group = await flat();

    const { status, body } = await record(group.id, { ...bobPaysAlice(), ...change() }, bob);

    expect(status).toBe(400);
    expect(body.code).toBe('invalid_input');
    expect(body.fields).toHaveProperty([field]);
  });

  it('gives a non-member the same 404 as a group that does not exist', async () => {
    const group = await flat();

    const notTheirs = await record(group.id, bobPaysAlice(), dave);
    const unknown = await record(randomUUID(), bobPaysAlice(), dave);

    expect(notTheirs.status).toBe(404);
    expect(notTheirs.body).toEqual(unknown.body);
  });

  it('answers 409 for an archived group, and records nothing', async () => {
    const { status, body } = await record(archived.id, bobPaysAlice(), bob);

    expect(status).toBe(409);
    expect(body.code).toBe('group_archived');
    expect(await prisma.settlement.count({ where: { groupId: archived.id } })).toBe(1);
  });

  it('answers 401 without a session', async () => {
    const group = await flat();

    expect((await record(group.id, bobPaysAlice(), null)).status).toBe(401);
  });
});

describe('PATCH /api/v1/settlements/:settlementId', () => {
  async function pendingPayment() {
    const group = await flat();
    const { body } = await record(group.id, bobPaysAlice(), bob);
    return { group, payment: body.settlement as { id: string } };
  }

  it('lets the receiver confirm a pending payment, which then counts in the balances', async () => {
    const { group, payment } = await pendingPayment();

    const { status, body } = await setStatus(payment.id, { status: 'CONFIRMED' }, alice);

    expect(status).toBe(200);
    expect(body.settlement).toMatchObject({ id: payment.id, status: 'CONFIRMED', settledAt: expect.any(String) });
    expect(balanceOf((await board(group.id)).body, bob)).toBe(0);
  });

  it('lets the receiver dispute a pending payment, which does not count', async () => {
    const { group, payment } = await pendingPayment();

    const { status, body } = await setStatus(payment.id, { status: 'DISPUTED' }, alice);

    expect(status).toBe(200);
    expect(body.settlement).toMatchObject({ status: 'DISPUTED', settledAt: null });
    expect(balanceOf((await board(group.id)).body, bob)).toBe(-3000);
  });

  it('answers 403 when the payer tries to confirm their own payment', async () => {
    const { payment } = await pendingPayment();

    const { status, body } = await setStatus(payment.id, { status: 'CONFIRMED' }, bob);

    expect(status).toBe(403);
    expect(body.code).toBe('forbidden');
  });

  it('answers 409 for a payment that is no longer pending', async () => {
    const { payment } = await pendingPayment();
    await setStatus(payment.id, { status: 'CONFIRMED' }, alice);

    const { status, body } = await setStatus(payment.id, { status: 'DISPUTED' }, alice);

    expect(status).toBe(409);
    expect(body.code).toBe('settlement_not_pending');
  });

  it.each([['PAID'], ['PENDING'], [undefined]])('answers 400 for the status %s', async (newStatus) => {
    const { payment } = await pendingPayment();

    const { status, body } = await setStatus(payment.id, { status: newStatus }, alice);

    expect(status).toBe(400);
    expect(body.fields).toHaveProperty(['status']);
  });

  it('gives a non-member the same 404 as a payment that does not exist', async () => {
    const { payment } = await pendingPayment();

    const notTheirs = await setStatus(payment.id, { status: 'CONFIRMED' }, dave);
    const unknown = await setStatus(randomUUID(), { status: 'CONFIRMED' }, dave);

    expect(notTheirs.status).toBe(404);
    expect(notTheirs.body).toEqual(unknown.body);
  });

  it('answers 409 in an archived group', async () => {
    const { status, body } = await setStatus(archivedPayment.id, { status: 'CONFIRMED' }, alice);

    expect(status).toBe(409);
    expect(body.code).toBe('group_archived');
  });

  it('answers 401 without a session', async () => {
    const { payment } = await pendingPayment();

    expect((await setStatus(payment.id, { status: 'CONFIRMED' }, null)).status).toBe(401);
  });
});
