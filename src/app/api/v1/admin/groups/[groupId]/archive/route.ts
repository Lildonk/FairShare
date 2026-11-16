import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/current-user';
import { archiveGroup } from '@/lib/db/admin';
import { HttpError, errorResponse } from '@/lib/http/responses';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/v1/admin/groups/:groupId/archive: archives any group and freezes its ledger. ADMIN only
 * (the role is read from the database); the admin need not be a member. Archiving twice changes nothing.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    // The role check comes first, so members learn nothing about which group IDs exist.
    await requireAdmin(request);
    const { groupId } = await params;
    const group = await archiveGroup(groupId);
    if (!group) throw new HttpError(404, 'not_found', 'Group not found.');
    return NextResponse.json({ group });
  } catch (error) {
    return errorResponse(error);
  }
}
