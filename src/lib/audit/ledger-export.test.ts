/**
 * Ledger export — tests for Issue #8 (JSON and CSV export of settlement and audit data).
 *
 * Pure formatting: no I/O. Amounts arrive as integer cents and are written both as cents
 * and as a decimal string, without binary floating point.
 */
import { describe, expect, it } from 'vitest';
import {
  CSV_HEADER,
  InvalidExportError,
  ledgerToCsv,
  ledgerToJson,
  type LedgerExportRow,
} from './ledger-export';

const dinner: LedgerExportRow = {
  id: 'e-1',
  occurredAt: '2026-11-01T19:30:00.000Z',
  type: 'EXPENSE',
  description: 'Dinner',
  fromName: 'Alice',
  toName: '',
  amountCents: 80000,
  status: 'ACTIVE',
};

const bobPays: LedgerExportRow = {
  id: 's-1',
  occurredAt: '2026-11-03T08:00:00.000Z',
  type: 'SETTLEMENT',
  description: 'Settle up',
  fromName: 'Bob',
  toName: 'Alice',
  amountCents: 34500,
  status: 'CONFIRMED',
};

const disputedTaxi: LedgerExportRow = {
  id: 'e-2',
  occurredAt: '2026-11-02T12:00:00.000Z',
  type: 'EXPENSE',
  description: 'Taxi',
  fromName: 'Charlie',
  toName: '',
  amountCents: 4705,
  status: 'DISPUTED',
};

function csvLines(csv: string): string[] {
  return csv.split('\r\n');
}

describe('ledgerToCsv', () => {
  it('starts with a header row', () => {
    expect(CSV_HEADER).toBe('date,type,description,from,to,amount,amount_cents,status');
    expect(csvLines(ledgerToCsv([]))[0]).toBe(CSV_HEADER);
  });

  it('exports only the header for an empty ledger', () => {
    expect(ledgerToCsv([])).toBe(`${CSV_HEADER}\r\n`);
  });

  it('writes one row per entry with the amount as dollars and as cents', () => {
    expect(csvLines(ledgerToCsv([bobPays]))[1]).toBe(
      '2026-11-03T08:00:00.000Z,SETTLEMENT,Settle up,Bob,Alice,345.00,34500,CONFIRMED',
    );
  });

  it('keeps leading zeros in the cents part of the amount', () => {
    expect(csvLines(ledgerToCsv([disputedTaxi]))[1]).toContain(',47.05,4705,');
    expect(csvLines(ledgerToCsv([{ ...dinner, amountCents: 1 }]))[1]).toContain(',0.01,1,');
  });

  it('formats the largest safe amount exactly, without floating-point rounding', () => {
    const huge = { ...dinner, amountCents: Number.MAX_SAFE_INTEGER };
    expect(csvLines(ledgerToCsv([huge]))[1]).toContain(',90071992547409.91,9007199254740991,');
  });

  it('marks disputed entries in the status column', () => {
    expect(csvLines(ledgerToCsv([disputedTaxi]))[1].endsWith(',DISPUTED')).toBe(true);
  });

  it('sorts entries by time, then by ID, whatever the input order', () => {
    const sameTime = { ...dinner, id: 'e-0', description: 'Breakfast' };
    const lines = csvLines(ledgerToCsv([bobPays, dinner, disputedTaxi, sameTime]));
    expect(lines.slice(1, 5).map((line) => line.split(',')[2])).toEqual([
      'Breakfast',
      'Dinner',
      'Taxi',
      'Settle up',
    ]);
  });

  it('ends every row, including the last, with CRLF (RFC 4180)', () => {
    const csv = ledgerToCsv([dinner, bobPays]);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csvLines(csv)).toHaveLength(4);
  });

  it('quotes fields that contain commas, quotes, or line breaks', () => {
    const tricky = { ...dinner, description: 'Pizza, "large"\nwith extra cheese' };
    expect(ledgerToCsv([tricky])).toContain(',"Pizza, ""large""\nwith extra cheese",');
  });

  it.each(['=SUM(A1:A9)', '+1', '-1', '@cmd', '\tTab', '\rReturn'])(
    'neutralizes text a spreadsheet would run as a formula: %j',
    (description) => {
      const row = csvLines(ledgerToCsv([{ ...dinner, description }]))[1];
      expect(row.split(',')[2].replace(/^"/, '')).toMatch(/^'/);
    },
  );

  it('guards names as well as descriptions against formulas', () => {
    const row = csvLines(ledgerToCsv([{ ...bobPays, fromName: '=HYPERLINK("x")' }]))[1];
    expect(row).toContain(`,"'=HYPERLINK(""x"")",`);
  });
});

describe('ledgerToJson', () => {
  it('wraps the entries with the group name and export time', () => {
    const parsed = JSON.parse(ledgerToJson('Lake Tahoe Trip', [], '2026-11-09T12:00:00.000Z'));
    expect(parsed).toEqual({
      group: 'Lake Tahoe Trip',
      exportedAt: '2026-11-09T12:00:00.000Z',
      entries: [],
    });
  });

  it('writes amounts as integer cents and as an exact decimal string', () => {
    const parsed = JSON.parse(ledgerToJson('Trip', [bobPays], '2026-11-09T12:00:00.000Z'));
    expect(parsed.entries).toEqual([
      {
        id: 's-1',
        date: '2026-11-03T08:00:00.000Z',
        type: 'SETTLEMENT',
        description: 'Settle up',
        from: 'Bob',
        to: 'Alice',
        amount: '345.00',
        amountCents: 34500,
        status: 'CONFIRMED',
      },
    ]);
  });

  it('sorts entries the same way as the CSV export', () => {
    const parsed = JSON.parse(
      ledgerToJson('Trip', [bobPays, disputedTaxi, dinner], '2026-11-09T12:00:00.000Z'),
    );
    expect(parsed.entries.map((e: { id: string }) => e.id)).toEqual(['e-1', 'e-2', 's-1']);
  });

  it('keeps text exactly as entered, since JSON has no formula risk', () => {
    const parsed = JSON.parse(
      ledgerToJson('Trip', [{ ...dinner, description: '=SUM(A1)' }], '2026-11-09T12:00:00.000Z'),
    );
    expect(parsed.entries[0].description).toBe('=SUM(A1)');
  });
});

describe('validation', () => {
  it.each([0, -100, 12.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an amount that is not a positive whole number of cents: %s',
    (amountCents) => {
      expect(() => ledgerToCsv([{ ...dinner, amountCents }])).toThrow(InvalidExportError);
      expect(() => ledgerToJson('Trip', [{ ...dinner, amountCents }], '2026-11-09T12:00:00.000Z')).toThrow(
        InvalidExportError,
      );
    },
  );

  it('rejects a date that is not an ISO 8601 timestamp', () => {
    expect(() => ledgerToCsv([{ ...dinner, occurredAt: 'yesterday' }])).toThrow(InvalidExportError);
  });

  it('rejects duplicate entry IDs', () => {
    expect(() => ledgerToCsv([dinner, dinner])).toThrow(InvalidExportError);
  });
});
