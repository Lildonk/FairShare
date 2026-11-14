import { render, screen } from '@testing-library/react';
import type { User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSignedInUser } from '@/lib/auth/current-user';
import { adminGroupOverview, disputedExpenses } from '@/lib/db/admin';
import AdminPage from './page';

vi.mock('@/lib/auth/current-user', () => ({ getSignedInUser: vi.fn() }));
vi.mock('@/lib/db/admin', () => ({ adminGroupOverview: vi.fn(), disputedExpenses: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

const user = (role: 'MEMBER' | 'ADMIN') => ({ id: 'u-1', name: 'Bob Smith', role }) as User;

beforeEach(() => {
  vi.mocked(adminGroupOverview).mockReset().mockResolvedValue([
    { id: 'g-1', name: 'Lake Tahoe Trip', isArchived: false, memberCount: 4, expenseCount: 6, disputedExpenseCount: 1 },
  ]);
  vi.mocked(disputedExpenses).mockReset().mockResolvedValue([]);
});

describe('/admin', () => {
  it('sends signed-out visitors to sign in', async () => {
    vi.mocked(getSignedInUser).mockResolvedValue(null);

    await expect(AdminPage()).rejects.toThrow('redirect:/login?next=/admin');
  });

  it('tells a member it is for admins only, without loading any admin data', async () => {
    vi.mocked(getSignedInUser).mockResolvedValue(user('MEMBER'));

    render(await AdminPage());

    expect(screen.getByRole('heading', { level: 1, name: 'Admins only' })).toBeInTheDocument();
    expect(adminGroupOverview).not.toHaveBeenCalled();
    expect(disputedExpenses).not.toHaveBeenCalled();
  });

  it('shows an admin every group and the disputed expenses', async () => {
    vi.mocked(getSignedInUser).mockResolvedValue(user('ADMIN'));

    render(await AdminPage());

    expect(screen.getByRole('heading', { level: 1, name: 'Admin' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Groups' })).toHaveTextContent('Lake Tahoe Trip');
    expect(screen.getByText('No disputed expenses.')).toBeInTheDocument();
  });
});
