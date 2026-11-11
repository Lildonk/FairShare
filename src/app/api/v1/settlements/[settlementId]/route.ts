import { NextResponse, type NextRequest } from 'next/server';
import { toSettlementDto } from '@/lib/api/ledger-dto';
import { validateStatusInput } from '@/lib/api/settlement-input';
import { assertGroupWritable, requireUser } from '@/lib/auth/current-user';
import { prisma } from '@/lib/db/prisma';
import { HttpError, errorResponse, readJson } from '@/lib/http/responses';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/v1/settlements/:settlementId: the receiver confirms or disputes a pending payment.
 * Only payments in the caller's own groups are found, so a non-member gets the same 404 as an
 * unknown ID.
 */
export async function PATCH(request: NextRequest, { params }: { params: { settlementId: string } }) {
  try {
    const user = await requireUser(request);
    const settlement = await prisma.settlement.findFirst({
      where: { id: params.settlementId, group: { members: { some: { userId: user.id } } } },
      include: { group: true },
    });
    if (!settlement) throw new HttpError(404, 'not_found', 'Payment not found.');
    assertGroupWritable(settlement.group);
    const input = validateStatusInput(await readJson(request));
    if (!input.ok) throw new HttpError(400, 'invalid_input', 'Check the highlighted fields.', input.errors);
    if (user.id !== settlement.toUserId) {
      throw new HttpError(403, 'forbidden', 'Only the person who received this payment can confirm or dispute it.');
    }

    const { status } = input.value;
    const updated = await prisma.$transaction(async (tx) => {
      // Conditional on PENDING, so two answers at once can't both apply.
      const { count } = await tx.settlement.updateMany({
        where: { id: settlement.id, status: 'PENDING' },
        data: { status, settledAt: status === 'CONFIRMED' ? new Date() : null },
      });
      if (count === 0) {
        throw new HttpError(409, 'settlement_not_pending', 'This payment was already confirmed or disputed.');
      }
      return tx.settlement.findUniqueOrThrow({ where: { id: settlement.id } });
    });
    return NextResponse.json({ settlement: toSettlementDto(updated) });
  } catch (error) {
    return errorResponse(error);
  }
}
