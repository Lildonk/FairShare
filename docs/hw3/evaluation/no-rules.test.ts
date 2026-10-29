import { simplifyDebts } from '../generated/no-rules/src/simplifyDebts';
import { runSharedSuite } from './shared-cases';

// Experiment A takes a name → balance record and returns unitless amounts,
// so cents are passed through as plain numbers.
runSharedSuite('no-rules', (balances) =>
  simplifyDebts(Object.fromEntries(balances.map((b) => [b.id, b.netCents]))).map((t) => ({
    from: t.from,
    to: t.to,
    amountCents: t.amount,
  })),
);
