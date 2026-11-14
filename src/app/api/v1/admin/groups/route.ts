import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/current-user';
import { adminGroupOverview } from '@/lib/db/admin';
import { errorResponse } from '@/lib/http/responses';

export const dynamic = 'force-dynamic';

/** GET /api/v1/admin/groups: every group with member, expense, and dispute counts. ADMIN only. */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    return NextResponse.json({ groups: await adminGroupOverview() });
  } catch (error) {
    return errorResponse(error);
  }
}
