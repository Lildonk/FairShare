/**
 * "Continue with Google" through openid-client (a certified OpenID Connect client): authorization
 * code flow with PKCE, state, and nonce. openid-client validates the ID token's issuer, audience,
 * expiry, and nonce; nothing the browser sends is trusted as identity.
 */
import * as client from 'openid-client';
import { normalizeEmail } from './validation';

export const GOOGLE_FLOW_COOKIE = 'fairshare_google_flow';
export const GOOGLE_FLOW_MAX_AGE_SECONDS = 10 * 60;
export const GOOGLE_CALLBACK_PATH = '/api/v1/auth/google/callback';

const GOOGLE_ISSUER = new URL('https://accounts.google.com');

/** One-time values from the start of a sign-in, checked again in the callback. */
export interface GoogleFlow {
  state: string;
  nonce: string;
  codeVerifier: string;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

let configuration: Promise<client.Configuration> | undefined;

function googleConfiguration(): Promise<client.Configuration> {
  configuration ??= client
    .discovery(GOOGLE_ISSUER, process.env.GOOGLE_CLIENT_ID ?? '', process.env.GOOGLE_CLIENT_SECRET ?? '')
    .catch((error: unknown) => {
      configuration = undefined; // try discovery again on the next sign-in
      throw error;
    });
  return configuration;
}

export async function startGoogleSignIn(redirectUri: string): Promise<{ url: URL; flow: GoogleFlow }> {
  const config = await googleConfiguration();
  const flow: GoogleFlow = {
    state: client.randomState(),
    nonce: client.randomNonce(),
    codeVerifier: client.randomPKCECodeVerifier(),
  };
  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: 'openid email profile',
    code_challenge: await client.calculatePKCECodeChallenge(flow.codeVerifier),
    code_challenge_method: 'S256',
    state: flow.state,
    nonce: flow.nonce,
  });
  return { url, flow };
}

/** Exchanges the callback's code and returns Google's verified identity. Throws on any failure. */
export async function finishGoogleSignIn(callbackUrl: URL, flow: GoogleFlow): Promise<GoogleIdentity> {
  const config = await googleConfiguration();
  const tokens = await client.authorizationCodeGrant(config, callbackUrl, {
    pkceCodeVerifier: flow.codeVerifier,
    expectedState: flow.state,
    expectedNonce: flow.nonce,
    idTokenExpected: true,
  });

  const claims = tokens.claims();
  if (!claims || typeof claims.sub !== 'string' || typeof claims.email !== 'string' || claims.email === '') {
    throw new Error('Google did not return an email address for this account.');
  }
  const email = normalizeEmail(claims.email);
  const name = typeof claims.name === 'string' && claims.name.trim() !== '' ? claims.name.trim() : email.split('@')[0];
  return { sub: claims.sub, email, emailVerified: claims.email_verified === true, name };
}

/** Reads the flow cookie written by the start route; null if it is missing or malformed. */
export function parseGoogleFlow(value: string | undefined): GoogleFlow | null {
  if (!value) return null;
  try {
    const flow: unknown = JSON.parse(value);
    if (typeof flow !== 'object' || flow === null) return null;
    const { state, nonce, codeVerifier } = flow as Record<string, unknown>;
    return typeof state === 'string' && typeof nonce === 'string' && typeof codeVerifier === 'string'
      ? { state, nonce, codeVerifier }
      : null;
  } catch {
    return null;
  }
}

/** The redirect URI registered with Google: APP_URL if set, otherwise this request's origin. */
export function googleRedirectUri(requestUrl: string): string {
  return new URL(GOOGLE_CALLBACK_PATH, process.env.APP_URL || requestUrl).toString();
}
