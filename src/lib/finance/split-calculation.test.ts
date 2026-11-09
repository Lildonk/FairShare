/**
 * EQUAL / EXACT / PERCENTAGE split engine — tests for Issue #5.
 *
 * Rules under test (integer cents throughout):
 * - EQUAL: floor(total / n) each; leftover cents all go to the payer when the payer
 *   participates, otherwise one each to participants in memberId ordinal order.
 * - EXACT: entered shares must add up to the total exactly.
 * - PERCENTAGE: basis points (10000 = 100%) must sum to 10000 within 1 bp (0.01%);
 *   cents are prorated by basis points, leftover cents by largest remainder, ties by
 *   memberId ordinal.
 * Allocations come back in the order participants were given.
 */
import { describe, expect, it } from 'vitest';
import { InvalidSplitError } from './itemized-split';
import {
  PERCENT_TOLERANCE_BPS,
  splitEqual,
  splitExact,
  splitPercentage,
  type ShareAllocation,
} from './split-calculation';

/** Invariants every successful split must satisfy. */
function expectExactTotal(totalCents: number, allocations: ShareAllocation[]): void {
  let sum = 0;
  for (const a of allocations) {
    expect(Number.isSafeInteger(a.owedCents)).toBe(true);
    expect(a.owedCents).toBeGreaterThanOrEqual(0);
    sum += a.owedCents;
  }
  expect(sum).toBe(totalCents);
}

function byMember(allocations: ShareAllocation[]): Record<string, number> {
  return Object.fromEntries(allocations.map((a) => [a.memberId, a.owedCents]));
}

describe('splitEqual', () => {
  it('matches the mockup: $120.01 among three gives the payer the leftover cent', () => {
    const result = splitEqual(12001, ['memberA', 'memberB', 'memberC'], 'memberA');
    expectExactTotal(12001, result);
    expect(result).toEqual([
      { memberId: 'memberA', owedCents: 4001 },
      { memberId: 'memberB', owedCents: 4000 },
      { memberId: 'memberC', owedCents: 4000 },
    ]);
  });

  it('splits evenly when the total divides exactly', () => {
    const result = splitEqual(9000, ['a', 'b', 'c'], 'a');
    expectExactTotal(9000, result);
    expect(byMember(result)).toEqual({ a: 3000, b: 3000, c: 3000 });
  });

  it('gives every leftover cent to the payer when the payer participates', () => {
    const result = splitEqual(10002, ['a', 'b', 'c', 'd'], 'c');
    expectExactTotal(10002, result);
    expect(result.map((a) => a.owedCents)).toEqual([2500, 2500, 2502, 2500]);
  });

  it('gives a single cent to the payer', () => {
    const result = splitEqual(1, ['a', 'b', 'c'], 'b');
    expectExactTotal(1, result);
    expect(byMember(result)).toEqual({ a: 0, b: 1, c: 0 });
  });

  it('spreads leftover cents by memberId ordinal when the payer does not participate', () => {
    const result = splitEqual(101, ['carol', 'alice', 'bob'], 'dave');
    expectExactTotal(101, result);
    expect(result).toEqual([
      { memberId: 'carol', owedCents: 33 },
      { memberId: 'alice', owedCents: 34 },
      { memberId: 'bob', owedCents: 34 },
    ]);
  });

  it('charges the whole amount to a single participant', () => {
    expect(splitEqual(4321, ['solo'], 'other')).toEqual([{ memberId: 'solo', owedCents: 4321 }]);
  });

  it('gives each member the same amount regardless of participant order', () => {
    const a = splitEqual(1000, ['x', 'y', 'z'], 'q');
    const b = splitEqual(1000, ['z', 'x', 'y'], 'q');
    expect(byMember(a)).toEqual(byMember(b));
  });
});

describe('splitExact', () => {
  it('returns the entered shares when they add up to the total', () => {
    const result = splitExact(10000, [
      { memberId: 'a', amountCents: 2500 },
      { memberId: 'b', amountCents: 7500 },
    ]);
    expectExactTotal(10000, result);
    expect(result).toEqual([
      { memberId: 'a', owedCents: 2500 },
      { memberId: 'b', owedCents: 7500 },
    ]);
  });

  it('allows a participant with a zero share', () => {
    const result = splitExact(500, [
      { memberId: 'a', amountCents: 500 },
      { memberId: 'b', amountCents: 0 },
    ]);
    expect(byMember(result)).toEqual({ a: 500, b: 0 });
  });

  it('rejects shares that add up to more than the total', () => {
    expect(() =>
      splitExact(1000, [
        { memberId: 'a', amountCents: 600 },
        { memberId: 'b', amountCents: 401 },
      ]),
    ).toThrow(InvalidSplitError);
  });

  it('rejects shares that add up to less than the total, with a clear message', () => {
    expect(() =>
      splitExact(1000, [
        { memberId: 'a', amountCents: 600 },
        { memberId: 'b', amountCents: 399 },
      ]),
    ).toThrow(/add up/i);
  });

  it.each([
    ['negative', -1],
    ['fractional', 10.5],
    ['NaN', NaN],
    ['unsafe', Number.MAX_SAFE_INTEGER + 1],
  ])('rejects a %s share', (_label, amountCents) => {
    expect(() =>
      splitExact(1000, [
        { memberId: 'a', amountCents },
        { memberId: 'b', amountCents: 1000 },
      ]),
    ).toThrow(InvalidSplitError);
  });
});

describe('splitPercentage', () => {
  it('uses a 1 basis point (0.01%) tolerance', () => {
    expect(PERCENT_TOLERANCE_BPS).toBe(1);
  });

  it('prorates by basis points and gives tied leftover cents by memberId ordinal', () => {
    // 12345 * 50% = 6172.5, * 30% = 3703.5, * 20% = 2469 -> one leftover cent.
    // a and b tie on remainder; a wins by ordinal.
    const result = splitPercentage(12345, [
      { memberId: 'a', basisPoints: 5000 },
      { memberId: 'b', basisPoints: 3000 },
      { memberId: 'c', basisPoints: 2000 },
    ]);
    expectExactTotal(12345, result);
    expect(result).toEqual([
      { memberId: 'a', owedCents: 6173 },
      { memberId: 'b', owedCents: 3703 },
      { memberId: 'c', owedCents: 2469 },
    ]);
  });

  it('accepts 33.33% x 3 (99.99%) within tolerance and keeps the exact total', () => {
    const result = splitPercentage(10000, [
      { memberId: 'c', basisPoints: 3333 },
      { memberId: 'a', basisPoints: 3333 },
      { memberId: 'b', basisPoints: 3333 },
    ]);
    expectExactTotal(10000, result);
    expect(byMember(result)).toEqual({ a: 3334, b: 3333, c: 3333 });
  });

  it('accepts 100.01% within tolerance and keeps the exact total', () => {
    const result = splitPercentage(10000, [
      { memberId: 'a', basisPoints: 3334 },
      { memberId: 'b', basisPoints: 3334 },
      { memberId: 'c', basisPoints: 3333 },
    ]);
    expectExactTotal(10000, result);
    expect(byMember(result)).toEqual({ a: 3334, b: 3333, c: 3333 });
  });

  it.each([9998, 10002])('rejects percentages summing to %i basis points', (lastBps) => {
    expect(() =>
      splitPercentage(1000, [
        { memberId: 'a', basisPoints: 5000 },
        { memberId: 'b', basisPoints: lastBps - 5000 },
      ]),
    ).toThrow(InvalidSplitError);
  });

  it('explains a percentage total that is outside the tolerance', () => {
    expect(() =>
      splitPercentage(1000, [
        { memberId: 'a', basisPoints: 5000 },
        { memberId: 'b', basisPoints: 4000 },
      ]),
    ).toThrow(/100%/);
  });

  it.each([
    ['negative', -100],
    ['above 100%', 10001],
    ['fractional', 12.5],
  ])('rejects a %s basis-point share', (_label, basisPoints) => {
    expect(() =>
      splitPercentage(1000, [
        { memberId: 'a', basisPoints },
        { memberId: 'b', basisPoints: 10000 - basisPoints },
      ]),
    ).toThrow(InvalidSplitError);
  });

  it('gives a 0% participant nothing', () => {
    const result = splitPercentage(999, [
      { memberId: 'a', basisPoints: 10000 },
      { memberId: 'b', basisPoints: 0 },
    ]);
    expect(byMember(result)).toEqual({ a: 999, b: 0 });
  });

  it('prorates large totals without floating-point precision loss', () => {
    const total = 900_719_925_474_099;
    const result = splitPercentage(total, [
      { memberId: 'a', basisPoints: 3333 },
      { memberId: 'b', basisPoints: 3333 },
      { memberId: 'c', basisPoints: 3334 },
    ]);
    expectExactTotal(total, result);
    expect(byMember(result)).toEqual({
      a: 300_209_951_160_517,
      b: 300_209_951_160_517,
      c: 300_300_023_153_065,
    });
  });
});

describe('shared validation', () => {
  const equal = (total: number, ids: string[]) => () => splitEqual(total, ids, ids[0] ?? 'p');
  const exact = (total: number, ids: string[]) => () =>
    splitExact(
      total,
      ids.map((memberId, i) => ({ memberId, amountCents: i === 0 ? total : 0 })),
    );
  const percentage = (total: number, ids: string[]) => () =>
    splitPercentage(
      total,
      ids.map((memberId, i) => ({ memberId, basisPoints: i === 0 ? 10000 : 0 })),
    );

  describe.each([
    ['EQUAL', equal],
    ['EXACT', exact],
    ['PERCENTAGE', percentage],
  ])('%s', (_mode, run) => {
    it.each([
      ['zero', 0],
      ['negative', -100],
      ['fractional', 100.5],
      ['unsafe', Number.MAX_SAFE_INTEGER + 1],
    ])('rejects a %s total', (_label, total) => {
      expect(run(total, ['a', 'b'])).toThrow(InvalidSplitError);
    });

    it('rejects an empty participant list', () => {
      expect(run(100, [])).toThrow(InvalidSplitError);
    });

    it('rejects a duplicate participant', () => {
      expect(run(100, ['a', 'a'])).toThrow(InvalidSplitError);
    });

    it('rejects an empty participant ID', () => {
      expect(run(100, ['a', ''])).toThrow(InvalidSplitError);
    });
  });
});
