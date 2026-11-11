import { NextResponse, type NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth/current-user';
import { prisma } from '@/lib/db/prisma';
import { errorResponse } from '@/lib/http/responses';

export const dynamic = 'force-dynamic';

/** GET /api/v1/groups: the groups the signed-in user belongs to. */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const groups = await prisma.group.findMany({
      where: { members: { some: { userId: user.id } } },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        currency: true,
        isArchived: true,
        _count: { select: { members: true } },
      },
    });
    return NextResponse.json({
      groups: groups.map(({ _count, ...group }) => ({ ...group, memberCount: _count.members })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
