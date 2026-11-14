import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';

/**
 * Keeps signed-out visitors off private pages. A convenience for pages only: API routes do their
 * own checks with the guards in src/lib/auth/current-user.ts, against the database. The /admin page
 * checks the role itself, from the database, and tells members it is for admins only (#11).
 */
export async function middleware(request: NextRequest) {
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  const login = new URL('/login', request.url);
  login.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/groups/:path*', '/admin/:path*'],
};
