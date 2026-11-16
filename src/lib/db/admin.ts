/**
 * Platform-wide reads and writes for the admin portal (Issue #11). Callers must check the ADMIN role
 * first: these functions see every group.
 */
import { prisma } from './prisma';

export interface AdminGroup {
  id: string;
  name: string;
  isArchived: boolean;
  memberCount: number;
  expenseCount: number;
  disputedExpenseCount: number;
}

export interface DisputedExpense {
  id: string;
  title: string;
  amountCents: number;
  groupId: string;
  groupName: string;
  payerName: string;
  /** ISO 8601. */
  createdAt: string;
}

const groupWithCounts = {
  id: true,
  name: true,
  isArchived: true,
  _count: { select: { members: true, expenses: true } },
} as const;

type GroupWithCounts = { id: string; name: string; isArchived: boolean; _count: { members: number; expenses: number } };

async function disputedCounts(groupIds?: string[]): Promise<Map<string, number>> {
  const rows = await prisma.expense.groupBy({
    by: ['groupId'],
    where: { isDisputed: true, ...(groupIds ? { groupId: { in: groupIds } } : {}) },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.groupId, row._count._all]));
}

function toAdminGroup({ _count, ...group }: GroupWithCounts, disputed: Map<string, number>): AdminGroup {
  return {
    ...group,
    memberCount: _count.members,
    expenseCount: _count.expenses,
    disputedExpenseCount: disputed.get(group.id) ?? 0,
  };
}

/** Every group, by name, with member, expense, and dispute counts. */
export async function adminGroupOverview(): Promise<AdminGroup[]> {
  const [groups, disputed] = await Promise.all([
    prisma.group.findMany({ orderBy: [{ name: 'asc' }, { id: 'asc' }], select: groupWithCounts }),
    disputedCounts(),
  ]);
  return groups.map((group) => toAdminGroup(group, disputed));
}

/**
 * Archives a group, which freezes its ledger (every write then answers 409). Archiving twice changes
 * nothing. Returns the group's overview, or null if there is no such group.
 */
export async function archiveGroup(groupId: string): Promise<AdminGroup | null> {
  const { count } = await prisma.group.updateMany({ where: { id: groupId }, data: { isArchived: true } });
  if (count === 0) return null;
  const group = await prisma.group.findUniqueOrThrow({ where: { id: groupId }, select: groupWithCounts });
  return toAdminGroup(group, await disputedCounts([groupId]));
}

/** Disputed expenses from every group, newest first. */
export async function disputedExpenses(): Promise<DisputedExpense[]> {
  const expenses = await prisma.expense.findMany({
    where: { isDisputed: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    select: {
      id: true,
      title: true,
      amountCents: true,
      groupId: true,
      createdAt: true,
      group: { select: { name: true } },
      payer: { select: { name: true } },
    },
  });
  return expenses.map(({ group, payer, createdAt, ...expense }) => ({
    ...expense,
    groupName: group.name,
    payerName: payer.name,
    createdAt: createdAt.toISOString(),
  }));
}
