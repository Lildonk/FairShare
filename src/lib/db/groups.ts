/** Group reads shared by the group, expense, and settlement routes (Issue #9). */
import type { Group } from '@prisma/client';
import { prisma } from './prisma';

/** The IDs of a group's members. */
export async function groupMemberIds(groupId: string): Promise<string[]> {
  const members = await prisma.groupMember.findMany({ where: { groupId }, select: { userId: true } });
  return members.map((m) => m.userId);
}

/** What a member sees of a group: its details, invite code, and members' names (no emails), in join order. */
export async function groupDetail(group: Group) {
  const memberships = await prisma.groupMember.findMany({
    where: { groupId: group.id },
    orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
    select: { user: { select: { id: true, name: true } } },
  });
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    currency: group.currency,
    isArchived: group.isArchived,
    inviteCode: group.inviteCode,
    members: memberships.map((membership) => membership.user),
  };
}
