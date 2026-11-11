import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/auth/current-user';
import {
  GOOGLE_FLOW_COOKIE,
  finishGoogleSignIn,
  googleRedirectUri,
  isGoogleConfigured,
  parseGoogleFlow,
} from '@/lib/auth/google';
import { resolveGoogleSignIn } from '@/lib/auth/google-account';
import { setSessionCookie } from '@/lib/auth/session';
import { logSafely, redirectToLogin } from '@/lib/http/responses';

export const dynamic = 'force-dynamic';

async function completeSignIn(request: NextRequest): Promise<NextResponse> {
  const flow = parseGoogleFlow(request.cookies.get(GOOGLE_FLOW_COOKIE)?.value);
  if (!flow || !isGoogleConfigured()) return redirectToLogin(request, 'google_failed');

  try {
    // Rebuild the callback URL from the registered redirect URI so it matches what Google expects.
    const callbackUrl = new URL(googleRedirectUri(request.url));
    callbackUrl.search = request.nextUrl.search;

    const identity = await finishGoogleSignIn(callbackUrl, flow);
    const result = await resolveGoogleSignIn(identity, await getSessionUser(request));
    if (!result.ok) return redirectToLogin(request, result.reason);

    const response = NextResponse.redirect(new URL('/', request.url));
    await setSessionCookie(response, result.user);
    return response;
  } catch (error) {
    logSafely('Google sign-in failed', error);
    return redirectToLogin(request, 'google_failed');
  }
}

/** GET /api/v1/auth/google/callback: Google sends the browser back here after sign-in. */
export async function GET(request: NextRequest) {
  const response = await completeSignIn(request);
  // The flow values are single-use.
  response.cookies.set(GOOGLE_FLOW_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/api/v1/auth/google', maxAge: 0 });
  return response;
}
