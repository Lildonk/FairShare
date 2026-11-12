import { NextResponse, type NextRequest } from 'next/server';
import { requireGroupMember } from '@/lib/auth/current-user';
import { groupDetail } from '@/lib/db/groups';
import { errorResponse } from '@/lib/http/responses';

export const dynamic = 'force-dynamic';

/** GET /api/v1/groups/:groupId: a group, its invite code, and its members' names, for members only. */
// Next.js 15 passes route params as a promise.
export async function GET(request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { group } = await requireGroupMember(request, (await params).groupId);
    return NextResponse.json({ group: await groupDetail(group) });
  } catch (error) {
    return errorResponse(error);
  }
}
