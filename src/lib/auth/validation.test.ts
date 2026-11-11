// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { normalizeEmail, validateLogin, validateRegistration } from './validation';

describe('validateRegistration', () => {
  it('accepts a valid registration, trimming the name and normalizing the email', () => {
    expect(
      validateRegistration({ name: '  Alice Chen ', email: ' Alice@Example.COM ', password: 'correct horse' }),
    ).toEqual({
      ok: true,
      value: { name: 'Alice Chen', email: 'alice@example.com', password: 'correct horse' },
    });
  });

  it('ignores fields the client may not set, such as role', () => {
    const result = validateRegistration({
      name: 'Mallory',
      email: 'mallory@example.com',
      password: 'long enough',
      role: 'ADMIN',
    });

    expect(result).toEqual({
      ok: true,
      value: { name: 'Mallory', email: 'mallory@example.com', password: 'long enough' },
    });
  });

  it('reports every invalid field with a readable message', () => {
    expect(validateRegistration({ name: ' ', email: 'not-an-email', password: 'short' })).toEqual({
      ok: false,
      errors: {
        name: expect.any(String),
        email: expect.any(String),
        password: expect.any(String),
      },
    });
  });

  it('rejects passwords over the 72-byte bcrypt limit instead of silently truncating them', () => {
    const tooLong = 'é'.repeat(37); // 74 bytes in UTF-8
    const result = validateRegistration({ name: 'A', email: 'a@example.com', password: tooLong });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.password).toMatch(/72/);
  });

  it('accepts a password of exactly 72 bytes', () => {
    const result = validateRegistration({ name: 'A', email: 'a@example.com', password: 'x'.repeat(72) });

    expect(result.ok).toBe(true);
  });

  it('rejects names longer than 100 characters', () => {
    const result = validateRegistration({ name: 'n'.repeat(101), email: 'a@example.com', password: 'long enough' });

    expect(!result.ok && result.errors.name).toBeTruthy();
  });

  it('rejects a body that is not a JSON object', () => {
    for (const body of [null, undefined, 'text', 42, []]) {
      expect(validateRegistration(body).ok, JSON.stringify(body)).toBe(false);
    }
  });
});

describe('validateLogin', () => {
  it('normalizes the email and keeps the password exactly as typed', () => {
    expect(validateLogin({ email: ' Bob@Example.com', password: '  spaced  ' })).toEqual({
      ok: true,
      value: { email: 'bob@example.com', password: '  spaced  ' },
    });
  });

  it('requires both an email and a password', () => {
    expect(validateLogin({})).toEqual({
      ok: false,
      errors: { email: expect.any(String), password: expect.any(String) },
    });
  });
});

describe('normalizeEmail', () => {
  it('trims and lowercases the address', () => {
    expect(normalizeEmail('  Dana@FairShare.TEST ')).toBe('dana@fairshare.test');
  });
});
