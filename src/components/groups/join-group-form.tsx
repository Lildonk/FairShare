'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { ALERT, BUTTON, FIELD_ERROR, INPUT, LABEL, STATUS } from './form-styles';

const EMPTY_CODE = 'Enter the invite code you were given.';

/** Joins a group through POST /api/v1/groups/join with an invite code (#50). */
export function JoinGroupForm() {
  const router = useRouter();
  const id = useId();
  const [inviteCode, setInviteCode] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const code = inviteCode.trim();
    setNotice('');
    setError(null);
    if (!code) {
      setFieldError(EMPTY_CODE);
      return;
    }
    setFieldError(null);
    setSubmitting(true);
    try {
      const response = await fetch('/api/v1/groups/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ inviteCode: code }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 404) {
        setError('No group has this invite code. Check it and try again.');
      } else if (response.status === 409) {
        setError('That group is archived, so it can’t take new members.');
      } else if (response.status === 400 && body.fields?.inviteCode) {
        setFieldError(body.fields.inviteCode);
      } else if (!response.ok) {
        throw new Error(`Join failed with HTTP ${response.status}`);
      } else {
        setNotice(`Joined ${body.group.name}.`);
        setInviteCode('');
        router.refresh();
      }
    } catch {
      setError('Couldn’t join the group. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form noValidate onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor={`${id}-code`} className={LABEL}>
          Invite code
        </label>
        <input
          id={`${id}-code`}
          name="inviteCode"
          value={inviteCode}
          onChange={(event) => setInviteCode(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? `${id}-code-error` : undefined}
          className={INPUT}
        />
        {fieldError && (
          <p id={`${id}-code-error`} className={FIELD_ERROR}>
            {fieldError}
          </p>
        )}
      </div>
      <button type="submit" aria-disabled={submitting} className={BUTTON}>
        Join group
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
