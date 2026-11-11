import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { LedgerExportRow } from '@/lib/audit/ledger-export';
import { ActivityLedger, type ActivityLedgerState } from './activity-ledger';

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

const taxi: LedgerExportRow = {
  id: 'e-2',
  occurredAt: '2026-11-02T12:00:00.000Z',
  type: 'EXPENSE',
  description: 'Taxi',
  fromName: 'Charlie',
  toName: '',
  amountCents: 4705,
  status: 'DISPUTED',
};

const bobPays: LedgerExportRow = {
  id: 's-1',
  occurredAt: '2026-11-03T08:00:00.000Z',
  type: 'SETTLEMENT',
  description: 'Settle up',
  fromName: 'Bob',
  toName: 'Alice',
  amountCents: 34500,
  status: 'PENDING',
};

const exportLinks = {
  csv: '/export/ledger.csv',
  json: '/export/ledger.json',
};

function ready(entries: LedgerExportRow[] = [dinner, taxi, bobPays]): ActivityLedgerState {
  return { status: 'ready', entries };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(state: ActivityLedgerState = ready()) {
  const onToggleDispute = vi.fn<(entryId: string, disputed: boolean) => Promise<void>>();
  const user = userEvent.setup();
  render(
    <ActivityLedger state={state} onToggleDispute={onToggleDispute} exportLinks={exportLinks} />,
  );
  return { user, onToggleDispute };
}

function entryTexts(): string[] {
  const list = screen.getByRole('list', { name: 'Ledger entries' });
  return within(list)
    .getAllByRole('listitem')
    .map((item) => within(item).getByTestId('entry-text').textContent ?? '');
}

function entry(text: string): HTMLElement {
  const item = screen.getByText(text).closest('li');
  if (!item) throw new Error(`No entry for ${text}`);
  return item;
}

describe('ActivityLedger', () => {
  describe('entries', () => {
    it('lists expenses and payments newest first in plain words', () => {
      setup();
      expect(entryTexts()).toEqual([
        'Bob paid Alice $345.00',
        'Charlie paid $47.05 for Taxi',
        'Alice paid $800.00 for Dinner',
      ]);
    });

    it('shows each entry date as a machine-readable time element', () => {
      setup();
      const time = within(entry('Alice paid $800.00 for Dinner')).getByText('Nov 1, 2026');
      expect(time.tagName).toBe('TIME');
      expect(time).toHaveAttribute('dateTime', '2026-11-01T19:30:00.000Z');
    });

    it('labels disputed and pending entries in text, not by color alone', () => {
      setup();
      expect(within(entry('Charlie paid $47.05 for Taxi')).getByText('Disputed')).toBeInTheDocument();
      expect(within(entry('Bob paid Alice $345.00')).getByText('Pending')).toBeInTheDocument();
      expect(within(entry('Alice paid $800.00 for Dinner')).queryByText('Disputed')).not.toBeInTheDocument();
    });

    it('counts the entries that need review', () => {
      setup();
      expect(screen.getByText('1 entry needs review.')).toBeInTheDocument();
    });

    it('uses the plural when several entries need review', () => {
      setup(ready([dinner, taxi, { ...bobPays, status: 'DISPUTED' }]));
      expect(screen.getByText('2 entries need review.')).toBeInTheDocument();
    });

    it('does not show a review count when nothing is disputed', () => {
      setup(ready([dinner]));
      expect(screen.queryByText(/need(s)? review/)).not.toBeInTheDocument();
    });
  });

  describe('dispute toggle', () => {
    it('offers a flag button on undisputed expenses and a clear button on disputed ones', () => {
      setup();
      expect(screen.getByRole('button', { name: 'Flag for review: Dinner' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Clear dispute: Taxi' })).toBeInTheDocument();
    });

    it('does not offer a dispute toggle on payments', () => {
      setup();
      expect(within(entry('Bob paid Alice $345.00')).queryByRole('button')).not.toBeInTheDocument();
    });

    it('flags an expense optimistically before the server answers', async () => {
      const { user, onToggleDispute } = setup();
      onToggleDispute.mockReturnValue(deferred().promise);

      await user.click(screen.getByRole('button', { name: 'Flag for review: Dinner' }));

      expect(onToggleDispute).toHaveBeenCalledWith('e-1', true);
      expect(within(entry('Alice paid $800.00 for Dinner')).getByText('Disputed')).toBeInTheDocument();
      expect(screen.getByText('2 entries need review.')).toBeInTheDocument();
    });

    it('disables the toggle while its request is in flight', async () => {
      const { user, onToggleDispute } = setup();
      onToggleDispute.mockReturnValue(deferred().promise);

      await user.click(screen.getByRole('button', { name: 'Flag for review: Dinner' }));

      expect(screen.getByRole('button', { name: 'Clear dispute: Dinner' })).toBeDisabled();
    });

    it('announces the change once the server saves it', async () => {
      const { user, onToggleDispute } = setup();
      onToggleDispute.mockResolvedValue();

      await user.click(screen.getByRole('button', { name: 'Clear dispute: Taxi' }));

      expect(onToggleDispute).toHaveBeenCalledWith('e-2', false);
      expect(await screen.findByRole('status')).toHaveTextContent('Dispute cleared on Taxi.');
      expect(screen.getByRole('button', { name: 'Flag for review: Taxi' })).toBeEnabled();
    });

    it('announces a new flag once the server saves it', async () => {
      const { user, onToggleDispute } = setup();
      onToggleDispute.mockResolvedValue();

      await user.click(screen.getByRole('button', { name: 'Flag for review: Dinner' }));

      expect(await screen.findByRole('status')).toHaveTextContent('Dinner flagged for review.');
    });

    it('rolls back and shows an error when the server rejects the change', async () => {
      const { user, onToggleDispute } = setup();
      onToggleDispute.mockRejectedValue(new Error('Network down'));

      await user.click(screen.getByRole('button', { name: 'Flag for review: Dinner' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Couldn’t update the dispute on Dinner. Please try again.',
      );
      expect(screen.getByRole('button', { name: 'Flag for review: Dinner' })).toBeEnabled();
      expect(screen.getByText('1 entry needs review.')).toBeInTheDocument();
    });

    it('clears an earlier error after a later change succeeds', async () => {
      const { user, onToggleDispute } = setup();
      onToggleDispute.mockRejectedValueOnce(new Error('Network down'));
      onToggleDispute.mockResolvedValueOnce();

      await user.click(screen.getByRole('button', { name: 'Flag for review: Dinner' }));
      await screen.findByRole('alert');
      await user.click(screen.getByRole('button', { name: 'Flag for review: Dinner' }));

      expect(await screen.findByRole('status')).toHaveTextContent('Dinner flagged for review.');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('export', () => {
    it('links to the CSV and JSON exports as downloads', () => {
      setup();
      expect(screen.getByRole('link', { name: 'Export CSV' })).toHaveAttribute('href', exportLinks.csv);
      expect(screen.getByRole('link', { name: 'Export JSON' })).toHaveAttribute('href', exportLinks.json);
      expect(screen.getByRole('link', { name: 'Export CSV' })).toHaveAttribute('download');
    });
  });

  describe('loading, empty, and error states', () => {
    it('shows a loading status while the ledger loads', () => {
      setup({ status: 'loading' });
      expect(screen.getByRole('status')).toHaveTextContent('Loading activity…');
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });

    it('shows an error with a retry button when loading fails', async () => {
      const onRetry = vi.fn();
      const { user } = setup({ status: 'error', message: 'Server unavailable', onRetry });
      expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load activity: Server unavailable');
      await user.click(screen.getByRole('button', { name: 'Try again' }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('explains the empty state and offers no exports when there is no activity', () => {
      setup(ready([]));
      expect(
        screen.getByText('No activity yet. Expenses and payments will appear here.'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Export CSV' })).not.toBeInTheDocument();
    });
  });
});
