/**
 * Itemized split engine — tests for Issue #6.
 *
 * Rules under test (integer cents throughout):
 * 1. A shared item is split equally; leftover cents go one each to its participants in
 *    memberId ordinal order (a < b, never localeCompare).
 * 2. Tax + service + tip form one "extras" pool, prorated by each member's item subtotal.
 *    Floors first, then leftover cents by largest remainder, ties by memberId ordinal.
 * 3. One allocation per member on any item, sorted by memberId ordinal; the allocations
 *    add up to the receipt total exactly.
 */
import { describe, expect, it } from 'vitest';
import {
  InvalidSplitError,
  splitItemized,
  type ItemizedAllocation,
  type ItemizedReceipt,
  type ReceiptItem,
} from './itemized-split';

interface Extras {
  taxCents?: number;
  serviceCents?: number;
  tipCents?: number;
}

/** Builds a receipt whose totalCents matches its items and extras. */
function buildReceipt(items: ReceiptItem[], extras: Extras = {}): ItemizedReceipt {
  const taxCents = extras.taxCents ?? 0;
  const serviceCents = extras.serviceCents ?? 0;
  const tipCents = extras.tipCents ?? 0;
  const itemsCents = items.reduce((sum, item) => sum + item.priceCents, 0);
  return {
    items,
    taxCents,
    serviceCents,
    tipCents,
    totalCents: itemsCents + taxCents + serviceCents + tipCents,
  };
}

function item(description: string, priceCents: number, participantIds: string[]): ReceiptItem {
  return { description, priceCents, participantIds };
}

/** Invariants every successful split must satisfy. */
function expectPreservesReceipt(
  receipt: ItemizedReceipt,
  allocations: ItemizedAllocation[],
): void {
  const itemTotal = receipt.items.reduce((sum, i) => sum + i.priceCents, 0);
  let totalSum = 0;
  let itemsSum = 0;
  for (const a of allocations) {
    for (const value of [a.itemsCents, a.extrasCents, a.totalCents]) {
      expect(Number.isSafeInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
    expect(a.totalCents).toBe(a.itemsCents + a.extrasCents);
    totalSum += a.totalCents;
    itemsSum += a.itemsCents;
  }
  expect(totalSum).toBe(receipt.totalCents);
  expect(itemsSum).toBe(itemTotal);
}

/** Runs splitItemized and checks the invariants before returning the result. */
function splitChecked(receipt: ItemizedReceipt): ItemizedAllocation[] {
  const allocations = splitItemized(receipt);
  expectPreservesReceipt(receipt, allocations);
  return allocations;
}

const workedExample = (): ItemizedReceipt =>
  buildReceipt(
    [item('Pizza', 1000, ['alice', 'bob', 'carol']), item('Salad', 500, ['bob'])],
    { taxCents: 100, tipCents: 200 },
  );

describe('splitItemized', () => {
  describe('worked example', () => {
    it('splits a shared pizza and prorates tax and tip to the exact cent', () => {
      // Pizza 1000 / 3 -> 333 each, 1 leftover cent to alice (first by ordinal).
      // Subtotals: alice 334, bob 333 + 500 = 833, carol 333 (item total 1500).
      // Extras 300: floors 66 / 166 / 66 = 298, 2 leftover cents.
      // Remainders 300 * subtotal mod 1500: alice 1200, bob 900, carol 900
      // -> alice +1, then bob over carol by ordinal tie-break.
      expect(splitChecked(workedExample())).toEqual([
        { memberId: 'alice', itemsCents: 334, extrasCents: 67, totalCents: 401 },
        { memberId: 'bob', itemsCents: 833, extrasCents: 167, totalCents: 1000 },
        { memberId: 'carol', itemsCents: 333, extrasCents: 66, totalCents: 399 },
      ]);
    });
  });

  describe('item assignment', () => {
    it('charges single-person items entirely to that member', () => {
      const receipt = buildReceipt([item('Steak', 1250, ['alice']), item('Soup', 750, ['bob'])]);
      expect(splitChecked(receipt)).toEqual([
        { memberId: 'alice', itemsCents: 1250, extrasCents: 0, totalCents: 1250 },
        { memberId: 'bob', itemsCents: 750, extrasCents: 0, totalCents: 750 },
      ]);
    });

    it('splits an item shared by everyone equally when it divides evenly', () => {
      const receipt = buildReceipt([item('Nachos', 900, ['alice', 'bob', 'carol'])]);
      expect(splitChecked(receipt)).toEqual([
        { memberId: 'alice', itemsCents: 300, extrasCents: 0, totalCents: 300 },
        { memberId: 'bob', itemsCents: 300, extrasCents: 0, totalCents: 300 },
        { memberId: 'carol', itemsCents: 300, extrasCents: 0, totalCents: 300 },
      ]);
    });

    it('accumulates a member subtotal across several items', () => {
      const receipt = buildReceipt([
        item('Wine', 3000, ['alice', 'bob']),
        item('Dessert', 800, ['alice']),
      ]);
      expect(splitChecked(receipt)).toEqual([
        { memberId: 'alice', itemsCents: 2300, extrasCents: 0, totalCents: 2300 },
        { memberId: 'bob', itemsCents: 1500, extrasCents: 0, totalCents: 1500 },
      ]);
    });
  });

  describe('proportional extras', () => {
    it('prorates tax in proportion to item subtotals', () => {
      const receipt = buildReceipt(
        [item('Burger', 3000, ['alice']), item('Fries', 1000, ['bob'])],
        { taxCents: 400 },
      );
      expect(splitChecked(receipt)).toEqual([
        { memberId: 'alice', itemsCents: 3000, extrasCents: 300, totalCents: 3300 },
        { memberId: 'bob', itemsCents: 1000, extrasCents: 100, totalCents: 1100 },
      ]);
    });

    it('prorates tax, service charge, and tip as one pool', () => {
      const receipt = buildReceipt(
        [item('Ramen', 2000, ['alice']), item('Gyoza', 1000, ['bob'])],
        { taxCents: 10, serviceCents: 20, tipCents: 30 },
      );
      expect(splitChecked(receipt)).toEqual([
        { memberId: 'alice', itemsCents: 2000, extrasCents: 40, totalCents: 2040 },
        { memberId: 'bob', itemsCents: 1000, extrasCents: 20, totalCents: 1020 },
      ]);
    });
  });

  describe('remainder cents', () => {
    it('gives one leftover item cent to the first participant by memberId ordinal', () => {
      const receipt = buildReceipt([item('Pie', 100, ['carol', 'alice', 'bob'])]);
      expect(splitChecked(receipt).map((a) => [a.memberId, a.itemsCents])).toEqual([
        ['alice', 34],
        ['bob', 33],
        ['carol', 33],
      ]);
    });

    it('gives two leftover item cents to the first two participants by memberId ordinal', () => {
      const receipt = buildReceipt([item('Cake', 1001, ['carol', 'bob', 'alice'])]);
      expect(splitChecked(receipt).map((a) => [a.memberId, a.itemsCents])).toEqual([
        ['alice', 334],
        ['bob', 334],
        ['carol', 333],
      ]);
    });

    it('gives a leftover extras cent to the member with the largest remainder', () => {
      // Extras 1 over subtotals 1 and 2: floors 0 and 0; remainders 1 and 2 -> bob.
      const receipt = buildReceipt(
        [item('Gum', 1, ['alice']), item('Mints', 2, ['bob'])],
        { tipCents: 1 },
      );
      expect(splitChecked(receipt).map((a) => [a.memberId, a.extrasCents])).toEqual([
        ['alice', 0],
        ['bob', 1],
      ]);
    });

    it('breaks equal extras remainders by memberId ordinal', () => {
      const receipt = buildReceipt(
        [item('Tea', 1, ['bob']), item('Coffee', 1, ['alice'])],
        { tipCents: 1 },
      );
      expect(splitChecked(receipt).map((a) => [a.memberId, a.extrasCents])).toEqual([
        ['alice', 1],
        ['bob', 0],
      ]);
    });

    it('orders memberIds ordinally, so uppercase IDs come before lowercase', () => {
      // 2 cents over 3 people: 0 each, leftover cents to 'B' then 'a' (ordinal order).
      const receipt = buildReceipt([item('Candy', 2, ['b', 'B', 'a'])]);
      expect(splitChecked(receipt)).toEqual([
        { memberId: 'B', itemsCents: 1, extrasCents: 0, totalCents: 1 },
        { memberId: 'a', itemsCents: 1, extrasCents: 0, totalCents: 1 },
        { memberId: 'b', itemsCents: 0, extrasCents: 0, totalCents: 0 },
      ]);
    });
  });

  describe('zero amounts', () => {
    it('allocates no extras when tax, service, and tip are all zero', () => {
      const receipt = buildReceipt([item('Bagel', 450, ['alice', 'bob'])]);
      for (const allocation of splitChecked(receipt)) {
        expect(allocation.extrasCents).toBe(0);
      }
    });

    it('includes a member whose only item is free and gives them no extras', () => {
      const receipt = buildReceipt(
        [item('Water', 0, ['alice']), item('Sandwich', 800, ['bob'])],
        { taxCents: 80 },
      );
      expect(splitChecked(receipt)).toEqual([
        { memberId: 'alice', itemsCents: 0, extrasCents: 0, totalCents: 0 },
        { memberId: 'bob', itemsCents: 800, extrasCents: 80, totalCents: 880 },
      ]);
    });

    it('allows a receipt where every item and every extra is zero', () => {
      const receipt = buildReceipt([item('Sample', 0, ['alice', 'bob'])]);
      expect(splitChecked(receipt)).toEqual([
        { memberId: 'alice', itemsCents: 0, extrasCents: 0, totalCents: 0 },
        { memberId: 'bob', itemsCents: 0, extrasCents: 0, totalCents: 0 },
      ]);
    });
  });

  describe('determinism', () => {
    it('returns identical output when items and participants are listed in another order', () => {
      const reordered = buildReceipt(
        [item('Salad', 500, ['bob']), item('Pizza', 1000, ['carol', 'bob', 'alice'])],
        { taxCents: 100, tipCents: 200 },
      );
      expect(splitChecked(reordered)).toEqual(splitChecked(workedExample()));
    });
  });

  describe('large amounts', () => {
    it('prorates without floating-point precision loss when products exceed 2^53', () => {
      // extras * subtotal is about 3.8e16 here. Exact integer math gives alice 26487893
      // with remainder 0; Math.floor(extras * subtotal / itemTotal) gives 26487892.
      const receipt = buildReceipt(
        [item('Alice order', 52_975_786, ['alice']), item('Bob order', 1_399_718_378, ['bob'])],
        { taxCents: 726_347_082 },
      );
      expect(splitChecked(receipt)).toEqual([
        {
          memberId: 'alice',
          itemsCents: 52_975_786,
          extrasCents: 26_487_893,
          totalCents: 79_463_679,
        },
        {
          memberId: 'bob',
          itemsCents: 1_399_718_378,
          extrasCents: 699_859_189,
          totalCents: 2_099_577_567,
        },
      ]);
    });
  });

  describe('validation', () => {
    const valid = (): ItemizedReceipt => workedExample();

    it('rejects a negative item price', () => {
      const receipt = buildReceipt([item('Refund', -100, ['alice'])]);
      expect(() => splitItemized(receipt)).toThrow(InvalidSplitError);
    });

    it('rejects a non-integer item price', () => {
      const receipt = buildReceipt([item('Latte', 450.5, ['alice'])]);
      expect(() => splitItemized(receipt)).toThrow(InvalidSplitError);
    });

    it('rejects NaN tax', () => {
      expect(() => splitItemized({ ...valid(), taxCents: NaN })).toThrow(InvalidSplitError);
    });

    it('rejects an infinite tip', () => {
      expect(() => splitItemized({ ...valid(), tipCents: Infinity })).toThrow(InvalidSplitError);
    });

    it('rejects an unsafe-integer service charge', () => {
      expect(() =>
        splitItemized({ ...valid(), serviceCents: Number.MAX_SAFE_INTEGER + 1 }),
      ).toThrow(InvalidSplitError);
    });

    it('rejects a negative receipt total', () => {
      expect(() => splitItemized({ ...valid(), totalCents: -1 })).toThrow(InvalidSplitError);
    });

    it('rejects a receipt with no items', () => {
      expect(() => splitItemized(buildReceipt([]))).toThrow(InvalidSplitError);
    });

    it('rejects an item with no participants', () => {
      const receipt = buildReceipt([item('Orphan fries', 300, [])]);
      expect(() => splitItemized(receipt)).toThrow(InvalidSplitError);
    });

    it('rejects an item that lists the same participant twice', () => {
      const receipt = buildReceipt([item('Pasta', 1200, ['alice', 'alice'])]);
      expect(() => splitItemized(receipt)).toThrow(InvalidSplitError);
    });

    it('rejects an empty participant ID', () => {
      const receipt = buildReceipt([item('Bread', 300, ['alice', ''])]);
      expect(() => splitItemized(receipt)).toThrow(InvalidSplitError);
    });

    it('rejects a receipt total one cent above the items and extras', () => {
      const receipt = valid();
      expect(() => splitItemized({ ...receipt, totalCents: receipt.totalCents + 1 })).toThrow(
        InvalidSplitError,
      );
    });

    it('rejects a receipt total one cent below the items and extras', () => {
      const receipt = valid();
      expect(() => splitItemized({ ...receipt, totalCents: receipt.totalCents - 1 })).toThrow(
        InvalidSplitError,
      );
    });

    it('rejects extras when every item is free, since there is nothing to prorate by', () => {
      const receipt = buildReceipt([item('Free sample', 0, ['alice'])], { taxCents: 10 });
      expect(() => splitItemized(receipt)).toThrow(InvalidSplitError);
    });

    it('rejects a receipt whose amounts add up beyond the safe integer range', () => {
      const receipt: ItemizedReceipt = {
        items: [
          item('Yacht', Number.MAX_SAFE_INTEGER, ['alice']),
          item('Island', Number.MAX_SAFE_INTEGER, ['bob']),
        ],
        taxCents: 0,
        serviceCents: 0,
        tipCents: 0,
        totalCents: Number.MAX_SAFE_INTEGER,
      };
      expect(() => splitItemized(receipt)).toThrow(InvalidSplitError);
    });

    it('explains the problem in the error message', () => {
      const receipt = valid();
      expect(() => splitItemized({ ...receipt, totalCents: receipt.totalCents + 1 })).toThrow(
        /total/i,
      );
    });
  });

  describe('InvalidSplitError', () => {
    it('is an Error subclass with its own name', () => {
      const error = new InvalidSplitError('bad split');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('InvalidSplitError');
      expect(error.message).toBe('bad split');
    });
  });
});
