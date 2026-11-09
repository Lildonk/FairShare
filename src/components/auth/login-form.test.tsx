import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from './login-form';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

async function fillAndSubmit(email: string, password: string) {
  await userEvent.type(screen.getByLabelText('Email'), email);
  await userEvent.type(screen.getByLabelText('Password'), password);
  await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));
}

afterEach(() => {
  vi.restoreAllMocks();
  push.mockClear();
  refresh.mockClear();
});

describe('LoginForm', () => {
  it('has labelled email and password fields and a Continue with Google link', () => {
    render(<LoginForm />);

    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByRole('link', { name: /continue with google/i })).toHaveAttribute(
      'href',
      '/api/v1/auth/google',
    );
  });

  it('shows accessible errors and does not contact the server when fields are empty', async () => {
    const fetchSpy = mockFetch(200, {});
    render(<LoginForm />);

    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/enter your email/i);
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(/enter your email/i);
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('signs in and continues to the page the user asked for', async () => {
    const fetchSpy = mockFetch(200, { user: { id: 'user-1' } });
    render(<LoginForm next="/groups/123" />);

    await fillAndSubmit('alice@example.com', 'correct horse');

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'alice@example.com', password: 'correct horse' }),
      }),
    );
    expect(push).toHaveBeenCalledWith('/groups/123');
    expect(refresh).toHaveBeenCalled();
  });

  it('never redirects to another site after signing in', async () => {
    mockFetch(200, { user: { id: 'user-1' } });
    render(<LoginForm next="https://evil.example" />);

    await fillAndSubmit('alice@example.com', 'correct horse');

    expect(push).toHaveBeenCalledWith('/');
  });

  it('shows the server message when the email or password is wrong', async () => {
    mockFetch(401, { code: 'invalid_credentials', message: 'Incorrect email or password.' });
    render(<LoginForm />);

    await fillAndSubmit('alice@example.com', 'wrong horse');

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
    expect(push).not.toHaveBeenCalled();
  });

  it('tells the user when the server cannot be reached', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    render(<LoginForm />);

    await fillAndSubmit('alice@example.com', 'correct horse');

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t reach fairshare/i);
  });

  it('shows a sign-in error passed from the login page, such as a failed Google sign-in', () => {
    render(<LoginForm errorMessage="Google sign-in didn't complete. Please try again." />);

    expect(screen.getByRole('alert')).toHaveTextContent("Google sign-in didn't complete");
  });
});
