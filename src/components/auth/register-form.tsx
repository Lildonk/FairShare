'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { validateRegistration } from '@/lib/auth/validation';
import { ErrorSummary } from './error-summary';
import { FormField } from './form-field';
import { GoogleSignInButton } from './google-sign-in-button';
import { postAuthForm } from './post-auth-form';

export function RegisterForm() {
  const router = useRouter();
  const id = useId();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = validateRegistration({ name, email, password });
    if (!input.ok) {
      setFieldErrors(input.errors);
      setFormError(null);
      return;
    }

    setSubmitting(true);
    const error = await postAuthForm('/api/v1/auth/register', input.value);
    setSubmitting(false);
    if (error) {
      setFieldErrors(error.code === 'email_taken' ? { email: error.message } : error.fields);
      setFormError(error.code === 'email_taken' ? null : error.message);
      return;
    }
    router.push('/');
    router.refresh();
  }

  const messages = [...Object.values(fieldErrors), ...(formError ? [formError] : [])];

  return (
    <div className="space-y-6">
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        <ErrorSummary messages={messages} />
        <FormField
          id={`${id}-name`}
          label="Name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={setName}
          error={fieldErrors.name}
        />
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
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          error={fieldErrors.password}
          hint="At least 8 characters."
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-emerald-700 px-4 py-2.5 font-semibold text-white hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {submitting ? 'Creating account…' : 'Create Account'}
        </button>
      </form>

      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span aria-hidden="true" className="h-px flex-1 bg-slate-200" />
        or
        <span aria-hidden="true" className="h-px flex-1 bg-slate-200" />
      </div>
      <GoogleSignInButton />

      <p className="text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-emerald-700 underline-offset-2 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
