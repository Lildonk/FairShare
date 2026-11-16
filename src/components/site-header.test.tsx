import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SiteHeader } from './site-header';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

describe('SiteHeader', () => {
  it('lets a signed-in member go home, to their groups, or sign out', () => {
    render(<SiteHeader user={{ name: 'Jer', role: 'MEMBER' }} />);

    const nav = screen.getByRole('navigation', { name: 'Account' });
    expect(within(nav).getByRole('link', { name: 'FairShare home' })).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: 'Your groups' })).toHaveAttribute('href', '/groups');
    expect(within(nav).queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
    expect(within(nav).getByText(/Signed in as/)).toHaveTextContent('Signed in as Jer');
    expect(within(nav).getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('adds the admin portal for admins', () => {
    render(<SiteHeader user={{ name: 'Ada', role: 'ADMIN' }} />);

    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
  });
});
