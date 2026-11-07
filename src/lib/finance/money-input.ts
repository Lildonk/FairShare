/**
 * Converts form input to integer cents / basis points and formats cents for display,
 * without binary floating-point arithmetic (Issue #5).
 */

const AMOUNT_PATTERN = /^\$?(\d+)(?:\.(\d{1,2}))?$/;
const PERCENT_PATTERN = /^(\d+)(?:\.(\d{1,2}))?$/;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** Combines a whole part and up to two decimal digits into hundredths, or null if unsafe. */
function toHundredths(whole: string, fraction: string | undefined): number | null {
  const value = BigInt(whole) * BigInt(100) + BigInt((fraction ?? '').padEnd(2, '0'));
  return value > MAX_SAFE ? null : Number(value);
}

/** Parses "120.01" or "$120.01" into 12001 cents. Returns null for anything else. */
export function parseAmountToCents(input: string): number | null {
  const match = AMOUNT_PATTERN.exec(input.trim());
  return match ? toHundredths(match[1], match[2]) : null;
}

/** Parses "33.33" (percent) into 3333 basis points. Returns null for anything else. */
export function parsePercentToBasisPoints(input: string): number | null {
  const match = PERCENT_PATTERN.exec(input.trim());
  return match ? toHundredths(match[1], match[2]) : null;
}

/** Formats a non-negative count of hundredths as "1,234.05" without floating-point math. */
function formatHundredths(value: number): string {
  const whole = Math.floor(value / 100).toLocaleString('en-US');
  const fraction = String(value % 100).padStart(2, '0');
  return `${whole}.${fraction}`;
}

/** Formats integer cents as US dollars, e.g. 123456789 -> "$1,234,567.89". */
export function formatCents(cents: number): string {
  return `${cents < 0 ? '-' : ''}$${formatHundredths(Math.abs(cents))}`;
}

/** Formats non-negative basis points as a percentage, e.g. 9000 -> "90.00%". */
export function formatBasisPoints(basisPoints: number): string {
  return `${formatHundredths(basisPoints)}%`;
}
