import { NextResponse, type NextRequest } from 'next/server';
import { validateExpenseInput } from '@/lib/api/expense-input';
import { toExpenseDto } from '@/lib/api/ledger-dto';
import { requireGroupMember } from '@/lib/auth/current-user';
import { groupMemberIds } from '@/lib/db/groups';
import { prisma } from '@/lib/db/prisma';
import { HttpError, errorResponse, readJson } from '@/lib/http/responses';

export const dynamic = 'force-dynamic';

// Next.js 15 passes route params as a promise.
type Context = { params: Promise<{ groupId: string; expenseId: string }> };

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
    const { group } = await requireGroupMember(request, (await params).groupId, { write: true });
    const current = await findExpense(group.id, (await params).expenseId);
    const input = validateExpenseInput(await readJson(request), await groupMemberIds(group.id));
    if (!input.ok) throw new HttpError(400, 'invalid_input', 'Check the highlighted fields.', input.errors);

    const { splits, ...fields } = input.value;
    const expense = await prisma.$transaction(async (tx) => {
      await tx.expenseSplit.deleteMany({ where: { expenseId: current.id } });
      return tx.expense.update({
        where: { id: current.id },
        data: { ...fields, splits: { create: splits } },
        include: { splits: true },
      });
    });
    return NextResponse.json({ expense: toExpenseDto(expense) });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/v1/groups/:groupId/expenses/:expenseId: deletes the expense and its splits. */
export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    const { group } = await requireGroupMember(request, (await params).groupId, { write: true });
    const current = await findExpense(group.id, (await params).expenseId);
    await prisma.$transaction((tx) => tx.expense.delete({ where: { id: current.id } }));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
