/**
 * Debt Simplification Engine (Issue #4)
 *
 * Pure financial computation module — no React, Prisma, or I/O.
 * All monetary values are integer cents. Uses a greedy two-pointer
 * algorithm to settle debts in at most N-1 transfers for N nonzero
 * participants. This is NOT a globally minimum-transfer solver.
 *
 * Algorithm: sort debtors by amount owed descending and creditors by
 * amount due descending (ties broken by memberId ordinal ascending),
 * then walk two pointers. The current debtor pays the current creditor
 * min(owed, due); whichever reaches zero advances its pointer.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LedgerEntry {
  memberId: string;
  paidCents: number;
  owedCents: number;
}

export interface MemberBalance {
  memberId: string;
  balanceCents: number;
}

export interface Transfer {
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
}

// ─── Error ───────────────────────────────────────────────────────────────────

export class InvalidBalanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBalanceError';
    // Restore prototype chain for instanceof checks with TypeScript targets < ES2015
    Object.setPrototypeOf(this, InvalidBalanceError.prototype);
  }
}

// ─── Validation helpers ──────────────────────────────────────────────────────

/** Returns true if value is a non-negative safe integer (0, 1, 2, …). */
function isValidCents(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/** Returns true if value is a safe integer (positive, negative, or zero). */
function isSafeIntegerCents(value: number): boolean {
  return Number.isSafeInteger(value);
}

/**
 * Ordinal string comparator: uses `<` / `>` operators, not localeCompare.
 * Produces deterministic ordering independent of locale settings.
 */
function ordinalCompare(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// ─── computeNetBalances ──────────────────────────────────────────────────────

/**
 * Computes the net balance (paid − owed) for each member, aggregating
 * across repeated memberIds. Output is sorted by memberId using ordinal
 * comparison.
 *
 * @throws InvalidBalanceError if any paidCents or owedCents is not a
 *   non-negative safe integer (rejects negative, non-integer, NaN,
 *   Infinity, and values beyond Number.MAX_SAFE_INTEGER).
 */
export function computeNetBalances(entries: LedgerEntry[]): MemberBalance[] {
  // Validate every entry first
  for (const entry of entries) {
    if (!isValidCents(entry.paidCents)) {
      throw new InvalidBalanceError(
        `Invalid paidCents for member "${entry.memberId}": ${entry.paidCents}. ` +
          'Must be a non-negative safe integer.',
      );
    }
    if (!isValidCents(entry.owedCents)) {
      throw new InvalidBalanceError(
        `Invalid owedCents for member "${entry.memberId}": ${entry.owedCents}. ` +
          'Must be a non-negative safe integer.',
      );
    }
  }

  // Aggregate paid and owed per member
  const aggregated = new Map<string, { paidCents: number; owedCents: number }>();
  for (const entry of entries) {
    const existing = aggregated.get(entry.memberId);
    if (existing) {
      existing.paidCents += entry.paidCents;
      existing.owedCents += entry.owedCents;
    } else {
      aggregated.set(entry.memberId, {
        paidCents: entry.paidCents,
        owedCents: entry.owedCents,
      });
    }
  }

  // Build result array and sort by memberId ordinal
  const result: MemberBalance[] = [];
  for (const [memberId, totals] of aggregated) {
    result.push({
      memberId,
      balanceCents: totals.paidCents - totals.owedCents,
    });
  }

  result.sort((a, b) => ordinalCompare(a.memberId, b.memberId));
  return result;
}

// ─── simplifyDebts ───────────────────────────────────────────────────────────

/**
 * Produces settlement transfers using a greedy two-pointer algorithm.
 * Sorts debtors (negative balances) by amount owed descending and
 * creditors (positive balances) by amount due descending, with ties
 * broken by memberId ordinal ascending. Walks two pointers: the current
 * debtor pays the current creditor min(owed, due); whichever reaches
 * zero advances. Does NOT re-sort after each transfer.
 *
 * @throws InvalidBalanceError if balances do not sum to zero, if any
 *   balanceCents is not a safe integer, or if a memberId appears twice.
 */
export function simplifyDebts(balances: MemberBalance[]): Transfer[] {
  // Validate: every balanceCents must be a safe integer
  for (const b of balances) {
    if (!isSafeIntegerCents(b.balanceCents)) {
      throw new InvalidBalanceError(
        `Invalid balanceCents for member "${b.memberId}": ${b.balanceCents}. ` +
          'Must be a safe integer.',
      );
    }
  }

  // Validate: no duplicate memberIds
  const seenIds = new Set<string>();
  for (const b of balances) {
    if (seenIds.has(b.memberId)) {
      throw new InvalidBalanceError(
        `Duplicate memberId "${b.memberId}". Each member must appear exactly once.`,
      );
    }
    seenIds.add(b.memberId);
  }

  // Validate: balances must sum to zero
  let sum = 0;
  for (const b of balances) {
    sum += b.balanceCents;
  }
  if (sum !== 0) {
    throw new InvalidBalanceError(
      `Balances do not sum to zero (sum: ${sum}). Input is unbalanced.`,
    );
  }

  // Separate into debtors (negative balance) and creditors (positive balance),
  // skipping zero balances entirely.
  // Debtors: sorted by |balance| descending, ties by memberId ordinal ascending.
  // Creditors: sorted by balance descending, ties by memberId ordinal ascending.
  const debtors: { memberId: string; remaining: number }[] = [];
  const creditors: { memberId: string; remaining: number }[] = [];

  for (const b of balances) {
    if (b.balanceCents < 0) {
      debtors.push({ memberId: b.memberId, remaining: -b.balanceCents });
    } else if (b.balanceCents > 0) {
      creditors.push({ memberId: b.memberId, remaining: b.balanceCents });
    }
    // Skip zero balances
  }

  // Sort debtors: by remaining descending, then memberId ordinal ascending
  debtors.sort((a, b) => {
    if (b.remaining !== a.remaining) return b.remaining - a.remaining;
    return ordinalCompare(a.memberId, b.memberId);
  });

  // Sort creditors: by remaining descending, then memberId ordinal ascending
  creditors.sort((a, b) => {
    if (b.remaining !== a.remaining) return b.remaining - a.remaining;
    return ordinalCompare(a.memberId, b.memberId);
  });

  // Two-pointer walk: no re-sorting
  const transfers: Transfer[] = [];
  let dPtr = 0;
  let cPtr = 0;

  while (dPtr < debtors.length && cPtr < creditors.length) {
    const debtor = debtors[dPtr];
    const creditor = creditors[cPtr];

    const amount = Math.min(debtor.remaining, creditor.remaining);

    transfers.push({
      fromMemberId: debtor.memberId,
      toMemberId: creditor.memberId,
      amountCents: amount,
    });

    debtor.remaining -= amount;
    creditor.remaining -= amount;

    if (debtor.remaining === 0) dPtr++;
    if (creditor.remaining === 0) cPtr++;
  }

  return transfers;
}

