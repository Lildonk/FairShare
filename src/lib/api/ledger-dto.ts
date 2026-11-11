/** JSON shapes the API returns for expenses and settlements (Issue #9). Pure: no I/O. */
import type { Expense, ExpenseSplit, Settlement } from '@prisma/client';

const byUserId = (a: { userId: string }, b: { userId: string }) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0);

/** An expense with its splits sorted by member ID (ordinal), so the output never depends on row order. */
export function toExpenseDto(expense: Expense & { splits: ExpenseSplit[] }) {
  return {
    id: expense.id,
    groupId: expense.groupId,
    title: expense.title,
    amountCents: expense.amountCents,
    payerId: expense.payerId,
    splitType: expense.splitType,
    category: expense.category,
    isDisputed: expense.isDisputed,
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
    splits: [...expense.splits]
      .sort(byUserId)
      .map(({ userId, owedCents, allocatedBps }) => ({ userId, owedCents, allocatedBps })),
  };
}

export function toSettlementDto(settlement: Settlement) {
  return {
    id: settlement.id,
    groupId: settlement.groupId,
    fromUserId: settlement.fromUserId,
    toUserId: settlement.toUserId,
    amountCents: settlement.amountCents,
    status: settlement.status,
    notes: settlement.notes,
    settledAt: settlement.settledAt?.toISOString() ?? null,
    createdAt: settlement.createdAt.toISOString(),
    updatedAt: settlement.updatedAt.toISOString(),
  };
}
