/**
 * Input validation for the public calculator endpoints (Issue #9): `POST /api/v1/simplify` and
 * `POST /api/v1/split/calculate`. Pure: no I/O. It turns an untrusted JSON body into input for the
 * finance engines, or into field errors keyed by their JSON path (for example
 * `debts[0].amountCents`). The engines still check the money rules themselves.
 */
import type { ExactShare, PercentageShare } from '@/lib/finance/split-calculation';
import type { ReceiptItem } from '@/lib/finance/itemized-split';

/** Size limits, because anyone can call these endpoints. */
export const MAX_DEBTS = 1000;
export const MAX_SPLIT_MEMBERS = 100;
export const MAX_RECEIPT_ITEMS = 200;
export const MAX_MEMBER_ID_LENGTH = 100;
export const MAX_ITEM_DESCRIPTION_LENGTH = 200;

export const SPLIT_TYPES = ['EQUAL', 'EXACT', 'PERCENTAGE', 'ITEMIZED'] as const;

export type InputResult<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

/** `fromMemberId` owes `toMemberId` this many cents. */
export interface DebtInput {
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
}

export type SplitRequest =
  | { splitType: 'EQUAL'; totalCents: number; participantIds: string[]; payerId: string }
  | { splitType: 'EXACT'; totalCents: number; shares: ExactShare[] }
  | { splitType: 'PERCENTAGE'; totalCents: number; shares: PercentageShare[] }
  | {
      splitType: 'ITEMIZED';
      totalCents: number;
      items: ReceiptItem[];
      taxCents: number;
      serviceCents: number;
      tipCents: number;
    };

type Errors = Record<string, string>;
type Fields = Record<string, unknown>;

const isRecord = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function positiveCents(value: unknown, field: string, errors: Errors): number {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
  errors[field] = 'Enter a whole number of cents greater than 0.';
  return 0;
}

function nonNegativeCents(value: unknown, field: string, errors: Errors): number {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  errors[field] = 'Enter a whole number of cents, 0 or more.';
  return 0;
}

/** An optional extra such as tax: missing means 0. */
function optionalCents(value: unknown, field: string, errors: Errors): number {
  return value === undefined ? 0 : nonNegativeCents(value, field, errors);
}

function memberId(value: unknown, field: string, errors: Errors): string {
  if (typeof value === 'string' && value.trim() !== '' && value.length <= MAX_MEMBER_ID_LENGTH) return value;
  errors[field] = `Enter a member ID of 1 to ${MAX_MEMBER_ID_LENGTH} characters.`;
  return '';
}

function list(value: unknown, field: string, errors: Errors, min: number, max: number): unknown[] {
  if (Array.isArray(value) && value.length >= min && value.length <= max) return value;
  errors[field] = min > 0 ? `Send a list of ${min} to ${max} entries.` : `Send a list of up to ${max} entries.`;
  return [];
}

function record(value: unknown, field: string, errors: Errors): Fields {
  if (isRecord(value)) return value;
  errors[field] = 'Send an object here.';
  return {};
}

function distinctMemberIds(ids: string[], field: string, errors: Errors): void {
  if (new Set(ids).size !== ids.length) errors[field] ??= 'List each member only once.';
}

function result<T>(value: T, errors: Errors): InputResult<T> {
  return Object.keys(errors).length === 0 ? { ok: true, value } : { ok: false, errors };
}

/** Body of `POST /api/v1/simplify`: `{ debts: [{ fromMemberId, toMemberId, amountCents }] }`. */
export function validateSimplifyRequest(body: unknown): InputResult<{ debts: DebtInput[] }> {
  const errors: Errors = {};
  const fields = record(body, 'body', errors);
  const rawDebts = list(fields.debts, 'debts', errors, 0, MAX_DEBTS);

  let totalCents = 0;
  const debts = rawDebts.map((raw, index): DebtInput => {
    const at = `debts[${index}]`;
    const debt = record(raw, at, errors);
    if (!isRecord(raw)) return { fromMemberId: '', toMemberId: '', amountCents: 0 };
    const fromMemberId = memberId(debt.fromMemberId, `${at}.fromMemberId`, errors);
    const toMemberId = memberId(debt.toMemberId, `${at}.toMemberId`, errors);
    if (fromMemberId && fromMemberId === toMemberId) errors[`${at}.toMemberId`] = 'A member can’t owe themselves.';
    const amountCents = positiveCents(debt.amountCents, `${at}.amountCents`, errors);
    totalCents += amountCents;
    return { fromMemberId, toMemberId, amountCents };
  });
  // Every member's totals stay exact as long as the sum of all debts does.
  if (!Number.isSafeInteger(totalCents)) errors.debts = 'The debts add up to more cents than can be handled exactly.';

  return result({ debts }, errors);
}

/** Body of `POST /api/v1/split/calculate`, by `splitType`. */
export function validateSplitRequest(body: unknown): InputResult<SplitRequest> {
  const errors: Errors = {};
  const fields = record(body, 'body', errors);
  const splitType = SPLIT_TYPES.find((type) => type === fields.splitType);
  if (!splitType) {
    errors.splitType = `Choose one of ${SPLIT_TYPES.join(', ')}.`;
    return { ok: false, errors };
  }
  const totalCents = positiveCents(fields.totalCents, 'totalCents', errors);

  switch (splitType) {
    case 'EQUAL': {
      const participantIds = list(fields.participantIds, 'participantIds', errors, 1, MAX_SPLIT_MEMBERS).map((id, i) =>
        memberId(id, `participantIds[${i}]`, errors),
      );
      distinctMemberIds(participantIds, 'participantIds', errors);
      const payerId = memberId(fields.payerId, 'payerId', errors);
      return result({ splitType, totalCents, participantIds, payerId }, errors);
    }
    case 'EXACT': {
      const shares = list(fields.shares, 'shares', errors, 1, MAX_SPLIT_MEMBERS).map((raw, i): ExactShare => {
        const share = record(raw, `shares[${i}]`, errors);
        return {
          memberId: memberId(share.memberId, `shares[${i}].memberId`, errors),
          amountCents: nonNegativeCents(share.amountCents, `shares[${i}].amountCents`, errors),
        };
      });
      distinctMemberIds(shares.map((s) => s.memberId), 'shares', errors);
      return result({ splitType, totalCents, shares }, errors);
    }
    case 'PERCENTAGE': {
      const shares = list(fields.shares, 'shares', errors, 1, MAX_SPLIT_MEMBERS).map((raw, i): PercentageShare => {
        const share = record(raw, `shares[${i}]`, errors);
        const basisPoints = share.basisPoints;
        const valid = typeof basisPoints === 'number' && Number.isInteger(basisPoints) && basisPoints >= 0 && basisPoints <= 10000;
        if (!valid) errors[`shares[${i}].basisPoints`] = 'Enter whole basis points from 0 to 10000 (10000 = 100%).';
        return { memberId: memberId(share.memberId, `shares[${i}].memberId`, errors), basisPoints: valid ? basisPoints : 0 };
      });
      distinctMemberIds(shares.map((s) => s.memberId), 'shares', errors);
      return result({ splitType, totalCents, shares }, errors);
    }
    case 'ITEMIZED': {
      const items = list(fields.items, 'items', errors, 1, MAX_RECEIPT_ITEMS).map((raw, i): ReceiptItem => {
        const at = `items[${i}]`;
        const item = record(raw, at, errors);
        const description = item.description;
        const validDescription =
          typeof description === 'string' && description.trim() !== '' && description.length <= MAX_ITEM_DESCRIPTION_LENGTH;
        if (!validDescription) errors[`${at}.description`] = `Enter a description of 1 to ${MAX_ITEM_DESCRIPTION_LENGTH} characters.`;
        const participantIds = list(item.participantIds, `${at}.participantIds`, errors, 1, MAX_SPLIT_MEMBERS).map((id, j) =>
          memberId(id, `${at}.participantIds[${j}]`, errors),
        );
        distinctMemberIds(participantIds, `${at}.participantIds`, errors);
        return {
          description: validDescription ? description : '',
          priceCents: positiveCents(item.priceCents, `${at}.priceCents`, errors),
          participantIds,
        };
      });
      return result(
        {
          splitType,
          totalCents,
          items,
          taxCents: optionalCents(fields.taxCents, 'taxCents', errors),
          serviceCents: optionalCents(fields.serviceCents, 'serviceCents', errors),
          tipCents: optionalCents(fields.tipCents, 'tipCents', errors),
        },
        errors,
      );
    }
  }
}
