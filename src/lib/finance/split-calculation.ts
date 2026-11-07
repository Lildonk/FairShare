/**
 * EQUAL / EXACT / PERCENTAGE split engine (Issue #5).
 *
 * Pure financial computation: no React, Prisma, or I/O. All amounts are integer cents;
 * percentages are integer basis points (10000 = 100%).
 *
 * - EQUAL: floor(total / n) each. Leftover cents all go to the payer when the payer
 *   participates; otherwise one each to participants in memberId ordinal order.
 * - EXACT: entered shares must add up to the total exactly.
 * - PERCENTAGE: basis points must sum to 10000 within PERCENT_TOLERANCE_BPS. Cents are
 *   prorated by basis points (over their actual sum, so the total is always preserved);
 *   leftover cents go by largest remainder, ties by memberId ordinal.
 *
 * Allocations are returned in the order the participants were given.
 */
import { InvalidSplitError } from './itemized-split';
import { formatCents } from './money-input';

export interface ShareAllocation {
  memberId: string;
  owedCents: number;
}

export interface ExactShare {
  memberId: string;
  amountCents: number;
}

export interface PercentageShare {
  memberId: string;
  basisPoints: number;
}

/** 1 basis point = the blueprint's 0.01% input tolerance. */
export const PERCENT_TOLERANCE_BPS = 1;
const FULL_BASIS_POINTS = 10000;

/** Ordinal comparison for IDs already known to be distinct. */
function compareDistinctIds(a: string, b: string): number {
  return a < b ? -1 : 1;
}

function validateTotal(totalCents: number): void {
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    throw new InvalidSplitError('Amount must be a whole number of cents greater than $0.00.');
  }
}

function validateParticipants(participantIds: string[]): void {
  if (participantIds.length === 0) {
    throw new InvalidSplitError('Choose at least one person to split with.');
  }
  const seen = new Set<string>();
  for (const id of participantIds) {
    if (id === '') {
      throw new InvalidSplitError('Participant IDs cannot be empty.');
    }
    if (seen.has(id)) {
      throw new InvalidSplitError(`Participant "${id}" is listed more than once.`);
    }
    seen.add(id);
  }
}

/** Splits the total equally; see the module comment for the leftover-cent rule. */
export function splitEqual(
  totalCents: number,
  participantIds: string[],
  payerId: string,
): ShareAllocation[] {
  validateTotal(totalCents);
  validateParticipants(participantIds);

  const baseShare = Math.floor(totalCents / participantIds.length);
  const leftoverCents = totalCents % participantIds.length;
  const extraCents = new Map<string, number>();
  if (participantIds.includes(payerId)) {
    extraCents.set(payerId, leftoverCents);
  } else {
    [...participantIds]
      .sort(compareDistinctIds)
      .slice(0, leftoverCents)
      .forEach((id) => extraCents.set(id, 1));
  }

  return participantIds.map((memberId) => ({
    memberId,
    owedCents: baseShare + (extraCents.get(memberId) ?? 0),
  }));
}

/** Accepts entered shares only if they add up to the total exactly. */
export function splitExact(totalCents: number, shares: ExactShare[]): ShareAllocation[] {
  validateTotal(totalCents);
  validateParticipants(shares.map((share) => share.memberId));

  let sum = 0;
  for (const share of shares) {
    if (!Number.isSafeInteger(share.amountCents) || share.amountCents < 0) {
      throw new InvalidSplitError(
        `Amount for "${share.memberId}" must be a non-negative whole number of cents.`,
      );
    }
    sum += share.amountCents;
  }
  if (sum !== totalCents) {
    throw new InvalidSplitError(
      `Exact amounts add up to ${formatCents(sum)}, but the expense total is ` +
        `${formatCents(totalCents)}.`,
    );
  }

  return shares.map((share) => ({ memberId: share.memberId, owedCents: share.amountCents }));
}

/** Prorates the total by basis points; see the module comment for the rules. */
export function splitPercentage(
  totalCents: number,
  shares: PercentageShare[],
): ShareAllocation[] {
  validateTotal(totalCents);
  validateParticipants(shares.map((share) => share.memberId));

  let sumBasisPoints = 0;
  for (const share of shares) {
    const bps = share.basisPoints;
    if (!Number.isInteger(bps) || bps < 0 || bps > FULL_BASIS_POINTS) {
      throw new InvalidSplitError(
        `Percentage for "${share.memberId}" must be between 0% and 100% with at most two decimals.`,
      );
    }
    sumBasisPoints += bps;
  }
  if (Math.abs(sumBasisPoints - FULL_BASIS_POINTS) > PERCENT_TOLERANCE_BPS) {
    throw new InvalidSplitError(
      `Percentages add up to ${(sumBasisPoints / 100).toFixed(2)}%; they must total 100% ` +
        '(within 0.01%).',
    );
  }

  const total = BigInt(totalCents);
  const denominator = BigInt(sumBasisPoints);
  const owed: number[] = [];
  const remainders: bigint[] = [];
  for (const share of shares) {
    const product = total * BigInt(share.basisPoints);
    owed.push(Number(product / denominator));
    remainders.push(product % denominator);
  }

  const leftoverCents = totalCents - owed.reduce((sum, cents) => sum + cents, 0);
  const order = shares
    .map((_, index) => index)
    .sort((a, b) => {
      if (remainders[a] !== remainders[b]) return remainders[a] > remainders[b] ? -1 : 1;
      return compareDistinctIds(shares[a].memberId, shares[b].memberId);
    });
  for (let k = 0; k < leftoverCents; k++) {
    owed[order[k]] += 1;
  }

  return shares.map((share, index) => ({ memberId: share.memberId, owedCents: owed[index] }));
}
