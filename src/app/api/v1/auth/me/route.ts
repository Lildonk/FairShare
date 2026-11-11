import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth/current-user';
import { toPublicUser } from '@/lib/auth/public-user';
import { errorResponse } from '@/lib/http/responses';

export const dynamic = 'force-dynamic';

/** GET /api/v1/auth/me: the signed-in user. */
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({ user: toPublicUser(await requireUser(request)) });
  } catch (error) {
    return errorResponse(error);
  }
}
