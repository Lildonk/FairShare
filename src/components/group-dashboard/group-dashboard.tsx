'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { ActivityLedger } from '@/components/activity-ledger/activity-ledger';
import { AddExpenseDialog, type NewExpense } from '@/components/add-expense/add-expense-dialog';
import {
  SettlementBoard,
  type PaymentAnswer,
  type PaymentRequest,
} from '@/components/settlement-board/settlement-board';
import { TransactionGraph } from '@/components/transaction-graph/transaction-graph';
import type { LedgerExportRow } from '@/lib/audit/ledger-export';
import type { Transfer } from '@/lib/finance/debt-simplification';
import type { ExpenseRecord, SettlementRecord } from '@/lib/finance/group-balances';

export interface GroupDashboardProps {
  currentUserId: string;
  group: { id: string; name: string; isArchived: boolean; members: { id: string; name: string }[] };
  expenses: ExpenseRecord[];
  settlements: SettlementRecord[];
  /** Transfers that settle the confirmed balances (from the server), for the graph. */
  transfers: Transfer[];
  ledger: LedgerExportRow[];
}

const CARD = 'rounded-xl border border-gray-200 bg-white p-5 shadow-sm';

/** The API's error message, or a generic one when the body isn't the usual `{ message }`. */
async function errorMessage(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') return body.message;
  return `the server answered ${response.status}.`;
}

async function sendJson(url: string, method: 'POST' | 'PATCH', body: unknown): Promise<Response> {
  return fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

/**
 * The interactive part of /groups/[groupId] (#7, #8): the settlement board, the add-expense
 * dialog, the transaction graph, and the activity ledger, wired to the #9 API. After every saved
 * change the page refetches through `router.refresh()`. Archived groups are read-only.
 */
export function GroupDashboard({ currentUserId, group, expenses, settlements, transfers, ledger }: GroupDashboardProps) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const api = `/api/v1/groups/${group.id}`;
  const readOnly = group.isArchived;

  const addExpense = async (expense: NewExpense) => {
    if (saving.current) return; // one save at a time; the dialog stays open while it runs
    saving.current = true;
    setError(null);
    setNotice('');
    try {
      const response = await sendJson(`${api}/expenses`, 'POST', expense);
      if (!response.ok) {
        setError(`Couldn’t add ${expense.title}: ${await errorMessage(response)}`);
        return;
      }
      setAdding(false);
      setNotice(`Added ${expense.title}.`);
      router.refresh();
    } catch {
      setError(`Couldn’t add ${expense.title}. Check your connection and try again.`);
    } finally {
      saving.current = false;
    }
  };

  const recordPayment = async (payment: PaymentRequest): Promise<SettlementRecord> => {
    const response = await sendJson(`${api}/settlements`, 'POST', payment);
    if (!response.ok) throw new Error(await errorMessage(response));
    const { settlement } = (await response.json()) as { settlement: SettlementRecord };
    router.refresh();
    return settlement;
  };

  const respondToPayment = async (settlementId: string, status: PaymentAnswer): Promise<SettlementRecord> => {
    const response = await sendJson(`/api/v1/settlements/${encodeURIComponent(settlementId)}`, 'PATCH', { status });
    if (!response.ok) throw new Error(await errorMessage(response));
    const { settlement } = (await response.json()) as { settlement: SettlementRecord };
    router.refresh();
    return settlement;
  };

  const toggleDispute = async (expenseId: string, disputed: boolean): Promise<void> => {
    const response = await sendJson(`${api}/expenses/${expenseId}/dispute`, 'PATCH', { disputed });
    if (!response.ok) throw new Error(await errorMessage(response));
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <p role="status" aria-label="Group updates" className="sr-only">
        {notice}
      </p>
      {/* While the dialog is open the page is inert, so its errors show inside the dialog instead. */}
      {error && !adding && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {!readOnly && (
        <div>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setAdding(true);
            }}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add expense
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-label="Balances and payments" className={CARD}>
          <SettlementBoard
            state={{ status: 'ready', data: { members: group.members, expenses, settlements } }}
            currentUserId={currentUserId}
            readOnly={readOnly}
            onRecordPayment={recordPayment}
            onRespondToPayment={respondToPayment}
          />
        </section>
        <section aria-labelledby="graph-heading" className={CARD}>
          <h2 id="graph-heading" className="mb-4 text-xl font-semibold text-gray-900">
            Who pays whom
          </h2>
          <TransactionGraph members={group.members} transfers={transfers} />
        </section>
      </div>

      <section aria-label="Group activity" className={CARD}>
        <ActivityLedger
          state={{ status: 'ready', entries: ledger }}
          readOnly={readOnly}
          onToggleDispute={toggleDispute}
          exportLinks={{ csv: `${api}/export?format=csv`, json: `${api}/export?format=json` }}
        />
      </section>

      {adding && (
        <AddExpenseDialog
          members={group.members}
          currentUserId={currentUserId}
          onSubmit={(expense) => void addExpense(expense)}
          onCancel={() => {
            setError(null);
            setAdding(false);
          }}
          submitError={error}
        />
      )}
    </div>
  );
}
