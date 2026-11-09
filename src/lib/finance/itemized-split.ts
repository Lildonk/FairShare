/**
 * Itemized split engine (Issue #6).
 *
 * Pure financial computation: no React, Prisma, or I/O. All amounts are integer cents.
 *
 * Rules:
 * 1. A shared item is split equally among its participants. Leftover cents go one each
 *    to participants in memberId ordinal order (`<`, never localeCompare).
 * 2. Tax, service charge, and tip form one extras pool, prorated by each member's item
 *    subtotal: floor(extras * subtotal / itemTotal) first, then leftover cents one each
 *    by largest remainder, ties by memberId ordinal. Products use BigInt so amounts
 *    beyond 2^53 never lose precision.
 * 3. The result has one allocation per member on any item, sorted by memberId, and the
 *    allocations add up to the receipt total exactly.
 */

export interface ReceiptItem {
  description: string;
  priceCents: number;
  participantIds: string[];
}

export interface ItemizedReceipt {
  items: ReceiptItem[];
  taxCents: number;
  serviceCents: number;
  tipCents: number;
  totalCents: number;
}

export interface ItemizedAllocation {
  memberId: string;
  itemsCents: number;
  extrasCents: number;
  totalCents: number;
}

export class InvalidSplitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSplitError';
  }
}

/** Ordinal comparison for IDs already known to be distinct. */
function compareDistinctIds(a: string, b: string): number {
  return a < b ? -1 : 1;
}

function assertCents(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new InvalidSplitError(`${label} must be a non-negative whole number of cents.`);
  }
}

function assertSafeSum(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new InvalidSplitError(`${label} is too large to calculate exactly.`);
  }
}

function validateItem(item: ReceiptItem): void {
  assertCents(item.priceCents, `Price of "${item.description}"`);
  if (item.participantIds.length === 0) {
    throw new InvalidSplitError(`"${item.description}" must be assigned to at least one person.`);
  }
  const seen = new Set<string>();
  for (const id of item.participantIds) {
    if (id === '') {
      throw new InvalidSplitError(`"${item.description}" has an empty participant ID.`);
    }
    if (seen.has(id)) {
      throw new InvalidSplitError(`"${item.description}" lists participant "${id}" more than once.`);
    }
    seen.add(id);
  }
}

/** Returns each member's item subtotal: equal shares of every item they are on. */
function allocateItems(items: ReceiptItem[]): Map<string, number> {
  const subtotals = new Map<string, number>();
  for (const item of items) {
    const participants = [...item.participantIds].sort(compareDistinctIds);
    const baseShare = Math.floor(item.priceCents / participants.length);
    const leftoverCents = item.priceCents % participants.length;
    participants.forEach((id, index) => {
      const share = baseShare + (index < leftoverCents ? 1 : 0);
      subtotals.set(id, (subtotals.get(id) ?? 0) + share);
    });
  }
  return subtotals;
}

/**
 * Prorates `extrasCents` across `subtotals` (already in memberId ordinal order) using
 * floors plus largest-remainder cents. Returns the extras share at each index.
 */
function prorateExtras(subtotals: number[], itemTotal: number, extrasCents: number): number[] {
  if (extrasCents === 0) {
    // Also avoids dividing by a zero item total when every item is free.
    return subtotals.map(() => 0);
  }

  const pool = BigInt(extrasCents);
  const denominator = BigInt(itemTotal);
  const shares: number[] = [];
  const remainders: bigint[] = [];
  for (const subtotal of subtotals) {
    const product = pool * BigInt(subtotal);
    shares.push(Number(product / denominator));
    remainders.push(product % denominator);
  }

  const leftoverCents = extrasCents - shares.reduce((sum, share) => sum + share, 0);
  // Largest remainder first; equal remainders keep index (memberId ordinal) order.
  const order = subtotals
    .map((_, index) => index)
    .sort((a, b) => {
      if (remainders[a] === remainders[b]) return a - b;
      return remainders[a] > remainders[b] ? -1 : 1;
    });
  for (let k = 0; k < leftoverCents; k++) {
    shares[order[k]] += 1;
  }
  return shares;
}

/**
 * Splits an itemized receipt among its participants.
 *
 * @throws InvalidSplitError for negative, fractional, or unsafe amounts; a receipt with
 *   no items; an item with no participants, a duplicate participant, or an empty
 *   participant ID; a total that does not equal items + tax + service + tip; or extras
 *   on a receipt whose items are all free.
 */
export function splitItemized(receipt: ItemizedReceipt): ItemizedAllocation[] {
  if (receipt.items.length === 0) {
    throw new InvalidSplitError('Add at least one item to split.');
  }
  receipt.items.forEach(validateItem);
  assertCents(receipt.taxCents, 'Tax');
  assertCents(receipt.serviceCents, 'Service charge');
  assertCents(receipt.tipCents, 'Tip');
  assertCents(receipt.totalCents, 'Receipt total');

  const itemTotal = receipt.items.reduce((sum, item) => sum + item.priceCents, 0);
  assertSafeSum(itemTotal, 'Item total');
  const extrasCents = receipt.taxCents + receipt.serviceCents + receipt.tipCents;
  assertSafeSum(extrasCents, 'Tax, service charge, and tip');
  const expectedTotal = itemTotal + extrasCents;
  assertSafeSum(expectedTotal, 'Receipt total');

  if (expectedTotal !== receipt.totalCents) {
    throw new InvalidSplitError(
      `Receipt total (${receipt.totalCents}) must equal items plus tax, service charge, ` +
        `and tip (${expectedTotal}).`,
    );
  }
  if (itemTotal === 0 && extrasCents > 0) {
    throw new InvalidSplitError(
      'Tax, service charge, or tip cannot be split when every item is free.',
    );
  }

  // Map keys are unique, so the IDs being sorted are distinct.
  const members = [...allocateItems(receipt.items)].sort(([a], [b]) => compareDistinctIds(a, b));
  const extras = prorateExtras(
    members.map(([, subtotal]) => subtotal),
    itemTotal,
    extrasCents,
  );

  return members.map(([memberId, itemsCents], index) => ({
    memberId,
    itemsCents,
    extrasCents: extras[index],
    totalCents: itemsCents + extras[index],
  }));
}
