'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { formatCents } from '@/lib/finance/money-input';
import {
  buildExpenseDraft,
  shareField,
  type BasicSplitMode,
  type ExpenseFormState,
  type FieldKey,
  type GroupMemberOption,
  type NewExpense,
} from './expense-draft';

export type { GroupMemberOption, NewExpense } from './expense-draft';

export interface AddExpenseDialogProps {
  members: GroupMemberOption[];
  /** Default payer. */
  currentUserId: string;
  onSubmit: (expense: NewExpense) => void;
  onCancel: () => void;
}

const SPLIT_MODES: { value: BasicSplitMode; label: string }[] = [
  { value: 'EQUAL', label: 'Equal' },
  { value: 'EXACT', label: 'Exact' },
  { value: 'PERCENTAGE', label: 'Percentage' },
];

const inputClass =
  'mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ' +
  'aria-[invalid=true]:border-red-600';

/** Modal form for adding an EQUAL, EXACT, or PERCENTAGE expense with a live preview. */
export function AddExpenseDialog({
  members,
  currentUserId,
  onSubmit,
  onCancel,
}: AddExpenseDialogProps) {
  const id = useId();
  const descriptionRef = useRef<HTMLInputElement>(null);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState<ExpenseFormState>(() => ({
    description: '',
    amount: '',
    payerId: currentUserId,
    splitType: 'EQUAL',
    participantIds: members.map((m) => m.id),
    exactInputs: {},
    percentInputs: {},
  }));
  const draft = useMemo(() => buildExpenseDraft(form, members), [form, members]);

  useEffect(() => {
    descriptionRef.current?.focus();
  }, []);

  const update = (changes: Partial<ExpenseFormState>) =>
    setForm((current) => ({ ...current, ...changes }));

  const errorFor = (field: FieldKey) =>
    submitted ? draft.errors.find((e) => e.field === field)?.message : undefined;
  const errorId = (field: FieldKey) => `${id}-${field}-error`;
  const invalidProps = (field: FieldKey) => {
    const message = errorFor(field);
    return message
      ? { 'aria-invalid': true as const, 'aria-describedby': errorId(field) }
      : { 'aria-invalid': false as const };
  };
  const ErrorText = ({ field }: { field: FieldKey }) => {
    const message = errorFor(field);
    return message ? (
      <p id={errorId(field)} className="mt-1 text-sm text-red-700">
        {message}
      </p>
    ) : null;
  };

  const toggleParticipant = (memberId: string) => {
    const included = form.participantIds.includes(memberId);
    update({
      participantIds: members
        .map((m) => m.id)
        .filter((mId) => (mId === memberId ? !included : form.participantIds.includes(mId))),
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (draft.expense) {
      onSubmit(draft.expense);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
    }
  };

  const titleId = `${id}-title`;
  const modeLabelId = `${id}-mode`;
  const showErrors = submitted && draft.errors.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
      >
        <form noValidate onSubmit={handleSubmit} className="space-y-5">
          <h2 id={titleId} className="text-xl font-semibold text-gray-900">
            Add expense
          </h2>

          {showErrors && (
            <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm">
              <p className="font-medium text-red-800">Please fix the following:</p>
              <ul className="mt-1 list-disc pl-5 text-red-700">
                {draft.errors.map((e) => (
                  <li key={e.field}>{e.message}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <label htmlFor={`${id}-description`} className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <input
              ref={descriptionRef}
              id={`${id}-description`}
              type="text"
              value={form.description}
              onChange={(e) => update({ description: e.target.value })}
              className={inputClass}
              {...invalidProps('description')}
            />
            <ErrorText field="description" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-amount`} className="block text-sm font-medium text-gray-700">
                Amount
              </label>
              <input
                id={`${id}-amount`}
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => update({ amount: e.target.value })}
                className={inputClass}
                {...invalidProps('amount')}
              />
              <ErrorText field="amount" />
            </div>
            <div>
              <label htmlFor={`${id}-payer`} className="block text-sm font-medium text-gray-700">
                Paid by
              </label>
              <select
                id={`${id}-payer`}
                value={form.payerId}
                onChange={(e) => update({ payerId: e.target.value })}
                className={inputClass}
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div role="radiogroup" aria-labelledby={modeLabelId}>
            <span id={modeLabelId} className="block text-sm font-medium text-gray-700">
              Split type
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {SPLIT_MODES.map((mode) => (
                <label
                  key={mode.value}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-600"
                >
                  <input
                    type="radio"
                    name={`${id}-split-type`}
                    value={mode.value}
                    checked={form.splitType === mode.value}
                    onChange={() => update({ splitType: mode.value })}
                    className="accent-emerald-600"
                  />
                  {mode.label}
                </label>
              ))}
            </div>
          </div>

          <fieldset {...invalidProps('participants')}>
            <legend className="text-sm font-medium text-gray-700">Split among</legend>
            <ul className="mt-2 space-y-2">
              {members.map((member) => {
                const included = form.participantIds.includes(member.id);
                const field = shareField(member.id);
                const isExact = form.splitType === 'EXACT';
                const shareLabel = `${isExact ? 'Amount' : 'Percentage'} for ${member.name}`;
                const inputs = isExact ? form.exactInputs : form.percentInputs;
                return (
                  <li key={member.id} className="flex flex-wrap items-center gap-3">
                    <label className="flex min-w-[8rem] items-center gap-2 text-gray-900">
                      <input
                        type="checkbox"
                        checked={included}
                        onChange={() => toggleParticipant(member.id)}
                        className="h-4 w-4 accent-emerald-600"
                      />
                      {member.name}
                    </label>
                    {included && form.splitType !== 'EQUAL' && (
                      <div className="flex-1">
                        <label htmlFor={`${id}-${field}`} className="sr-only">
                          {shareLabel}
                        </label>
                        <div className="flex items-center gap-1">
                          {isExact && <span aria-hidden="true">$</span>}
                          <input
                            id={`${id}-${field}`}
                            type="text"
                            inputMode="decimal"
                            placeholder={isExact ? '0.00' : '0'}
                            value={inputs[member.id] ?? ''}
                            onChange={(e) =>
                              update(
                                isExact
                                  ? { exactInputs: { ...form.exactInputs, [member.id]: e.target.value } }
                                  : {
                                      percentInputs: {
                                        ...form.percentInputs,
                                        [member.id]: e.target.value,
                                      },
                                    },
                              )
                            }
                            className={`${inputClass} mt-0 max-w-[8rem]`}
                            {...invalidProps(field)}
                          />
                          {!isExact && <span aria-hidden="true">%</span>}
                        </div>
                        <ErrorText field={field} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <ErrorText field="participants" />
          </fieldset>

          <section aria-labelledby={`${id}-preview`} className="rounded-md bg-gray-50 p-4">
            <h3 id={`${id}-preview`} className="text-sm font-medium text-gray-700">
              Preview
            </h3>
            <ul aria-label="Allocation preview" className="mt-2 space-y-1 text-gray-900">
              {draft.rows.map((row) => (
                <li key={row.memberId}>
                  {`${row.label}: ${row.owedCents === null ? '—' : formatCents(row.owedCents)}`}
                </li>
              ))}
            </ul>
            <p role="status" className="mt-2 text-sm text-gray-700">
              {draft.status}
            </p>
          </section>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
            >
              Add expense
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
