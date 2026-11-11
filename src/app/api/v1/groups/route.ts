import { NextResponse, type NextRequest } from 'next/server';
import { validateGroupInput } from '@/lib/api/group-input';
import { requireUser } from '@/lib/auth/current-user';
import { groupDetail } from '@/lib/db/groups';
import { prisma } from '@/lib/db/prisma';
import { HttpError, errorResponse, readJson } from '@/lib/http/responses';

export const dynamic = 'force-dynamic';

/** POST /api/v1/groups: creates a group whose only member is the signed-in user. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const input = validateGroupInput(await readJson(request));
    if (!input.ok) throw new HttpError(400, 'invalid_input', 'Check the highlighted fields.', input.errors);

    const group = await prisma.group.create({
      data: { ...input.value, members: { create: { userId: user.id } } },
    });
    return NextResponse.json({ group: await groupDetail(group) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

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
