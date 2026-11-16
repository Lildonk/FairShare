/** A group's ledger as rows for the activity view and the CSV/JSON export (Issue #8). */
import type { LedgerExportRow } from '@/lib/audit/ledger-export';
import { prisma } from './prisma';

/** Every expense and recorded payment in the group, with member names, in no particular order. */
export async function ledgerRowsForGroup(groupId: string): Promise<LedgerExportRow[]> {
  const [expenses, settlements] = await Promise.all([
    prisma.expense.findMany({
      where: { groupId },
      select: { id: true, title: true, amountCents: true, isDisputed: true, createdAt: true, payer: { select: { name: true } } },
    }),
    prisma.settlement.findMany({
      where: { groupId },
      select: {
        id: true,
        amountCents: true,
        status: true,
        notes: true,
        createdAt: true,
        fromUser: { select: { name: true } },
        toUser: { select: { name: true } },
      },
    }),
  ]);
  return [
    ...expenses.map(
      (e): LedgerExportRow => ({
        id: e.id,
        occurredAt: e.createdAt.toISOString(),
        type: 'EXPENSE',
        description: e.title,
        fromName: e.payer.name,
        toName: '',
        amountCents: e.amountCents,
        status: e.isDisputed ? 'DISPUTED' : 'ACTIVE',
      }),
    ),
    ...settlements.map(
      (s): LedgerExportRow => ({
        id: s.id,
        occurredAt: s.createdAt.toISOString(),
        type: 'SETTLEMENT',
        description: s.notes?.trim() || 'Payment',
        fromName: s.fromUser.name,
        toName: s.toUser.name,
        amountCents: s.amountCents,
        status: s.status,
      }),
    ),
  ];
}
