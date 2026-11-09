/**
 * Turns the add-expense form state into a live preview, validation errors, and (when
 * valid) the expense to submit. Pure function: the dialog only renders its result.
 */
import { InvalidSplitError } from '@/lib/finance/itemized-split';
import {
  formatCents,
  parseAmountToCents,
  parsePercentToBasisPoints,
} from '@/lib/finance/money-input';
import {
  splitEqual,
  splitExact,
  splitPercentage,
  type ShareAllocation,
} from '@/lib/finance/split-calculation';
import type { SplitMode } from '@/types';

export type BasicSplitMode = Exclude<SplitMode, 'ITEMIZED'>;

export interface GroupMemberOption {
  id: string;
  name: string;
}

export interface NewExpenseSplit {
  userId: string;
  owedCents: number;
  /** Basis points (10000 = 100%) for PERCENTAGE splits; null otherwise. */
  allocatedBps: number | null;
}

export interface NewExpense {
  title: string;
  amountCents: number;
  payerId: string;
  splitType: BasicSplitMode;
  splits: NewExpenseSplit[];
}

export interface ExpenseFormState {
  description: string;
  amount: string;
  payerId: string;
  splitType: BasicSplitMode;
  participantIds: string[];
  exactInputs: Record<string, string>;
  percentInputs: Record<string, string>;
}

export type FieldKey = 'description' | 'amount' | 'participants' | 'split' | `share-${string}`;

export interface FieldError {
  field: FieldKey;
  message: string;
}

export interface PreviewRow {
  memberId: string;
  label: string;
  owedCents: number | null;
}

export interface ExpenseDraft {
  rows: PreviewRow[];
  status: string;
  errors: FieldError[];
  expense: NewExpense | null;
}

export const shareField = (memberId: string): FieldKey => `share-${memberId}`;

/** Parses one per-person input; a blank field counts as zero. */
function parseShare(raw: string | undefined, parse: (input: string) => number | null) {
  const value = raw ?? '';
  return value.trim() === '' ? 0 : parse(value);
}

export function buildExpenseDraft(
  state: ExpenseFormState,
  members: GroupMemberOption[],
): ExpenseDraft {
  const errors: FieldError[] = [];
  const title = state.description.trim();
  if (title === '') {
    errors.push({ field: 'description', message: 'Enter a description.' });
  }

  const parsedAmount = parseAmountToCents(state.amount);
  const amountCents = parsedAmount !== null && parsedAmount > 0 ? parsedAmount : null;
  if (amountCents === null) {
    errors.push({
      field: 'amount',
      message: 'Enter an amount greater than $0.00, with at most two decimals.',
    });
  }

  const participants = members.filter((m) => state.participantIds.includes(m.id));
  if (participants.length === 0) {
    errors.push({ field: 'participants', message: 'Choose at least one person to split with.' });
  }

  // Per-person inputs for EXACT (cents) and PERCENTAGE (basis points).
  const entered = new Map<string, number | null>();
  if (state.splitType !== 'EQUAL') {
    const isExact = state.splitType === 'EXACT';
    for (const member of participants) {
      const value = isExact
        ? parseShare(state.exactInputs[member.id], parseAmountToCents)
        : parseShare(state.percentInputs[member.id], parsePercentToBasisPoints);
      entered.set(member.id, value);
      if (value === null) {
        errors.push({
          field: shareField(member.id),
          message: `Enter a valid ${isExact ? 'amount' : 'percentage'} for ${member.name}.`,
        });
      }
    }
  }

  const hasShareErrors = [...entered.values()].some((value) => value === null);
  let allocations: ShareAllocation[] | null = null;
  let splitError: string | null = null;
  if (amountCents !== null && participants.length > 0 && !hasShareErrors) {
    const ids = participants.map((m) => m.id);
    try {
      if (state.splitType === 'EQUAL') {
        allocations = splitEqual(amountCents, ids, state.payerId);
      } else if (state.splitType === 'EXACT') {
        allocations = splitExact(
          amountCents,
          ids.map((memberId) => ({ memberId, amountCents: entered.get(memberId) ?? 0 })),
        );
      } else {
        allocations = splitPercentage(
          amountCents,
          ids.map((memberId) => ({ memberId, basisPoints: entered.get(memberId) ?? 0 })),
        );
      }
    } catch (error) {
      if (!(error instanceof InvalidSplitError)) throw error;
      splitError = error.message;
      errors.push({ field: 'split', message: error.message });
    }
  }

  const owedFor = (memberId: string): number | null => {
    const allocation = allocations?.find((a) => a.memberId === memberId);
    if (allocation) return allocation.owedCents;
    // EXACT previews what was typed even before it adds up.
    return state.splitType === 'EXACT' ? (entered.get(memberId) ?? null) : null;
  };
  const rows: PreviewRow[] = participants.map((member) => ({
    memberId: member.id,
    label: member.id === state.payerId ? `${member.name} (payer)` : member.name,
    owedCents: owedFor(member.id),
  }));

  let status: string;
  if (amountCents === null) {
    status = 'Enter an amount to see the split.';
  } else if (state.splitType === 'PERCENTAGE' && splitError !== null) {
    status = splitError;
  } else {
    const allocated = rows.reduce((sum, row) => sum + (row.owedCents ?? 0), 0);
    status = `Total allocated: ${formatCents(allocated)} of ${formatCents(amountCents)}`;
  }

  const expense: NewExpense | null =
    errors.length === 0 && allocations !== null && amountCents !== null
      ? {
          title,
          amountCents,
          payerId: state.payerId,
          splitType: state.splitType,
          splits: allocations.map((a) => ({
            userId: a.memberId,
            owedCents: a.owedCents,
            allocatedBps: state.splitType === 'PERCENTAGE' ? (entered.get(a.memberId) ?? 0) : null,
          })),
        }
      : null;

  return { rows, status, errors, expense };
}
