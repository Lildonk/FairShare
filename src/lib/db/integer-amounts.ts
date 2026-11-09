import { Prisma } from '@prisma/client';

// Columns that hold integer cents or basis points.
const INTEGER_AMOUNT_FIELDS = new Set(['amountCents', 'owedCents', 'allocatedBps']);

// Prisma's atomic number operators, for example { increment: 5 }.
const NUMBER_OPERATORS = ['set', 'increment', 'decrement'] as const;
// The database would round these (integer division turns 100 / 3 into 33), so money math
// happens in src/lib/finance and the result is written with `set`.
const ROUNDING_OPERATORS = ['multiply', 'divide'] as const;

// Parts of a write call that carry values to store. Top-level filters such as `where` are skipped.
const WRITE_PAYLOAD_KEYS = ['data', 'create', 'update'] as const;

/**
 * Throws a Prisma validation error when a write payload holds a non-integer amount.
 * Prisma silently truncates fractional numbers written to Int columns (19.99 is stored as 19),
 * so without this check a cent could be dropped without any error.
 */
export function assertIntegerAmounts(args: unknown): void {
  if (!isPlainObject(args)) return;

  for (const key of WRITE_PAYLOAD_KEYS) {
    if (key in args) checkPayload(args[key], key);
  }
}

function checkPayload(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => checkPayload(item, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (INTEGER_AMOUNT_FIELDS.has(key)) checkAmount(child, childPath);
    else checkPayload(child, childPath);
  }
}

function checkAmount(value: unknown, path: string): void {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Prisma.PrismaClientValidationError(
        `${path} must be a whole number (integer cents or basis points), received ${value}.`,
        { clientVersion: Prisma.prismaVersion.client },
      );
    }
    return;
  }

  if (isPlainObject(value)) {
    for (const operator of ROUNDING_OPERATORS) {
      if (operator in value) {
        throw new Prisma.PrismaClientValidationError(
          `${path}.${operator} is not allowed on amounts because the database would round the result. ` +
            'Calculate the new amount in src/lib/finance and write it with `set`.',
          { clientVersion: Prisma.prismaVersion.client },
        );
      }
    }
    for (const operator of NUMBER_OPERATORS) {
      if (operator in value) checkAmount(value[operator], `${path}.${operator}`);
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
