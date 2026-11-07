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

/** Adds each member's equal share of every item to `subtotals`. */
function allocateItems(items: ReceiptItem[], subtotals: Map<string, number>): void {
  for (const item of items) {
    const participants = [...item.participantIds].sort(compareDistinctIds);
    const baseShare = Math.floor(item.priceCents / participants.length);
    const leftoverCents = item.priceCents % participants.length;
    participants.forEach((id, index) => {
      const share = baseShare + (index < leftoverCents ? 1 : 0);
      subtotals.set(id, (subtotals.get(id) ?? 0) + share);
    });
  }
}

/** Prorates `extrasCents` by subtotal using floors plus largest-remainder cents. */
function prorateExtras(
  memberIds: string[],
  subtotals: Map<string, number>,
  itemTotal: number,
  extrasCents: number,
): Map<string, number> {
  const extras = new Map<string, number>(memberIds.map((id) => [id, 0]));
  if (extrasCents === 0) {
    return extras;
  }

  const pool = BigInt(extrasCents);
  const denominator = BigInt(itemTotal);
  const remainders: { id: string; remainder: bigint }[] = [];
  let allocated = 0;
  for (const id of memberIds) {
    const product = pool * BigInt(subtotals.get(id) ?? 0);
    const share = Number(product / denominator);
    extras.set(id, share);
    allocated += share;
    remainders.push({ id, remainder: product % denominator });
  }

  remainders.sort((a, b) => {
    if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
    return compareDistinctIds(a.id, b.id);
  });
  for (let i = 0; i < extrasCents - allocated; i++) {
    const { id } = remainders[i];
    extras.set(id, (extras.get(id) ?? 0) + 1);
  }
  return extras;
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

  const subtotals = new Map<string, number>();
  allocateItems(receipt.items, subtotals);
  // Map keys are unique, so the IDs are distinct.
  const memberIds = [...subtotals.keys()].sort(compareDistinctIds);
  const extras = prorateExtras(memberIds, subtotals, itemTotal, extrasCents);

  return memberIds.map((memberId) => {
    const itemsCents = subtotals.get(memberId) ?? 0;
    const extrasShare = extras.get(memberId) ?? 0;
    return {
      memberId,
      itemsCents,
      extrasCents: extrasShare,
      totalCents: itemsCents + extrasShare,
    };
  });
}
