import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LedgerExportRow } from '@/lib/audit/ledger-export';
import { GroupDashboard, type GroupDashboardProps } from './group-dashboard';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const alice = { id: 'u-alice', name: 'Alice' };
const bob = { id: 'u-bob', name: 'Bob' };
const carol = { id: 'u-carol', name: 'Carol' };

const cabin: LedgerExportRow = {
  id: 'e-1',
  occurredAt: '2026-11-01T19:30:00.000Z',
  type: 'EXPENSE',
  description: 'Cabin',
  fromName: 'Alice',
  toName: '',
  amountCents: 9000,
  status: 'ACTIVE',
};

/** Alice paid $90.00 for all three: Bob and Carol owe her $30.00 each. */
function props(overrides: Partial<GroupDashboardProps> = {}): GroupDashboardProps {
  return {
    currentUserId: bob.id,
    group: { id: 'g-1', name: 'Lake Tahoe Trip', isArchived: false, members: [alice, bob, carol] },
    expenses: [
      {
        payerId: alice.id,
        amountCents: 9000,
        splits: [alice, bob, carol].map((m) => ({ userId: m.id, owedCents: 3000 })),
      },
    ],
    settlements: [],
    transfers: [
      { fromMemberId: bob.id, toMemberId: alice.id, amountCents: 3000 },
      { fromMemberId: carol.id, toMemberId: alice.id, amountCents: 3000 },
    ],
    ledger: [cabin],
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  refresh.mockReset();
  vi.unstubAllGlobals();
});

describe('GroupDashboard', () => {
  it('shows the board, the transaction graph, and the activity ledger for the group', () => {
    render(<GroupDashboard {...props()} />);

    expect(screen.getByRole('heading', { name: 'Settle up' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Transaction graph' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Activity' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Export CSV' })).toHaveAttribute('href', '/api/v1/groups/g-1/export?format=csv');
    expect(screen.getByRole('link', { name: 'Export JSON' })).toHaveAttribute('href', '/api/v1/groups/g-1/export?format=json');
  });

  it('offers Record payment only on the viewer’s own transfers', () => {
    render(<GroupDashboard {...props()} />);

    expect(screen.getByRole('button', { name: 'Record payment: Bob pays Alice $30.00' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record payment: Carol pays Alice $30.00' })).not.toBeInTheDocument();
  });

  describe('adding an expense', () => {
    async function addTenDollarDinner(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole('button', { name: 'Add expense' }));
      const dialog = screen.getByRole('dialog', { name: 'Add expense' });
      await user.type(within(dialog).getByLabelText('Description'), 'Dinner');
      await user.type(within(dialog).getByLabelText('Amount'), '9.00');
      await user.click(within(dialog).getByRole('button', { name: 'Add expense' }));
    }

    it('posts the dialog’s expense to the group, closes the dialog, and refreshes the page', async () => {
      fetchMock.mockResolvedValue(jsonResponse(201, { expense: { id: 'e-2' } }));
      const user = userEvent.setup();
      render(<GroupDashboard {...props()} />);

      await addTenDollarDinner(user);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/v1/groups/g-1/expenses');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({
        title: 'Dinner',
        amountCents: 900,
        payerId: bob.id,
        splitType: 'EQUAL',
        splits: [
          { userId: alice.id, owedCents: 300, allocatedBps: null },
          { userId: bob.id, owedCents: 300, allocatedBps: null },
          { userId: carol.id, owedCents: 300, allocatedBps: null },
        ],
      });
      expect(await screen.findByRole('status', { name: 'Group updates' })).toHaveTextContent('Added Dinner.');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(refresh).toHaveBeenCalled();
    });

    it('keeps the dialog open and explains a refused expense', async () => {
      fetchMock.mockResolvedValue(jsonResponse(409, { code: 'group_archived', message: 'This group is archived.' }));
      const user = userEvent.setup();
      render(<GroupDashboard {...props()} />);

      await addTenDollarDinner(user);

      expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t add Dinner: This group is archived.');
      expect(screen.getByRole('dialog', { name: 'Add expense' })).toBeInTheDocument();
      expect(refresh).not.toHaveBeenCalled();
    });

    it('closes the dialog without saving on Cancel', async () => {
      const user = userEvent.setup();
      render(<GroupDashboard {...props()} />);

      await user.click(screen.getByRole('button', { name: 'Add expense' }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it('records a payment through the API and refreshes the page', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(201, {
        settlement: { id: 's-1', fromUserId: bob.id, toUserId: alice.id, amountCents: 3000, status: 'PENDING' },
      }),
    );
    const user = userEvent.setup();
    render(<GroupDashboard {...props()} />);

    await user.click(screen.getByRole('button', { name: 'Record payment: Bob pays Alice $30.00' }));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/groups/g-1/settlements');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ fromUserId: bob.id, toUserId: alice.id, amountCents: 3000 });
    expect(await screen.findByText('Bob’s payment to Alice is waiting for confirmation.')).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it('confirms a pending payment to the viewer through the API and refreshes the page', async () => {
    const pending = { id: 's-1', fromUserId: carol.id, toUserId: alice.id, amountCents: 3000, status: 'PENDING' as const };
    fetchMock.mockResolvedValue(jsonResponse(200, { settlement: { ...pending, status: 'CONFIRMED' } }));
    const user = userEvent.setup();
    render(<GroupDashboard {...props({ currentUserId: alice.id, settlements: [pending] })} />);

    await user.click(screen.getByRole('button', { name: 'Confirm payment: Carol paid Alice $30.00' }));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/settlements/s-1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({ status: 'CONFIRMED' });
    expect(await screen.findByText('Confirmed: Carol paid Alice $30.00.')).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it('reports a refused confirmation and keeps the payment pending', async () => {
    const pending = { id: 's-1', fromUserId: carol.id, toUserId: alice.id, amountCents: 3000, status: 'PENDING' as const };
    fetchMock.mockResolvedValue(
      jsonResponse(409, { code: 'settlement_not_pending', message: 'This payment was already confirmed or disputed.' }),
    );
    const user = userEvent.setup();
    render(<GroupDashboard {...props({ currentUserId: alice.id, settlements: [pending] })} />);

    await user.click(screen.getByRole('button', { name: 'Dispute payment: Carol paid Alice $30.00' }));

    expect(await screen.findByText('Couldn’t dispute Carol’s payment to Alice. Please try again.')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('flags an expense through the dispute endpoint, and reports a refusal', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { expense: { id: 'e-1', isDisputed: true } }));
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { code: 'group_archived', message: 'Archived.' }));
    const user = userEvent.setup();
    render(<GroupDashboard {...props()} />);

    await user.click(screen.getByRole('button', { name: 'Flag for review: Cabin' }));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/groups/g-1/expenses/e-1/dispute');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({ disputed: true });
    expect(await screen.findByText('Cabin flagged for review.')).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Clear dispute: Cabin' }));
    expect(await screen.findByText('Couldn’t update the dispute on Cabin. Please try again.')).toBeInTheDocument();
  });

  it('is read-only for an archived group: no new expenses, payments, or dispute changes', () => {
    render(<GroupDashboard {...props({ group: { ...props().group, isArchived: true } })} />);

    expect(screen.queryByRole('button', { name: 'Add expense' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Record payment/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Flag for review/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Confirm payment/ })).not.toBeInTheDocument();
    expect(screen.getByText('This group is archived, so payments can’t be recorded.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Export CSV' })).toBeInTheDocument();
  });
});
