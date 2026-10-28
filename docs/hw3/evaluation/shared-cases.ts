// Shared HW3 evaluation suite for Issue #4. Each experiment's generated code is
// wrapped by an adapter so both implementations face identical cases.
import { describe, expect, it } from 'vitest';

export interface Balance {
  id: string;
  netCents: number;
}

export interface Transfer {
  from: string;
  to: string;
  amountCents: number;
}

export type SimplifyAdapter = (balances: Balance[]) => Transfer[];

function netAfter(balances: Balance[], transfers: Transfer[]): Map<string, number> {
  const net = new Map(balances.map((b) => [b.id, b.netCents]));
  for (const t of transfers) {
    net.set(t.from, (net.get(t.from) ?? 0) + t.amountCents);
    net.set(t.to, (net.get(t.to) ?? 0) - t.amountCents);
  }
  return net;
}

function expectSettles(balances: Balance[], transfers: Transfer[]): void {
  for (const [, remaining] of netAfter(balances, transfers)) {
    expect(remaining).toBe(0);
  }
  const nonzero = balances.filter((b) => b.netCents !== 0).length;
  expect(transfers.length).toBeLessThanOrEqual(Math.max(nonzero - 1, 0));
  for (const t of transfers) {
    expect(Number.isSafeInteger(t.amountCents)).toBe(true);
    expect(t.amountCents).toBeGreaterThan(0);
    expect(t.from).not.toBe(t.to);
  }
}

export function runSharedSuite(label: string, simplify: SimplifyAdapter): void {
  describe(`[${label}] shared debt simplification cases`, () => {
    describe('empty and zero balances', () => {
      it('returns no transfers for empty input', () => {
        expect(simplify([])).toEqual([]);
      });

      it('returns no transfers when everyone is settled', () => {
        expect(
          simplify([
            { id: 'A', netCents: 0 },
            { id: 'B', netCents: 0 },
          ]),
        ).toEqual([]);
      });

      it('never involves zero-balance members', () => {
        const transfers = simplify([
          { id: 'A', netCents: -500 },
          { id: 'Z', netCents: 0 },
          { id: 'B', netCents: 500 },
        ]);
        expect(transfers.some((t) => t.from === 'Z' || t.to === 'Z')).toBe(false);
        expectSettles([{ id: 'A', netCents: -500 }, { id: 'B', netCents: 500 }], transfers);
      });
    });

    describe('multiple debtors and creditors', () => {
      it('settles a single debtor paying several creditors', () => {
        const balances = [
          { id: 'A', netCents: -9000 },
          { id: 'B', netCents: 3000 },
          { id: 'C', netCents: 6000 },
        ];
        expectSettles(balances, simplify(balances));
      });

      it('settles several debtors and creditors in at most N-1 transfers', () => {
        const balances = [
          { id: 'A', netCents: -4567 },
          { id: 'B', netCents: -1233 },
          { id: 'C', netCents: -200 },
          { id: 'D', netCents: 3000 },
          { id: 'E', netCents: 2999 },
          { id: 'F', netCents: 1 },
        ];
        expectSettles(balances, simplify(balances));
      });
    });

    describe('unbalanced input', () => {
      it('rejects balances that do not sum to zero', () => {
        expect(() =>
          simplify([
            { id: 'A', netCents: -1000 },
            { id: 'B', netCents: 999 },
          ]),
        ).toThrow();
      });
    });

    describe('cyclic debts', () => {
      it('collapses an even cycle (A→B→C→A, 10.00 each) to no transfers', () => {
        // Net of the cycle is zero for everyone.
        expect(
          simplify([
            { id: 'A', netCents: 0 },
            { id: 'B', netCents: 0 },
            { id: 'C', netCents: 0 },
          ]),
        ).toEqual([]);
      });

      it('settles an uneven cycle (A→B 30, B→C 20, C→A 10)', () => {
        const balances = [
          { id: 'A', netCents: -2000 },
          { id: 'B', netCents: 1000 },
          { id: 'C', netCents: 1000 },
        ];
        expectSettles(balances, simplify(balances));
      });
    });

    describe('integer-cent precision', () => {
      it('rejects fractional cents', () => {
        expect(() =>
          simplify([
            { id: 'A', netCents: -10.5 },
            { id: 'B', netCents: 10.5 },
          ]),
        ).toThrow();
      });

      it('rejects amounts outside the safe integer range', () => {
        expect(() =>
          simplify([
            { id: 'A', netCents: -(Number.MAX_SAFE_INTEGER + 1) },
            { id: 'B', netCents: Number.MAX_SAFE_INTEGER + 1 },
          ]),
        ).toThrow();
      });

      it('keeps one-cent balances exact', () => {
        const balances = [
          { id: 'A', netCents: -1 },
          { id: 'B', netCents: -1 },
          { id: 'C', netCents: 2 },
        ];
        expectSettles(balances, simplify(balances));
      });
    });

    describe('deterministic output', () => {
      const balances = [
        { id: 'A', netCents: -2500 },
        { id: 'B', netCents: -2500 },
        { id: 'C', netCents: 2500 },
        { id: 'D', netCents: 2500 },
      ];

      it('returns identical output for identical input', () => {
        expect(simplify(balances)).toEqual(simplify(balances));
      });

      it('returns identical output regardless of input order', () => {
        expect(simplify([...balances].reverse())).toEqual(simplify(balances));
      });

      it('does not mutate the input', () => {
        const copy = structuredClone(balances);
        simplify(copy);
        expect(copy).toEqual(balances);
      });
    });
  });
}
