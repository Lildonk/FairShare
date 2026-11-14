'use client';

import { useRef, useState } from 'react';
import type { AdminGroup, DisputedExpense } from '@/lib/db/admin';
import { formatCents } from '@/lib/finance/money-input';

export interface AdminPortalProps {
  groups: AdminGroup[];
  disputes: DisputedExpense[];
}

const BUTTON =
  'rounded-md border px-3 py-1.5 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 aria-disabled:cursor-not-allowed aria-disabled:opacity-60';

/** The admin portal (#11): every group with an Archive action, and the disputed expenses. */
export function AdminPortal({ groups: initialGroups, disputes }: AdminPortalProps) {
  const [groups, setGroups] = useState(initialGroups);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Which control should take focus when it next mounts, so keyboard users never land on <body>.
  const focusNext = useRef<string | null>(null);
  const focusOnMount = (key: string) => (element: HTMLButtonElement | null) => {
    if (element && focusNext.current === key) {
      focusNext.current = null;
      element.focus();
    }
  };

  const ask = (group: AdminGroup) => {
    setError(null);
    focusNext.current = `confirm-${group.id}`;
    setConfirming(group.id);
  };

  const cancel = (group: AdminGroup) => {
    focusNext.current = `archive-${group.id}`;
    setConfirming(null);
  };

  const archive = async (group: AdminGroup) => {
    if (archiving) return; // aria-disabled keeps focus, so the click handler blocks repeats instead
    setArchiving(group.id);
    setError(null);
    setNotice('');
    try {
      const response = await fetch(`/api/v1/admin/groups/${group.id}/archive`, { method: 'PATCH' });
      if (!response.ok) throw new Error(`Archive failed with HTTP ${response.status}`);
      setGroups((current) => current.map((g) => (g.id === group.id ? { ...g, isArchived: true } : g)));
      setNotice(`Archived ${group.name}. Its expenses and payments can no longer change.`);
    } catch {
      setError(`Couldn’t archive ${group.name}. Please try again.`);
      focusNext.current = `archive-${group.id}`;
    } finally {
      setArchiving(null);
      setConfirming(null);
    }
  };

  return (
    <div className="mt-8 space-y-10">
      <section aria-labelledby="admin-groups-heading" className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 id="admin-groups-heading" className="text-lg font-semibold text-gray-900">
          Groups
        </h2>
        <p role="status" className="mt-2 min-h-5 text-sm text-emerald-800">
          {notice}
        </p>
        {error && (
          <p role="alert" className="mt-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}
        <div className="mt-3 overflow-x-auto">
          <table aria-labelledby="admin-groups-heading" className="w-full min-w-[36rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th scope="col" className="py-2 pr-4 font-medium">Group</th>
                <th scope="col" className="py-2 pr-4 font-medium">Members</th>
                <th scope="col" className="py-2 pr-4 font-medium">Expenses</th>
                <th scope="col" className="py-2 pr-4 font-medium">Disputed</th>
                <th scope="col" className="py-2 pr-4 font-medium">Status</th>
                <th scope="col" className="py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {groups.map((group) => (
                <tr key={group.id}>
                  <th scope="row" className="py-3 pr-4 font-medium text-gray-900">
                    {group.name}
                  </th>
                  <td className="py-3 pr-4">{group.memberCount}</td>
                  <td className="py-3 pr-4">{group.expenseCount}</td>
                  <td className="py-3 pr-4">{group.disputedExpenseCount}</td>
                  <td className="py-3 pr-4">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        group.isArchived ? 'bg-gray-200 text-gray-800' : 'bg-emerald-50 text-emerald-800'
                      }`}
                    >
                      {group.isArchived ? 'Archived' : 'Active'}
                    </span>
                  </td>
                  <td className="py-3">
                    {group.isArchived ? null : confirming === group.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-gray-700">Freeze its ledger?</span>
                        <button
                          type="button"
                          ref={focusOnMount(`confirm-${group.id}`)}
                          aria-label={`Confirm archiving ${group.name}`}
                          aria-disabled={archiving === group.id}
                          onClick={() => void archive(group)}
                          className={`${BUTTON} border-red-700 bg-red-700 text-white hover:bg-red-800 focus-visible:ring-red-700`}
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          aria-label={`Cancel archiving ${group.name}`}
                          aria-disabled={archiving === group.id}
                          onClick={() => archiving !== group.id && cancel(group)}
                          className={`${BUTTON} border-gray-300 text-gray-800 hover:bg-gray-50 focus-visible:ring-gray-700`}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        ref={focusOnMount(`archive-${group.id}`)}
                        aria-label={`Archive ${group.name}`}
                        onClick={() => ask(group)}
                        className={`${BUTTON} border-gray-300 text-gray-800 hover:bg-gray-50 focus-visible:ring-gray-700`}
                      >
                        Archive
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="admin-disputes-heading" className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 id="admin-disputes-heading" className="text-lg font-semibold text-gray-900">
          Disputed expenses
        </h2>
        {disputes.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">No disputed expenses.</p>
        ) : (
          <ul aria-label="Disputed expenses" className="mt-3 divide-y divide-gray-100 text-sm">
            {disputes.map((expense) => (
              <li key={expense.id} className="py-3">
                <span className="font-medium text-gray-900">{expense.title}</span>
                <span className="text-gray-700">
                  {' '}
                  · {formatCents(expense.amountCents)}, paid by {expense.payerName} in {expense.groupName} on{' '}
                  {expense.createdAt.slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
