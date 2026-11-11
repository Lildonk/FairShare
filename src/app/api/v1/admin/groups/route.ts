import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/current-user';
import { prisma } from '@/lib/db/prisma';
import { errorResponse } from '@/lib/http/responses';

export const dynamic = 'force-dynamic';

/** GET /api/v1/admin/groups: every group with member, expense, and dispute counts. ADMIN only. */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const [groups, disputed] = await Promise.all([
      prisma.group.findMany({
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          name: true,
          isArchived: true,
          _count: { select: { members: true, expenses: true } },
        },
      }),
      prisma.expense.groupBy({ by: ['groupId'], where: { isDisputed: true }, _count: { _all: true } }),
    ]);
    const disputedByGroup = new Map(disputed.map((row) => [row.groupId, row._count._all]));

    return NextResponse.json({
      groups: groups.map(({ _count, ...group }) => ({
        ...group,
        memberCount: _count.members,
        expenseCount: _count.expenses,
        disputedExpenseCount: disputedByGroup.get(group.id) ?? 0,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
