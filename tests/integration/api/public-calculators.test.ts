import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { User } from '@prisma/client';
import type { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_DEBTS, MAX_SPLIT_MEMBERS } from '@/lib/api/calculator-input';
import { POST as simplify } from '@/app/api/v1/simplify/route';
import { POST as calculateSplit } from '@/app/api/v1/split/calculate/route';
import { splitItemized } from '@/lib/finance/itemized-split';
import { splitPercentage } from '@/lib/finance/split-calculation';
import { prisma } from '@/lib/db/prisma';
import { cleanupTestData, createTestGroup, createTestUser, jsonRequest, sessionCookie } from '../helpers/auth-helpers';

type Handler = (request: NextRequest) => Promise<Response>;

async function call(handler: Handler, url: string, body: unknown, cookie?: string) {
  const response = await handler(jsonRequest(url, { method: 'POST', body, cookie }));
  return { status: response.status, body: await response.json() };
}

const simplifyDebts = (body: unknown, cookie?: string) => call(simplify, '/api/v1/simplify', body, cookie);
const split = (body: unknown) => call(calculateSplit, '/api/v1/split/calculate', body);

const byMember = <T extends { memberId: string }>(rows: T[]) =>
  [...rows].sort((a, b) => (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0));

let alice: User;

beforeAll(async () => {
  alice = await createTestUser('Alice');
  await createTestGroup('Private trip', [alice.id]);
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe('POST /api/v1/simplify', () => {
  it('turns raw debts into net balances and transfers', async () => {
    const { status, body } = await simplifyDebts({
      debts: [
        { fromMemberId: 'alice', toMemberId: 'bob', amountCents: 1000 },
        { fromMemberId: 'bob', toMemberId: 'carol', amountCents: 1000 },
      ],
    });

    expect(status).toBe(200);
    expect(body).toEqual({
      balances: [
        { memberId: 'alice', balanceCents: -1000 },
        { memberId: 'bob', balanceCents: 0 },
        { memberId: 'carol', balanceCents: 1000 },
      ],
      transfers: [{ fromMemberId: 'alice', toMemberId: 'carol', amountCents: 1000 }],
    });
  });

  it('needs no transfers when the debts form a cycle', async () => {
    const { status, body } = await simplifyDebts({
      debts: [
        { fromMemberId: 'a', toMemberId: 'b', amountCents: 500 },
        { fromMemberId: 'b', toMemberId: 'c', amountCents: 500 },
        { fromMemberId: 'c', toMemberId: 'a', amountCents: 500 },
      ],
    });

    expect(status).toBe(200);
    expect(body.transfers).toEqual([]);
  });

  it('gives the same answer whatever order the debts arrive in', async () => {
    const debts = [
      { fromMemberId: 'dan', toMemberId: 'amy', amountCents: 700 },
      { fromMemberId: 'cat', toMemberId: 'amy', amountCents: 300 },
      { fromMemberId: 'dan', toMemberId: 'bea', amountCents: 250 },
      { fromMemberId: 'bea', toMemberId: 'cat', amountCents: 125 },
    ];

    const forward = await simplifyDebts({ debts });
    const reversed = await simplifyDebts({ debts: [...debts].reverse() });

    expect(forward.status).toBe(200);
    expect(reversed.body).toEqual(forward.body);
  });

  it('accepts an empty list of debts', async () => {
    const { status, body } = await simplifyDebts({ debts: [] });

    expect(status).toBe(200);
    expect(body).toEqual({ balances: [], transfers: [] });
  });

  it('answers 400 when the body is not JSON', async () => {
    const response = await simplify(jsonRequest('/api/v1/simplify', { method: 'POST', rawBody: '{not json' }));

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('invalid_input');
  });

  it.each([
    ['debts is missing', {}, 'debts'],
    ['debts is not a list', { debts: 'alice owes bob' }, 'debts'],
    ['a debt is not an object', { debts: [42] }, 'debts[0]'],
    ['the amount is fractional', { debts: [{ fromMemberId: 'a', toMemberId: 'b', amountCents: 12.5 }] }, 'debts[0].amountCents'],
    ['the amount is negative', { debts: [{ fromMemberId: 'a', toMemberId: 'b', amountCents: -100 }] }, 'debts[0].amountCents'],
    ['the amount is zero', { debts: [{ fromMemberId: 'a', toMemberId: 'b', amountCents: 0 }] }, 'debts[0].amountCents'],
    ['the amount is a string', { debts: [{ fromMemberId: 'a', toMemberId: 'b', amountCents: '100' }] }, 'debts[0].amountCents'],
    ['the amount is not a safe integer', { debts: [{ fromMemberId: 'a', toMemberId: 'b', amountCents: 2 ** 53 }] }, 'debts[0].amountCents'],
    ['a member ID is empty', { debts: [{ fromMemberId: '', toMemberId: 'b', amountCents: 100 }] }, 'debts[0].fromMemberId'],
    ['a member ID is too long', { debts: [{ fromMemberId: 'a', toMemberId: 'b'.repeat(101), amountCents: 100 }] }, 'debts[0].toMemberId'],
    ['someone owes themselves', { debts: [{ fromMemberId: 'a', toMemberId: 'a', amountCents: 100 }] }, 'debts[0].toMemberId'],
  ])('answers 400 with a field error when %s', async (_case, body, field) => {
    const response = await simplifyDebts(body);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_input');
    expect(response.body.fields).toHaveProperty([field]);
  });

  it(`answers 400 for more than ${MAX_DEBTS} debts`, async () => {
    const debts = Array.from({ length: MAX_DEBTS + 1 }, (_, i) => ({
      fromMemberId: `m${i}`,
      toMemberId: `m${i + 1}`,
      amountCents: 1,
    }));

    const response = await simplifyDebts({ debts });

    expect(response.status).toBe(400);
    expect(response.body.fields).toHaveProperty(['debts']);
  });

  it('answers 400 when the debts add up to more than a safe integer of cents', async () => {
    const half = Math.ceil(Number.MAX_SAFE_INTEGER / 2);
    const response = await simplifyDebts({
      debts: [
        { fromMemberId: 'a', toMemberId: 'b', amountCents: half },
        { fromMemberId: 'c', toMemberId: 'b', amountCents: half },
      ],
    });

    expect(response.status).toBe(400);
    expect(response.body.fields).toHaveProperty(['debts']);
  });

  // The #41 review: 'a' and 'a ' were two different members.
  it('trims member IDs, so "a" and "a " are the same member', async () => {
    const { status, body } = await simplifyDebts({ debts: [{ fromMemberId: 'a', toMemberId: 'a ', amountCents: 100 }] });

    expect(status).toBe(400);
    expect(body.fields).toHaveProperty(['debts[0].toMemberId']);
  });

  it('returns member IDs trimmed', async () => {
    const { status, body } = await simplifyDebts({ debts: [{ fromMemberId: ' alice ', toMemberId: 'bob', amountCents: 100 }] });

    expect(status).toBe(200);
    expect(body.transfers).toEqual([{ fromMemberId: 'alice', toMemberId: 'bob', amountCents: 100 }]);
  });

  it('is stateless: a session cookie changes nothing, and a real user ID reveals nothing', async () => {
    const debts = [{ fromMemberId: alice.id, toMemberId: 'someone-else', amountCents: 500 }];

    const signedOut = await simplifyDebts({ debts });
    const signedIn = await simplifyDebts({ debts }, await sessionCookie(alice));

    expect(signedOut.status).toBe(200);
    expect(signedIn).toEqual(signedOut);
    expect(JSON.stringify(signedIn.body)).not.toMatch(/Alice|@auth-test\.test|Private trip/);
  });
});

describe('POST /api/v1/split/calculate', () => {
  it('splits EQUAL and gives the leftover cent to the payer when the payer takes part', async () => {
    const { status, body } = await split({ splitType: 'EQUAL', totalCents: 1000, participantIds: ['c', 'a', 'b'], payerId: 'a' });

    expect(status).toBe(200);
    expect(body).toEqual({
      splitType: 'EQUAL',
      totalCents: 1000,
      allocations: [
        { memberId: 'a', owedCents: 334 },
        { memberId: 'b', owedCents: 333 },
        { memberId: 'c', owedCents: 333 },
      ],
    });
  });

  it('splits EQUAL and hands leftover cents out by member ID when the payer does not take part', async () => {
    const { status, body } = await split({ splitType: 'EQUAL', totalCents: 1000, participantIds: ['d', 'b', 'c'], payerId: 'payer' });

    expect(status).toBe(200);
    expect(body.allocations).toEqual([
      { memberId: 'b', owedCents: 334 },
      { memberId: 'c', owedCents: 333 },
      { memberId: 'd', owedCents: 333 },
    ]);
  });

  it('accepts EXACT shares that add up to the total', async () => {
    const { status, body } = await split({
      splitType: 'EXACT',
      totalCents: 1500,
      shares: [
        { memberId: 'b', amountCents: 1000 },
        { memberId: 'a', amountCents: 500 },
      ],
    });

    expect(status).toBe(200);
    expect(body.allocations).toEqual([
      { memberId: 'a', owedCents: 500 },
      { memberId: 'b', owedCents: 1000 },
    ]);
  });

  it('answers 400 when EXACT shares do not add up to the total', async () => {
    const { status, body } = await split({
      splitType: 'EXACT',
      totalCents: 1500,
      shares: [
        { memberId: 'a', amountCents: 500 },
        { memberId: 'b', amountCents: 999 },
      ],
    });

    expect(status).toBe(400);
    expect(body.code).toBe('invalid_input');
    expect(body.message).toEqual(expect.any(String));
  });

  it('splits PERCENTAGE shares given in basis points, and the cents add up exactly', async () => {
    const shares = [
      { memberId: 'a', basisPoints: 3333 },
      { memberId: 'b', basisPoints: 3333 },
      { memberId: 'c', basisPoints: 3334 },
    ];

    const { status, body } = await split({ splitType: 'PERCENTAGE', totalCents: 1000, shares });

    expect(status).toBe(200);
    expect(body.allocations).toEqual(byMember(splitPercentage(1000, shares)));
    expect(body.allocations.reduce((sum: number, a: { owedCents: number }) => sum + a.owedCents, 0)).toBe(1000);
  });

  it('answers 400 when PERCENTAGE shares are not 100%', async () => {
    const { status, body } = await split({
      splitType: 'PERCENTAGE',
      totalCents: 1000,
      shares: [
        { memberId: 'a', basisPoints: 5000 },
        { memberId: 'b', basisPoints: 4000 },
      ],
    });

    expect(status).toBe(400);
    expect(body.code).toBe('invalid_input');
  });

  it('splits an ITEMIZED receipt with tax and tip prorated, and the cents add up exactly', async () => {
    const receipt = {
      items: [
        { description: 'Pizza', priceCents: 2000, participantIds: ['a', 'b'] },
        { description: 'Salad', priceCents: 1000, participantIds: ['c'] },
      ],
      taxCents: 270,
      serviceCents: 0,
      tipCents: 600,
      totalCents: 3870,
    };

    const { status, body } = await split({ splitType: 'ITEMIZED', ...receipt });

    expect(status).toBe(200);
    expect(body.allocations).toEqual(
      byMember(splitItemized(receipt)).map(({ memberId, itemsCents, extrasCents, totalCents }) => ({
        memberId,
        owedCents: totalCents,
        itemsCents,
        extrasCents,
      })),
    );
    expect(body.allocations.reduce((sum: number, a: { owedCents: number }) => sum + a.owedCents, 0)).toBe(3870);
  });

  it.each([
    ['splitType is missing', { totalCents: 100, participantIds: ['a'], payerId: 'a' }, 'splitType'],
    ['splitType is unknown', { splitType: 'RANDOM', totalCents: 100 }, 'splitType'],
    ['totalCents is fractional', { splitType: 'EQUAL', totalCents: 10.5, participantIds: ['a'], payerId: 'a' }, 'totalCents'],
    ['totalCents is negative', { splitType: 'EQUAL', totalCents: -1, participantIds: ['a'], payerId: 'a' }, 'totalCents'],
    ['EQUAL has no participants', { splitType: 'EQUAL', totalCents: 100, participantIds: [], payerId: 'a' }, 'participantIds'],
    ['EQUAL has no payer', { splitType: 'EQUAL', totalCents: 100, participantIds: ['a'] }, 'payerId'],
    ['an EXACT share is fractional', { splitType: 'EXACT', totalCents: 100, shares: [{ memberId: 'a', amountCents: 99.5 }] }, 'shares[0].amountCents'],
    ['a PERCENTAGE share is fractional', { splitType: 'PERCENTAGE', totalCents: 100, shares: [{ memberId: 'a', basisPoints: 10.5 }] }, 'shares[0].basisPoints'],
    ['an ITEMIZED item has no participants', { splitType: 'ITEMIZED', totalCents: 100, items: [{ description: 'Tea', priceCents: 100, participantIds: [] }] }, 'items[0].participantIds'],
    ['ITEMIZED tax is negative', { splitType: 'ITEMIZED', totalCents: 100, taxCents: -5, items: [{ description: 'Tea', priceCents: 100, participantIds: ['a'] }] }, 'taxCents'],
  ])('answers 400 with a field error when %s', async (_case, body, field) => {
    const response = await split(body);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_input');
    expect(response.body.fields).toHaveProperty([field]);
  });

  // The #41 review: invalid IDs all became '', which looked like the same member listed twice.
  it('does not report two invalid member IDs as duplicates', async () => {
    const { status, body } = await split({ splitType: 'EQUAL', totalCents: 100, participantIds: [1, 2], payerId: 'a' });

    expect(status).toBe(400);
    expect(Object.keys(body.fields).sort()).toEqual(['participantIds[0]', 'participantIds[1]']);
  });

  it(`answers 400 for more than ${MAX_SPLIT_MEMBERS} participants`, async () => {
    const participantIds = Array.from({ length: MAX_SPLIT_MEMBERS + 1 }, (_, i) => `m${i}`);

    const response = await split({ splitType: 'EQUAL', totalCents: 100_000, participantIds, payerId: 'm0' });

    expect(response.status).toBe(400);
    expect(response.body.fields).toHaveProperty(['participantIds']);
  });
});

describe('public calculator routes', () => {
  it.each(['simplify/route.ts', 'split/calculate/route.ts'])(
    '%s reads no database, session, or cookie, so it cannot reveal private group data',
    (file) => {
      const source = readFileSync(path.resolve(__dirname, '../../../src/app/api/v1', file), 'utf8');

      expect(source).not.toMatch(/@\/lib\/db|@\/lib\/auth|@prisma\/client|cookies\(|next\/headers/);
    },
  );
});
