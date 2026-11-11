import * as client from 'openid-client';
import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as googleCallback } from '@/app/api/v1/auth/google/callback/route';
import { GET as startGoogle } from '@/app/api/v1/auth/google/route';
import { GOOGLE_FLOW_COOKIE } from '@/lib/auth/google';
import { verifySessionToken } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import {
  BASE_URL,
  cleanupTestData,
  createTestUser,
  sessionCookie,
  sessionCookieFrom,
  setCookie,
  testEmail,
  testGoogleSub,
} from '../helpers/auth-helpers';

// Google itself is replaced by this mock; the routes, cookies, and account rules are real.
vi.mock('openid-client', () => ({
  discovery: vi.fn(async () => ({ issuer: 'https://accounts.google.com' })),
  randomPKCECodeVerifier: vi.fn(() => 'verifier-123'),
  calculatePKCECodeChallenge: vi.fn(async () => 'challenge-123'),
  randomState: vi.fn(() => 'state-123'),
  randomNonce: vi.fn(() => 'nonce-123'),
  buildAuthorizationUrl: vi.fn((_config: unknown, parameters: Record<string, string>) => {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, value);
    return url;
  }),
  authorizationCodeGrant: vi.fn(),
}));

interface GoogleClaims {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
}

/** Runs the real start route, then the callback, with Google answering `result`. */
async function signInWithGoogle(result: GoogleClaims | Error, options: { cookie?: string; withFlow?: boolean } = {}) {
  if (result instanceof Error) {
    vi.mocked(client.authorizationCodeGrant).mockRejectedValue(result);
  } else {
    vi.mocked(client.authorizationCodeGrant).mockResolvedValue({
      claims: () => result,
    } as unknown as Awaited<ReturnType<typeof client.authorizationCodeGrant>>);
  }

  const started = await startGoogle(new NextRequest(`${BASE_URL}/api/v1/auth/google`));
  const flow = setCookie(started, GOOGLE_FLOW_COOKIE);
  const state = new URL(started.headers.get('location') ?? '').searchParams.get('state');
  const cookies = [options.withFlow === false ? undefined : `${GOOGLE_FLOW_COOKIE}=${encodeURIComponent(flow?.value ?? '')}`, options.cookie]
    .filter(Boolean)
    .join('; ');

  return googleCallback(
    new NextRequest(`${BASE_URL}/api/v1/auth/google/callback?code=auth-code&state=${state}`, {
      headers: cookies ? { cookie: cookies } : undefined,
    }),
  );
}

function redirectTo(response: Response): URL {
  return new URL(response.headers.get('location') ?? 'about:blank');
}

beforeEach(() => {
  vi.stubEnv('GOOGLE_CLIENT_ID', 'client-id.apps.googleusercontent.com');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'client-secret');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe('GET /api/v1/auth/google', () => {
  it('redirects to Google and keeps the sign-in checks in a short-lived HttpOnly cookie', async () => {
    const response = await startGoogle(new NextRequest(`${BASE_URL}/api/v1/auth/google`));
    const flow = setCookie(response, GOOGLE_FLOW_COOKIE);

    expect(response.status).toBe(307);
    expect(redirectTo(response).origin).toBe('https://accounts.google.com');
    expect(redirectTo(response).searchParams.get('redirect_uri')).toBe(`${BASE_URL}/api/v1/auth/google/callback`);
    expect(flow?.header).toMatch(/HttpOnly/i);
    expect(flow?.header).toMatch(/SameSite=Lax/i);
    expect(flow?.header).toMatch(/Max-Age=600/);
  });

  it('sends people back to the login page when Google sign-in is not configured', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    const response = await startGoogle(new NextRequest(`${BASE_URL}/api/v1/auth/google`));

    expect(redirectTo(response).pathname).toBe('/login');
    expect(redirectTo(response).searchParams.get('error')).toBe('google_unavailable');
    expect(client.discovery).not.toHaveBeenCalled();
  });
  it('sends people back to the login page if the sign-in cannot be started', async () => {
    vi.mocked(client.buildAuthorizationUrl).mockImplementationOnce(() => {
      throw new Error('Google is unreachable');
    });
    const response = await startGoogle(new NextRequest(`${BASE_URL}/api/v1/auth/google`));

    expect(redirectTo(response).searchParams.get('error')).toBe('google_failed');
    expect(setCookie(response, GOOGLE_FLOW_COOKIE)).toBeUndefined();
  });
});

describe('GET /api/v1/auth/google/callback', () => {
  it('creates an account on first Google sign-in and signs the user in', async () => {
    const email = testEmail('Gina');
    const response = await signInWithGoogle({
      sub: testGoogleSub('Gina'),
      email,
      email_verified: true,
      name: 'Gina Lopez',
    });

    expect(redirectTo(response).pathname).toBe('/');
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user).toMatchObject({ googleSub: testGoogleSub('Gina'), passwordHash: null, role: 'MEMBER', name: 'Gina Lopez' });
    expect(await verifySessionToken(sessionCookieFrom(response)?.value)).toEqual({ userId: user.id, role: 'MEMBER' });
  });

  it('signs in a returning Google user without creating a duplicate', async () => {
    const returning = await createTestUser('Greg', { googleSub: testGoogleSub('Greg') });
    const response = await signInWithGoogle({
      sub: testGoogleSub('Greg'),
      email: returning.email,
      email_verified: true,
      name: 'Greg',
    });

    expect(redirectTo(response).pathname).toBe('/');
    expect(await verifySessionToken(sessionCookieFrom(response)?.value)).toEqual({ userId: returning.id, role: 'MEMBER' });
    expect(await prisma.user.count({ where: { googleSub: testGoogleSub('Greg') } })).toBe(1);
  });

  it('does not merge a Google sign-in into an existing password account with the same email', async () => {
    const existing = await createTestUser('Paula', { password: 'correct horse' });
    const response = await signInWithGoogle({
      sub: testGoogleSub('Paula'),
      email: existing.email,
      email_verified: true,
      name: 'Paula',
    });

    expect(redirectTo(response).pathname).toBe('/login');
    expect(redirectTo(response).searchParams.get('error')).toBe('account_exists');
    expect(sessionCookieFrom(response)?.value).toBeFalsy();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: existing.id } })).googleSub).toBeNull();
    expect(await prisma.user.count({ where: { email: existing.email } })).toBe(1);
  });

  it('rejects a Google account whose email is not verified', async () => {
    const email = testEmail('Unverified');
    const response = await signInWithGoogle({
      sub: testGoogleSub('Unverified'),
      email,
      email_verified: false,
      name: 'Unverified',
    });

    expect(redirectTo(response).searchParams.get('error')).toBe('email_unverified');
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it('connects Google to the account that is already signed in', async () => {
    const lin = await createTestUser('Lin', { password: 'correct horse' });
    const response = await signInWithGoogle(
      { sub: testGoogleSub('Lin'), email: 'lin.personal@gmail.com', email_verified: true, name: 'Lin' },
      { cookie: await sessionCookie(lin) },
    );

    expect(redirectTo(response).pathname).toBe('/');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: lin.id } })).googleSub).toBe(testGoogleSub('Lin'));
  });

  it('refuses to connect a Google account that already belongs to someone else', async () => {
    await createTestUser('Owner', { googleSub: testGoogleSub('Shared') });
    const other = await createTestUser('Other', { password: 'correct horse' });
    const response = await signInWithGoogle(
      { sub: testGoogleSub('Shared'), email: 'shared@gmail.com', email_verified: true, name: 'Owner' },
      { cookie: await sessionCookie(other) },
    );

    expect(redirectTo(response).searchParams.get('error')).toBe('google_linked_elsewhere');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).googleSub).toBeNull();
  });

  it('refuses to connect a second Google account to an account that already has one', async () => {
    const owner = await createTestUser('Twice', { googleSub: testGoogleSub('TwiceFirst') });
    const response = await signInWithGoogle(
      { sub: testGoogleSub('TwiceSecond'), email: 'twice.second@gmail.com', email_verified: true, name: 'Twice' },
      { cookie: await sessionCookie(owner) },
    );

    expect(redirectTo(response).searchParams.get('error')).toBe('already_linked_other');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).googleSub).toBe(testGoogleSub('TwiceFirst'));
  });

  it('fails safely when Google rejects the callback', async () => {
    const response = await signInWithGoogle(new Error('unexpected "state" response parameter value'));

    expect(redirectTo(response).pathname).toBe('/login');
    expect(redirectTo(response).searchParams.get('error')).toBe('google_failed');
    expect(sessionCookieFrom(response)?.value).toBeFalsy();
  });

  it('fails safely without the sign-in cookie, and never contacts Google', async () => {
    const response = await signInWithGoogle(
      { sub: testGoogleSub('NoFlow'), email: testEmail('NoFlow'), email_verified: true },
      { withFlow: false },
    );

    expect(redirectTo(response).searchParams.get('error')).toBe('google_failed');
    expect(client.authorizationCodeGrant).not.toHaveBeenCalled();
  });

  it('clears the sign-in cookie once the callback has used it', async () => {
    const response = await signInWithGoogle({
      sub: testGoogleSub('Clear'),
      email: testEmail('Clear'),
      email_verified: true,
      name: 'Clear',
    });

    expect(setCookie(response, GOOGLE_FLOW_COOKIE)?.header).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });
});
