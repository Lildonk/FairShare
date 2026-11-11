'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { safeNextPath } from '@/lib/auth/redirects';
import { validateLogin } from '@/lib/auth/validation';
import { ErrorSummary } from './error-summary';
import { FormField } from './form-field';
import { GoogleSignInButton } from './google-sign-in-button';
import { postAuthForm } from './post-auth-form';

export interface LoginFormProps {
  /** Where to go after signing in. Anything that is not a path on this site is ignored. */
  next?: string;
  /** An error to show on arrival, such as a failed Google sign-in. */
  errorMessage?: string | null;
}

export function LoginForm({ next, errorMessage = null }: LoginFormProps) {
  const router = useRouter();
  const id = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(errorMessage);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = validateLogin({ email, password });
    if (!input.ok) {
      setFieldErrors(input.errors);
      setFormError(null);
      return;
    }

    setSubmitting(true);
    const error = await postAuthForm('/api/v1/auth/login', input.value);
    setSubmitting(false);
    if (error) {
      setFieldErrors(error.fields);
      setFormError(error.message);
      return;
    }
    router.push(safeNextPath(next));
    router.refresh();
  }

  const messages = [...Object.values(fieldErrors), ...(formError ? [formError] : [])];

  return (
    <div className="space-y-6">
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        <ErrorSummary messages={messages} />
        <FormField
          id={`${id}-email`}
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          error={fieldErrors.email}
        />
        <FormField
          id={`${id}-password`}
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          error={fieldErrors.password}
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-emerald-700 px-4 py-2.5 font-semibold text-white hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {submitting ? 'Signing in…' : 'Sign In'}
        </button>
      </form>

      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span aria-hidden="true" className="h-px flex-1 bg-slate-200" />
        or
        <span aria-hidden="true" className="h-px flex-1 bg-slate-200" />
      </div>
      <GoogleSignInButton />

      <p className="text-center text-sm text-slate-600">
        New to FairShare?{' '}
        <Link href="/register" className="font-semibold text-emerald-700 underline-offset-2 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
