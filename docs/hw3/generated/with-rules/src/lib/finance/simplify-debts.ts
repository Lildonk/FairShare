import type { NetBalance, Transfer } from "../../types/finance.js";

/**
 * Validate that all net balances are finite safe integers,
 * that member IDs are unique, and that the balances sum to zero.
 *
 * @throws {Error} on invalid input
 */
function validateBalances(balances: readonly NetBalance[]): void {
  const seen = new Set<string>();

  for (const { memberId, balanceCents } of balances) {
    if (!Number.isFinite(balanceCents) || !Number.isInteger(balanceCents)) {
      throw new Error(
        `Balance for "${memberId}" must be a finite safe integer, got ${balanceCents}`,
      );
    }
    if (!Number.isSafeInteger(balanceCents)) {
      throw new Error(
        `Balance for "${memberId}" must be a safe integer within ±${Number.MAX_SAFE_INTEGER}`,
      );
    }
    if (seen.has(memberId)) {
      throw new Error(`Duplicate member ID: "${memberId}"`);
    }
    seen.add(memberId);
  }

  const sum = balances.reduce((acc, b) => acc + b.balanceCents, 0);
  if (sum !== 0) {
    throw new Error(
      `Net balances must sum to zero, but sum is ${sum}`,
    );
  }
}

/**
 * Simplify group debts using a greedy creditor/debtor matching algorithm.
 *
 * Given each participant's net balance (paidCents − owedCents), generates a
 * deterministic list of transfers that settle all debts. The greedy approach
 * matches the largest remaining debtor with the largest remaining creditor,
 * producing **at most N−1 transfers for N nonzero balances**.
 *
 * This is a greedy heuristic — it does **not** guarantee the globally minimum
 * number of transfers.
 *
 * @param balances - Array of net balances, one per participant. Must sum to zero.
 *                   Positive = creditor (is owed money); Negative = debtor (owes money).
 * @returns Deterministic array of settlement transfers.
 * @throws {Error} if balances contain non-integer, non-finite, or unsafe values,
 *                 if member IDs are duplicated, or if the sum is not zero.
 */
export function simplifyDebts(balances: readonly NetBalance[]): Transfer[] {
  validateBalances(balances);

  // Sort a working copy by memberId for deterministic ordering before processing.
  // This ensures identical results regardless of input order.
  const sorted = [...balances]
    .filter((b) => b.balanceCents !== 0)
    .sort((a, b) => a.memberId.localeCompare(b.memberId));

  // Separate into debtors (negative balance) and creditors (positive balance).
  // Each entry is a mutable working copy so we can reduce balances in-place.
  const debtors: { memberId: string; remaining: number }[] = [];
  const creditors: { memberId: string; remaining: number }[] = [];

  for (const { memberId, balanceCents } of sorted) {
    if (balanceCents < 0) {
      debtors.push({ memberId, remaining: -balanceCents }); // store as positive amount owed
    } else {
      creditors.push({ memberId, remaining: balanceCents });
    }
  }

  // Sort both lists by remaining amount descending (largest first),
  // then by memberId for deterministic tie-breaking.
  const sortByAmountDesc = (
    a: { memberId: string; remaining: number },
    b: { memberId: string; remaining: number },
  ): number => {
    if (b.remaining !== a.remaining) return b.remaining - a.remaining;
    return a.memberId.localeCompare(b.memberId);
  };

  debtors.sort(sortByAmountDesc);
  creditors.sort(sortByAmountDesc);

  const transfers: Transfer[] = [];

  // Greedy matching: always match the largest remaining debtor with the
  // largest remaining creditor. Each iteration settles at least one side
  // completely, guaranteeing at most N−1 iterations for N nonzero balances.
  let di = 0;
  let ci = 0;

  while (di < debtors.length && ci < creditors.length) {
    const debtor = debtors[di]!;
    const creditor = creditors[ci]!;

    const transferAmount = Math.min(debtor.remaining, creditor.remaining);

    transfers.push({
      fromMemberId: debtor.memberId,
      toMemberId: creditor.memberId,
      amountCents: transferAmount,
    });

    debtor.remaining -= transferAmount;
    creditor.remaining -= transferAmount;

    if (debtor.remaining === 0) di++;
    if (creditor.remaining === 0) ci++;
  }

  return transfers;
}

