/** Everything the /groups/[groupId] page shows (Issue #7), loaded once on the server for a member. */
import type { LedgerExportRow } from '@/lib/audit/ledger-export';
import { InvalidBalanceError, simplifyDebts, type Transfer } from '@/lib/finance/debt-simplification';
import { computeGroupBalances, type ExpenseRecord, type SettlementRecord } from '@/lib/finance/group-balances';
import { groupDetail } from './groups';
import { ledgerRowsForGroup } from './ledger';
import { prisma } from './prisma';

export interface GroupDashboardData {
  group: Awaited<ReturnType<typeof groupDetail>>;
  expenses: ExpenseRecord[];
  /** Every recorded payment with its ID; only CONFIRMED ones count toward balances. */
  settlements: SettlementRecord[];
  /** The transfers that settle the confirmed balances, for the transaction graph. */
  transfers: Transfer[];
  ledger: LedgerExportRow[];
}

/**
 * The dashboard for `groupId` as `userId` sees it, or null when they aren't a member (or the group
 * doesn't exist), so the page answers both with the same 404.
 */
export async function loadGroupDashboard(userId: string, groupId: string): Promise<GroupDashboardData | null> {
  const membership = await prisma.groupMember.findUnique({
    where: { userId_groupId: { userId, groupId } },
    include: { group: true },
  });
  if (!membership) return null;

  const [group, expenseRows, settlementRows, ledger] = await Promise.all([
    groupDetail(membership.group),
    prisma.expense.findMany({
      where: { groupId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { payerId: true, amountCents: true, splits: { select: { userId: true, owedCents: true } } },
    }),
    prisma.settlement.findMany({
      where: { groupId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, fromUserId: true, toUserId: true, amountCents: true, status: true },
    }),
    ledgerRowsForGroup(groupId),
  ]);

  const expenses: ExpenseRecord[] = expenseRows;
  const settlements: SettlementRecord[] = settlementRows;
  return { group, expenses, settlements, transfers: confirmedTransfers(group.members, expenses, settlements), ledger };
}

/** Records that don't add up give no transfers; the settlement board then shows its own error. */
function confirmedTransfers(
  members: { id: string }[],
  expenses: ExpenseRecord[],
  settlements: SettlementRecord[],
): Transfer[] {
  try {
    return simplifyDebts(computeGroupBalances(members.map((m) => m.id), expenses, settlements));
  } catch (error) {
    if (error instanceof InvalidBalanceError) return [];
    throw error;
  }
}
