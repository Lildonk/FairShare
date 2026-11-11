import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/auth-shell';
import { LoginForm } from '@/components/auth/login-form';
import { authErrorMessage, safeNextPath } from '@/lib/auth/redirects';

export const metadata: Metadata = { title: 'Sign in · FairShare' };

interface LoginPageProps {
  searchParams: { next?: string | string[]; error?: string | string[] };
}

const first = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);

export default function LoginPage({ searchParams }: LoginPageProps) {
  return (
    <AuthShell active="login" title="Welcome back" subtitle="Sign in to your FairShare account">
      <LoginForm
        next={safeNextPath(first(searchParams.next))}
        errorMessage={authErrorMessage(first(searchParams.error))}
      />
    </AuthShell>
  );
}
