'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check } from 'lucide-react';
import {
  InvalidBalanceError,
  simplifyDebts,
  type Transfer,
} from '@/lib/finance/debt-simplification';
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

/** The receiver's answer to a pending payment. */
export type PaymentAnswer = 'CONFIRMED' | 'DISPUTED';

export type SettlementBoardState =
  | { status: 'loading' }
  | { status: 'error'; message: string; onRetry: () => void }
  | { status: 'ready'; data: SettlementBoardData };

export interface SettlementBoardProps {
  state: SettlementBoardState;
  /** The signed-in member. When set, Record payment appears only on transfers they pay or receive. */
  currentUserId?: string;
  /** An archived group: balances and transfers are shown, but no payment can be recorded. */
  readOnly?: boolean;
  /** Saves a payment and resolves with the stored settlement (its status decides whether it counts). */
  onRecordPayment: (payment: PaymentRequest) => Promise<SettlementRecord>;
  /**
   * Saves the receiver's answer to a pending payment and resolves with the updated settlement.
   * Without it, pending payments are listed but can't be answered here.
   */
  onRespondToPayment?: (settlementId: string, status: PaymentAnswer) => Promise<SettlementRecord>;
}

/** Group settlement board: loading and error states around the ready view. */
export function SettlementBoard({
  state,
  currentUserId,
  readOnly = false,
  onRecordPayment,
  onRespondToPayment,
}: SettlementBoardProps) {
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
        <ReadyBoard
          data={state.data}
          currentUserId={currentUserId}
          readOnly={readOnly}
          onRecordPayment={onRecordPayment}
          onRespondToPayment={onRespondToPayment}
        />
      )}
    </div>
  );
}

interface InFlightPayment {
  key: number;
  payment: PaymentRequest;
}

/** A settlement saved from this board, and the data it was saved on top of. */
interface SavedPayment {
  basis: SettlementBoardData;
  settlement: SettlementRecord;
}

function ReadyBoard({
  data,
  currentUserId,
  readOnly,
  onRecordPayment,
  onRespondToPayment,
}: {
  data: SettlementBoardData;
  currentUserId: string | undefined;
  readOnly: boolean;
  onRecordPayment: SettlementBoardProps['onRecordPayment'];
  onRespondToPayment: SettlementBoardProps['onRespondToPayment'];
}) {
  const headingId = useId();
  const balancesHeadingId = `${headingId}-balances`;
  const transfersHeadingId = `${headingId}-transfers`;
  const pendingHeadingId = `${headingId}-pending`;
  const nextKey = useRef(0);
  const [inFlight, setInFlight] = useState<InFlightPayment[]>([]);
  const [saved, setSaved] = useState<SavedPayment[]>([]);
  // Answers saved from this board, by settlement ID. They apply while the data still says PENDING.
  const [answered, setAnswered] = useState<ReadonlyMap<string, PaymentAnswer>>(new Map());
  const answering = useRef(false);
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  // The data the board shows right now, read when a save finishes.
  const dataRef = useRef(data);
  dataRef.current = data;
  const [notice, setNotice] = useState('');
  const [error, setError] = useState<string | null>(null);

  const names = useMemo(() => new Map(data.members.map((m) => [m.id, m.name])), [data.members]);
  const nameOf = (id: string) => names.get(id) ?? 'Unknown member';

  // In-flight payments count as confirmed until the server answers (optimistic update).
  // A saved payment with an ID counts until refreshed data includes that ID, so it is never counted
  // twice and never dropped by a refetch that started before the save. Without an ID, it counts only
  // on top of the data it was saved against.
  // Inconsistent records give null, so the board shows an error instead of crashing.
  const computed = useMemo(() => {
    const storedIds = new Set(data.settlements.map((s) => s.id).filter((id) => id !== undefined));
    const stillLocal = ({ basis, settlement }: SavedPayment) =>
      settlement.id === undefined ? basis === data : !storedIds.has(settlement.id);
    const withAnswer = (s: SettlementRecord): SettlementRecord => {
      const answer = s.id === undefined ? undefined : answered.get(s.id);
      return answer && s.status === 'PENDING' ? { ...s, status: answer } : s;
    };
    const recorded = [...data.settlements, ...saved.filter(stillLocal).map((entry) => entry.settlement)].map(withAnswer);
    const settlements: SettlementRecord[] = [
      ...recorded,
      ...inFlight.map(({ payment }) => ({ ...payment, status: 'CONFIRMED' as const })),
    ];
    try {
      const memberBalances = computeGroupBalances(
        data.members.map((m) => m.id),
        data.expenses,
        settlements,
      );
      return {
        balances: new Map(memberBalances.map((b) => [b.memberId, b.balanceCents])),
        transfers: simplifyDebts(memberBalances),
        pending: recorded.filter((s): s is SettlementRecord & { id: string } => s.status === 'PENDING' && s.id !== undefined),
      };
    } catch (err) {
      if (err instanceof InvalidBalanceError) return null;
      throw err;
    }
  }, [data, saved, inFlight, answered]);

  const recordPayment = async (transfer: Transfer) => {
    const payment: PaymentRequest = {
      fromUserId: transfer.fromMemberId,
      toUserId: transfer.toMemberId,
      amountCents: transfer.amountCents,
    };
    const from = nameOf(payment.fromUserId);
    const to = nameOf(payment.toUserId);
    const key = nextKey.current++;
    const basis = dataRef.current;
    setInFlight((current) => [...current, { key, payment }]);
    setNotice(`Recording ${from}’s payment to ${to}…`);

    try {
      const settlement = await onRecordPayment(payment);
      setSaved((current) => [...current, { basis, settlement }]);
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

  const describePayment = (s: SettlementRecord) =>
    `${nameOf(s.fromUserId)} paid ${nameOf(s.toUserId)} ${formatCents(s.amountCents)}`;

  const respond = async (settlement: SettlementRecord & { id: string }, status: PaymentAnswer) => {
    if (!onRespondToPayment || answering.current) return; // one answer at a time
    answering.current = true;
    setAnsweringId(settlement.id);
    const text = describePayment(settlement);
    try {
      await onRespondToPayment(settlement.id, status);
      setAnswered((current) => new Map(current).set(settlement.id, status));
      setError(null);
      setNotice(`${status === 'CONFIRMED' ? 'Confirmed' : 'Disputed'}: ${text}.`);
    } catch {
      const verb = status === 'CONFIRMED' ? 'confirm' : 'dispute';
      setError(`Couldn’t ${verb} ${nameOf(settlement.fromUserId)}’s payment to ${nameOf(settlement.toUserId)}. Please try again.`);
      setNotice('');
    } finally {
      answering.current = false;
      setAnsweringId(null);
    }
  };

  const canAnswer = (s: SettlementRecord) => !readOnly && !!onRespondToPayment && currentUserId === s.toUserId;

  const canRecord = (t: Transfer) =>
    !readOnly && (currentUserId === undefined || currentUserId === t.fromMemberId || currentUserId === t.toMemberId);

  const describeTransfer = (t: Transfer) =>
    `${nameOf(t.fromMemberId)} pays ${nameOf(t.toMemberId)} ${formatCents(t.amountCents)}`;

  if (computed === null) {
    return (
      <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-red-800">
        Couldn’t calculate balances because some records don’t add up. Please refresh, or ask an
        admin to check this group.
      </p>
    );
  }
  const { balances, transfers, pending } = computed;

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

      <section aria-labelledby={balancesHeadingId}>
        <h3 id={balancesHeadingId} className="text-lg font-medium text-gray-900">
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

      <section aria-labelledby={transfersHeadingId}>
        <h3 id={transfersHeadingId} className="text-lg font-medium text-gray-900">
          Suggested transfers
        </h3>
        {readOnly && (
          <p className="mt-1 text-sm text-gray-600">This group is archived, so payments can’t be recorded.</p>
        )}
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
                  {canRecord(transfer) && (
                    <button
                      type="button"
                      aria-label={`Record payment: ${text}`}
                      onClick={() => void recordPayment(transfer)}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                    >
                      Record payment
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {pending.length > 0 && (
        <section aria-labelledby={pendingHeadingId}>
          <h3 id={pendingHeadingId} className="text-lg font-medium text-gray-900">
            Waiting for confirmation
          </h3>
          <ul
            aria-label="Payments waiting for confirmation"
            className="mt-3 divide-y divide-gray-200 rounded-md border border-amber-300 bg-amber-50"
          >
            {pending.map((settlement) => {
              const text = describePayment(settlement);
              const busy = answeringId === settlement.id;
              return (
                <li key={settlement.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <span data-testid="pending-text" className="text-gray-900">
                    {`${text}. Waiting for ${nameOf(settlement.toUserId)} to confirm.`}
                  </span>
                  {canAnswer(settlement) && (
                    <span className="flex gap-2">
                      <button
                        type="button"
                        aria-label={`Confirm payment: ${text}`}
                        aria-disabled={busy || undefined}
                        onClick={() => void respond(settlement, 'CONFIRMED')}
                        className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 aria-disabled:opacity-60"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        aria-label={`Dispute payment: ${text}`}
                        aria-disabled={busy || undefined}
                        onClick={() => void respond(settlement, 'DISPUTED')}
                        className="rounded-md border border-red-400 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 aria-disabled:opacity-60"
                      >
                        Dispute
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
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
