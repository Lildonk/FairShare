'use client';

import { useMemo, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check } from 'lucide-react';
import { simplifyDebts, type Transfer } from '@/lib/finance/debt-simplification';
import {
  computeGroupBalances,
  type ExpenseRecord,
  type SettlementRecord,
} from '@/lib/finance/group-balances';
import { formatCents } from '@/lib/finance/money-input';

export interface BoardMember {
  id: string;
  name: string;
}

export interface SettlementBoardData {
  members: BoardMember[];
  expenses: ExpenseRecord[];
  settlements: SettlementRecord[];
}

export interface PaymentRequest {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
}

export type SettlementBoardState =
  | { status: 'loading' }
  | { status: 'error'; message: string; onRetry: () => void }
  | { status: 'ready'; data: SettlementBoardData };

export interface SettlementBoardProps {
  state: SettlementBoardState;
  /** Saves a payment and resolves with the stored settlement (its status decides whether it counts). */
  onRecordPayment: (payment: PaymentRequest) => Promise<SettlementRecord>;
}

/** Group settlement board: loading and error states around the ready view. */
export function SettlementBoard({ state, onRecordPayment }: SettlementBoardProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Settle up</h2>
      {state.status === 'loading' && (
        <p role="status" aria-busy="true" className="text-gray-600">
          Loading balances…
        </p>
      )}
      {state.status === 'error' && (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-red-800">
          <p>Couldn’t load balances: {state.message}</p>
          <button
            type="button"
            onClick={state.onRetry}
            className="mt-2 rounded-md border border-red-400 px-3 py-1 text-sm font-medium hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
          >
            Try again
          </button>
        </div>
      )}
      {state.status === 'ready' && (
        <ReadyBoard data={state.data} onRecordPayment={onRecordPayment} />
      )}
    </div>
  );
}

interface InFlightPayment {
  key: number;
  payment: PaymentRequest;
}

function ReadyBoard({
  data,
  onRecordPayment,
}: {
  data: SettlementBoardData;
  onRecordPayment: SettlementBoardProps['onRecordPayment'];
}) {
  const nextKey = useRef(0);
  const [inFlight, setInFlight] = useState<InFlightPayment[]>([]);
  const [saved, setSaved] = useState<SettlementRecord[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState<string | null>(null);

  const names = useMemo(() => new Map(data.members.map((m) => [m.id, m.name])), [data.members]);
  const nameOf = (id: string) => names.get(id) ?? 'Unknown member';

  // In-flight payments count as confirmed until the server answers (optimistic update).
  const { balances, transfers } = useMemo(() => {
    const settlements: SettlementRecord[] = [
      ...data.settlements,
      ...saved,
      ...inFlight.map(({ payment }) => ({ ...payment, status: 'CONFIRMED' as const })),
    ];
    const computed = computeGroupBalances(
      data.members.map((m) => m.id),
      data.expenses,
      settlements,
    );
    return {
      balances: new Map(computed.map((b) => [b.memberId, b.balanceCents])),
      transfers: simplifyDebts(computed),
    };
  }, [data, saved, inFlight]);

  const recordPayment = async (transfer: Transfer) => {
    const payment: PaymentRequest = {
      fromUserId: transfer.fromMemberId,
      toUserId: transfer.toMemberId,
      amountCents: transfer.amountCents,
    };
    const from = nameOf(payment.fromUserId);
    const to = nameOf(payment.toUserId);
    const key = nextKey.current++;
    setInFlight((current) => [...current, { key, payment }]);
    setNotice(`Recording ${from}’s payment to ${to}…`);

    try {
      const settlement = await onRecordPayment(payment);
      setSaved((current) => [...current, settlement]);
      setError(null);
      setNotice(
        settlement.status === 'CONFIRMED'
          ? `Recorded: ${from} paid ${to} ${formatCents(settlement.amountCents)}.`
          : `${from}’s payment to ${to} is waiting for confirmation.`,
      );
    } catch {
      setError(`Couldn’t record ${from}’s payment to ${to}. Please try again.`);
      setNotice('');
    } finally {
      setInFlight((current) => current.filter((p) => p.key !== key));
    }
  };

  const describeTransfer = (t: Transfer) =>
    `${nameOf(t.fromMemberId)} pays ${nameOf(t.toMemberId)} ${formatCents(t.amountCents)}`;

  return (
    <>
      {error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-red-800">
          {error}
        </p>
      )}
      <p role="status" className="sr-only">
        {notice}
      </p>

      <section aria-labelledby="balances-heading">
        <h3 id="balances-heading" className="text-lg font-medium text-gray-900">
          Balances
        </h3>
        <ul aria-label="Member balances" className="mt-3 flex flex-wrap gap-2">
          {data.members.map((member) => (
            <BalanceChip
              key={member.id}
              name={member.name}
              balanceCents={balances.get(member.id) ?? 0}
            />
          ))}
        </ul>
      </section>

      <section aria-labelledby="transfers-heading">
        <h3 id="transfers-heading" className="text-lg font-medium text-gray-900">
          Suggested transfers
        </h3>
        {data.expenses.length === 0 ? (
          <p className="mt-3 text-gray-600">
            No expenses yet. Add an expense to see who owes whom.
          </p>
        ) : transfers.length === 0 ? (
          <p className="mt-3 flex items-center gap-2 text-gray-700">
            <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            Everyone is settled up.
          </p>
        ) : (
          <ul aria-label="Suggested transfers" className="mt-3 divide-y divide-gray-200 rounded-md border border-gray-200">
            {transfers.map((transfer) => {
              const text = describeTransfer(transfer);
              return (
                <li
                  key={`${transfer.fromMemberId}-${transfer.toMemberId}`}
                  className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span data-testid="transfer-text" className="text-gray-900">
                    {text}
                  </span>
                  <button
                    type="button"
                    aria-label={`Record payment: ${text}`}
                    onClick={() => void recordPayment(transfer)}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                  >
                    Record payment
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

/** A balance chip with a text label, so the meaning never depends on color alone. */
function BalanceChip({ name, balanceCents }: { name: string; balanceCents: number }) {
  if (balanceCents > 0) {
    return (
      <li className="flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-800 ring-1 ring-emerald-600/30">
        <ArrowDownLeft className="h-4 w-4" aria-hidden="true" />
        {`${name}: gets back ${formatCents(balanceCents)}`}
      </li>
    );
  }
  if (balanceCents < 0) {
    return (
      <li className="flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-sm text-red-800 ring-1 ring-red-600/30">
        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        {`${name}: owes ${formatCents(-balanceCents)}`}
      </li>
    );
  }
  return (
    <li className="flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700 ring-1 ring-gray-400/30">
      <Check className="h-4 w-4" aria-hidden="true" />
      {`${name}: settled up`}
    </li>
  );
}
