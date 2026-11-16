import { NextResponse, type NextRequest } from 'next/server';
import { validateDisputeInput } from '@/lib/api/ledger-input';
import { toExpenseDto } from '@/lib/api/ledger-dto';
import { requireGroupMember } from '@/lib/auth/current-user';
import { recordAuditEvent } from '@/lib/db/audit-log';
import { prisma } from '@/lib/db/prisma';
import { HttpError, errorResponse, readJson } from '@/lib/http/responses';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/v1/groups/:groupId/expenses/:expenseId/dispute: flags an expense for review, or clears
 * the flag (#8). Any member may do it; the audit event records who. Setting the flag it already has
 * changes nothing and records nothing. Refused with 409 while the group is archived.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string; expenseId: string }> },
) {
  try {
    const { groupId, expenseId } = await params;
    const { user, group } = await requireGroupMember(request, groupId, { write: true });
    const input = validateDisputeInput(await readJson(request));
    if (!input.ok) throw new HttpError(400, 'invalid_input', 'Check the highlighted fields.', input.errors);
    const { disputed } = input.value;

    const expense = await prisma.$transaction(async (tx) => {
      const current = await tx.expense.findFirst({ where: { id: expenseId, groupId: group.id }, include: { splits: true } });
      if (!current) throw new HttpError(404, 'not_found', 'Expense not found.');
      if (current.isDisputed === disputed) return toExpenseDto(current);

      const updated = toExpenseDto(
        await tx.expense.update({ where: { id: current.id }, data: { isDisputed: disputed }, include: { splits: true } }),
      );
      await recordAuditEvent(tx, {
        groupId: group.id,
        actorId: user.id,
        action: disputed ? 'EXPENSE_DISPUTED' : 'EXPENSE_UNDISPUTED',
        entityId: updated.id,
        snapshot: updated,
      });
      return updated;
    });
    return NextResponse.json({ expense });
  } catch (error) {
    return errorResponse(error);
  }
}
