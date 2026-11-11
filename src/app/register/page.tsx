import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/auth-shell';
import { RegisterForm } from '@/components/auth/register-form';

export const metadata: Metadata = { title: 'Create account · FairShare' };

export default function RegisterPage() {
  return (
    <AuthShell active="register" title="Create your account" subtitle="Start splitting expenses with your group">
      <RegisterForm />
    </AuthShell>
  );
}
