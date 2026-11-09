/**
 * Group balances — tests for Issue #7.
 *
 * Net balance per member = paid − owed across expenses, plus confirmed settlements:
 * the sender's balance rises and the receiver's falls by the settled amount.
 * PENDING and DISPUTED settlements do not count until confirmed.
 */
import { describe, expect, it } from 'vitest';
import { InvalidBalanceError, simplifyDebts } from './debt-simplification';
import {
  computeGroupBalances,
  type ExpenseRecord,
  type SettlementRecord,
} from './group-balances';

const members = ['u-alice', 'u-bob', 'u-charlie', 'u-dana'];

/** Produces Alice +574.00, Bob −345.00, Charlie +47.00, Dana −276.00 (the #2 seed sample). */
const lakeTahoeExpenses: ExpenseRecord[] = [
  {
    payerId: 'u-alice',
    amountCents: 80000,
    splits: [
      { userId: 'u-alice', owedCents: 22600 },
      { userId: 'u-bob', owedCents: 34500 },
      { userId: 'u-dana', owedCents: 22900 },
    ],
  },
  {
    payerId: 'u-charlie',
    amountCents: 10000,
    splits: [
      { userId: 'u-charlie', owedCents: 5300 },
      { userId: 'u-dana', owedCents: 4700 },
    ],
  },
];

function settlement(
  fromUserId: string,
  toUserId: string,
  amountCents: number,
  status: SettlementRecord['status'] = 'CONFIRMED',
): SettlementRecord {
  return { fromUserId, toUserId, amountCents, status };
}

function balanceMap(balances: { memberId: string; balanceCents: number }[]) {
  return Object.fromEntries(balances.map((b) => [b.memberId, b.balanceCents]));
}

describe('computeGroupBalances', () => {
  it('computes paid minus owed for every member across expenses', () => {
    expect(balanceMap(computeGroupBalances(members, lakeTahoeExpenses, []))).toEqual({
      'u-alice': 57400,
      'u-bob': -34500,
      'u-charlie': 4700,
      'u-dana': -27600,
    });
  });

  it('feeds the debt engine to produce the expected transfers', () => {
    const balances = computeGroupBalances(members, lakeTahoeExpenses, []);
    expect(simplifyDebts(balances)).toEqual([
      { fromMemberId: 'u-bob', toMemberId: 'u-alice', amountCents: 34500 },
      { fromMemberId: 'u-dana', toMemberId: 'u-alice', amountCents: 22900 },
      { fromMemberId: 'u-dana', toMemberId: 'u-charlie', amountCents: 4700 },
    ]);
  });

  it('includes members with no activity at zero', () => {
    const result = computeGroupBalances([...members, 'u-erin'], lakeTahoeExpenses, []);
    expect(balanceMap(result)['u-erin']).toBe(0);
    expect(result).toHaveLength(5);
  });

  it('returns zero balances for a group with no expenses or settlements', () => {
    expect(computeGroupBalances(['u-b', 'u-a'], [], [])).toEqual([
      { memberId: 'u-a', balanceCents: 0 },
      { memberId: 'u-b', balanceCents: 0 },
    ]);
  });

  it('returns members sorted by ID using ordinal comparison', () => {
    const result = computeGroupBalances(['u-b', 'U-z', 'u-a'], [], []);
    expect(result.map((b) => b.memberId)).toEqual(['U-z', 'u-a', 'u-b']);
  });

  it('applies a confirmed settlement: the sender owes less and the receiver is owed less', () => {
    const result = computeGroupBalances(members, lakeTahoeExpenses, [
      settlement('u-bob', 'u-alice', 34500),
    ]);
    expect(balanceMap(result)).toEqual({
      'u-alice': 22900,
      'u-bob': 0,
      'u-charlie': 4700,
      'u-dana': -27600,
    });
  });

  it('applies a partial confirmed settlement', () => {
    const result = computeGroupBalances(members, lakeTahoeExpenses, [
      settlement('u-dana', 'u-charlie', 1000),
    ]);
    expect(balanceMap(result)['u-dana']).toBe(-26600);
    expect(balanceMap(result)['u-charlie']).toBe(3700);
  });

  it.each(['PENDING', 'DISPUTED'] as const)('ignores %s settlements', (status) => {
    const result = computeGroupBalances(members, lakeTahoeExpenses, [
      settlement('u-bob', 'u-alice', 34500, status),
    ]);
    expect(balanceMap(result)['u-bob']).toBe(-34500);
    expect(balanceMap(result)['u-alice']).toBe(57400);
  });

  it('keeps the balances summing to zero', () => {
    const result = computeGroupBalances(members, lakeTahoeExpenses, [
      settlement('u-bob', 'u-alice', 34500),
      settlement('u-dana', 'u-charlie', 4700),
    ]);
    expect(result.reduce((sum, b) => sum + b.balanceCents, 0)).toBe(0);
  });

  describe('validation', () => {
    it('rejects an expense whose splits do not add up to its amount', () => {
      const broken: ExpenseRecord = {
        payerId: 'u-alice',
        amountCents: 1000,
        splits: [{ userId: 'u-bob', owedCents: 999 }],
      };
      expect(() => computeGroupBalances(members, [broken], [])).toThrow(InvalidBalanceError);
    });

    it('rejects an expense with a non-positive amount', () => {
      const zero: ExpenseRecord = { payerId: 'u-alice', amountCents: 0, splits: [] };
      expect(() => computeGroupBalances(members, [zero], [])).toThrow(InvalidBalanceError);
    });

    it('rejects a fractional split amount', () => {
      const fractional: ExpenseRecord = {
        payerId: 'u-alice',
        amountCents: 1000,
        splits: [
          { userId: 'u-alice', owedCents: 500.5 },
          { userId: 'u-bob', owedCents: 499.5 },
        ],
      };
      expect(() => computeGroupBalances(members, [fractional], [])).toThrow(InvalidBalanceError);
    });

    it('rejects a settlement with a non-positive amount', () => {
      expect(() =>
        computeGroupBalances(members, [], [settlement('u-bob', 'u-alice', 0)]),
      ).toThrow(InvalidBalanceError);
    });

    it('rejects a settlement from a member to themselves', () => {
      expect(() =>
        computeGroupBalances(members, [], [settlement('u-bob', 'u-bob', 100)]),
      ).toThrow(InvalidBalanceError);
    });

    it('rejects an expense payer who is not a group member', () => {
      const outsider: ExpenseRecord = {
        payerId: 'u-zed',
        amountCents: 100,
        splits: [{ userId: 'u-alice', owedCents: 100 }],
      };
      expect(() => computeGroupBalances(members, [outsider], [])).toThrow(InvalidBalanceError);
    });

    it('rejects a split for someone who is not a group member', () => {
      const outsider: ExpenseRecord = {
        payerId: 'u-alice',
        amountCents: 100,
        splits: [{ userId: 'u-zed', owedCents: 100 }],
      };
      expect(() => computeGroupBalances(members, [outsider], [])).toThrow(InvalidBalanceError);
    });

    it('rejects a settlement involving someone who is not a group member', () => {
      expect(() =>
        computeGroupBalances(members, [], [settlement('u-zed', 'u-alice', 100)]),
      ).toThrow(InvalidBalanceError);
    });

    it('rejects duplicate member IDs', () => {
      expect(() => computeGroupBalances(['u-a', 'u-a'], [], [])).toThrow(InvalidBalanceError);
    });
  });
});
