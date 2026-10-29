/**
 * A participant's net balance in integer cents.
 * Positive = owed money (creditor); negative = owes money (debtor).
 */
export interface NetBalance {
  /** Unique member identifier. */
  memberId: string;
  /** Net balance in integer cents: paidCents − owedCents. */
  balanceCents: number;
}

/**
 * A single settlement transfer instruction.
 * Represents "fromMemberId pays toMemberId amountCents."
 */
export interface Transfer {
  /** The debtor who owes money. */
  fromMemberId: string;
  /** The creditor who is owed money. */
  toMemberId: string;
  /** Positive integer amount in cents. */
  amountCents: number;
}

