import { describe, it, expect } from "vitest";
import { simplifyDebts, type Balances, type Transfer } from "./simplifyDebts.js";

// ── Helpers ─────────────────────────────────────────────────────────────

/** Assert that a set of transfers fully settles the original balances. */
function assertSettled(balances: Balances, transfers: Transfer[]): void {
  // Rebuild net flows from transfers and verify they match the input.
  const net: Record<string, number> = {};
  for (const name of Object.keys(balances)) {
    net[name] = 0;
  }
  for (const { from, to, amount } of transfers) {
    net[from] = (net[from] ?? 0) - amount;
    net[to] = (net[to] ?? 0) + amount;
  }
  for (const [name, expected] of Object.entries(balances)) {
    expect(net[name]).toBeCloseTo(expected, 8);
  }
}

// ── Test suites ─────────────────────────────────────────────────────────

describe("simplifyDebts", () => {
  // ─── Basic cases ────────────────────────────────────────────────────

  it("returns no transfers when all balances are zero", () => {
    const result = simplifyDebts({ Alice: 0, Bob: 0 });
    expect(result).toEqual([]);
  });

  it("returns no transfers for an empty input", () => {
    const result = simplifyDebts({});
    expect(result).toEqual([]);
  });

  it("handles a simple two-person debt", () => {
    const balances: Balances = { Alice: -10, Bob: 10 };
    const transfers = simplifyDebts(balances);

    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toEqual({ from: "Alice", to: "Bob", amount: 10 });
    assertSettled(balances, transfers);
  });

  it("handles one debtor paying two creditors", () => {
    const balances: Balances = { Alice: -10, Bob: 5, Carol: 5 };
    const transfers = simplifyDebts(balances);

    expect(transfers).toHaveLength(2);
    assertSettled(balances, transfers);

    // Total transferred should equal 10
    const totalTransferred = transfers.reduce((s, t) => s + t.amount, 0);
    expect(totalTransferred).toBeCloseTo(10);
  });

  it("handles two debtors paying one creditor", () => {
    const balances: Balances = { Alice: 20, Bob: -8, Carol: -12 };
    const transfers = simplifyDebts(balances);

    expect(transfers).toHaveLength(2);
    assertSettled(balances, transfers);
  });

  // ─── Simplification (fewer transfers than naive pairwise) ───────────

  it("simplifies a chain of debts (A→B→C) into fewer transfers", () => {
    // Without simplification you might get A→B and B→C.
    // With simplification: A→C directly (if A owes the amount C is owed).
    const balances: Balances = { A: -10, B: 0, C: 10 };
    const transfers = simplifyDebts(balances);

    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toEqual({ from: "A", to: "C", amount: 10 });
    assertSettled(balances, transfers);
  });

  it("simplifies a four-person scenario", () => {
    //  Alice owes 30, Bob owes 10 → Carol is owed 20, Dave is owed 20
    const balances: Balances = { Alice: -30, Bob: -10, Carol: 20, Dave: 20 };
    const transfers = simplifyDebts(balances);

    // Maximum transfers = min(#creditors, #debtors) ≤ 3
    expect(transfers.length).toBeLessThanOrEqual(3);
    assertSettled(balances, transfers);
  });

  // ─── Edge cases ─────────────────────────────────────────────────────

  it("handles a single participant with zero balance", () => {
    const result = simplifyDebts({ Alice: 0 });
    expect(result).toEqual([]);
  });

  it("handles fractional / decimal amounts correctly", () => {
    const balances: Balances = { Alice: -7.5, Bob: 3.25, Carol: 4.25 };
    const transfers = simplifyDebts(balances);

    assertSettled(balances, transfers);
    // Every amount should be rounded to 2 decimal places
    for (const t of transfers) {
      expect(t.amount).toBe(parseFloat(t.amount.toFixed(2)));
    }
  });

  it("handles many participants", () => {
    const balances: Balances = {
      A: -50,
      B: -30,
      C: -20,
      D: 40,
      E: 35,
      F: 25,
    };
    const transfers = simplifyDebts(balances);

    // At most N-1 = 5 transfers
    expect(transfers.length).toBeLessThanOrEqual(5);
    assertSettled(balances, transfers);
  });

  it("handles very small balances near zero", () => {
    const balances: Balances = { Alice: 1e-10, Bob: -1e-10 };
    const result = simplifyDebts(balances);
    // Both are within EPSILON of zero, so no transfers needed
    expect(result).toEqual([]);
  });

  // ─── Validation ─────────────────────────────────────────────────────

  it("throws when balances do not sum to zero", () => {
    expect(() => simplifyDebts({ Alice: 10, Bob: -5 })).toThrow(
      /do not sum to zero/,
    );
  });

  it("throws for a single non-zero balance", () => {
    expect(() => simplifyDebts({ Alice: 5 })).toThrow(/do not sum to zero/);
  });

  // ─── Property: all transfer amounts are positive ────────────────────

  it("never produces a transfer with zero or negative amount", () => {
    const balances: Balances = { A: -15, B: -5, C: 8, D: 12 };
    const transfers = simplifyDebts(balances);

    for (const t of transfers) {
      expect(t.amount).toBeGreaterThan(0);
    }
    assertSettled(balances, transfers);
  });

  // ─── Property: total money transferred is correct ───────────────────

  it("transfers exactly the total amount owed", () => {
    const balances: Balances = { A: -30, B: -10, C: 20, D: 20 };
    const transfers = simplifyDebts(balances);

    const totalOwed = Object.values(balances)
      .filter((v) => v > 0)
      .reduce((s, v) => s + v, 0);
    const totalTransferred = transfers.reduce((s, t) => s + t.amount, 0);

    expect(totalTransferred).toBeCloseTo(totalOwed);
  });
});

