'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { ALERT, BUTTON, FIELD_ERROR, INPUT, LABEL, STATUS } from './form-styles';

/** Creates a group through POST /api/v1/groups and shows its invite code (#50). */
export function CreateGroupForm() {
  const router = useRouter();
  const id = useId();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return; // aria-disabled keeps focus on the button, so repeats are blocked here
    setSubmitting(true);
    setFieldErrors({});
    setNotice('');
    setError(null);
    try {
      const response = await fetch('/api/v1/groups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 400 && body.fields) {
        setFieldErrors(body.fields);
        return;
      }
      if (!response.ok) throw new Error(`Create failed with HTTP ${response.status}`);
      setNotice(`Created ${body.group.name}. Share the invite code ${body.group.inviteCode} so others can join.`);
      setName('');
      setDescription('');
      router.refresh();
    } catch {
      setError('Couldn’t create the group. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const describedBy = (field: string) => (fieldErrors[field] ? `${id}-${field}-error` : undefined);

  return (
    <form noValidate onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor={`${id}-name`} className={LABEL}>
          Group name
        </label>
        <input
          id={`${id}-name`}
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
          aria-invalid={fieldErrors.name ? true : undefined}
          aria-describedby={describedBy('name')}
          className={INPUT}
        />
        {fieldErrors.name && (
          <p id={`${id}-name-error`} className={FIELD_ERROR}>
            {fieldErrors.name}
          </p>
        )}
      </div>
      <div>
        <label htmlFor={`${id}-description`} className={LABEL}>
          Description (optional)
        </label>
        <input
          id={`${id}-description`}
          name="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          autoComplete="off"
          aria-invalid={fieldErrors.description ? true : undefined}
          aria-describedby={describedBy('description')}
          className={INPUT}
        />
        {fieldErrors.description && (
          <p id={`${id}-description-error`} className={FIELD_ERROR}>
            {fieldErrors.description}
          </p>
        )}
      </div>
      <button type="submit" aria-disabled={submitting} className={BUTTON}>
        Create group
      </button>
      <p role="status" className={STATUS}>
        {notice}
      </p>
      {error && (
        <p role="alert" className={ALERT}>
          {error}
        </p>
      )}
    </form>
  );
}
