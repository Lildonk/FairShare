/** Validation for recording payments and changing their status (Issue #9). Pure: no I/O. */
import { bodyFields, optionalText, positiveCents, result, type Errors, type InputResult } from './input-helpers';

export const MAX_PAYMENT_NOTES_LENGTH = 500;
const NEW_STATUSES = ['CONFIRMED', 'DISPUTED'] as const;

export interface PaymentInput {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
  notes: string | null;
}

/** Body of `POST /api/v1/groups/:groupId/settlements`; the caller passes the group's member IDs. */
export function validatePaymentInput(body: unknown, memberIds: readonly string[]): InputResult<PaymentInput> {
  const errors: Errors = {};
  const fields = bodyFields(body, errors);
  const members = new Set(memberIds);

  const fromUserId = typeof fields.fromUserId === 'string' && members.has(fields.fromUserId) ? fields.fromUserId : '';
  if (!fromUserId) errors.fromUserId = 'Choose a payer who is in this group.';
  const toUserId = typeof fields.toUserId === 'string' && members.has(fields.toUserId) ? fields.toUserId : '';
  if (!toUserId) errors.toUserId = 'Choose a receiver who is in this group.';
  else if (toUserId === fromUserId) errors.toUserId = 'Someone can’t pay themselves.';
  const amountCents = positiveCents(fields.amountCents, 'amountCents', errors);
  const notes = optionalText(fields.notes, 'notes', errors, MAX_PAYMENT_NOTES_LENGTH);

  return result({ fromUserId, toUserId, amountCents, notes }, errors);
}

/** Body of `PATCH /api/v1/settlements/:settlementId`: a pending payment becomes confirmed or disputed. */
export function validateStatusInput(body: unknown): InputResult<{ status: (typeof NEW_STATUSES)[number] }> {
  const errors: Errors = {};
  const fields = bodyFields(body, errors);
  const status = NEW_STATUSES.find((s) => s === fields.status);
  if (!status) errors.status = 'Choose CONFIRMED or DISPUTED.';
  return result({ status: status ?? 'CONFIRMED' }, errors);
}
