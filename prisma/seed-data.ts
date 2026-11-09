import type { Role, SettlementStatus, SplitType } from '@prisma/client';

// Deterministic sample data for local development and tests: fixed ids, fixed timestamps,
// reserved .test emails, and integer cents whose splits add up exactly.
// Seed users have no password yet; #3 adds sign-in.

export interface SeedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface SeedGroup {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  inviteCode: string;
  isArchived: boolean;
}

export interface SeedMembership {
  id: string;
  groupId: string;
  userId: string;
}

export interface SeedSplit {
  id: string;
  userId: string;
  owedCents: number;
  allocatedBps: number | null;
}

export interface SeedExpense {
  id: string;
  groupId: string;
  payerId: string;
  title: string;
  amountCents: number;
  splitType: SplitType;
  category: string;
  createdAt: string;
  splits: SeedSplit[];
}

export interface SeedSettlement {
  id: string;
  groupId: string;
  fromUserId: string;
  toUserId: string;
  amountCents: number;
  status: SettlementStatus;
  notes: string | null;
  settledAt: string | null;
  createdAt: string;
}

export interface SeedData {
  users: SeedUser[];
  groups: SeedGroup[];
  memberships: SeedMembership[];
  expenses: SeedExpense[];
  settlements: SeedSettlement[];
}

const user = {
  alice: '11111111-1111-4111-8111-000000000001',
  bob: '11111111-1111-4111-8111-000000000002',
  charlie: '11111111-1111-4111-8111-000000000003',
  dana: '11111111-1111-4111-8111-000000000004',
  admin: '11111111-1111-4111-8111-000000000005',
};

const group = {
  tahoe: '22222222-2222-4222-8222-000000000001',
  apartment: '22222222-2222-4222-8222-000000000002',
  springBreak: '22222222-2222-4222-8222-000000000003',
};

function split(id: string, userId: string, owedCents: number, allocatedBps: number | null = null): SeedSplit {
  return { id: `66666666-6666-4666-8666-0000000000${id}`, userId, owedCents, allocatedBps };
}

export const seedData: SeedData = {
  users: [
    { id: user.alice, email: 'alice@fairshare.test', name: 'Alice Chen', role: 'MEMBER' },
    { id: user.bob, email: 'bob@fairshare.test', name: 'Bob Martinez', role: 'MEMBER' },
    { id: user.charlie, email: 'charlie@fairshare.test', name: 'Charlie Kim', role: 'MEMBER' },
    { id: user.dana, email: 'dana@fairshare.test', name: 'Dana Patel', role: 'MEMBER' },
    { id: user.admin, email: 'admin@fairshare.test', name: 'FairShare Admin', role: 'ADMIN' },
  ],

  groups: [
    {
      id: group.tahoe,
      name: 'Lake Tahoe Trip',
      description: 'Long weekend at the lake, October 2026',
      currency: 'USD',
      inviteCode: '33333333-3333-4333-8333-000000000001',
      isArchived: false,
    },
    {
      id: group.apartment,
      name: 'Apartment 4B',
      description: 'Shared bills for the apartment',
      currency: 'USD',
      inviteCode: '33333333-3333-4333-8333-000000000002',
      isArchived: false,
    },
    {
      id: group.springBreak,
      name: 'Spring Break 2026',
      description: 'Archived after everyone settled up',
      currency: 'USD',
      inviteCode: '33333333-3333-4333-8333-000000000003',
      isArchived: true,
    },
  ],

  memberships: [
    { id: '44444444-4444-4444-8444-000000000001', groupId: group.tahoe, userId: user.alice },
    { id: '44444444-4444-4444-8444-000000000002', groupId: group.tahoe, userId: user.bob },
    { id: '44444444-4444-4444-8444-000000000003', groupId: group.tahoe, userId: user.charlie },
    { id: '44444444-4444-4444-8444-000000000004', groupId: group.tahoe, userId: user.dana },
    { id: '44444444-4444-4444-8444-000000000005', groupId: group.apartment, userId: user.alice },
    { id: '44444444-4444-4444-8444-000000000006', groupId: group.apartment, userId: user.bob },
    { id: '44444444-4444-4444-8444-000000000007', groupId: group.apartment, userId: user.charlie },
    { id: '44444444-4444-4444-8444-000000000008', groupId: group.springBreak, userId: user.bob },
    { id: '44444444-4444-4444-8444-000000000009', groupId: group.springBreak, userId: user.dana },
  ],

  expenses: [
    {
      // EQUAL with a leftover cent: 100001 / 4 = 25000 r 1, and the payer (Alice) takes the extra cent.
      id: '55555555-5555-4555-8555-000000000001',
      groupId: group.tahoe,
      payerId: user.alice,
      title: 'Cabin rental',
      amountCents: 100_001,
      splitType: 'EQUAL',
      category: 'Lodging',
      createdAt: '2026-10-01T17:00:00.000Z',
      splits: [
        split('01', user.alice, 25_001),
        split('02', user.bob, 25_000),
        split('03', user.charlie, 25_000),
        split('04', user.dana, 25_000),
      ],
    },
    {
      id: '55555555-5555-4555-8555-000000000002',
      groupId: group.tahoe,
      payerId: user.bob,
      title: 'Groceries',
      amountCents: 8_650,
      splitType: 'EXACT',
      category: 'Groceries',
      createdAt: '2026-10-02T01:15:00.000Z',
      splits: [
        split('05', user.alice, 2_000),
        split('06', user.bob, 3_150),
        split('07', user.charlie, 1_500),
        split('08', user.dana, 2_000),
      ],
    },
    {
      // 25% / 25% / 30% / 20%, stored as basis points.
      id: '55555555-5555-4555-8555-000000000003',
      groupId: group.tahoe,
      payerId: user.charlie,
      title: 'Ski lift tickets',
      amountCents: 48_000,
      splitType: 'PERCENTAGE',
      category: 'Activities',
      createdAt: '2026-10-02T16:30:00.000Z',
      splits: [
        split('09', user.alice, 12_000, 2_500),
        split('10', user.bob, 12_000, 2_500),
        split('11', user.charlie, 14_400, 3_000),
        split('12', user.dana, 9_600, 2_000),
      ],
    },
    {
      // Items $30.00 / $25.00 / $20.00 / $25.00; tax $8.00 and tip $12.00 prorated by item subtotal (+20%).
      id: '55555555-5555-4555-8555-000000000004',
      groupId: group.tahoe,
      payerId: user.dana,
      title: 'Dinner at Lakeside Grill',
      amountCents: 12_000,
      splitType: 'ITEMIZED',
      category: 'Dining',
      createdAt: '2026-10-03T03:45:00.000Z',
      splits: [
        split('13', user.alice, 3_600),
        split('14', user.bob, 3_000),
        split('15', user.charlie, 2_400),
        split('16', user.dana, 3_000),
      ],
    },
    {
      id: '55555555-5555-4555-8555-000000000005',
      groupId: group.apartment,
      payerId: user.bob,
      title: 'Internet, October',
      amountCents: 6_000,
      splitType: 'EQUAL',
      category: 'Utilities',
      createdAt: '2026-10-05T12:00:00.000Z',
      splits: [
        split('17', user.alice, 2_000),
        split('18', user.bob, 2_000),
        split('19', user.charlie, 2_000),
      ],
    },
    {
      id: '55555555-5555-4555-8555-000000000006',
      groupId: group.springBreak,
      payerId: user.dana,
      title: 'Beach house',
      amountCents: 50_001,
      splitType: 'EQUAL',
      category: 'Lodging',
      createdAt: '2026-03-20T15:00:00.000Z',
      splits: [split('20', user.dana, 25_001), split('21', user.bob, 25_000)],
    },
  ],

  // Lake Tahoe net balances (paid - owed): Alice +574.00, Charlie +47.00, Bob -345.00, Dana -276.00.
  // The greedy matcher turns them into the first three transfers below.
  settlements: [
    {
      id: '77777777-7777-4777-8777-000000000001',
      groupId: group.tahoe,
      fromUserId: user.bob,
      toUserId: user.alice,
      amountCents: 34_500,
      status: 'CONFIRMED',
      notes: 'Paid by bank transfer',
      settledAt: '2026-10-06T10:00:00.000Z',
      createdAt: '2026-10-06T10:00:00.000Z',
    },
    {
      id: '77777777-7777-4777-8777-000000000002',
      groupId: group.tahoe,
      fromUserId: user.dana,
      toUserId: user.alice,
      amountCents: 22_900,
      status: 'PENDING',
      notes: null,
      settledAt: null,
      createdAt: '2026-10-06T10:05:00.000Z',
    },
    {
      id: '77777777-7777-4777-8777-000000000003',
      groupId: group.tahoe,
      fromUserId: user.dana,
      toUserId: user.charlie,
      amountCents: 4_700,
      status: 'DISPUTED',
      notes: 'Dana thinks the lift ticket split is wrong',
      settledAt: null,
      createdAt: '2026-10-07T09:00:00.000Z',
    },
    {
      id: '77777777-7777-4777-8777-000000000004',
      groupId: group.springBreak,
      fromUserId: user.bob,
      toUserId: user.dana,
      amountCents: 25_000,
      status: 'CONFIRMED',
      notes: null,
      settledAt: '2026-03-28T12:00:00.000Z',
      createdAt: '2026-03-28T12:00:00.000Z',
    },
  ],
};
