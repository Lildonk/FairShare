// @vitest-environment node
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { assertIntegerAmounts } from './integer-amounts';

describe('assertIntegerAmounts', () => {
  it('accepts whole-number amounts, nulls, and unrelated fields', () => {
    expect(() =>
      assertIntegerAmounts({
        data: { title: '19.99', amountCents: 1999, allocatedBps: null, receiptUrl: undefined },
      }),
    ).not.toThrow();
  });

  it('rejects a fractional amount with a Prisma validation error that names the field', () => {
    const write = () => assertIntegerAmounts({ data: { amountCents: 19.99 } });

    expect(write).toThrow(Prisma.PrismaClientValidationError);
    expect(write).toThrow(/data\.amountCents.*19\.99/);
  });

  it('rejects unsafe integers, NaN, and Infinity', () => {
    for (const amountCents of [2 ** 53, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => assertIntegerAmounts({ data: { amountCents } }), String(amountCents)).toThrow(
        Prisma.PrismaClientValidationError,
      );
    }
  });

  it('checks nested relation writes and createMany arrays', () => {
    expect(() =>
      assertIntegerAmounts({
        data: {
          amountCents: 3000,
          splits: {
            create: [
              { userId: 'alice', owedCents: 1500 },
              { userId: 'bob', owedCents: 1500.5 },
            ],
          },
        },
      }),
    ).toThrow(/data\.splits\.create\[1\]\.owedCents/);

    expect(() => assertIntegerAmounts({ data: [{ owedCents: 100 }, { owedCents: 0.5 }] })).toThrow(
      /data\[1\]\.owedCents/,
    );
  });

  it('checks numeric update operators such as increment', () => {
    expect(() => assertIntegerAmounts({ data: { amountCents: { set: 100 } } })).not.toThrow();
    expect(() => assertIntegerAmounts({ data: { amountCents: { increment: 0.5 } } })).toThrow(
      /data\.amountCents\.increment/,
    );
  });

  it('checks both the create and update branches of an upsert', () => {
    expect(() =>
      assertIntegerAmounts({
        where: { id: 'settlement-1' },
        create: { amountCents: 100 },
        update: { amountCents: 1.5 },
      }),
    ).toThrow(/update\.amountCents/);
  });

  it('ignores amounts used only as query filters', () => {
    expect(() =>
      assertIntegerAmounts({ where: { amountCents: { gt: 0.5 } }, data: { title: 'Dinner' } }),
    ).not.toThrow();
  });
});
