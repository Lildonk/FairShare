import { simplifyDebts } from '../generated/with-rules/src/lib/finance/simplify-debts';
import { runSharedSuite } from './shared-cases';

runSharedSuite('with-rules', (balances) =>
  simplifyDebts(balances.map((b) => ({ memberId: b.id, balanceCents: b.netCents }))).map((t) => ({
    from: t.fromMemberId,
    to: t.toMemberId,
    amountCents: t.amountCents,
  })),
);
