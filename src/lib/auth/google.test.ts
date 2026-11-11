// @vitest-environment node
import * as client from 'openid-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { finishGoogleSignIn, isGoogleConfigured, startGoogleSignIn } from './google';

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

const REDIRECT_URI = 'http://localhost:3000/api/v1/auth/google/callback';
const flow = { state: 'state-123', nonce: 'nonce-123', codeVerifier: 'verifier-123' };

function grantReturning(claims: Record<string, unknown>) {
  vi.mocked(client.authorizationCodeGrant).mockResolvedValue({
    claims: () => claims,
  } as unknown as Awaited<ReturnType<typeof client.authorizationCodeGrant>>);
}

beforeEach(() => {
  vi.stubEnv('GOOGLE_CLIENT_ID', 'client-id.apps.googleusercontent.com');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'client-secret');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('isGoogleConfigured', () => {
  it('is true only when both the client ID and secret are set', () => {
    expect(isGoogleConfigured()).toBe(true);

    vi.stubEnv('GOOGLE_CLIENT_SECRET', '');
    expect(isGoogleConfigured()).toBe(false);
  });
});

describe('startGoogleSignIn', () => {
  it('asks Google for openid, email, and profile with PKCE, state, and nonce', async () => {
    const { url, flow: started } = await startGoogleSignIn(REDIRECT_URI);

    expect(url.origin).toBe('https://accounts.google.com');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      redirect_uri: REDIRECT_URI,
      scope: 'openid email profile',
      code_challenge: 'challenge-123',
      code_challenge_method: 'S256',
      state: 'state-123',
      nonce: 'nonce-123',
    });
    expect(started).toEqual(flow);
  });
});

describe('finishGoogleSignIn', () => {
  it('checks state, nonce, and PKCE, then returns the verified Google identity', async () => {
    grantReturning({ sub: 'google-1', email: 'Alice@Gmail.com', email_verified: true, name: 'Alice Chen' });
    const callbackUrl = new URL(`${REDIRECT_URI}?code=abc&state=state-123`);

    await expect(finishGoogleSignIn(callbackUrl, flow)).resolves.toEqual({
      sub: 'google-1',
      email: 'alice@gmail.com',
      emailVerified: true,
      name: 'Alice Chen',
    });
    expect(client.authorizationCodeGrant).toHaveBeenCalledWith(
      expect.anything(),
      callbackUrl,
      expect.objectContaining({
        pkceCodeVerifier: 'verifier-123',
        expectedState: 'state-123',
        expectedNonce: 'nonce-123',
        idTokenExpected: true,
      }),
    );
  });

  it('treats a missing email_verified claim as not verified', async () => {
    grantReturning({ sub: 'google-2', email: 'bob@gmail.com', name: 'Bob' });

    await expect(finishGoogleSignIn(new URL(`${REDIRECT_URI}?code=x`), flow)).resolves.toMatchObject({
      emailVerified: false,
    });
  });

  it('fails when Google rejects the callback, for example on a state mismatch', async () => {
    vi.mocked(client.authorizationCodeGrant).mockRejectedValue(new Error('unexpected "state" response parameter value'));

    await expect(finishGoogleSignIn(new URL(`${REDIRECT_URI}?code=x&state=forged`), flow)).rejects.toThrow();
  });

  it('fails when the ID token has no subject or email', async () => {
    grantReturning({ sub: 'google-3', email_verified: true });

    await expect(finishGoogleSignIn(new URL(`${REDIRECT_URI}?code=x`), flow)).rejects.toThrow(/email/i);
  });
});
