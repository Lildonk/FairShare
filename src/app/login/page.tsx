import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/auth-shell';
import { LoginForm } from '@/components/auth/login-form';
import { authErrorMessage, safeNextPath } from '@/lib/auth/redirects';

export const metadata: Metadata = { title: 'Sign in · FairShare' };

interface LoginPageProps {
  /** A promise since Next.js 15. */
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
}

const first = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next, error } = await searchParams;
  return (
    <AuthShell active="login" title="Welcome back" subtitle="Sign in to your FairShare account">
      <LoginForm
        next={safeNextPath(first(next))}
        errorMessage={authErrorMessage(first(error))}
      />
    </AuthShell>
  );
}
