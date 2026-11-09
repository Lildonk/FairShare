import { randomUUID } from 'node:crypto';
import { inspect } from 'node:util';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { POST as login } from '@/app/api/v1/auth/login/route';
import { POST as logout } from '@/app/api/v1/auth/logout/route';
import { GET as me } from '@/app/api/v1/auth/me/route';
import { POST as register } from '@/app/api/v1/auth/register/route';
import { SESSION_COOKIE, createSessionToken, verifySessionToken } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import {
  cleanupTestData,
  createTestUser,
  jsonRequest,
  sessionCookie,
  sessionCookieFrom,
  testEmail,
  testGoogleSub,
} from '../helpers/auth-helpers';

const SECRETS_PATTERN = /passwordHash|googleSub|\$2[aby]\$/;

function registerRequest(body: unknown) {
  return jsonRequest('/api/v1/auth/register', { method: 'POST', body });
}

function loginRequest(body: unknown) {
  return jsonRequest('/api/v1/auth/login', { method: 'POST', body });
}

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe('POST /api/v1/auth/register', () => {
  it('creates a MEMBER account, signs the user in, and returns no secrets', async () => {
    const email = testEmail('Newbie');
    const response = await register(
      registerRequest({ name: ' New Bie ', email: email.toUpperCase(), password: 'correct horse' }),
    );
    const text = await response.text();
    const body = JSON.parse(text);

    expect(response.status).toBe(201);
    expect(body).toEqual({ user: { id: expect.any(String), email, name: 'New Bie', role: 'MEMBER' } });
    expect(text).not.toMatch(SECRETS_PATTERN);
    expect(text).not.toContain('correct horse');

    const cookie = sessionCookieFrom(response);
    expect(cookie?.header).toMatch(/HttpOnly/i);
    expect(cookie?.header).toMatch(/SameSite=Lax/i);
    expect(cookie?.header).toMatch(/Path=\//);
    expect(text).not.toContain(cookie?.value);
    expect(await verifySessionToken(cookie?.value)).toEqual({ userId: body.user.id, role: 'MEMBER' });

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: body.user.id } });
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });

  it('ignores a role sent by the client', async () => {
    const response = await register(
      registerRequest({ name: 'Mallory', email: testEmail('Mallory'), password: 'correct horse', role: 'ADMIN' }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.user.role).toBe('MEMBER');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: body.user.id } })).role).toBe('MEMBER');
  });

  it('rejects invalid input with a message for each field', async () => {
    const response = await register(registerRequest({ name: '', email: 'nope', password: 'short' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: 'invalid_input',
      message: expect.any(String),
      fields: { name: expect.any(String), email: expect.any(String), password: expect.any(String) },
    });
    expect(sessionCookieFrom(response)).toBeUndefined();
  });

  it('rejects a body that is not JSON', async () => {
    const response = await register(jsonRequest('/api/v1/auth/register', { method: 'POST', rawBody: 'not json' }));

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('invalid_input');
  });

  it('rejects an email that is already registered, ignoring case', async () => {
    const existing = await createTestUser('Taken', { password: 'correct horse' });
    const response = await register(
      registerRequest({ name: 'Copycat', email: existing.email.toUpperCase(), password: 'correct horse' }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('email_taken');
    expect(await prisma.user.count({ where: { email: existing.email } })).toBe(1);
  });
});

describe('POST /api/v1/auth/login', () => {
  it('signs in with the right password', async () => {
    const user = await createTestUser('Login', { password: 'correct horse' });
    const response = await login(loginRequest({ email: ` ${user.email.toUpperCase()} `, password: 'correct horse' }));
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({
      user: { id: user.id, email: user.email, name: 'Login', role: 'MEMBER' },
    });
    expect(text).not.toMatch(SECRETS_PATTERN);
    expect(await verifySessionToken(sessionCookieFrom(response)?.value)).toEqual({
      userId: user.id,
      role: 'MEMBER',
    });
  });

  it('rejects a wrong password with a generic message and sets no cookie', async () => {
    const user = await createTestUser('Wrong', { password: 'correct horse' });
    const response = await login(loginRequest({ email: user.email, password: 'wrong horse' }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      code: 'invalid_credentials',
      message: 'Incorrect email or password.',
    });
    expect(sessionCookieFrom(response)).toBeUndefined();
  });

  it('answers an unknown email exactly like a wrong password', async () => {
    const response = await login(loginRequest({ email: testEmail('Nobody'), password: 'correct horse' }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      code: 'invalid_credentials',
      message: 'Incorrect email or password.',
    });
  });

  it('rejects password sign-in for an account that only uses Google', async () => {
    const user = await createTestUser('GoogleOnly', { googleSub: testGoogleSub('GoogleOnly') });
    const response = await login(loginRequest({ email: user.email, password: 'any password' }));

    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe('invalid_credentials');
  });

  it('rejects a request without an email or password', async () => {
    const response = await login(loginRequest({}));

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('invalid_input');
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('clears the session cookie', async () => {
    const response = await logout();
    const cookie = sessionCookieFrom(response);

    expect(response.status).toBe(204);
    expect(cookie?.value).toBe('');
    expect(cookie?.header).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });
});

describe('GET /api/v1/auth/me', () => {
  it('returns the signed-in user without secrets', async () => {
    const user = await createTestUser('Me', { password: 'correct horse', googleSub: testGoogleSub('Me') });
    const response = await me(jsonRequest('/api/v1/auth/me', { cookie: await sessionCookie(user) }));
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ user: { id: user.id, email: user.email, name: 'Me', role: 'MEMBER' } });
    expect(text).not.toMatch(SECRETS_PATTERN);
  });

  it('returns 401 without a session cookie', async () => {
    const response = await me(jsonRequest('/api/v1/auth/me'));

    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe('unauthorized');
  });

  it('returns 401 for an invalid token', async () => {
    const response = await me(jsonRequest('/api/v1/auth/me', { cookie: `${SESSION_COOKIE}=garbage` }));

    expect(response.status).toBe(401);
  });

  it('returns 401 when the account no longer exists', async () => {
    const token = await createSessionToken({ userId: randomUUID(), role: 'MEMBER' });
    const response = await me(jsonRequest('/api/v1/auth/me', { cookie: `${SESSION_COOKIE}=${token}` }));

    expect(response.status).toBe(401);
  });
});

describe('logging', () => {
  it('never logs passwords, password hashes, or tokens', async () => {
    const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;
    const spies = methods.map((method) => vi.spyOn(console, method).mockImplementation(() => undefined));
    try {
      const email = testEmail('Quiet');
      const registered = await register(registerRequest({ name: 'Quiet', email, password: 'secret horse' }));
      await login(loginRequest({ email, password: 'secret horse' }));
      await login(loginRequest({ email, password: 'wrong horse' }));
      await register(registerRequest({ name: 'Quiet', email, password: 'secret horse' }));

      const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
      const logged = spies
        .flatMap((spy) => spy.mock.calls)
        .map((args) => args.map((arg) => (typeof arg === 'string' ? arg : inspect(arg, { depth: 5 }))).join(' '))
        .join('\n');
      for (const secret of ['secret horse', 'wrong horse', stored.passwordHash, sessionCookieFrom(registered)?.value]) {
        expect(secret).toBeTruthy();
        expect(logged).not.toContain(secret);
      }
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });
});
