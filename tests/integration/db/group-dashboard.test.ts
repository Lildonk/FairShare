import type { Group, User } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadGroupDashboard } from '@/lib/db/group-dashboard';
import { prisma } from '@/lib/db/prisma';
import { cleanupTestData, createTestGroup, createTestUser } from '../helpers/auth-helpers';

// Issue #7: everything the /groups/[groupId] page shows, loaded once on the server, for members only.

let alice: User;
let bob: User;
let dave: User; // not a member
let trip: Group;

beforeAll(async () => {
  [alice, bob, dave] = await Promise.all([
    createTestUser('DashAlice'),
    createTestUser('DashBob'),
    createTestUser('DashDave'),
  ]);
  trip = await createTestGroup('Dash trip', [alice.id, bob.id]);
  await prisma.expense.create({
    data: {
      groupId: trip.id,
      payerId: alice.id,
      title: 'Cabin',
      amountCents: 10001,
      splitType: 'EQUAL',
      isDisputed: true,
      splits: { create: [{ userId: alice.id, owedCents: 5001 }, { userId: bob.id, owedCents: 5000 }] },
    },
  });
  await prisma.settlement.create({
    data: { groupId: trip.id, fromUserId: bob.id, toUserId: alice.id, amountCents: 2000, status: 'CONFIRMED' },
  });
  await prisma.settlement.create({
    data: { groupId: trip.id, fromUserId: bob.id, toUserId: alice.id, amountCents: 1000, status: 'PENDING' },
  });
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe('loadGroupDashboard', () => {
  it('returns null for someone who is not a member, so the page can answer 404', async () => {
    expect(await loadGroupDashboard(dave.id, trip.id)).toBeNull();
    expect(await loadGroupDashboard(alice.id, '00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('returns the group with its invite code and its members', async () => {
    const dashboard = await loadGroupDashboard(bob.id, trip.id);

    expect(dashboard?.group).toMatchObject({ id: trip.id, name: trip.name, isArchived: false, inviteCode: trip.inviteCode });
    // Both memberships come from one insert with the same joinedAt, so their order is not defined here.
    expect(dashboard?.group.members).toHaveLength(2);
    expect(dashboard?.group.members).toEqual(
      expect.arrayContaining([
        { id: alice.id, name: 'DashAlice' },
        { id: bob.id, name: 'DashBob' },
      ]),
    );
  });

  it('returns expenses and payments in the shapes the board uses, with payment IDs', async () => {
    const dashboard = await loadGroupDashboard(alice.id, trip.id);

    expect(dashboard?.expenses).toEqual([
      {
        payerId: alice.id,
        amountCents: 10001,
        splits: expect.arrayContaining([
          { userId: alice.id, owedCents: 5001 },
          { userId: bob.id, owedCents: 5000 },
        ]),
      },
    ]);
    expect(dashboard?.settlements).toHaveLength(2);
    expect(dashboard?.settlements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromUserId: bob.id, toUserId: alice.id, amountCents: 2000, status: 'CONFIRMED' }),
        expect.objectContaining({ amountCents: 1000, status: 'PENDING' }),
      ]),
    );
    for (const settlement of dashboard?.settlements ?? []) expect(settlement.id).toEqual(expect.any(String));
  });

  it('returns the transfers that settle confirmed balances, for the transaction graph', async () => {
    const dashboard = await loadGroupDashboard(alice.id, trip.id);

    // Bob owes 50.00 and paid 20.00 (the pending 10.00 does not count yet).
    expect(dashboard?.transfers).toEqual([{ fromMemberId: bob.id, toMemberId: alice.id, amountCents: 3000 }]);
  });

  it('returns the ledger rows the activity view and the export share', async () => {
    const dashboard = await loadGroupDashboard(alice.id, trip.id);

    expect(dashboard?.ledger).toHaveLength(3);
    expect(dashboard?.ledger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'EXPENSE', description: 'Cabin', fromName: 'DashAlice', status: 'DISPUTED' }),
        expect.objectContaining({ type: 'SETTLEMENT', fromName: 'DashBob', toName: 'DashAlice', status: 'PENDING' }),
      ]),
    );
  });
});
