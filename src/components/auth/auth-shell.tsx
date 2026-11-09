import Link from 'next/link';
import type { ReactNode } from 'react';

interface AuthShellProps {
  active: 'login' | 'register';
  title: string;
  subtitle: string;
  children: ReactNode;
}

const STEPS = [
  'Create or join a group',
  'Split equal, exact, percentage or itemized',
  'Review clear settlement instructions',
];

function tabClass(isActive: boolean): string {
  return `rounded px-3 py-2 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
    isActive ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
  }`;
}

/** The sign-in / create-account layout from the auth mockup (docs/mockups/01-auth.svg). */
export function AuthShell({ active, title, subtitle, children }: AuthShellProps) {
  return (
    <main className="min-h-screen bg-slate-100 lg:grid lg:grid-cols-2">
      <section aria-label="About FairShare" className="hidden flex-col justify-center gap-6 bg-slate-800 px-12 text-white lg:flex">
        <p className="text-4xl font-bold">
          Fair<span className="text-emerald-400">Share</span>
        </p>
        <p className="text-lg text-slate-200">Split expenses fairly. Settle up simply.</p>
        <div>
          <h2 className="text-xl font-semibold">Designed for your group</h2>
          <p className="mt-2 text-slate-300">Share bills, track balances, and keep everyone on the same page.</p>
        </div>
        <ol className="space-y-3">
          {STEPS.map((step, index) => (
            <li key={step} className="flex items-center gap-3">
              <span className="text-sm font-bold text-emerald-400">{String(index + 1).padStart(2, '0')}</span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <p className="mb-6 text-3xl font-bold text-slate-900 lg:hidden">
          Fair<span className="text-emerald-700">Share</span>
        </p>
        <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg sm:p-8">
          <nav aria-label="Account" className="mb-6 grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-1 text-sm font-semibold">
            <Link href="/login" aria-current={active === 'login' ? 'page' : undefined} className={tabClass(active === 'login')}>
              Sign in
            </Link>
            <Link href="/register" aria-current={active === 'register' ? 'page' : undefined} className={tabClass(active === 'register')}>
              Create account
            </Link>
          </nav>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="mt-1 text-slate-600">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
