// @vitest-environment node
import { SignJWT, UnsecuredJWT } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  JWT_AUDIENCE,
  JWT_ISSUER,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  sessionCookieOptions,
  verifySessionToken,
} from './session';

const key = () => new TextEncoder().encode(process.env.JWT_SECRET);

function signedToken(claims: Record<string, unknown>, options: { secret?: Uint8Array; expiresAt?: number } = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('user-1')
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt(now - 60)
    .setExpirationTime(options.expiresAt ?? now + 3600)
    .sign(options.secret ?? key());
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('session tokens', () => {
  it('round-trips the user id and role', async () => {
    const token = await createSessionToken({ userId: 'user-1', role: 'ADMIN' });

    expect(await verifySessionToken(token)).toEqual({ userId: 'user-1', role: 'ADMIN' });
  });

  it('returns null for a missing, malformed, or tampered token', async () => {
    const token = await createSessionToken({ userId: 'user-1', role: 'MEMBER' });
    const [header, payload, signature] = token.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ sub: 'user-1', role: 'ADMIN' })).toString('base64url');

    expect(await verifySessionToken(undefined)).toBeNull();
    expect(await verifySessionToken('')).toBeNull();
    expect(await verifySessionToken('not.a.jwt')).toBeNull();
    expect(await verifySessionToken(`${header}.${forgedPayload}.${signature}`)).toBeNull();
    expect(await verifySessionToken(`${header}.${payload}.${signature.slice(0, -2)}xx`)).toBeNull();
  });

  it('returns null for an expired token', async () => {
    const expired = await signedToken({ role: 'MEMBER' }, { expiresAt: Math.floor(Date.now() / 1000) - 10 });

    expect(await verifySessionToken(expired)).toBeNull();
  });

  it('returns null for a token signed with a different secret', async () => {
    const otherSecret = new TextEncoder().encode('a-completely-different-secret-of-32-plus-chars');

    expect(await verifySessionToken(await signedToken({ role: 'ADMIN' }, { secret: otherSecret }))).toBeNull();
  });

  it('returns null for an unsigned token (alg "none")', async () => {
    const unsigned = new UnsecuredJWT({ role: 'ADMIN' })
      .setSubject('user-1')
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setExpirationTime('1h')
      .encode();

    expect(await verifySessionToken(unsigned)).toBeNull();
  });

  it('returns null when the role is not a FairShare role', async () => {
    expect(await verifySessionToken(await signedToken({ role: 'SUPERUSER' }))).toBeNull();
  });

  it('refuses to sign or verify without a JWT_SECRET of at least 32 characters', async () => {
    vi.stubEnv('JWT_SECRET', 'too-short');

    await expect(createSessionToken({ userId: 'user-1', role: 'MEMBER' })).rejects.toThrow(/JWT_SECRET/);
    await expect(verifySessionToken('a.b.c')).rejects.toThrow(/JWT_SECRET/);
  });
});

describe('session cookie options', () => {
  it('uses an HttpOnly, SameSite=Lax cookie for seven days', () => {
    expect(sessionCookieOptions()).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    expect(SESSION_MAX_AGE_SECONDS).toBe(7 * 24 * 60 * 60);
  });

  it('marks the cookie Secure in production', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(sessionCookieOptions().secure).toBe(true);
  });
});
