import { NextResponse, type NextRequest } from 'next/server';
import { validateSplitRequest, type SplitRequest } from '@/lib/api/calculator-input';
import { InvalidSplitError, splitItemized } from '@/lib/finance/itemized-split';
import { splitEqual, splitExact, splitPercentage } from '@/lib/finance/split-calculation';
import { HttpError, errorResponse, readJson } from '@/lib/http/responses';

export const dynamic = 'force-dynamic';

interface Allocation {
  memberId: string;
  owedCents: number;
  /** ITEMIZED only: the member's items, and their share of tax, service, and tip. */
  itemsCents?: number;
  extrasCents?: number;
}

function allocate(input: SplitRequest): Allocation[] {
  switch (input.splitType) {
    case 'EQUAL':
      return splitEqual(input.totalCents, input.participantIds, input.payerId);
    case 'EXACT':
      return splitExact(input.totalCents, input.shares);
    case 'PERCENTAGE':
      return splitPercentage(input.totalCents, input.shares);
    case 'ITEMIZED': {
      const { items, taxCents, serviceCents, tipCents, totalCents } = input;
      return splitItemized({ items, taxCents, serviceCents, tipCents, totalCents }).map((a) => ({
        memberId: a.memberId,
        owedCents: a.totalCents,
        itemsCents: a.itemsCents,
        extrasCents: a.extrasCents,
      }));
    }
  }
}

/**
 * POST /api/v1/split/calculate: public and stateless. Splits a total in integer cents with the same
 * engines the app uses (EQUAL, EXACT, PERCENTAGE in basis points, or ITEMIZED with tax and tip).
 * The allocations always add up to the total exactly.
 */
export async function POST(request: NextRequest) {
  try {
    const input = validateSplitRequest(await readJson(request));
    if (!input.ok) throw new HttpError(400, 'invalid_input', 'Check the highlighted fields.', input.errors);

    let allocations: Allocation[];
    try {
      allocations = allocate(input.value);
    } catch (error) {
      if (error instanceof InvalidSplitError) throw new HttpError(400, 'invalid_input', error.message);
      throw error;
    }
    // Ordinal order, so the answer never depends on input order or locale.
    allocations.sort((a, b) => (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0));
    return NextResponse.json({ splitType: input.value.splitType, totalCents: input.value.totalCents, allocations });
  } catch (error) {
    return errorResponse(error);
  }
}
