import { NextResponse, type NextRequest } from 'next/server';
import { requireGroupMember } from '@/lib/auth/current-user';
import { prisma } from '@/lib/db/prisma';
import { errorResponse } from '@/lib/http/responses';

export const dynamic = 'force-dynamic';

/** GET /api/v1/groups/:groupId: a group and its members' names, for members only. */
// Next.js 15 passes route params as a promise.
export async function GET(request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { group } = await requireGroupMember(request, (await params).groupId);
    const memberships = await prisma.groupMember.findMany({
      where: { groupId: group.id },
      orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
      select: { user: { select: { id: true, name: true } } },
    });
    return NextResponse.json({
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        currency: group.currency,
        isArchived: group.isArchived,
        members: memberships.map((membership) => membership.user),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
