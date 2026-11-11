import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignOutButton } from './sign-out-button';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SignOutButton', () => {
  it('signs out, then sends the user to the home page', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 204 } as Response);
    render(<SignOutButton />);

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/auth/logout', expect.objectContaining({ method: 'POST' }));
    expect(push).toHaveBeenCalledWith('/');
    expect(refresh).toHaveBeenCalled();
  });
});
