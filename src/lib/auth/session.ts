/**
 * Session tokens: a JWT (HS256) in an HttpOnly cookie. Edge-safe (only `jose`), so the page
 * middleware can use it too. The token is never sent in a response body.
 */
import type { Role } from '@prisma/client';
// Deep imports keep jose's JWE (encryption) code out of the Edge middleware bundle.
import { JOSEError } from 'jose/errors';
import { SignJWT } from 'jose/jwt/sign';
import { jwtVerify } from 'jose/jwt/verify';
import type { NextResponse } from 'next/server';

export const SESSION_COOKIE = 'fairshare_session';
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
export const JWT_ISSUER = 'fairshare';
export const JWT_AUDIENCE = 'fairshare-web';

const ROLES: readonly Role[] = ['MEMBER', 'ADMIN'];
const MIN_SECRET_LENGTH = 32;

export interface SessionClaims {
  userId: string;
  role: Role;
}

function signingKey(): Uint8Array {
  const secret = process.env.JWT_SECRET ?? '';
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters.`);
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken({ userId, role }: SessionClaims): Promise<string> {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(signingKey());
}

/** Returns the session for a valid token, or null for a missing, invalid, or expired one. */
export async function verifySessionToken(token: string | undefined): Promise<SessionClaims | null> {
  const key = signingKey();
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    const role = payload.role as Role;
    if (typeof payload.sub !== 'string' || !ROLES.includes(role)) return null;
    return { userId: payload.sub, role };
  } catch (error) {
    if (error instanceof JOSEError) return null;
    throw error;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export async function setSessionCookie(response: NextResponse, user: { id: string; role: Role }): Promise<void> {
  response.cookies.set(
    SESSION_COOKIE,
    await createSessionToken({ userId: user.id, role: user.role }),
    sessionCookieOptions(),
  );
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 });
}
