import { NextResponse, type NextRequest } from 'next/server';
import { validateExpenseInput } from '@/lib/api/expense-input';
import { toExpenseDto } from '@/lib/api/ledger-dto';
import { requireGroupMember } from '@/lib/auth/current-user';
import { recordAuditEvent } from '@/lib/db/audit-log';
import { groupMemberIds } from '@/lib/db/groups';
import { prisma } from '@/lib/db/prisma';
import { HttpError, errorResponse, readJson } from '@/lib/http/responses';

export const dynamic = 'force-dynamic';

type Context = { params: { groupId: string } };

/** GET /api/v1/groups/:groupId/expenses: the group's expenses, oldest first. Members only. */
export async function GET(request: NextRequest, { params }: Context) {
  try {
    const { group } = await requireGroupMember(request, params.groupId);
    const expenses = await prisma.expense.findMany({
      where: { groupId: group.id },
      include: { splits: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return NextResponse.json({ expenses: expenses.map(toExpenseDto) });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/v1/groups/:groupId/expenses: adds an expense. The shares are checked against the amount
 * and, for EQUAL and PERCENTAGE, against the finance engines. Refused for archived groups.
 */
export async function POST(request: NextRequest, { params }: Context) {
  try {
    const { user, group } = await requireGroupMember(request, params.groupId, { write: true });
    const input = validateExpenseInput(await readJson(request), await groupMemberIds(group.id));
    if (!input.ok) throw new HttpError(400, 'invalid_input', 'Check the highlighted fields.', input.errors);

    const { splits, ...fields } = input.value;
    // The expense and its #8 audit event are saved together or not at all.
    const expense = await prisma.$transaction(async (tx) => {
      const created = toExpenseDto(
        await tx.expense.create({
          data: { ...fields, groupId: group.id, splits: { create: splits } },
          include: { splits: true },
        }),
      );
      await recordAuditEvent(tx, {
        groupId: group.id,
        actorId: user.id,
        action: 'EXPENSE_CREATED',
        entityId: created.id,
        snapshot: created,
      });
      return created;
    });
    return NextResponse.json({ expense }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
