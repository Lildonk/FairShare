import { NextResponse, type NextRequest } from 'next/server';
import { validateSimplifyRequest } from '@/lib/api/calculator-input';
import { InvalidBalanceError, computeNetBalances, simplifyDebts, type LedgerEntry } from '@/lib/finance/debt-simplification';
import { HttpError, errorResponse, readJson } from '@/lib/http/responses';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/simplify: public and stateless. Turns raw debts into net balances and the transfers
 * that settle them. It reads no database, session, or cookie, so it can't reveal any group's data.
 */
export async function POST(request: NextRequest) {
  try {
    const input = validateSimplifyRequest(await readJson(request));
    if (!input.ok) throw new HttpError(400, 'invalid_input', 'Check the highlighted fields.', input.errors);

    // "A owes B 10" is the same as B paying 10 on A's behalf.
    const entries = input.value.debts.flatMap(({ fromMemberId, toMemberId, amountCents }): LedgerEntry[] => [
      { memberId: toMemberId, paidCents: amountCents, owedCents: 0 },
      { memberId: fromMemberId, paidCents: 0, owedCents: amountCents },
    ]);
    try {
      const balances = computeNetBalances(entries);
      return NextResponse.json({ balances, transfers: simplifyDebts(balances) });
    } catch (error) {
      if (error instanceof InvalidBalanceError) throw new HttpError(400, 'invalid_input', error.message);
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}
