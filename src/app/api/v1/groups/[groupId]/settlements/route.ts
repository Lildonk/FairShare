import { NextResponse, type NextRequest } from 'next/server';
import { toSettlementDto } from '@/lib/api/ledger-dto';
import { validatePaymentInput } from '@/lib/api/settlement-input';
import { requireGroupMember } from '@/lib/auth/current-user';
import { recordAuditEvent } from '@/lib/db/audit-log';
import { groupMemberIds } from '@/lib/db/groups';
import { prisma } from '@/lib/db/prisma';
import { simplifyDebts } from '@/lib/finance/debt-simplification';
import { computeGroupBalances } from '@/lib/finance/group-balances';
import { HttpError, errorResponse, readJson } from '@/lib/http/responses';

export const dynamic = 'force-dynamic';

// Next.js 15 passes route params as a promise.
type Context = { params: Promise<{ groupId: string }> };

/**
 * GET /api/v1/groups/:groupId/settlements: each member's balance (confirmed payments count, pending
 * and disputed ones don't), the transfers that would settle the group, and every recorded payment.
 */
export async function GET(request: NextRequest, { params }: Context) {
  try {
    const { group } = await requireGroupMember(request, (await params).groupId);
    const [memberIds, expenses, settlements] = await Promise.all([
      groupMemberIds(group.id),
      prisma.expense.findMany({ where: { groupId: group.id }, include: { splits: true } }),
      prisma.settlement.findMany({ where: { groupId: group.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    ]);
    const balances = computeGroupBalances(
      memberIds,
      expenses.map(({ payerId, amountCents, splits }) => ({
        payerId,
        amountCents,
        splits: splits.map(({ userId, owedCents }) => ({ userId, owedCents })),
      })),
      settlements.map(({ fromUserId, toUserId, amountCents, status }) => ({ fromUserId, toUserId, amountCents, status })),
    );
    return NextResponse.json({
      balances: balances.map(({ memberId, balanceCents }) => ({ userId: memberId, balanceCents })),
      transfers: simplifyDebts(balances).map(({ fromMemberId, toMemberId, amountCents }) => ({
        fromUserId: fromMemberId,
        toUserId: toMemberId,
        amountCents,
      })),
      settlements: settlements.map(toSettlementDto),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/v1/groups/:groupId/settlements: records a payment between two members. Only the payer
 * or the receiver may record it. The receiver's word confirms it at once; a payment recorded by the
 * payer stays PENDING until the receiver confirms or disputes it.
 */
export async function POST(request: NextRequest, { params }: Context) {
  try {
    const { user, group } = await requireGroupMember(request, (await params).groupId, { write: true });
    const input = validatePaymentInput(await readJson(request), await groupMemberIds(group.id));
    if (!input.ok) throw new HttpError(400, 'invalid_input', 'Check the highlighted fields.', input.errors);

    const { fromUserId, toUserId } = input.value;
    if (user.id !== fromUserId && user.id !== toUserId) {
      throw new HttpError(403, 'forbidden', 'Only the payer or the receiver can record this payment.');
    }
    const confirmed = user.id === toUserId;
    const settlement = await prisma.$transaction(async (tx) => {
      const created = toSettlementDto(
        await tx.settlement.create({
          data: {
            ...input.value,
            groupId: group.id,
            status: confirmed ? 'CONFIRMED' : 'PENDING',
            settledAt: confirmed ? new Date() : null,
          },
        }),
      );
      await recordAuditEvent(tx, {
        groupId: group.id,
        actorId: user.id,
        action: 'SETTLEMENT_RECORDED',
        entityId: created.id,
        snapshot: created,
      });
      return created;
    });
    return NextResponse.json({ settlement }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
