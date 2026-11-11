import { NextResponse, type NextRequest } from 'next/server';
import {
  GOOGLE_FLOW_COOKIE,
  GOOGLE_FLOW_MAX_AGE_SECONDS,
  googleRedirectUri,
  isGoogleConfigured,
  startGoogleSignIn,
} from '@/lib/auth/google';
import { logSafely, redirectToLogin } from '@/lib/http/responses';

export const dynamic = 'force-dynamic';

/** GET /api/v1/auth/google: sends the browser to Google's sign-in page. */
export async function GET(request: NextRequest) {
  if (!isGoogleConfigured()) return redirectToLogin(request, 'google_unavailable');

  try {
    const { url, flow } = await startGoogleSignIn(googleRedirectUri(request.url));
    const response = NextResponse.redirect(url);
    response.cookies.set(GOOGLE_FLOW_COOKIE, JSON.stringify(flow), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/v1/auth/google',
      maxAge: GOOGLE_FLOW_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    logSafely('Could not start Google sign-in', error);
    return redirectToLogin(request, 'google_failed');
  }
}
