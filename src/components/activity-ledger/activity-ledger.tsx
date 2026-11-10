'use client';

import { useId, useState } from 'react';
import { Download, Flag, FlagOff } from 'lucide-react';
import type { LedgerExportRow } from '@/lib/audit/ledger-export';
import { formatCents } from '@/lib/finance/money-input';

export type ActivityLedgerState =
  | { status: 'loading' }
  | { status: 'error'; message: string; onRetry: () => void }
  | { status: 'ready'; entries: LedgerExportRow[] };

export interface ActivityLedgerProps {
  state: ActivityLedgerState;
  /** Saves the dispute flag of an expense; rejects if the server refuses. */
  onToggleDispute: (entryId: string, disputed: boolean) => Promise<void>;
  /** Server routes that check membership before returning the export (see #8). */
  exportLinks: { csv: string; json: string };
}

// UTC, so the date matches the exported timestamp whatever the viewer's time zone.
const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

const SETTLEMENT_LABELS = { PENDING: 'Pending', CONFIRMED: 'Confirmed', DISPUTED: 'Disputed' } as const;

/** Group activity ledger (Issue #8): expenses and payments with dispute flags and export links. */
export function ActivityLedger({ state, onToggleDispute, exportLinks }: ActivityLedgerProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Activity</h2>
      {state.status === 'loading' && (
        <p role="status" aria-busy="true" className="text-gray-600">
          Loading activity…
        </p>
      )}
      {state.status === 'error' && (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-red-800">
          <p>Couldn’t load activity: {state.message}</p>
          <button
            type="button"
            onClick={state.onRetry}
            className="mt-2 rounded-md border border-red-400 px-3 py-1 text-sm font-medium hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
          >
            Try again
          </button>
        </div>
      )}
      {state.status === 'ready' && (
        <ReadyLedger
          entries={state.entries}
          onToggleDispute={onToggleDispute}
          exportLinks={exportLinks}
        />
      )}
    </div>
  );
}

function ReadyLedger({
  entries,
  onToggleDispute,
  exportLinks,
}: {
  entries: LedgerExportRow[];
  onToggleDispute: ActivityLedgerProps['onToggleDispute'];
  exportLinks: ActivityLedgerProps['exportLinks'];
}) {
  const summaryId = useId();
  // Dispute flags changed on this page, applied over the loaded entries (optimistic update).
  const [flags, setFlags] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isDisputed = (row: LedgerExportRow) => flags.get(row.id) ?? row.status === 'DISPUTED';
  const setFlag = (id: string, disputed: boolean) =>
    setFlags((current) => new Map(current).set(id, disputed));

  const toggleDispute = async (row: LedgerExportRow) => {
    const disputed = !isDisputed(row);
    setFlag(row.id, disputed);
    setSaving((current) => new Set(current).add(row.id));
    try {
      await onToggleDispute(row.id, disputed);
      setError(null);
      setNotice(
        disputed ? `${row.description} flagged for review.` : `Dispute cleared on ${row.description}.`,
      );
    } catch {
      setFlag(row.id, !disputed);
      setError(`Couldn’t update the dispute on ${row.description}. Please try again.`);
      setNotice('');
    } finally {
      setSaving((current) => {
        const next = new Set(current);
        next.delete(row.id);
        return next;
      });
    }
  };

  if (entries.length === 0) {
    return <p className="text-gray-600">No activity yet. Expenses and payments will appear here.</p>;
  }

  // Newest first; entries at the same time by ID (ordinal), matching the export's tie-break.
  const newestFirst = [...entries].sort((a, b) =>
    a.occurredAt === b.occurredAt ? (a.id < b.id ? -1 : 1) : a.occurredAt < b.occurredAt ? 1 : -1,
  );
  const reviewCount = entries.filter(isDisputed).length;

  return (
    <>
      {error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-red-800">
          {error}
        </p>
      )}
      <p role="status" className="sr-only">
        {notice}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {reviewCount > 0 ? (
          <p id={summaryId} className="font-medium text-amber-800">
            {reviewCount === 1 ? '1 entry needs review.' : `${reviewCount} entries need review.`}
          </p>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <ExportLink href={exportLinks.csv} label="Export CSV" />
          <ExportLink href={exportLinks.json} label="Export JSON" />
        </div>
      </div>

      <ol aria-label="Ledger entries" className="divide-y divide-gray-200 rounded-md border border-gray-200">
        {newestFirst.map((row) => {
          const disputed = isDisputed(row);
          const amount = formatCents(row.amountCents);
          const text =
            row.type === 'SETTLEMENT'
              ? `${row.fromName} paid ${row.toName} ${amount}`
              : `${row.fromName} paid ${amount} for ${row.description}`;
          const chip =
            row.type === 'SETTLEMENT'
              ? SETTLEMENT_LABELS[row.status as keyof typeof SETTLEMENT_LABELS]
              : disputed
                ? 'Disputed'
                : null;
          return (
            <li key={row.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <span data-testid="entry-text" className="text-gray-900">
                  {text}
                </span>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <time dateTime={row.occurredAt}>{DATE_FORMAT.format(new Date(row.occurredAt))}</time>
                  {chip && <StatusChip label={chip} />}
                </div>
              </div>
              {row.type === 'EXPENSE' && (
                <button
                  type="button"
                  disabled={saving.has(row.id)}
                  onClick={() => void toggleDispute(row)}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {disputed ? (
                    <FlagOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Flag className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span className="sr-only">
                    {disputed ? `Clear dispute on ${row.description}` : `Flag ${row.description} for review`}
                  </span>
                  <span aria-hidden="true">{disputed ? 'Clear dispute' : 'Flag for review'}</span>
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

function StatusChip({ label }: { label: string }) {
  const tone =
    label === 'Disputed'
      ? 'bg-amber-50 text-amber-800 ring-amber-600/30'
      : label === 'Pending'
        ? 'bg-gray-100 text-gray-700 ring-gray-400/30'
        : 'bg-emerald-50 text-emerald-800 ring-emerald-600/30';
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${tone}`}>{label}</span>;
}

function ExportLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      download
      className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      {label}
    </a>
  );
}
