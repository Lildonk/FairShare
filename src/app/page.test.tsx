import { render, screen } from '@testing-library/react';
import type { User } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { getSignedInUser } from '@/lib/auth/current-user';
import HomePage from './page';

vi.mock('@/lib/auth/current-user', () => ({ getSignedInUser: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const user = (role: 'MEMBER' | 'ADMIN') => ({ id: 'u-1', name: 'Jer', role }) as User;

describe('home page', () => {
  it('offers sign-in and registration when signed out', async () => {
    vi.mocked(getSignedInUser).mockResolvedValue(null);

    render(await HomePage());

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/register');
    expect(screen.queryByRole('link', { name: 'Your groups' })).not.toBeInTheDocument();
  });

  it('links a signed-in member to their groups, and not to the admin portal', async () => {
    vi.mocked(getSignedInUser).mockResolvedValue(user('MEMBER'));

    render(await HomePage());

    expect(screen.getByText(/Signed in as/)).toHaveTextContent('Signed in as Jer');
    expect(screen.getByRole('link', { name: 'Your groups' })).toHaveAttribute('href', '/groups');
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('also links an admin to the admin portal', async () => {
    vi.mocked(getSignedInUser).mockResolvedValue(user('ADMIN'));

    render(await HomePage());

    expect(screen.getByRole('link', { name: 'Your groups' })).toHaveAttribute('href', '/groups');
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
  });
});
