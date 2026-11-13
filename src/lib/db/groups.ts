/** Group reads shared by the group, expense, and settlement routes (Issue #9). */
import type { Group } from '@prisma/client';
import { prisma } from './prisma';

/** A group as listed for one of its members. */
export interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  isArchived: boolean;
  memberCount: number;
}

/** The groups this user belongs to, by name. */
export async function groupsForUser(userId: string): Promise<GroupSummary[]> {
  const groups = await prisma.group.findMany({
    where: { members: { some: { userId } } },
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
  return groups.map(({ _count, ...group }) => ({ ...group, memberCount: _count.members }));
}

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
