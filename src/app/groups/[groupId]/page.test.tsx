import { render, screen } from '@testing-library/react';
import type { User } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { getSignedInUser } from '@/lib/auth/current-user';
import { loadGroupDashboard, type GroupDashboardData } from '@/lib/db/group-dashboard';
import GroupPage from './page';

vi.mock('@/lib/auth/current-user', () => ({ getSignedInUser: vi.fn() }));
vi.mock('@/lib/db/group-dashboard', () => ({ loadGroupDashboard: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('notFound');
  }),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const params = (groupId: string) => ({ params: Promise.resolve({ groupId }) });
const alice = { id: 'u-alice', name: 'Alice' } as User;

function dashboard(overrides: Partial<GroupDashboardData['group']> = {}): GroupDashboardData {
  return {
    group: {
      id: 'g-1',
      name: 'Lake Tahoe Trip',
      description: 'Ski weekend',
      currency: 'USD',
      isArchived: false,
      inviteCode: 'invite-123',
      members: [{ id: 'u-alice', name: 'Alice' }, { id: 'u-bob', name: 'Bob' }],
      ...overrides,
    },
    expenses: [],
    settlements: [],
    transfers: [],
    ledger: [],
  };
}

describe('/groups/[groupId]', () => {
  it('sends signed-out visitors to sign in and back to this group', async () => {
    vi.mocked(getSignedInUser).mockResolvedValue(null);

    await expect(GroupPage(params('g-1'))).rejects.toThrow('redirect:/login?next=/groups/g-1');
    expect(loadGroupDashboard).not.toHaveBeenCalled();
  });

  it('answers 404 to someone who is not a member, like an unknown group', async () => {
    vi.mocked(getSignedInUser).mockResolvedValue(alice);
    vi.mocked(loadGroupDashboard).mockResolvedValue(null);

    await expect(GroupPage(params('g-1'))).rejects.toThrow('notFound');
    expect(loadGroupDashboard).toHaveBeenCalledWith('u-alice', 'g-1');
  });

  it('shows the group name, its members, the invite code, and a way back to all groups', async () => {
    vi.mocked(getSignedInUser).mockResolvedValue(alice);
    vi.mocked(loadGroupDashboard).mockResolvedValue(dashboard());

    render(await GroupPage(params('g-1')));

    expect(screen.getByRole('heading', { level: 1, name: 'Lake Tahoe Trip' })).toBeInTheDocument();
    expect(screen.getByText('Ski weekend')).toBeInTheDocument();
    expect(screen.getByText('Alice, Bob')).toBeInTheDocument();
    expect(screen.getByText('invite-123')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All groups' })).toHaveAttribute('href', '/groups');
    expect(screen.getByRole('button', { name: 'Add expense' })).toBeInTheDocument();
  });

  it('labels an archived group in text and hides its invite code', async () => {
    vi.mocked(getSignedInUser).mockResolvedValue(alice);
    vi.mocked(loadGroupDashboard).mockResolvedValue(dashboard({ isArchived: true }));

    render(await GroupPage(params('g-1')));

    expect(screen.getByText('Archived: read-only')).toBeInTheDocument();
    expect(screen.queryByText('invite-123')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add expense' })).not.toBeInTheDocument();
  });
});
