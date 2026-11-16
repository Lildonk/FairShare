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

    it('offers Record payment only on transfers the viewer pays or receives (#47 rule)', () => {
      render(<SettlementBoard state={ready()} currentUserId="u-dana" onRecordPayment={vi.fn()} />);

      const buttons = screen.getAllByRole('button', { name: /^Record payment/ });
      expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
        'Record payment: Dana pays Alice $229.00',
        'Record payment: Dana pays Charlie $47.00',
      ]);
      // Other transfers are still listed, without an action.
      expect(transferTexts()).toContain('Bob pays Alice $345.00');
    });

    it('offers no Record payment in a read-only (archived) group and says why', () => {
      render(<SettlementBoard state={ready()} currentUserId="u-bob" readOnly onRecordPayment={vi.fn()} />);

      expect(screen.queryByRole('button', { name: /^Record payment/ })).not.toBeInTheDocument();
      expect(screen.getByText('This group is archived, so payments can’t be recorded.')).toBeInTheDocument();
      expect(transferTexts()).toContain('Bob pays Alice $345.00');
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

    it('counts a recorded payment once when the page passes refreshed data that includes it (#33 review)', async () => {
      const bobPaid: SettlementRecord = {
        fromUserId: 'u-bob',
        toUserId: 'u-alice',
        amountCents: 34500,
        status: 'CONFIRMED',
      };
      const onRecordPayment = vi.fn<(payment: PaymentRequest) => Promise<SettlementRecord>>();
      onRecordPayment.mockResolvedValue(bobPaid);
      const user = userEvent.setup();
      const { rerender } = render(
        <SettlementBoard state={ready()} onRecordPayment={onRecordPayment} />,
      );

      await user.click(screen.getByRole('button', bobPaysAlice));
      await screen.findByText('Recorded: Bob paid Alice $345.00.');
      // The page refetches (for example after router.refresh()) without remounting the board.
      rerender(
        <SettlementBoard state={ready({ settlements: [bobPaid] })} onRecordPayment={onRecordPayment} />,
      );

      expect(chipTexts()).toEqual([
        'Alice: gets back $229.00',
        'Bob: settled up',
        'Charlie: gets back $47.00',
        'Dana: owes $276.00',
      ]);
    });

    it('keeps a saved payment until refreshed data includes its id (#42 review)', async () => {
      const bobPaid: SettlementRecord = {
        id: 's-1',
        fromUserId: 'u-bob',
        toUserId: 'u-alice',
        amountCents: 34500,
        status: 'CONFIRMED',
      };
      const onRecordPayment = vi.fn<(payment: PaymentRequest) => Promise<SettlementRecord>>();
      onRecordPayment.mockResolvedValue(bobPaid);
      const user = userEvent.setup();
      const { rerender } = render(<SettlementBoard state={ready()} onRecordPayment={onRecordPayment} />);

      await user.click(screen.getByRole('button', bobPaysAlice));
      await screen.findByText('Recorded: Bob paid Alice $345.00.');
      // A refetch that started before the save committed: new data, still without the payment.
      rerender(<SettlementBoard state={ready()} onRecordPayment={onRecordPayment} />);
      expect(chipTexts()).toContain('Bob: settled up');
      expect(screen.queryByRole('button', bobPaysAlice)).not.toBeInTheDocument();

      // The next refetch includes it: counted once.
      rerender(<SettlementBoard state={ready({ settlements: [bobPaid] })} onRecordPayment={onRecordPayment} />);
      expect(chipTexts()).toEqual([
        'Alice: gets back $229.00',
        'Bob: settled up',
        'Charlie: gets back $47.00',
        'Dana: owes $276.00',
      ]);
    });

    it('counts a payment once when refreshed data arrives before the server answers', async () => {
      const bobPaid: SettlementRecord = {
        fromUserId: 'u-bob',
        toUserId: 'u-alice',
        amountCents: 34500,
        status: 'CONFIRMED',
      };
      const saving = deferred<SettlementRecord>();
      const onRecordPayment = vi.fn<(payment: PaymentRequest) => Promise<SettlementRecord>>();
      onRecordPayment.mockReturnValue(saving.promise);
      const user = userEvent.setup();
      const { rerender } = render(
        <SettlementBoard state={ready()} onRecordPayment={onRecordPayment} />,
      );

      await user.click(screen.getByRole('button', bobPaysAlice));
      rerender(
        <SettlementBoard state={ready({ settlements: [bobPaid] })} onRecordPayment={onRecordPayment} />,
      );
      saving.resolve(bobPaid);
      await screen.findByText('Recorded: Bob paid Alice $345.00.');

      expect(chipTexts()).toContain('Alice: gets back $229.00');
      expect(chipTexts()).toContain('Bob: settled up');
    });
  });

  describe('payments waiting for confirmation', () => {
    /** Bob recorded paying Alice $345.00; it stays PENDING until Alice answers. */
    const bobPending: SettlementRecord = {
      id: 's-bob',
      fromUserId: 'u-bob',
      toUserId: 'u-alice',
      amountCents: 34500,
      status: 'PENDING',
    };

    function setupPending(
      currentUserId: string | undefined,
      { readOnly = false, settlements = [bobPending] }: { readOnly?: boolean; settlements?: SettlementRecord[] } = {},
    ) {
      const onRecordPayment = vi.fn<(payment: PaymentRequest) => Promise<SettlementRecord>>();
      const onRespondToPayment =
        vi.fn<(settlementId: string, status: 'CONFIRMED' | 'DISPUTED') => Promise<SettlementRecord>>();
      const user = userEvent.setup();
      render(
        <SettlementBoard
          state={ready({ settlements })}
          currentUserId={currentUserId}
          readOnly={readOnly}
          onRecordPayment={onRecordPayment}
          onRespondToPayment={onRespondToPayment}
        />,
      );
      return { user, onRespondToPayment };
    }

    function pendingTexts(): string[] {
      const list = screen.queryByRole('list', { name: 'Payments waiting for confirmation' });
      if (!list) return [];
      return within(list)
        .getAllByTestId('pending-text')
        .map((item) => item.textContent ?? '');
    }

    it('lists a pending payment, with who must confirm it, without counting it in the balances', () => {
      setupPending('u-bob');

      expect(screen.getByRole('heading', { name: 'Waiting for confirmation' })).toBeInTheDocument();
      expect(pendingTexts()).toEqual(['Bob paid Alice $345.00. Waiting for Alice to confirm.']);
      expect(chipTexts()).toContain('Bob: owes $345.00');
    });

    it('shows no pending section when nothing is pending', () => {
      setupPending('u-alice', {
        settlements: [{ ...bobPending, status: 'CONFIRMED' }, { ...bobPending, id: 's-2', status: 'DISPUTED' }],
      });

      expect(screen.queryByRole('heading', { name: 'Waiting for confirmation' })).not.toBeInTheDocument();
    });

    it('offers Confirm and Dispute only to the receiver, and to no one in an archived group', () => {
      const confirm = { name: 'Confirm payment: Bob paid Alice $345.00' };
      const dispute = { name: 'Dispute payment: Bob paid Alice $345.00' };

      for (const viewer of ['u-bob', 'u-charlie']) {
        const view = render(
          <SettlementBoard
            state={ready({ settlements: [bobPending] })}
            currentUserId={viewer}
            onRecordPayment={vi.fn()}
            onRespondToPayment={vi.fn()}
          />,
        );
        expect(screen.queryByRole('button', confirm)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', dispute)).not.toBeInTheDocument();
        view.unmount();
      }

      const archived = render(
        <SettlementBoard
          state={ready({ settlements: [bobPending] })}
          currentUserId="u-alice"
          readOnly
          onRecordPayment={vi.fn()}
          onRespondToPayment={vi.fn()}
        />,
      );
      expect(screen.queryByRole('button', confirm)).not.toBeInTheDocument();
      expect(pendingTexts()).toEqual(['Bob paid Alice $345.00. Waiting for Alice to confirm.']);
      archived.unmount();

      setupPending('u-alice');
      expect(screen.getByRole('button', confirm)).toBeInTheDocument();
      expect(screen.getByRole('button', dispute)).toBeInTheDocument();
    });

    it('confirms a payment: it counts at once, leaves the list, and the change is announced', async () => {
      const { user, onRespondToPayment } = setupPending('u-alice');
      onRespondToPayment.mockResolvedValue({ ...bobPending, status: 'CONFIRMED' });

      await user.click(screen.getByRole('button', { name: 'Confirm payment: Bob paid Alice $345.00' }));

      expect(onRespondToPayment).toHaveBeenCalledWith('s-bob', 'CONFIRMED');
      expect(await screen.findByText('Confirmed: Bob paid Alice $345.00.')).toBeInTheDocument();
      expect(pendingTexts()).toEqual([]);
      expect(chipTexts()).toContain('Bob: settled up');
      expect(chipTexts()).toContain('Alice: gets back $229.00');
    });

    it('disputes a payment: it leaves the list and never counts', async () => {
      const { user, onRespondToPayment } = setupPending('u-alice');
      onRespondToPayment.mockResolvedValue({ ...bobPending, status: 'DISPUTED' });

      await user.click(screen.getByRole('button', { name: 'Dispute payment: Bob paid Alice $345.00' }));

      expect(onRespondToPayment).toHaveBeenCalledWith('s-bob', 'DISPUTED');
      expect(await screen.findByText('Disputed: Bob paid Alice $345.00.')).toBeInTheDocument();
      expect(pendingTexts()).toEqual([]);
      expect(chipTexts()).toContain('Bob: owes $345.00');
    });

    it('keeps the payment pending and explains a failed answer', async () => {
      const { user, onRespondToPayment } = setupPending('u-alice');
      onRespondToPayment.mockRejectedValue(new Error('409'));

      await user.click(screen.getByRole('button', { name: 'Confirm payment: Bob paid Alice $345.00' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Couldn’t confirm Bob’s payment to Alice. Please try again.',
      );
      expect(pendingTexts()).toEqual(['Bob paid Alice $345.00. Waiting for Alice to confirm.']);
      expect(chipTexts()).toContain('Bob: owes $345.00');
    });

    it('ignores a second click while the answer is saving', async () => {
      const { user, onRespondToPayment } = setupPending('u-alice');
      const saving = deferred<SettlementRecord>();
      onRespondToPayment.mockReturnValue(saving.promise);

      await user.click(screen.getByRole('button', { name: 'Confirm payment: Bob paid Alice $345.00' }));
      await user.click(screen.getByRole('button', { name: 'Dispute payment: Bob paid Alice $345.00' }));

      expect(onRespondToPayment).toHaveBeenCalledTimes(1);
      saving.resolve({ ...bobPending, status: 'CONFIRMED' });
      await screen.findByText('Confirmed: Bob paid Alice $345.00.');
    });

    it('lists a payment the viewer just recorded as pending', async () => {
      const onRecordPayment = vi.fn<(payment: PaymentRequest) => Promise<SettlementRecord>>();
      onRecordPayment.mockResolvedValue(bobPending);
      const user = userEvent.setup();
      render(<SettlementBoard state={ready()} currentUserId="u-bob" onRecordPayment={onRecordPayment} />);

      await user.click(screen.getByRole('button', { name: 'Record payment: Bob pays Alice $345.00' }));

      await screen.findByText('Bob’s payment to Alice is waiting for confirmation.');
      expect(pendingTexts()).toEqual(['Bob paid Alice $345.00. Waiting for Alice to confirm.']);
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

    it('shows an error instead of crashing when the records do not add up (#25 review)', () => {
      const broken: ExpenseRecord = {
        payerId: 'u-alice',
        amountCents: 1000,
        splits: [{ userId: 'u-bob', owedCents: 999 }],
      };
      setup(ready({ expenses: [...expenses, broken] }));
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Couldn’t calculate balances because some records don’t add up. Please refresh, or ask an admin to check this group.',
      );
      expect(screen.queryByRole('list', { name: 'Member balances' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Record payment/ })).not.toBeInTheDocument();
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
