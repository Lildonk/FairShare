/** Validation for the dispute flag and the ledger export (Issue #8). Pure: no I/O. */
import { bodyFields, result, type Errors, type InputResult } from './input-helpers';

export const EXPORT_FORMATS = ['csv', 'json'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** Body of `PATCH /api/v1/groups/:groupId/expenses/:expenseId/dispute`: `{ "disputed": boolean }`. */
export function validateDisputeInput(body: unknown): InputResult<{ disputed: boolean }> {
  const errors: Errors = {};
  const fields = bodyFields(body, errors);
  if (typeof fields.disputed !== 'boolean') errors.disputed = 'Send true to flag the expense for review, or false to clear it.';
  return result({ disputed: fields.disputed === true }, errors);
}

/** The `format` query parameter of the export: `csv` or `json` (the default). */
export function validateExportFormat(value: string | null): InputResult<ExportFormat> {
  const format = EXPORT_FORMATS.find((f) => f === (value ?? 'json'));
  return format ? { ok: true, value: format } : { ok: false, errors: { format: 'Choose csv or json.' } };
}
