import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ExpenseRecord, SettlementRecord } from '@/lib/finance/group-balances';
import {
  SettlementBoard,
  type PaymentRequest,
  type SettlementBoardData,
  type SettlementBoardState,
} from './settlement-board';

const members = [
  { id: 'u-alice', name: 'Alice' },
  { id: 'u-bob', name: 'Bob' },
  { id: 'u-charlie', name: 'Charlie' },
  { id: 'u-dana', name: 'Dana' },
];

/** Alice +574.00, Bob −345.00, Charlie +47.00, Dana −276.00 (the #2 seed sample). */
const expenses: ExpenseRecord[] = [
  {
    payerId: 'u-alice',
    amountCents: 80000,
    splits: [
      { userId: 'u-alice', owedCents: 22600 },
      { userId: 'u-bob', owedCents: 34500 },
      { userId: 'u-dana', owedCents: 22900 },
    ],
  },
  {
    payerId: 'u-charlie',
    amountCents: 10000,
    splits: [
      { userId: 'u-charlie', owedCents: 5300 },
      { userId: 'u-dana', owedCents: 4700 },
    ],
  },
];

function ready(overrides: Partial<SettlementBoardData> = {}): SettlementBoardState {
  return { status: 'ready', data: { members, expenses, settlements: [], ...overrides } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(state: SettlementBoardState = ready()) {
  const onRecordPayment = vi.fn<(payment: PaymentRequest) => Promise<SettlementRecord>>();
  const user = userEvent.setup();
  render(<SettlementBoard state={state} onRecordPayment={onRecordPayment} />);
  return { user, onRecordPayment };
}

function chipTexts(): (string | null)[] {
  const list = screen.getByRole('list', { name: 'Member balances' });
  return within(list)
    .getAllByRole('listitem')
    .map((item) => item.textContent);
}

function transferTexts(): string[] {
  const list = screen.queryByRole('list', { name: 'Suggested transfers' });
  if (!list) return [];
  return within(list)
    .getAllByRole('listitem')
    .map((item) => within(item).getByTestId('transfer-text').textContent ?? '');
}

const bobPaysAlice = { name: 'Record payment: Bob pays Alice $345.00' };

describe('SettlementBoard', () => {
  describe('balances', () => {
    it('labels each member as getting money back or owing, not by color alone', () => {
      setup();
      expect(chipTexts()).toEqual([
        'Alice: gets back $574.00',
        'Bob: owes $345.00',
        'Charlie: gets back $47.00',
        'Dana: owes $276.00',
      ]);
    });

    it('labels a member with a zero balance as settled up', () => {
      setup(ready({ members: [...members, { id: 'u-erin', name: 'Erin' }] }));
      expect(chipTexts()).toContain('Erin: settled up');
    });

    it('counts confirmed settlements and ignores pending or disputed ones', () => {
      setup(
        ready({
          settlements: [
            { fromUserId: 'u-bob', toUserId: 'u-alice', amountCents: 34500, status: 'CONFIRMED' },
            { fromUserId: 'u-dana', toUserId: 'u-charlie', amountCents: 4700, status: 'PENDING' },
            { fromUserId: 'u-dana', toUserId: 'u-alice', amountCents: 100, status: 'DISPUTED' },
          ],
        }),
      );
      expect(chipTexts()).toEqual([
        'Alice: gets back $229.00',
        'Bob: settled up',
        'Charlie: gets back $47.00',
        'Dana: owes $276.00',
      ]);
    });
  });

  describe('transfer instructions', () => {
    it('lists the transfers produced by the debt engine', () => {
      setup();
      expect(transferTexts()).toEqual([
        'Bob pays Alice $345.00',
        'Dana pays Alice $229.00',
        'Dana pays Charlie $47.00',
      ]);
    });

    it('gives every Record payment button a unique accessible name', () => {
      setup();
      expect(screen.getByRole('button', bobPaysAlice)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Record payment: Dana pays Charlie $47.00' }),
      ).toBeInTheDocument();
    });

    it('says everyone is settled up when no transfers are needed', () => {
      setup(
        ready({
          settlements: [
            { fromUserId: 'u-bob', toUserId: 'u-alice', amountCents: 34500, status: 'CONFIRMED' },
            { fromUserId: 'u-dana', toUserId: 'u-alice', amountCents: 22900, status: 'CONFIRMED' },
            { fromUserId: 'u-dana', toUserId: 'u-charlie', amountCents: 4700, status: 'CONFIRMED' },
          ],
        }),
      );
      expect(transferTexts()).toEqual([]);
      expect(screen.getByText('Everyone is settled up.')).toBeInTheDocument();
    });
  });

  describe('Record payment', () => {
    it('sends the transfer and updates balances optimistically before the server answers', async () => {
      const { user, onRecordPayment } = setup();
      const pending = deferred<SettlementRecord>();
      onRecordPayment.mockReturnValue(pending.promise);

      await user.click(screen.getByRole('button', bobPaysAlice));

      expect(onRecordPayment).toHaveBeenCalledWith({
        fromUserId: 'u-bob',
        toUserId: 'u-alice',
        amountCents: 34500,
      });
      expect(chipTexts()).toContain('Bob: settled up');
      expect(transferTexts()).not.toContain('Bob pays Alice $345.00');
      expect(screen.getByRole('status')).toHaveTextContent('Recording Bob’s payment to Alice…');
    });

    it('confirms the payment once the server saves it', async () => {
      const { user, onRecordPayment } = setup();
      onRecordPayment.mockResolvedValue({
        fromUserId: 'u-bob',
        toUserId: 'u-alice',
        amountCents: 34500,
        status: 'CONFIRMED',
      });

      await user.click(screen.getByRole('button', bobPaysAlice));

      expect(await screen.findByRole('status')).toHaveTextContent(
        'Recorded: Bob paid Alice $345.00.',
      );
      expect(chipTexts()).toContain('Bob: settled up');
      expect(transferTexts()).toEqual(['Dana pays Alice $229.00', 'Dana pays Charlie $47.00']);
    });

    it('rolls back and shows an error when the server rejects the payment', async () => {
      const { user, onRecordPayment } = setup();
      onRecordPayment.mockRejectedValue(new Error('Network down'));

      await user.click(screen.getByRole('button', bobPaysAlice));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Couldn’t record Bob’s payment to Alice. Please try again.',
      );
      expect(chipTexts()).toContain('Bob: owes $345.00');
      expect(transferTexts()).toContain('Bob pays Alice $345.00');
    });

    it('keeps balances on confirmed state when the server saves the payment as pending', async () => {
      const { user, onRecordPayment } = setup();
      onRecordPayment.mockResolvedValue({
        fromUserId: 'u-bob',
        toUserId: 'u-alice',
        amountCents: 34500,
        status: 'PENDING',
      });

      await user.click(screen.getByRole('button', bobPaysAlice));

      expect(await screen.findByRole('status')).toHaveTextContent(
        'Bob’s payment to Alice is waiting for confirmation.',
      );
      expect(chipTexts()).toContain('Bob: owes $345.00');
    });

    it('clears an earlier error after a later payment succeeds', async () => {
      const { user, onRecordPayment } = setup();
      onRecordPayment.mockRejectedValueOnce(new Error('Network down'));
      onRecordPayment.mockResolvedValueOnce({
        fromUserId: 'u-bob',
        toUserId: 'u-alice',
        amountCents: 34500,
        status: 'CONFIRMED',
      });

      await user.click(screen.getByRole('button', bobPaysAlice));
      await screen.findByRole('alert');
      await user.click(screen.getByRole('button', bobPaysAlice));

      expect(await screen.findByRole('status')).toHaveTextContent(
        'Recorded: Bob paid Alice $345.00.',
      );
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('loading, empty, and error states', () => {
    it('shows a loading status while data loads', () => {
      setup({ status: 'loading' });
      expect(screen.getByRole('status')).toHaveTextContent('Loading balances…');
      expect(screen.queryByRole('list', { name: 'Member balances' })).not.toBeInTheDocument();
    });

    it('shows an error with a retry button when loading fails', async () => {
      const onRetry = vi.fn();
      const { user } = setup({ status: 'error', message: 'Server unavailable', onRetry });
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Couldn’t load balances: Server unavailable',
      );
      await user.click(screen.getByRole('button', { name: 'Try again' }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('explains the empty state when the group has no expenses', () => {
      setup(ready({ expenses: [] }));
      expect(
        screen.getByText('No expenses yet. Add an expense to see who owes whom.'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'Suggested transfers' })).not.toBeInTheDocument();
    });
  });

  describe('structure', () => {
    it('uses labelled sections for balances and transfers', () => {
      setup();
      expect(screen.getByRole('heading', { name: 'Balances' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Suggested transfers' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Balances' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Suggested transfers' })).toBeInTheDocument();
    });
  });
});
