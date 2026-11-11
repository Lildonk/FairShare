/**
 * Small, pure helpers for validating untrusted JSON request bodies (Issue #9). Each check records
 * a message under the field's JSON path (for example `splits[0].owedCents`) instead of throwing, so
 * one response can list every problem.
 */

export type InputResult<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };
export type Errors = Record<string, string>;
export type Fields = Record<string, unknown>;

export const isRecord = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The body's fields, or none (with an error) when the body isn't a JSON object. */
export function bodyFields(body: unknown, errors: Errors): Fields {
  if (isRecord(body)) return body;
  errors.body = 'Send a JSON object.';
  return {};
}

export function result<T>(value: T, errors: Errors): InputResult<T> {
  return Object.keys(errors).length === 0 ? { ok: true, value } : { ok: false, errors };
}

export function positiveCents(value: unknown, field: string, errors: Errors): number {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
  errors[field] = 'Enter a whole number of cents greater than 0.';
  return 0;
}

export function nonNegativeCents(value: unknown, field: string, errors: Errors): number {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  errors[field] = 'Enter a whole number of cents, 0 or more.';
  return 0;
}

/**
 * Records `message` when an ID repeats. Invalid IDs come back as '' and already have their own
 * error, so they don't count as repeats.
 */
export function checkDistinct(ids: readonly string[], field: string, errors: Errors, message: string): void {
  const valid = ids.filter((id) => id !== '');
  if (new Set(valid).size !== valid.length) errors[field] ??= message;
}

/** Trimmed text of 1 to `max` characters. */
export function requiredText(value: unknown, field: string, errors: Errors, max: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text !== '' && text.length <= max) return text;
  errors[field] = text === '' ? 'Enter some text here.' : `Use at most ${max} characters.`;
  return '';
}

/** Trimmed text of up to `max` characters; null when missing or blank. */
export function optionalText(value: unknown, field: string, errors: Errors, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    errors[field] = 'Send text here.';
    return null;
  }
  const text = value.trim();
  if (text.length > max) errors[field] = `Use at most ${max} characters.`;
  return text === '' ? null : text;
}
