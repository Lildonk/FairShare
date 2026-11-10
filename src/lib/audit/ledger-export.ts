/**
 * Ledger export (Issue #8): JSON and CSV export of a group's expenses and settlements.
 *
 * Pure formatting: no React, Prisma, or I/O. Amounts are integer cents; the decimal
 * string is built from integer division, never from binary floating point.
 */

export type LedgerEntryType = 'EXPENSE' | 'SETTLEMENT';
/** ACTIVE and DISPUTED apply to expenses; PENDING, CONFIRMED, and DISPUTED to settlements. */
export type LedgerEntryStatus = 'ACTIVE' | 'DISPUTED' | 'PENDING' | 'CONFIRMED';

export interface LedgerExportRow {
  id: string;
  /** ISO 8601 UTC timestamp, as produced by `Date.prototype.toISOString`. */
  occurredAt: string;
  type: LedgerEntryType;
  description: string;
  /** The payer of an expense, or the sender of a settlement. */
  fromName: string;
  /** The receiver of a settlement; empty for an expense. */
  toName: string;
  amountCents: number;
  status: LedgerEntryStatus;
}

export class InvalidExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidExportError';
  }
}

export const CSV_HEADER = 'date,type,description,from,to,amount,amount_cents,status';

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
/** Leading characters that make Excel, Sheets, or LibreOffice treat a cell as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

function validate(rows: LedgerExportRow[]): void {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!Number.isSafeInteger(row.amountCents) || row.amountCents <= 0) {
      throw new InvalidExportError(
        `Entry "${row.id}" has an invalid amount; amounts must be positive whole numbers of cents.`,
      );
    }
    if (!ISO_UTC.test(row.occurredAt) || Number.isNaN(Date.parse(row.occurredAt))) {
      throw new InvalidExportError(`Entry "${row.id}" has an invalid date: "${row.occurredAt}".`);
    }
    if (ids.has(row.id)) {
      throw new InvalidExportError(`Entry "${row.id}" appears more than once.`);
    }
    ids.add(row.id);
  }
}

/** Oldest first; entries at the same time are ordered by ID (ordinal, not locale-dependent). */
function sorted(rows: LedgerExportRow[]): LedgerExportRow[] {
  validate(rows);
  // Validated timestamps share one fixed-width UTC format, so string order is time order.
  const key = (row: LedgerExportRow) => `${row.occurredAt}\u0000${row.id}`;
  return [...rows].sort((a, b) => (key(a) < key(b) ? -1 : 1));
}

/** 4705 -> "47.05". */
function centsToDecimal(cents: number): string {
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, '0');
  return `${whole}.${fraction}`;
}

/** Escapes one CSV field (RFC 4180) and neutralizes spreadsheet formulas with a leading apostrophe. */
function csvField(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV export: a header row, then one row per entry, every row ending in CRLF. */
export function ledgerToCsv(rows: LedgerExportRow[]): string {
  const lines = sorted(rows).map((row) =>
    [
      row.occurredAt,
      row.type,
      csvField(row.description),
      csvField(row.fromName),
      csvField(row.toName),
      centsToDecimal(row.amountCents),
      String(row.amountCents),
      row.status,
    ].join(','),
  );
  return [CSV_HEADER, ...lines].map((line) => `${line}\r\n`).join('');
}

/** JSON export: the group name, the export time, and the entries in ledger order. */
export function ledgerToJson(groupName: string, rows: LedgerExportRow[], exportedAt: string): string {
  const entries = sorted(rows).map((row) => ({
    id: row.id,
    date: row.occurredAt,
    type: row.type,
    description: row.description,
    from: row.fromName,
    to: row.toName,
    amount: centsToDecimal(row.amountCents),
    amountCents: row.amountCents,
    status: row.status,
  }));
  return JSON.stringify({ group: groupName, exportedAt, entries }, null, 2);
}
