/**
 * Validation for creating and replacing expenses (Issue #9). Pure: no I/O; the caller passes the
 * group's member IDs. The client computes the shares (the add-expense dialog shows them as a live
 * preview), but the server never trusts them: shares must add up to the amount exactly, and EQUAL
 * and PERCENTAGE shares must match what the same finance engines compute.
 */
import type { SplitType } from '@prisma/client';
import { InvalidSplitError } from '@/lib/finance/itemized-split';
import { splitEqual, splitPercentage, type ShareAllocation } from '@/lib/finance/split-calculation';
import {
  bodyFields,
  isRecord,
  nonNegativeCents,
  positiveCents,
  requiredText,
  result,
  type Errors,
  type InputResult,
} from './input-helpers';

export const MAX_EXPENSE_TITLE_LENGTH = 200;
export const MAX_CATEGORY_LENGTH = 50;
const SPLIT_TYPES: readonly SplitType[] = ['EQUAL', 'EXACT', 'PERCENTAGE', 'ITEMIZED'];

export interface ExpenseSplitInput {
  userId: string;
  owedCents: number;
  /** PERCENTAGE only: basis points, 0 to 10000. Null for every other split type. */
  allocatedBps: number | null;
}

export interface ExpenseInput {
  title: string;
  amountCents: number;
  payerId: string;
  splitType: SplitType;
  /** Undefined when not sent: a new expense gets the default, a replaced one keeps its category. */
  category?: string;
  splits: ExpenseSplitInput[];
}

function matches(shares: ExpenseSplitInput[], expected: ShareAllocation[]): boolean {
  const owed = new Map(expected.map((a) => [a.memberId, a.owedCents]));
  return shares.length === expected.length && shares.every((s) => owed.get(s.userId) === s.owedCents);
}

/** Checks the shares as a whole, once each share is valid on its own. */
function checkShares(input: ExpenseInput, errors: Errors): void {
  const { amountCents, payerId, splitType, splits } = input;
  const total = splits.reduce((sum, s) => sum + s.owedCents, 0);
  if (total !== amountCents) {
    errors.splits = `The shares add up to ${total} cents, but the amount is ${amountCents} cents.`;
    return;
  }
  try {
    if (splitType === 'EQUAL' && !matches(splits, splitEqual(amountCents, splits.map((s) => s.userId), payerId))) {
      errors.splits = 'These shares aren’t an equal split of the amount.';
    }
    if (splitType === 'PERCENTAGE') {
      const shares = splits.map((s) => ({ memberId: s.userId, basisPoints: s.allocatedBps ?? 0 }));
      if (!matches(splits, splitPercentage(amountCents, shares))) errors.splits = 'These shares don’t match their percentages.';
    }
  } catch (error) {
    if (!(error instanceof InvalidSplitError)) throw error;
    errors.splits = error.message;
  }
}

/** Body of `POST /api/v1/groups/:groupId/expenses` and `PATCH .../expenses/:expenseId`. */
export function validateExpenseInput(body: unknown, memberIds: readonly string[]): InputResult<ExpenseInput> {
  const errors: Errors = {};
  const fields = bodyFields(body, errors);
  const members = new Set(memberIds);

  const title = requiredText(fields.title, 'title', errors, MAX_EXPENSE_TITLE_LENGTH);
  const category = fields.category === undefined ? undefined : requiredText(fields.category, 'category', errors, MAX_CATEGORY_LENGTH);
  const amountCents = positiveCents(fields.amountCents, 'amountCents', errors);
  const payerId = typeof fields.payerId === 'string' && members.has(fields.payerId) ? fields.payerId : '';
  if (!payerId) errors.payerId = 'Choose a payer who is in this group.';
  const splitType = SPLIT_TYPES.find((type) => type === fields.splitType);
  if (!splitType) errors.splitType = `Choose one of ${SPLIT_TYPES.join(', ')}.`;

  const rawSplits = Array.isArray(fields.splits) ? fields.splits : [];
  if (rawSplits.length === 0 || rawSplits.length > members.size) {
    errors.splits = 'Split the expense between people in this group.';
  }
  const splits = rawSplits.slice(0, members.size).map((raw, i): ExpenseSplitInput => {
    const at = `splits[${i}]`;
    const split = isRecord(raw) ? raw : {};
    if (!isRecord(raw)) errors[at] = 'Send an object here.';
    const userId = typeof split.userId === 'string' && members.has(split.userId) ? split.userId : '';
    if (!userId) errors[`${at}.userId`] = 'Choose someone in this group.';
    const owedCents = nonNegativeCents(split.owedCents, `${at}.owedCents`, errors);
    let allocatedBps: number | null = null;
    if (splitType === 'PERCENTAGE') {
      const bps = split.allocatedBps;
      if (typeof bps === 'number' && Number.isInteger(bps) && bps >= 0 && bps <= 10000) allocatedBps = bps;
      else errors[`${at}.allocatedBps`] = 'Enter whole basis points from 0 to 10000 (10000 = 100%).';
    } else if (split.allocatedBps !== undefined && split.allocatedBps !== null) {
      errors[`${at}.allocatedBps`] = 'Only PERCENTAGE splits have basis points.';
    }
    return { userId, owedCents, allocatedBps };
  });
  if (new Set(splits.map((s) => s.userId)).size !== splits.length) errors.splits ??= 'List each person only once.';

  const input: ExpenseInput = { title, amountCents, payerId, splitType: splitType ?? 'EXACT', category, splits };
  if (Object.keys(errors).length === 0) checkShares(input, errors);
  return result(input, errors);
}
