import type { Expense, Group, User } from '@prisma/client';
import type { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PATCH as setDispute } from '@/app/api/v1/groups/[groupId]/expenses/[expenseId]/dispute/route';
import { GET as exportLedger } from '@/app/api/v1/groups/[groupId]/export/route';
import { prisma } from '@/lib/db/prisma';
import { cleanupTestData, createTestGroup, createTestUser, jsonRequest, sessionCookie } from '../helpers/auth-helpers';

// Issue #8: flagging an expense for review, and exporting a group's ledger. Both are members-only;
// the dispute flag is a write (refused for archived groups) and leaves an audit event.

let alice: User;
let bob: User;
let dave: User; // in no group here
let trip: Group;
let other: Group;
let archived: Group;

async function call<P>(
  handler: (request: NextRequest, context: { params: Promise<P> }) => Promise<Response>,
  method: string,
  url: string,
  params: P,
  user: User | null,
  body?: unknown,
) {
  const cookie = user ? await sessionCookie(user) : undefined;
  return handler(jsonRequest(url, { method, body, cookie }), { params: Promise.resolve(params) });
}

const dispute = (groupId: string, expenseId: string, body: unknown, user: User | null = alice) =>
  call(setDispute, 'PATCH', `/api/v1/groups/${groupId}/expenses/${expenseId}/dispute`, { groupId, expenseId }, user, body);

const download = (groupId: string, format: string | null, user: User | null = alice) =>
  call(
    exportLedger,
    'GET',
    `/api/v1/groups/${groupId}/export${format === null ? '' : `?format=${format}`}`,
    { groupId },
    user,
  );

function createExpense(group: Group, data: Partial<Pick<Expense, 'title' | 'amountCents' | 'isDisputed'>> = {}) {
  return prisma.expense.create({
    data: {
      groupId: group.id,
      payerId: alice.id,
      title: 'Groceries',
      amountCents: 4705,
      ...data,
      splits: { create: [{ userId: alice.id, owedCents: 2353 }, { userId: bob.id, owedCents: 2352 }] },
    },
  });
}

const auditEvents = (entityId: string) =>
  prisma.auditEvent.findMany({ where: { entityId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });

beforeAll(async () => {
  [alice, bob, dave] = await Promise.all([
    createTestUser('LedgerAlice'),
    createTestUser('LedgerBob'),
    createTestUser('LedgerDave'),
  ]);
  trip = await createTestGroup('Ledger trip', [alice.id, bob.id]);
  other = await createTestGroup('Ledger other', [alice.id]);
  archived = await createTestGroup('Ledger archived', [alice.id, bob.id]);
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe('PATCH /api/v1/groups/:groupId/expenses/:expenseId/dispute', () => {
  it('flags an expense for review and records EXPENSE_DISPUTED by the signed-in member', async () => {
    const expense = await createExpense(trip);

    const response = await dispute(trip.id, expense.id, { disputed: true }, bob);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.expense).toMatchObject({ id: expense.id, isDisputed: true });
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: expense.id } })).isDisputed).toBe(true);
    const events = await auditEvents(expense.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: 'EXPENSE_DISPUTED', actorId: bob.id, groupId: trip.id });
    expect(events[0].snapshot).toEqual(body.expense);
  });

  it('clears a dispute and records EXPENSE_UNDISPUTED', async () => {
    const expense = await createExpense(trip, { isDisputed: true });

    const response = await dispute(trip.id, expense.id, { disputed: false });

    expect(response.status).toBe(200);
    expect((await response.json()).expense.isDisputed).toBe(false);
    expect((await auditEvents(expense.id)).map((e) => e.action)).toEqual(['EXPENSE_UNDISPUTED']);
  });

  it('changes nothing and records nothing when the flag already has that value', async () => {
    const expense = await createExpense(trip, { isDisputed: true });

    const response = await dispute(trip.id, expense.id, { disputed: true });

    expect(response.status).toBe(200);
    expect((await response.json()).expense.isDisputed).toBe(true);
    expect(await auditEvents(expense.id)).toEqual([]);
  });

  it('rejects a body without a true or false `disputed`', async () => {
    const expense = await createExpense(trip);

    for (const body of [{}, { disputed: 'yes' }, { disputed: 1 }]) {
      const response = await dispute(trip.id, expense.id, body);
      expect(response.status).toBe(400);
      expect((await response.json()).fields).toHaveProperty('disputed');
    }
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: expense.id } })).isDisputed).toBe(false);
  });

  it('answers 404 for an expense from another group, even one the member can see', async () => {
    const elsewhere = await createExpense(other);

    const response = await dispute(trip.id, elsewhere.id, { disputed: true });

    expect(response.status).toBe(404);
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: elsewhere.id } })).isDisputed).toBe(false);
  });

  it('gives a non-member the same 404 as a group that does not exist', async () => {
    const expense = await createExpense(trip);

    const nonMember = await dispute(trip.id, expense.id, { disputed: true }, dave);
    const unknown = await dispute('00000000-0000-0000-0000-000000000000', expense.id, { disputed: true }, dave);

    expect(nonMember.status).toBe(404);
    expect(await nonMember.json()).toEqual(await unknown.json());
  });

  it('answers 409 for an archived group and changes nothing', async () => {
    const expense = await createExpense(archived);
    await prisma.group.update({ where: { id: archived.id }, data: { isArchived: true } });

    const response = await dispute(archived.id, expense.id, { disputed: true });

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('group_archived');
    expect((await prisma.expense.findUniqueOrThrow({ where: { id: expense.id } })).isDisputed).toBe(false);
    expect(await auditEvents(expense.id)).toEqual([]);
  });

  it('answers 401 without a session', async () => {
    const expense = await createExpense(trip);
    expect((await dispute(trip.id, expense.id, { disputed: true }, null)).status).toBe(401);
  });
});

describe('GET /api/v1/groups/:groupId/export', () => {
  let exportGroup: Group;

  beforeAll(async () => {
    exportGroup = await createTestGroup('Ledger export', [alice.id, bob.id]);
    await createExpense(exportGroup, { title: '=HYPERLINK("http://evil.example")', amountCents: 4705, isDisputed: true });
    await prisma.settlement.create({
      data: { groupId: exportGroup.id, fromUserId: bob.id, toUserId: alice.id, amountCents: 2352, notes: 'Groceries back' },
    });
  });

  it('downloads the ledger as CSV with names, amounts in dollars and cents, and statuses', async () => {
    const response = await download(exportGroup.id, 'csv');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename="fairshare-ledger-[\w-]+\.csv"$/);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const lines = (await response.text()).trimEnd().split('\r\n');
    expect(lines[0]).toBe('date,type,description,from,to,amount,amount_cents,status');
    expect(lines).toHaveLength(3);
    // The formula guard from #30 neutralizes the spreadsheet formula in the title.
    expect(lines[1]).toContain(`,EXPENSE,"'=HYPERLINK(""http://evil.example"")",LedgerAlice,,47.05,4705,DISPUTED`);
    expect(lines[2]).toContain(',SETTLEMENT,Groceries back,LedgerBob,LedgerAlice,23.52,2352,PENDING');
  });

  it('downloads the ledger as JSON, the default format', async () => {
    const response = await download(exportGroup.id, null);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename="fairshare-ledger-[\w-]+\.json"$/);
    const body = await response.json();
    expect(body.group).toBe(exportGroup.name);
    expect(body.entries.map((e: { type: string; amountCents: number; status: string }) => [e.type, e.amountCents, e.status])).toEqual([
      ['EXPENSE', 4705, 'DISPUTED'],
      ['SETTLEMENT', 2352, 'PENDING'],
    ]);
  });

  it('rejects an unknown format', async () => {
    const response = await download(exportGroup.id, 'xlsx');

    expect(response.status).toBe(400);
    expect((await response.json()).fields).toHaveProperty('format');
  });

  it('still exports an archived group, which stays readable', async () => {
    const frozen = await createTestGroup('Ledger frozen', [alice.id, bob.id]);
    await createExpense(frozen);
    await prisma.group.update({ where: { id: frozen.id }, data: { isArchived: true } });

    expect((await download(frozen.id, 'csv')).status).toBe(200);
  });

  it('gives a non-member the same 404 as a group that does not exist', async () => {
    const nonMember = await download(exportGroup.id, 'csv', dave);
    const unknown = await download('00000000-0000-0000-0000-000000000000', 'csv', dave);

    expect(nonMember.status).toBe(404);
    expect(await nonMember.json()).toEqual(await unknown.json());
  });

  it('answers 401 without a session', async () => {
    expect((await download(exportGroup.id, 'csv', null)).status).toBe(401);
  });
});
