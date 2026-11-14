/**
 * Group balances (Issue #7).
 *
 * Pure financial computation: no React, Prisma, or I/O. All amounts are integer cents.
 *
 * Net balance per member = paid − owed across expenses, plus confirmed settlements:
 * a confirmed settlement from A to B of X raises A's balance by X and lowers B's by X.
 * PENDING and DISPUTED settlements do not count until they are confirmed.
 */
import {
  InvalidBalanceError,
  computeNetBalances,
  type LedgerEntry,
  type MemberBalance,
} from './debt-simplification';

export interface ExpenseRecord {
  payerId: string;
  amountCents: number;
  splits: { userId: string; owedCents: number }[];
}

export type SettlementStatus = 'PENDING' | 'CONFIRMED' | 'DISPUTED';

export interface SettlementRecord {
  /** The stored payment's ID, when it has been saved (ignored by the balance math). */
  id?: string;
  fromUserId: string;
  toUserId: string;
  amountCents: number;
  status: SettlementStatus;
}

function assertPositiveCents(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new InvalidBalanceError(`${label} must be a positive whole number of cents.`);
  }
}

/**
 * Computes every member's net balance, sorted by member ID (ordinal).
 *
 * @throws InvalidBalanceError for duplicate member IDs, references to non-members,
 *   non-positive expense or settlement amounts, splits that do not add up to the
 *   expense amount, self-settlements, or invalid split amounts.
 */
export function computeGroupBalances(
  memberIds: string[],
  expenses: ExpenseRecord[],
  settlements: SettlementRecord[],
): MemberBalance[] {
  const members = new Set(memberIds);
  if (members.size !== memberIds.length) {
    throw new InvalidBalanceError('Each group member must appear exactly once.');
  }
  const assertMember = (userId: string) => {
    if (!members.has(userId)) {
      throw new InvalidBalanceError(`"${userId}" is not a member of this group.`);
    }
  };

  const entries: LedgerEntry[] = memberIds.map((memberId) => ({
    memberId,
    paidCents: 0,
    owedCents: 0,
  }));

  for (const expense of expenses) {
    assertPositiveCents(expense.amountCents, 'Expense amount');
    assertMember(expense.payerId);
    entries.push({ memberId: expense.payerId, paidCents: expense.amountCents, owedCents: 0 });
    let splitTotal = 0;
    for (const split of expense.splits) {
      assertMember(split.userId);
      entries.push({ memberId: split.userId, paidCents: 0, owedCents: split.owedCents });
      splitTotal += split.owedCents;
    }
    if (splitTotal !== expense.amountCents) {
      throw new InvalidBalanceError(
        `Expense splits add up to ${splitTotal} cents but the expense is ${expense.amountCents}.`,
      );
    }
  }

  for (const settlement of settlements) {
    if (settlement.status !== 'CONFIRMED') continue;
    assertPositiveCents(settlement.amountCents, 'Settlement amount');
    assertMember(settlement.fromUserId);
    assertMember(settlement.toUserId);
    if (settlement.fromUserId === settlement.toUserId) {
      throw new InvalidBalanceError('A settlement must be between two different members.');
    }
    entries.push({ memberId: settlement.fromUserId, paidCents: settlement.amountCents, owedCents: 0 });
    entries.push({ memberId: settlement.toUserId, paidCents: 0, owedCents: settlement.amountCents });
  }

  // computeNetBalances validates each amount as a non-negative safe integer.
  return computeNetBalances(entries);
}
