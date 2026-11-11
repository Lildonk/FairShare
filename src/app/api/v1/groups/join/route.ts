import { NextResponse, type NextRequest } from 'next/server';
import { validateJoinInput } from '@/lib/api/group-input';
import { assertGroupWritable, requireUser } from '@/lib/auth/current-user';
import { groupDetail } from '@/lib/db/groups';
import { prisma } from '@/lib/db/prisma';
import { HttpError, errorResponse, readJson } from '@/lib/http/responses';

export const dynamic = 'force-dynamic';

/** POST /api/v1/groups/join: joins the group with this invite code. Joining twice changes nothing. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const input = validateJoinInput(await readJson(request));
    if (!input.ok) throw new HttpError(400, 'invalid_input', 'Check the highlighted fields.', input.errors);

    const group = await prisma.group.findUnique({ where: { inviteCode: input.value.inviteCode } });
    if (!group) throw new HttpError(404, 'not_found', 'No group has this invite code.');
    assertGroupWritable(group);
    await prisma.groupMember.upsert({
      where: { userId_groupId: { userId: user.id, groupId: group.id } },
      create: { userId: user.id, groupId: group.id },
      update: {},
    });
    return NextResponse.json({ group: await groupDetail(group) });
  } catch (error) {
    return errorResponse(error);
  }
}
