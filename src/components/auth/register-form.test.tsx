import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RegisterForm } from './register-form';

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

async function fillAndSubmit(name: string, email: string, password: string) {
  if (name) await userEvent.type(screen.getByLabelText('Name'), name);
  if (email) await userEvent.type(screen.getByLabelText('Email'), email);
  if (password) await userEvent.type(screen.getByLabelText('Password'), password);
  await userEvent.click(screen.getByRole('button', { name: 'Create Account' }));
}

afterEach(() => {
  vi.restoreAllMocks();
  push.mockClear();
  refresh.mockClear();
});

describe('RegisterForm', () => {
  it('has labelled name, email, and password fields with the right autofill hints', () => {
    render(<RegisterForm />);

    expect(screen.getByLabelText('Name')).toHaveAttribute('autocomplete', 'name');
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(/at least 8 characters/i);
  });

  it('checks the fields before sending anything', async () => {
    const fetchSpy = mockFetch(201, {});
    render(<RegisterForm />);

    await fillAndSubmit('Alice', 'alice@example.com', 'short');

    expect(screen.getByRole('alert')).toHaveTextContent(/at least 8 characters/i);
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('creates the account and goes to the home page', async () => {
    const fetchSpy = mockFetch(201, { user: { id: 'user-1' } });
    render(<RegisterForm />);

    await fillAndSubmit('Alice Chen', 'alice@example.com', 'correct horse');

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/auth/register',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Alice Chen', email: 'alice@example.com', password: 'correct horse' }),
      }),
    );
    expect(push).toHaveBeenCalledWith('/');
    expect(refresh).toHaveBeenCalled();
  });

  it('shows a taken email next to the email field', async () => {
    mockFetch(409, { code: 'email_taken', message: 'An account with this email already exists.' });
    render(<RegisterForm />);

    await fillAndSubmit('Alice', 'alice@example.com', 'correct horse');

    expect(await screen.findByRole('alert')).toHaveTextContent('An account with this email already exists.');
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(push).not.toHaveBeenCalled();
  });
});
