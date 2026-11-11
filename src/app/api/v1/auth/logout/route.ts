import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/** POST /api/v1/auth/logout: removes the session cookie. */
export function POST() {
  const response = new NextResponse(null, { status: 204 });
  clearSessionCookie(response);
  return response;
}
