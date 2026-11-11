import { NextResponse, type NextRequest } from 'next/server';
import { validateExpenseInput } from '@/lib/api/expense-input';
import { toExpenseDto } from '@/lib/api/ledger-dto';
import { requireGroupMember } from '@/lib/auth/current-user';
import { recordAuditEvent } from '@/lib/db/audit-log';
import { groupMemberIds } from '@/lib/db/groups';
import { prisma } from '@/lib/db/prisma';
import { HttpError, errorResponse, readJson } from '@/lib/http/responses';

export const dynamic = 'force-dynamic';

type Context = { params: { groupId: string; expenseId: string } };

/** Members may change any expense in their group; an expense in another group is not found. */
async function findExpense(groupId: string, expenseId: string) {
  const expense = await prisma.expense.findFirst({ where: { id: expenseId, groupId } });
  if (!expense) throw new HttpError(404, 'not_found', 'Expense not found.');
  return expense;
}

/**
 * PATCH /api/v1/groups/:groupId/expenses/:expenseId: replaces the expense with the full body (same
 * fields and checks as creating one) and replaces its splits. A missing `category` keeps the current one.
 */
export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const { user, group } = await requireGroupMember(request, params.groupId, { write: true });
    const current = await findExpense(group.id, params.expenseId);
    const input = validateExpenseInput(await readJson(request), await groupMemberIds(group.id));
    if (!input.ok) throw new HttpError(400, 'invalid_input', 'Check the highlighted fields.', input.errors);

    const { splits, ...fields } = input.value;
    const expense = await prisma.$transaction(async (tx) => {
      await tx.expenseSplit.deleteMany({ where: { expenseId: current.id } });
      const updated = toExpenseDto(
        await tx.expense.update({
          where: { id: current.id },
          data: { ...fields, splits: { create: splits } },
          include: { splits: true },
        }),
      );
      await recordAuditEvent(tx, {
        groupId: group.id,
        actorId: user.id,
        action: 'EXPENSE_UPDATED',
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

/**
 * DELETE /api/v1/groups/:groupId/expenses/:expenseId: deletes the expense and its splits. The #8
 * audit event keeps the expense as it was, so the history survives the delete.
 */
export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    const { user, group } = await requireGroupMember(request, params.groupId, { write: true });
    const current = await findExpense(group.id, params.expenseId);
    await prisma.$transaction(async (tx) => {
      const before = toExpenseDto(
        await tx.expense.findUniqueOrThrow({ where: { id: current.id }, include: { splits: true } }),
      );
      await tx.expense.delete({ where: { id: current.id } });
      await recordAuditEvent(tx, {
        groupId: group.id,
        actorId: user.id,
        action: 'EXPENSE_DELETED',
        entityId: before.id,
        snapshot: before,
      });
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
