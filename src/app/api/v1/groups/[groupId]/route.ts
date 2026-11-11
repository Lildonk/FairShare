import { NextResponse, type NextRequest } from 'next/server';
import { requireGroupMember } from '@/lib/auth/current-user';
import { groupDetail } from '@/lib/db/groups';
import { errorResponse } from '@/lib/http/responses';

export const dynamic = 'force-dynamic';

/** GET /api/v1/groups/:groupId: a group, its invite code, and its members' names, for members only. */
export async function GET(request: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const { group } = await requireGroupMember(request, params.groupId);
    return NextResponse.json({ group: await groupDetail(group) });
  } catch (error) {
    return errorResponse(error);
  }
}
