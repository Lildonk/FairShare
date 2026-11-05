import { describe, it, expect } from "vitest";
import { simplifyDebts } from "./simplify-debts.js";
import type { NetBalance, Transfer } from "../../types/finance.js";

// ─── Helpers ────────────────────────────────────────────────────────

/** Sum of all transfer amounts in cents. */
function totalTransferCents(transfers: Transfer[]): number {
  return transfers.reduce((sum, t) => sum + t.amountCents, 0);
}

/** Verify that every participant's net position is preserved by the transfers. */
function assertNetPositionsPreserved(
  balances: NetBalance[],
  transfers: Transfer[],
): void {
  // Build expected net map from input balances
  const expected = new Map<string, number>();
  for (const b of balances) {
    expected.set(b.memberId, (expected.get(b.memberId) ?? 0) + b.balanceCents);
  }

  // Build actual net from transfers: positive for creditors (receivers), negative for debtors (senders)
  const actual = new Map<string, number>();
  for (const [id] of expected) {
    actual.set(id, 0);
  }
  for (const t of transfers) {
    actual.set(t.fromMemberId, (actual.get(t.fromMemberId) ?? 0) - t.amountCents);
    actual.set(t.toMemberId, (actual.get(t.toMemberId) ?? 0) + t.amountCents);
  }

  for (const [id, expectedNet] of expected) {
    expect(actual.get(id), `net position of ${id}`).toBe(expectedNet);
  }
}

// ─── Test suites ────────────────────────────────────────────────────

describe("simplifyDebts", () => {
  // ── Input validation ──────────────────────────────────────────────

  describe("input validation", () => {
    it("rejects balances that do not sum to zero", () => {
      const balances: NetBalance[] = [
        { memberId: "A", balanceCents: 100 },
        { memberId: "B", balanceCents: -50 },
      ];
      expect(() => simplifyDebts(balances)).toThrow(/sum.*zero/i);
    });

    it("rejects non-integer cent values", () => {
      const balances: NetBalance[] = [
        { memberId: "A", balanceCents: 10.5 },
        { memberId: "B", balanceCents: -10.5 },
      ];
      expect(() => simplifyDebts(balances)).toThrow(/integer/i);
    });

    it("rejects non-finite values (NaN)", () => {
      const balances: NetBalance[] = [
        { memberId: "A", balanceCents: NaN },
        { memberId: "B", balanceCents: 0 },
      ];
      expect(() => simplifyDebts(balances)).toThrow(/finite.*integer/i);
    });

    it("rejects non-finite values (Infinity)", () => {
      const balances: NetBalance[] = [
        { memberId: "A", balanceCents: Infinity },
        { memberId: "B", balanceCents: -Infinity },
      ];
      expect(() => simplifyDebts(balances)).toThrow(/finite.*integer/i);
    });

    it("rejects unsafe integers (> Number.MAX_SAFE_INTEGER)", () => {
      const balances: NetBalance[] = [
        { memberId: "A", balanceCents: Number.MAX_SAFE_INTEGER + 1 },
        { memberId: "B", balanceCents: -(Number.MAX_SAFE_INTEGER + 1) },
      ];
      expect(() => simplifyDebts(balances)).toThrow(/safe.*integer/i);
    });

    it("rejects duplicate member IDs", () => {
      const balances: NetBalance[] = [
        { memberId: "A", balanceCents: 100 },
        { memberId: "A", balanceCents: -100 },
      ];
      expect(() => simplifyDebts(balances)).toThrow(/duplicate/i);
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("returns empty array for empty input", () => {
      expect(simplifyDebts([])).toEqual([]);
    });

    it("returns empty array when all balances are zero", () => {
      const balances: NetBalance[] = [
        { memberId: "A", balanceCents: 0 },
        { memberId: "B", balanceCents: 0 },
        { memberId: "C", balanceCents: 0 },
      ];
      expect(simplifyDebts(balances)).toEqual([]);
    });

    it("handles a single member with zero balance", () => {
      const balances: NetBalance[] = [{ memberId: "A", balanceCents: 0 }];
      expect(simplifyDebts(balances)).toEqual([]);
    });
  });

  // ── Simple two-party ─────────────────────────────────────────────

  describe("two-party settlement", () => {
    it("produces one transfer for two members", () => {
      const balances: NetBalance[] = [
        { memberId: "A", balanceCents: 500 },
        { memberId: "B", balanceCents: -500 },
      ];
      const result = simplifyDebts(balances);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        fromMemberId: "B",
        toMemberId: "A",
        amountCents: 500,
      });
      assertNetPositionsPreserved(balances, result);
    });

    it("handles mutual debt (one owes the other the net difference)", () => {
      // If A is owed 30 and B owes 30 net, single transfer
      const balances: NetBalance[] = [
        { memberId: "A", balanceCents: 30 },
        { memberId: "B", balanceCents: -30 },
      ];
      const result = simplifyDebts(balances);
      expect(result).toHaveLength(1);
      expect(result[0]!.amountCents).toBe(30);
      assertNetPositionsPreserved(balances, result);
    });
  });

  // ── Multi-party ───────────────────────────────────────────────────

  describe("multi-party settlement", () => {
    it("produces at most N-1 transfers for N nonzero participants", () => {
      // 5 nonzero participants → at most 4 transfers
      const balances: NetBalance[] = [
        { memberId: "A", balanceCents: 3218 },
        { memberId: "B", balanceCents: -4120 },
        { memberId: "C", balanceCents: -1250 },
        { memberId: "D", balanceCents: 1532 },
        { memberId: "E", balanceCents: 620 },
      ];
      const result = simplifyDebts(balances);

      expect(result.length).toBeLessThanOrEqual(4);
      assertNetPositionsPreserved(balances, result);
    });

    it("preserves net positions for the mockup settlement scenario", () => {
      // From docs/mockups/README.md: A +$32.18, B -$41.20, C -$12.50, D +$15.32, E +$6.20
      const balances: NetBalance[] = [
        { memberId: "A", balanceCents: 3218 },
        { memberId: "B", balanceCents: -4120 },
        { memberId: "C", balanceCents: -1250 },
        { memberId: "D", balanceCents: 1532 },
        { memberId: "E", balanceCents: 620 },
      ];
      const result = simplifyDebts(balances);

      // All transfer amounts must be positive integers
      for (const t of result) {
        expect(t.amountCents).toBeGreaterThan(0);
        expect(Number.isInteger(t.amountCents)).toBe(true);
      }
      assertNetPositionsPreserved(balances, result);

      // Total transfer volume should equal the total amount owed
      // (sum of all positive balances = sum of all negative balances magnitude = 5370)
      expect(totalTransferCents(result)).toBe(5370);
    });

    it("handles three-way cycle correctly", () => {
      // A owes B, B owes C, C owes A — but net: A +10, B -20, C +10
      const balances: NetBalance[] = [
        { memberId: "A", balanceCents: 10 },
        { memberId: "B", balanceCents: -20 },
        { memberId: "C", balanceCents: 10 },
      ];
      const result = simplifyDebts(balances);

      // At most 2 transfers for 3 nonzero participants
      expect(result.length).toBeLessThanOrEqual(2);
      assertNetPositionsPreserved(balances, result);
    });

    it("handles mixed zero and nonzero balances", () => {
      const balances: NetBalance[] = [
        { memberId: "A", balanceCents: 100 },
        { memberId: "B", balanceCents: 0 },
        { memberId: "C", balanceCents: -100 },
      ];
      const result = simplifyDebts(balances);

      // Only 2 nonzero participants → at most 1 transfer
      expect(result.length).toBeLessThanOrEqual(1);
      assertNetPositionsPreserved(balances, result);

      // B should not appear in any transfer
      for (const t of result) {
        expect(t.fromMemberId).not.toBe("B");
        expect(t.toMemberId).not.toBe("B");
      }
    });

    it("handles single debtor paying multiple creditors", () => {
      const balances: NetBalance[] = [
        { memberId: "A", balanceCents: 200 },
        { memberId: "B", balanceCents: 300 },
        { memberId: "C", balanceCents: -500 },
      ];
      const result = simplifyDebts(balances);

      expect(result.length).toBeLessThanOrEqual(2);
      assertNetPositionsPreserved(balances, result);
    });

    it("handles single creditor receiving from multiple debtors", () => {
      const balances: NetBalance[] = [
        { memberId: "A", balanceCents: 500 },
        { memberId: "B", balanceCents: -200 },
        { memberId: "C", balanceCents: -300 },
      ];
      const result = simplifyDebts(balances);

      expect(result.length).toBeLessThanOrEqual(2);
      assertNetPositionsPreserved(balances, result);
    });

    it("handles many participants with small amounts", () => {
      // 6 participants, 3 debtors and 3 creditors
      const balances: NetBalance[] = [
        { memberId: "A", balanceCents: 1 },
        { memberId: "B", balanceCents: 2 },
        { memberId: "C", balanceCents: 3 },
        { memberId: "D", balanceCents: -1 },
        { memberId: "E", balanceCents: -2 },
        { memberId: "F", balanceCents: -3 },
      ];
      const result = simplifyDebts(balances);

      // 6 nonzero → at most 5 transfers
      expect(result.length).toBeLessThanOrEqual(5);
      assertNetPositionsPreserved(balances, result);
    });
  });

  // ── Determinism ───────────────────────────────────────────────────

  describe("determinism", () => {
    it("produces identical results on repeated calls with the same input", () => {
      const balances: NetBalance[] = [
        { memberId: "A", balanceCents: 3218 },
        { memberId: "B", balanceCents: -4120 },
        { memberId: "C", balanceCents: -1250 },
        { memberId: "D", balanceCents: 1532 },
        { memberId: "E", balanceCents: 620 },
      ];
      const result1 = simplifyDebts(balances);
      const result2 = simplifyDebts(balances);
      expect(result1).toEqual(result2);
    });

    it("produces identical results regardless of input order", () => {
      const balancesA: NetBalance[] = [
        { memberId: "A", balanceCents: 3218 },
        { memberId: "B", balanceCents: -4120 },
        { memberId: "C", balanceCents: -1250 },
        { memberId: "D", balanceCents: 1532 },
        { memberId: "E", balanceCents: 620 },
      ];
      const balancesB: NetBalance[] = [
        { memberId: "E", balanceCents: 620 },
        { memberId: "C", balanceCents: -1250 },
        { memberId: "A", balanceCents: 3218 },
        { memberId: "D", balanceCents: 1532 },
        { memberId: "B", balanceCents: -4120 },
      ];
      const resultA = simplifyDebts(balancesA);
      const resultB = simplifyDebts(balancesB);
      expect(resultA).toEqual(resultB);
    });
  });

  // ── Output invariants ─────────────────────────────────────────────

  describe("output invariants", () => {
    it("never produces a transfer with amountCents ≤ 0", () => {
      const balances: NetBalance[] = [
        { memberId: "A", balanceCents: 100 },
        { memberId: "B", balanceCents: -50 },
        { memberId: "C", balanceCents: -50 },
      ];
      const result = simplifyDebts(balances);
      for (const t of result) {
        expect(t.amountCents).toBeGreaterThan(0);
      }
    });

    it("never produces a self-transfer", () => {
      const balances: NetBalance[] = [
        { memberId: "A", balanceCents: 100 },
        { memberId: "B", balanceCents: -100 },
      ];
      const result = simplifyDebts(balances);
      for (const t of result) {
        expect(t.fromMemberId).not.toBe(t.toMemberId);
      }
    });

    it("does not mutate the input array", () => {
      const balances: NetBalance[] = [
        { memberId: "A", balanceCents: 100 },
        { memberId: "B", balanceCents: -100 },
      ];
      const copy = JSON.parse(JSON.stringify(balances)) as NetBalance[];
      simplifyDebts(balances);
      expect(balances).toEqual(copy);
    });
  });
});

