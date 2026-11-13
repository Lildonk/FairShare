import { render, screen } from '@testing-library/react';
import type { User } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { getSignedInUser } from '@/lib/auth/current-user';
import { groupsForUser } from '@/lib/db/groups';
import GroupsPage from './page';

vi.mock('@/lib/auth/current-user', () => ({ getSignedInUser: vi.fn() }));
vi.mock('@/lib/db/groups', () => ({ groupsForUser: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

describe('/groups', () => {
  it('sends signed-out visitors to sign in', async () => {
    vi.mocked(getSignedInUser).mockResolvedValue(null);

    await expect(GroupsPage()).rejects.toThrow('redirect:/login?next=/groups');
    expect(groupsForUser).not.toHaveBeenCalled();
  });

  it('shows the signed-in user’s groups and the create and join forms', async () => {
    vi.mocked(getSignedInUser).mockResolvedValue({ id: 'u-1', name: 'Alice Chen', role: 'MEMBER' } as User);
    vi.mocked(groupsForUser).mockResolvedValue([
      { id: 'g-1', name: 'Lake Tahoe Trip', description: null, currency: 'USD', isArchived: false, memberCount: 4 },
    ]);

    render(await GroupsPage());

    expect(groupsForUser).toHaveBeenCalledWith('u-1');
    expect(screen.getByRole('heading', { level: 1, name: 'Your groups' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lake Tahoe Trip' })).toHaveAttribute('href', '/groups/g-1');
    expect(screen.getByRole('heading', { name: 'Create a group' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Join a group' })).toBeInTheDocument();
  });
});
