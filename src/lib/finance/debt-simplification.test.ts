/**
 * Debt Simplification Engine — RED tests (Issue #4)
 *
 * Tests for the greedy creditor/debtor matcher described in FAIRSHARE_BLUEPRINT.md
 * Section 4, Feature 1. All monetary values are integer cents.
 *
 * Interface under test (not yet implemented):
 *   computeNetBalances(entries: LedgerEntry[]): MemberBalance[]
 *   simplifyDebts(balances: MemberBalance[]): Transfer[]
 *   InvalidBalanceError (extends Error)
 */

import { describe, it, expect } from 'vitest';
import {
  computeNetBalances,
  simplifyDebts,
  InvalidBalanceError,
  type LedgerEntry,
  type MemberBalance,
  type Transfer,
} from './debt-simplification';

// ─── Invariant helper ────────────────────────────────────────────────────────
// Applied to every simplifyDebts result to enforce structural invariants.

function assertTransferInvariants(
  balances: MemberBalance[],
  transfers: Transfer[],
): void {
  const nonZero = balances.filter((b) => b.balanceCents !== 0);

  // Invariant 1: at most N-1 transfers for N nonzero participants
  expect(transfers.length).toBeLessThanOrEqual(
    Math.max(nonZero.length - 1, 0),
  );

  // Invariant 2: every amountCents is a positive safe integer
  for (const t of transfers) {
    expect(t.amountCents).toBeGreaterThan(0);
    expect(Number.isSafeInteger(t.amountCents)).toBe(true);
  }

  // Invariant 3: no self-transfers
  for (const t of transfers) {
    expect(t.fromMemberId).not.toBe(t.toMemberId);
  }

  // Invariant 4: zero-balance members never appear in transfers
  const zeroIds = new Set(
    balances.filter((b) => b.balanceCents === 0).map((b) => b.memberId),
  );
  for (const t of transfers) {
    expect(zeroIds.has(t.fromMemberId)).toBe(false);
    expect(zeroIds.has(t.toMemberId)).toBe(false);
  }

  // Invariant 5: applying transfers brings every member to zero net position
  const netAfter = new Map<string, number>();
  for (const b of balances) {
    netAfter.set(b.memberId, (netAfter.get(b.memberId) ?? 0) + b.balanceCents);
  }
  for (const t of transfers) {
    // fromMember pays (their negative balance becomes less negative / zeroes)
    netAfter.set(
      t.fromMemberId,
      (netAfter.get(t.fromMemberId) ?? 0) + t.amountCents,
    );
    // toMember receives (their positive balance becomes less positive / zeroes)
    netAfter.set(
      t.toMemberId,
      (netAfter.get(t.toMemberId) ?? 0) - t.amountCents,
    );
  }
  for (const remaining of netAfter.values()) {
    expect(remaining).toBe(0);
  }
}

// ─── computeNetBalances ──────────────────────────────────────────────────────

describe('computeNetBalances', () => {
  describe('basic computation', () => {
    it('computes balance as paid minus owed for a single member', () => {
      const entries: LedgerEntry[] = [
        { memberId: 'alice', paidCents: 5000, owedCents: 3000 },
      ];
      const result = computeNetBalances(entries);
      expect(result).toEqual([{ memberId: 'alice', balanceCents: 2000 }]);
    });

    it('computes balances for multiple distinct members', () => {
      const entries: LedgerEntry[] = [
        { memberId: 'alice', paidCents: 6000, owedCents: 2000 },
        { memberId: 'bob', paidCents: 0, owedCents: 4000 },
      ];
      const result = computeNetBalances(entries);
      expect(result).toEqual([
        { memberId: 'alice', balanceCents: 4000 },
        { memberId: 'bob', balanceCents: -4000 },
      ]);
    });

    it('returns zero balance for a member who paid exactly what they owe', () => {
      const entries: LedgerEntry[] = [
        { memberId: 'alice', paidCents: 3000, owedCents: 3000 },
      ];
      const result = computeNetBalances(entries);
      expect(result).toEqual([{ memberId: 'alice', balanceCents: 0 }]);
    });
  });

  describe('aggregation of repeated memberIds', () => {
    it('sums paid and owed across multiple entries for the same member', () => {
      const entries: LedgerEntry[] = [
        { memberId: 'alice', paidCents: 1000, owedCents: 500 },
        { memberId: 'alice', paidCents: 2000, owedCents: 1500 },
      ];
      const result = computeNetBalances(entries);
      // paid: 3000, owed: 2000 → balance: 1000
      expect(result).toEqual([{ memberId: 'alice', balanceCents: 1000 }]);
    });

    it('aggregates across multiple members with repeated entries', () => {
      const entries: LedgerEntry[] = [
        { memberId: 'bob', paidCents: 1000, owedCents: 0 },
        { memberId: 'alice', paidCents: 500, owedCents: 500 },
        { memberId: 'bob', paidCents: 500, owedCents: 2000 },
      ];
      const result = computeNetBalances(entries);
      expect(result).toEqual([
        { memberId: 'alice', balanceCents: 0 },
        { memberId: 'bob', balanceCents: -500 },
      ]);
    });
  });

  describe('output sorting by ordinal memberId', () => {
    it('sorts output by memberId using ordinal comparison (a < b)', () => {
      const entries: LedgerEntry[] = [
        { memberId: 'charlie', paidCents: 300, owedCents: 100 },
        { memberId: 'alice', paidCents: 100, owedCents: 100 },
        { memberId: 'bob', paidCents: 200, owedCents: 400 },
      ];
      const result = computeNetBalances(entries);
      expect(result.map((b) => b.memberId)).toEqual([
        'alice',
        'bob',
        'charlie',
      ]);
    });

    it('uses ordinal sort, not localeCompare (uppercase before lowercase in ASCII)', () => {
      // In ordinal comparison: 'A' (65) < 'Z' (90) < 'a' (97) < 'z' (122)
      const entries: LedgerEntry[] = [
        { memberId: 'z', paidCents: 100, owedCents: 100 },
        { memberId: 'A', paidCents: 100, owedCents: 100 },
        { memberId: 'a', paidCents: 100, owedCents: 100 },
        { memberId: 'Z', paidCents: 100, owedCents: 100 },
      ];
      const result = computeNetBalances(entries);
      expect(result.map((b) => b.memberId)).toEqual(['A', 'Z', 'a', 'z']);
    });
  });

  describe('input validation — InvalidBalanceError', () => {
    it('throws InvalidBalanceError for non-integer paidCents', () => {
      const entries: LedgerEntry[] = [
        { memberId: 'alice', paidCents: 10.5, owedCents: 0 },
      ];
      expect(() => computeNetBalances(entries)).toThrow(InvalidBalanceError);
    });

    it('throws InvalidBalanceError for non-integer owedCents', () => {
      const entries: LedgerEntry[] = [
        { memberId: 'alice', paidCents: 0, owedCents: 99.99 },
      ];
      expect(() => computeNetBalances(entries)).toThrow(InvalidBalanceError);
    });

    it('throws InvalidBalanceError for negative paidCents', () => {
      const entries: LedgerEntry[] = [
        { memberId: 'alice', paidCents: -100, owedCents: 0 },
      ];
      expect(() => computeNetBalances(entries)).toThrow(InvalidBalanceError);
    });

    it('throws InvalidBalanceError for negative owedCents', () => {
      const entries: LedgerEntry[] = [
        { memberId: 'alice', paidCents: 0, owedCents: -200 },
      ];
      expect(() => computeNetBalances(entries)).toThrow(InvalidBalanceError);
    });

    it('throws InvalidBalanceError for NaN paidCents', () => {
      const entries: LedgerEntry[] = [
        { memberId: 'alice', paidCents: NaN, owedCents: 0 },
      ];
      expect(() => computeNetBalances(entries)).toThrow(InvalidBalanceError);
    });

    it('throws InvalidBalanceError for Infinity owedCents', () => {
      const entries: LedgerEntry[] = [
        { memberId: 'alice', paidCents: 0, owedCents: Infinity },
      ];
      expect(() => computeNetBalances(entries)).toThrow(InvalidBalanceError);
    });

    it('throws InvalidBalanceError for negative Infinity paidCents', () => {
      const entries: LedgerEntry[] = [
        { memberId: 'alice', paidCents: -Infinity, owedCents: 0 },
      ];
      expect(() => computeNetBalances(entries)).toThrow(InvalidBalanceError);
    });

    it('throws InvalidBalanceError for unsafe integer paidCents', () => {
      const entries: LedgerEntry[] = [
        {
          memberId: 'alice',
          paidCents: Number.MAX_SAFE_INTEGER + 1,
          owedCents: 0,
        },
      ];
      expect(() => computeNetBalances(entries)).toThrow(InvalidBalanceError);
    });

    it('throws InvalidBalanceError for unsafe integer owedCents', () => {
      const entries: LedgerEntry[] = [
        {
          memberId: 'alice',
          paidCents: 0,
          owedCents: Number.MAX_SAFE_INTEGER + 1,
        },
      ];
      expect(() => computeNetBalances(entries)).toThrow(InvalidBalanceError);
    });
  });

  describe('empty input', () => {
    it('returns an empty array for empty input', () => {
      expect(computeNetBalances([])).toEqual([]);
    });
  });
});

// ─── simplifyDebts ───────────────────────────────────────────────────────────

describe('simplifyDebts', () => {
  describe('input validation', () => {
    it('throws InvalidBalanceError when balances do not sum to zero', () => {
      const balances: MemberBalance[] = [
        { memberId: 'alice', balanceCents: 500 },
        { memberId: 'bob', balanceCents: -300 },
      ];
      expect(() => simplifyDebts(balances)).toThrow(InvalidBalanceError);
    });

    it('throws InvalidBalanceError when a balance is not a safe integer', () => {
      const balances: MemberBalance[] = [
        { memberId: 'alice', balanceCents: Number.MAX_SAFE_INTEGER + 1 },
        { memberId: 'bob', balanceCents: -(Number.MAX_SAFE_INTEGER + 1) },
      ];
      expect(() => simplifyDebts(balances)).toThrow(InvalidBalanceError);
    });

    it('throws InvalidBalanceError when a balance is NaN', () => {
      const balances: MemberBalance[] = [
        { memberId: 'alice', balanceCents: NaN },
        { memberId: 'bob', balanceCents: 0 },
      ];
      expect(() => simplifyDebts(balances)).toThrow(InvalidBalanceError);
    });

    it('throws InvalidBalanceError when a balance is Infinity', () => {
      const balances: MemberBalance[] = [
        { memberId: 'alice', balanceCents: Infinity },
        { memberId: 'bob', balanceCents: -Infinity },
      ];
      expect(() => simplifyDebts(balances)).toThrow(InvalidBalanceError);
    });

    it('throws InvalidBalanceError when a balance is non-integer', () => {
      const balances: MemberBalance[] = [
        { memberId: 'alice', balanceCents: 10.5 },
        { memberId: 'bob', balanceCents: -10.5 },
      ];
      expect(() => simplifyDebts(balances)).toThrow(InvalidBalanceError);
    });

    it('throws InvalidBalanceError when a memberId appears twice', () => {
      const balances: MemberBalance[] = [
        { memberId: 'alice', balanceCents: 100 },
        { memberId: 'alice', balanceCents: -100 },
      ];
      expect(() => simplifyDebts(balances)).toThrow(InvalidBalanceError);
    });
  });

  describe('edge cases', () => {
    it('returns empty array for empty input', () => {
      const result = simplifyDebts([]);
      expect(result).toEqual([]);
      assertTransferInvariants([], result);
    });

    it('returns empty array when all balances are zero', () => {
      const balances: MemberBalance[] = [
        { memberId: 'alice', balanceCents: 0 },
        { memberId: 'bob', balanceCents: 0 },
        { memberId: 'charlie', balanceCents: 0 },
      ];
      const result = simplifyDebts(balances);
      expect(result).toEqual([]);
      assertTransferInvariants(balances, result);
    });

    it('handles equal mutual debts that cancel out via computeNetBalances', () => {
      // Alice paid $50 for Bob, Bob paid $50 for Alice — net zero for both
      const entries: LedgerEntry[] = [
        { memberId: 'alice', paidCents: 5000, owedCents: 0 },
        { memberId: 'bob', paidCents: 0, owedCents: 5000 },
        { memberId: 'bob', paidCents: 5000, owedCents: 0 },
        { memberId: 'alice', paidCents: 0, owedCents: 5000 },
      ];
      const balances = computeNetBalances(entries);
      expect(balances).toEqual([
        { memberId: 'alice', balanceCents: 0 },
        { memberId: 'bob', balanceCents: 0 },
      ]);
      const result = simplifyDebts(balances);
      expect(result).toEqual([]);
      assertTransferInvariants(balances, result);
    });

    it('handles unequal mutual debts with a net transfer via computeNetBalances', () => {
      // Alice paid $50 for Bob, Bob paid $20 for Alice — alice is owed $30 net
      const entries: LedgerEntry[] = [
        { memberId: 'alice', paidCents: 5000, owedCents: 0 },
        { memberId: 'bob', paidCents: 0, owedCents: 5000 },
        { memberId: 'bob', paidCents: 2000, owedCents: 0 },
        { memberId: 'alice', paidCents: 0, owedCents: 2000 },
      ];
      const balances = computeNetBalances(entries);
      expect(balances).toEqual([
        { memberId: 'alice', balanceCents: 3000 },
        { memberId: 'bob', balanceCents: -3000 },
      ]);
      const result = simplifyDebts(balances);
      expect(result).toEqual([
        { fromMemberId: 'bob', toMemberId: 'alice', amountCents: 3000 },
      ]);
      assertTransferInvariants(balances, result);
    });

    it('handles a single debtor paying a single creditor', () => {
      const balances: MemberBalance[] = [
        { memberId: 'alice', balanceCents: 5000 },
        { memberId: 'bob', balanceCents: -5000 },
      ];
      const result = simplifyDebts(balances);
      expect(result).toEqual([
        { fromMemberId: 'bob', toMemberId: 'alice', amountCents: 5000 },
      ]);
      assertTransferInvariants(balances, result);
    });

    it('handles a single debtor paying several creditors', () => {
      // Bob owes $100 total; Alice gets $60, Charlie gets $40
      const balances: MemberBalance[] = [
        { memberId: 'alice', balanceCents: 6000 },
        { memberId: 'bob', balanceCents: -10000 },
        { memberId: 'charlie', balanceCents: 4000 },
      ];
      const result = simplifyDebts(balances);
      assertTransferInvariants(balances, result);
      // With greedy: largest debtor (-10000 bob) matches largest creditor (6000 alice)
      // Transfer 6000 from bob -> alice; bob remaining: -4000
      // Then bob (-4000) matches charlie (4000); transfer 4000 from bob -> charlie
      expect(result).toEqual([
        { fromMemberId: 'bob', toMemberId: 'alice', amountCents: 6000 },
        { fromMemberId: 'bob', toMemberId: 'charlie', amountCents: 4000 },
      ]);
    });
  });

  describe('greedy two-pointer matcher algorithm', () => {
    it('matches largest debtor with largest creditor via sorted two-pointer walk', () => {
      // 4-person scenario:
      // alice: +3000 (creditor), bob: -2000 (debtor),
      // charlie: +1000 (creditor), dave: -2000 (debtor)
      const balances: MemberBalance[] = [
        { memberId: 'alice', balanceCents: 3000 },
        { memberId: 'bob', balanceCents: -2000 },
        { memberId: 'charlie', balanceCents: 1000 },
        { memberId: 'dave', balanceCents: -2000 },
      ];
      const result = simplifyDebts(balances);
      assertTransferInvariants(balances, result);

      // Two-pointer algorithm: sort once, then walk pointers (no re-sort).
      // Debtors sorted by |balance| desc, tiebreak memberId ordinal asc: [bob(-2000), dave(-2000)]
      //   → bob before dave because 'bob' < 'dave' ordinally
      // Creditors sorted by balance desc, tiebreak memberId ordinal asc: [alice(+3000), charlie(+1000)]
      //
      // Step 1: debtor ptr → bob(-2000), creditor ptr → alice(+3000)
      //   Transfer min(2000, 3000) = 2000 from bob → alice
      //   bob → 0 (advance debtor ptr), alice remaining: +1000
      // Step 2: debtor ptr → dave(-2000), creditor ptr → alice(+1000)
      //   Transfer min(2000, 1000) = 1000 from dave → alice
      //   alice → 0 (advance creditor ptr), dave remaining: -1000
      // Step 3: debtor ptr → dave(-1000), creditor ptr → charlie(+1000)
      //   Transfer min(1000, 1000) = 1000 from dave → charlie
      //   Both → 0, done.
      expect(result).toEqual([
        { fromMemberId: 'bob', toMemberId: 'alice', amountCents: 2000 },
        { fromMemberId: 'dave', toMemberId: 'alice', amountCents: 1000 },
        { fromMemberId: 'dave', toMemberId: 'charlie', amountCents: 1000 },
      ]);
    });

    it('breaks ties among debtors by memberId ordinal ascending', () => {
      // Two equal debtors: 'b_debtor' and 'a_debtor' — 'a_debtor' comes first ordinally
      const balances: MemberBalance[] = [
        { memberId: 'a_debtor', balanceCents: -500 },
        { memberId: 'b_debtor', balanceCents: -500 },
        { memberId: 'creditor', balanceCents: 1000 },
      ];
      const result = simplifyDebts(balances);
      assertTransferInvariants(balances, result);
      // Greedy: both debtors at -500; tiebreak → a_debtor first
      // Transfer 500 from a_debtor → creditor; creditor remaining: 500
      // Transfer 500 from b_debtor → creditor; done
      expect(result).toEqual([
        {
          fromMemberId: 'a_debtor',
          toMemberId: 'creditor',
          amountCents: 500,
        },
        {
          fromMemberId: 'b_debtor',
          toMemberId: 'creditor',
          amountCents: 500,
        },
      ]);
    });

    it('breaks ties among creditors by memberId ordinal ascending', () => {
      // Two equal creditors: 'b_cred' and 'a_cred' — 'a_cred' comes first ordinally
      const balances: MemberBalance[] = [
        { memberId: 'a_cred', balanceCents: 500 },
        { memberId: 'b_cred', balanceCents: 500 },
        { memberId: 'debtor', balanceCents: -1000 },
      ];
      const result = simplifyDebts(balances);
      assertTransferInvariants(balances, result);
      // Greedy: debtor at -1000; creditors tied at 500; tiebreak → a_cred first
      // Transfer 500 from debtor → a_cred; debtor remaining: -500
      // Transfer 500 from debtor → b_cred; done
      expect(result).toEqual([
        { fromMemberId: 'debtor', toMemberId: 'a_cred', amountCents: 500 },
        { fromMemberId: 'debtor', toMemberId: 'b_cred', amountCents: 500 },
      ]);
    });
  });

  describe('determinism', () => {
    it('produces identical output regardless of input order', () => {
      const balancesOriginal: MemberBalance[] = [
        { memberId: 'alice', balanceCents: 3000 },
        { memberId: 'bob', balanceCents: -2000 },
        { memberId: 'charlie', balanceCents: 1000 },
        { memberId: 'dave', balanceCents: -2000 },
      ];

      // Shuffled orders
      const balancesShuffled1: MemberBalance[] = [
        { memberId: 'dave', balanceCents: -2000 },
        { memberId: 'charlie', balanceCents: 1000 },
        { memberId: 'alice', balanceCents: 3000 },
        { memberId: 'bob', balanceCents: -2000 },
      ];

      const balancesShuffled2: MemberBalance[] = [
        { memberId: 'bob', balanceCents: -2000 },
        { memberId: 'dave', balanceCents: -2000 },
        { memberId: 'alice', balanceCents: 3000 },
        { memberId: 'charlie', balanceCents: 1000 },
      ];

      const result1 = simplifyDebts(balancesOriginal);
      const result2 = simplifyDebts(balancesShuffled1);
      const result3 = simplifyDebts(balancesShuffled2);

      expect(result1).toEqual(result2);
      expect(result1).toEqual(result3);
      assertTransferInvariants(balancesOriginal, result1);
    });

    it('produces identical output for two-person swap', () => {
      const order1: MemberBalance[] = [
        { memberId: 'x', balanceCents: 750 },
        { memberId: 'y', balanceCents: -750 },
      ];
      const order2: MemberBalance[] = [
        { memberId: 'y', balanceCents: -750 },
        { memberId: 'x', balanceCents: 750 },
      ];
      expect(simplifyDebts(order1)).toEqual(simplifyDebts(order2));
    });
  });

  describe('cyclic debts via computeNetBalances', () => {
    it('settles a cyclic A->B->C->A ledger in at most N-1 transfers', () => {
      // Cycle: A pays B $30, B pays C $20, C pays A $10
      // Modeled as ledger entries where each transaction has a payer and an ower:
      //   A paid 3000 for B → A: paid 3000, owed 0; B: paid 0, owed 3000
      //   B paid 2000 for C → B: paid 2000, owed 0; C: paid 0, owed 2000
      //   C paid 1000 for A → C: paid 1000, owed 0; A: paid 0, owed 1000
      const entries: LedgerEntry[] = [
        { memberId: 'A', paidCents: 3000, owedCents: 0 },
        { memberId: 'B', paidCents: 0, owedCents: 3000 },
        { memberId: 'B', paidCents: 2000, owedCents: 0 },
        { memberId: 'C', paidCents: 0, owedCents: 2000 },
        { memberId: 'C', paidCents: 1000, owedCents: 0 },
        { memberId: 'A', paidCents: 0, owedCents: 1000 },
      ];

      const balances = computeNetBalances(entries);
      // A: paid 3000, owed 1000 → +2000
      // B: paid 2000, owed 3000 → -1000
      // C: paid 1000, owed 2000 → -1000
      expect(balances).toEqual([
        { memberId: 'A', balanceCents: 2000 },
        { memberId: 'B', balanceCents: -1000 },
        { memberId: 'C', balanceCents: -1000 },
      ]);

      const transfers = simplifyDebts(balances);
      assertTransferInvariants(balances, transfers);

      // Greedy: debtors B(-1000) and C(-1000) tied → B first (ordinal).
      // Creditor: A(+2000).
      // Transfer 1000 from B → A; A remaining: +1000
      // Transfer 1000 from C → A; done
      expect(transfers).toEqual([
        { fromMemberId: 'B', toMemberId: 'A', amountCents: 1000 },
        { fromMemberId: 'C', toMemberId: 'A', amountCents: 1000 },
      ]);
    });
  });

  describe('odd cents — no dropped cent', () => {
    it('handles 1001 cents split across 3 members with no cent lost', () => {
      // Total bill: 1001 cents paid by alice, split equally among alice, bob, charlie
      // Each owes floor(1001/3)=333, remainder 2 → alice(payer) gets remainder
      // alice owes 335, bob owes 333, charlie owes 333
      // alice paid 1001, owed 335 → balance = +666
      // bob paid 0, owed 333 → balance = -333
      // charlie paid 0, owed 333 → balance = -333
      // Sum: 666 - 333 - 333 = 0 ✓
      const balances: MemberBalance[] = [
        { memberId: 'alice', balanceCents: 666 },
        { memberId: 'bob', balanceCents: -333 },
        { memberId: 'charlie', balanceCents: -333 },
      ];

      const transfers = simplifyDebts(balances);
      assertTransferInvariants(balances, transfers);

      // Greedy: bob(-333) and charlie(-333) tied → bob first (ordinal)
      // Transfer 333 from bob → alice; alice remaining: +333
      // Transfer 333 from charlie → alice; done
      expect(transfers).toEqual([
        { fromMemberId: 'bob', toMemberId: 'alice', amountCents: 333 },
        { fromMemberId: 'charlie', toMemberId: 'alice', amountCents: 333 },
      ]);

      // Verify no dropped cent: sum of transfers equals total owed
      const totalTransferred = transfers.reduce(
        (sum, t) => sum + t.amountCents,
        0,
      );
      expect(totalTransferred).toBe(666);
    });

    it('handles uneven odd-cent split with correct remainder distribution', () => {
      // 5 members, 1 cent total imbalance is impossible (sum must be 0)
      // Instead: 100 cents, 3 members — payer alice paid 100, each owes 33, remainder 1 to alice
      // alice: paid 100, owed 34 → +66; bob: owed 33 → -33; charlie: owed 33 → -33
      const balances: MemberBalance[] = [
        { memberId: 'alice', balanceCents: 66 },
        { memberId: 'bob', balanceCents: -33 },
        { memberId: 'charlie', balanceCents: -33 },
      ];

      const transfers = simplifyDebts(balances);
      assertTransferInvariants(balances, transfers);

      const totalTransferred = transfers.reduce(
        (sum, t) => sum + t.amountCents,
        0,
      );
      expect(totalTransferred).toBe(66);
    });
  });

  describe('larger multi-member scenario', () => {
    it('produces correct transfers for a 5-member group', () => {
      // 5 members with varied balances summing to zero:
      // alice: +5000, bob: -3000, charlie: +2000, dave: -2500, eve: -1500
      // Sum: 5000 - 3000 + 2000 - 2500 - 1500 = 0 ✓
      const balances: MemberBalance[] = [
        { memberId: 'alice', balanceCents: 5000 },
        { memberId: 'bob', balanceCents: -3000 },
        { memberId: 'charlie', balanceCents: 2000 },
        { memberId: 'dave', balanceCents: -2500 },
        { memberId: 'eve', balanceCents: -1500 },
      ];

      const result = simplifyDebts(balances);
      assertTransferInvariants(balances, result);

      // Two-pointer algorithm: sort once, then walk pointers (no re-sort).
      // Debtors sorted by |balance| desc, tiebreak ordinal asc: [bob(-3000), dave(-2500), eve(-1500)]
      // Creditors sorted by balance desc, tiebreak ordinal asc: [alice(+5000), charlie(+2000)]
      //
      // Step 1: debtor ptr → bob(-3000), creditor ptr → alice(+5000)
      //   Transfer 3000 from bob → alice; bob → 0 (advance debtor), alice remaining: +2000
      // Step 2: debtor ptr → dave(-2500), creditor ptr → alice(+2000)
      //   Transfer 2000 from dave → alice; alice → 0 (advance creditor), dave remaining: -500
      // Step 3: debtor ptr → dave(-500), creditor ptr → charlie(+2000)
      //   Transfer 500 from dave → charlie; dave → 0 (advance debtor), charlie remaining: +1500
      // Step 4: debtor ptr → eve(-1500), creditor ptr → charlie(+1500)
      //   Transfer 1500 from eve → charlie; both → 0, done.
      expect(result).toEqual([
        { fromMemberId: 'bob', toMemberId: 'alice', amountCents: 3000 },
        { fromMemberId: 'dave', toMemberId: 'alice', amountCents: 2000 },
        { fromMemberId: 'dave', toMemberId: 'charlie', amountCents: 500 },
        { fromMemberId: 'eve', toMemberId: 'charlie', amountCents: 1500 },
      ]);
      // 4 transfers for 5 nonzero members = N-1 ✓
      expect(result.length).toBeLessThanOrEqual(4);
    });
  });

  describe('at-most N-1 transfer bound', () => {
    it('generates exactly 1 transfer for 2 nonzero members', () => {
      const balances: MemberBalance[] = [
        { memberId: 'a', balanceCents: 100 },
        { memberId: 'b', balanceCents: -100 },
      ];
      const result = simplifyDebts(balances);
      assertTransferInvariants(balances, result);
      expect(result).toHaveLength(1);
    });

    it('skips zero-balance members when counting N', () => {
      const balances: MemberBalance[] = [
        { memberId: 'a', balanceCents: 100 },
        { memberId: 'b', balanceCents: -100 },
        { memberId: 'c', balanceCents: 0 },
        { memberId: 'd', balanceCents: 0 },
      ];
      const result = simplifyDebts(balances);
      assertTransferInvariants(balances, result);
      // N nonzero = 2, so at most 1 transfer
      expect(result).toHaveLength(1);
    });
  });

  describe('mixed zero and nonzero balances', () => {
    it('ignores zero-balance members in output transfers', () => {
      const balances: MemberBalance[] = [
        { memberId: 'alice', balanceCents: 500 },
        { memberId: 'bob', balanceCents: 0 },
        { memberId: 'charlie', balanceCents: -500 },
      ];
      const result = simplifyDebts(balances);
      assertTransferInvariants(balances, result);

      const memberIdsInTransfers = new Set(
        result.flatMap((t) => [t.fromMemberId, t.toMemberId]),
      );
      expect(memberIdsInTransfers.has('bob')).toBe(false);
    });
  });

  describe('InvalidBalanceError is an Error subclass', () => {
    it('is an instance of Error', () => {
      expect(new InvalidBalanceError('test')).toBeInstanceOf(Error);
    });

    it('is an instance of InvalidBalanceError', () => {
      expect(new InvalidBalanceError('test')).toBeInstanceOf(
        InvalidBalanceError,
      );
    });

    it('carries a message', () => {
      const err = new InvalidBalanceError('balances must sum to zero');
      expect(err.message).toBe('balances must sum to zero');
    });
  });
});

