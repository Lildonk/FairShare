import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminGroup, DisputedExpense } from '@/lib/db/admin';
import { AccessDenied } from './access-denied';
import { AdminPortal } from './admin-portal';

const groups: AdminGroup[] = [
  { id: 'g-1', name: 'Lake Tahoe Trip', isArchived: false, memberCount: 4, expenseCount: 6, disputedExpenseCount: 1 },
  { id: 'g-2', name: 'Old Flat', isArchived: true, memberCount: 2, expenseCount: 3, disputedExpenseCount: 0 },
];
const disputes: DisputedExpense[] = [
  {
    id: 'e-1',
    title: 'Boat rental',
    amountCents: 12050,
    groupId: 'g-1',
    groupName: 'Lake Tahoe Trip',
    payerName: 'Alice Chen',
    createdAt: '2026-11-02T18:30:00.000Z',
  },
];

function mockFetch(status: number) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
  } as Response);
}

const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AdminPortal', () => {
  it('shows every group with its counts and a text status', () => {
    render(<AdminPortal groups={groups} disputes={disputes} />);

    expect(screen.getByRole('table', { name: 'Groups' })).toBeInTheDocument();
    expect(within(row('Lake Tahoe Trip')).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(
      expect.arrayContaining(['4', '6', '1', 'Active']),
    );
    expect(within(row('Old Flat')).getByText('Archived')).toBeInTheDocument();
  });

  it('offers Archive only for active groups', () => {
    render(<AdminPortal groups={groups} disputes={disputes} />);

    expect(screen.getByRole('button', { name: 'Archive Lake Tahoe Trip' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive Old Flat' })).not.toBeInTheDocument();
  });

  it('asks for confirmation, then archives the group and announces it', async () => {
    const fetchSpy = mockFetch(200);
    render(<AdminPortal groups={groups} disputes={disputes} />);

    await userEvent.click(screen.getByRole('button', { name: 'Archive Lake Tahoe Trip' }));
    const confirm = screen.getByRole('button', { name: 'Confirm archiving Lake Tahoe Trip' });
    expect(confirm).toHaveFocus();
    expect(fetchSpy).not.toHaveBeenCalled();

    await userEvent.click(confirm);

    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/admin/groups/g-1/archive', { method: 'PATCH' });
    expect(within(row('Lake Tahoe Trip')).getByText('Archived')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive Lake Tahoe Trip' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Archived Lake Tahoe Trip. Its expenses and payments can no longer change.');
  });

  it('cancelling leaves the group active and sends nothing', async () => {
    const fetchSpy = mockFetch(200);
    render(<AdminPortal groups={groups} disputes={disputes} />);

    await userEvent.click(screen.getByRole('button', { name: 'Archive Lake Tahoe Trip' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel archiving Lake Tahoe Trip' }));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(within(row('Lake Tahoe Trip')).getByText('Active')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive Lake Tahoe Trip' })).toHaveFocus();
  });

  it('shows an alert and keeps the group active when archiving fails', async () => {
    mockFetch(500);
    render(<AdminPortal groups={groups} disputes={disputes} />);

    await userEvent.click(screen.getByRole('button', { name: 'Archive Lake Tahoe Trip' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm archiving Lake Tahoe Trip' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t archive Lake Tahoe Trip. Please try again.');
    expect(within(row('Lake Tahoe Trip')).getByText('Active')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive Lake Tahoe Trip' })).toBeInTheDocument();
  });

  it('lists disputed expenses with their group, payer, amount, and date', () => {
    render(<AdminPortal groups={groups} disputes={disputes} />);

    const list = screen.getByRole('list', { name: 'Disputed expenses' });
    expect(within(list).getByText('Boat rental')).toBeInTheDocument();
    expect(list).toHaveTextContent('Lake Tahoe Trip');
    expect(list).toHaveTextContent('Alice Chen');
    expect(list).toHaveTextContent('$120.50');
    expect(list).toHaveTextContent('2026-11-02');
  });

  it('says so when nothing is disputed', () => {
    render(<AdminPortal groups={groups} disputes={[]} />);

    expect(screen.getByText('No disputed expenses.')).toBeInTheDocument();
  });
});

describe('AccessDenied', () => {
  it('tells a member the page is for admins only, and links home', () => {
    render(<AccessDenied name="Bob Smith" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Admins only' })).toBeInTheDocument();
    expect(screen.getByText(/signed in as Bob Smith/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
  });
});
