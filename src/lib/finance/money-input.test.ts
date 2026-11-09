import { describe, expect, it } from 'vitest';
import { formatCents, parseAmountToCents, parsePercentToBasisPoints } from './money-input';

describe('parseAmountToCents', () => {
  it.each([
    ['120.01', 12001],
    ['120', 12000],
    ['120.5', 12050],
    ['0.01', 1],
    ['$5.00', 500],
    ['  7.25  ', 725],
  ])('parses %j as %i cents without floating-point math', (input, expected) => {
    expect(parseAmountToCents(input)).toBe(expected);
  });

  it.each(['', '   ', 'abc', '1.234', '-5', '1e3', '.5', '5.', '1,000', '$', '12.3.4'])(
    'returns null for invalid amount %j',
    (input) => {
      expect(parseAmountToCents(input)).toBeNull();
    },
  );

  it('returns null when the amount is too large to represent exactly in cents', () => {
    expect(parseAmountToCents('90071992547409.92')).toBeNull();
  });
});

describe('parsePercentToBasisPoints', () => {
  it.each([
    ['33.33', 3333],
    ['50', 5000],
    ['12.5', 1250],
    ['100', 10000],
    ['0', 0],
    [' 25 ', 2500],
  ])('parses %j as %i basis points', (input, expected) => {
    expect(parsePercentToBasisPoints(input)).toBe(expected);
  });

  it.each(['', 'abc', '1.234', '-1', '50%', '.5', '1e2', '1000000000000000'])(
    'returns null for invalid percentage %j',
    (input) => {
      expect(parsePercentToBasisPoints(input)).toBeNull();
    },
  );
});

describe('formatCents', () => {
  it.each([
    [12001, '$120.01'],
    [5, '$0.05'],
    [0, '$0.00'],
    [123456789, '$1,234,567.89'],
    [-150, '-$1.50'],
  ])('formats %i cents as %j', (cents, expected) => {
    expect(formatCents(cents)).toBe(expected);
  });
});
