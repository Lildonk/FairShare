/**
 * Debt simplification for group expenses.
 *
 * Given each participant's net balance (positive = owed money, negative = owes money),
 * produce a minimal list of transfers that settles all debts.
 *
 * Algorithm: greedy matching of the largest creditor with the largest debtor.
 * This yields at most N-1 transfers for N participants and is optimal when all
 * balances are distinct powers‑of‑two (and near‑optimal in general).
 */

/** A single transfer instruction. */
export interface Transfer {
  /** Person who pays. */
  from: string;
  /** Person who receives. */
  to: string;
  /** Positive amount transferred. */
  amount: number;
}

/**
 * A map of participant name → net balance.
 *
 * - Positive balance: the group owes this person money (creditor).
 * - Negative balance: this person owes the group money (debtor).
 * - Zero balance: fully settled; ignored.
 *
 * The sum of all balances must be zero (within floating-point tolerance).
 */
export type Balances = Record<string, number>;

/** Floating-point tolerance for treating a balance as zero. */
const EPSILON = 1e-9;

/**
 * Simplify group debts into a minimal list of transfers.
 *
 * @param balances - A record mapping each participant to their net balance.
 * @returns An array of {@link Transfer} objects that settle all debts.
 * @throws {Error} If the balances do not sum to zero (within tolerance).
 *
 * @example
 * ```ts
 * const transfers = simplifyDebts({
 *   Alice: -10,  // Alice owes 10
 *   Bob:    5,   // Bob is owed 5
 *   Carol:  5,   // Carol is owed 5
 * });
 * // => [{ from: "Alice", to: "Bob", amount: 5 },
 * //     { from: "Alice", to: "Carol", amount: 5 }]
 * ```
 */
export function simplifyDebts(balances: Balances): Transfer[] {
  // ── Validate that balances sum to zero ──────────────────────────────
  const total = Object.values(balances).reduce((sum, v) => sum + v, 0);
  if (Math.abs(total) > EPSILON) {
    throw new Error(
      `Balances do not sum to zero (sum = ${total}). ` +
        "Every dollar owed must be matched by a dollar credited.",
    );
  }

  // ── Build sorted creditor / debtor lists ────────────────────────────
  // Creditors (positive balance) sorted descending by amount.
  // Debtors  (negative balance) sorted ascending  by amount (most negative first).
  const creditors: { name: string; amount: number }[] = [];
  const debtors: { name: string; amount: number }[] = [];

  for (const [name, balance] of Object.entries(balances)) {
    if (balance > EPSILON) {
      creditors.push({ name, amount: balance });
    } else if (balance < -EPSILON) {
      debtors.push({ name, amount: -balance }); // store as positive for convenience
    }
    // zero balances are ignored
  }

  // Sort so the largest amounts come first (greedy).
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  // ── Greedy settlement ───────────────────────────────────────────────
  const transfers: Transfer[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci]!;
    const debtor = debtors[di]!;
    const settled = Math.min(creditor.amount, debtor.amount);

    if (settled > EPSILON) {
      transfers.push({
        from: debtor.name,
        to: creditor.name,
        amount: round2(settled),
      });
    }

    creditor.amount -= settled;
    debtor.amount -= settled;

    if (creditor.amount < EPSILON) ci++;
    if (debtor.amount < EPSILON) di++;
  }

  return transfers;
}

/** Round to 2 decimal places to avoid floating-point dust. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

