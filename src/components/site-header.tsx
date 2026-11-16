import type { User } from '@prisma/client';
import { DollarSign } from 'lucide-react';
import Link from 'next/link';
import { SignOutButton } from '@/components/auth/sign-out-button';

const NAV_LINK =
  'rounded text-sm font-medium text-gray-700 hover:text-gray-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700';

/** The top bar on every signed-in page: home, your groups, the admin portal for admins, and Sign out. */
export function SiteHeader({ user }: { user: Pick<User, 'name' | 'role'> }) {
  return (
    <header className="border-b border-gray-200 bg-white">
      <nav
        aria-label="Account"
        className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3"
      >
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/"
            aria-label="FairShare home"
            className="flex items-center gap-1 rounded font-bold text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          >
            <DollarSign className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            FairShare
          </Link>
          <Link href="/groups" className={NAV_LINK}>
            Your groups
          </Link>
          {user.role === 'ADMIN' && (
            <Link href="/admin" className={NAV_LINK}>
              Admin
            </Link>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-gray-700">
            Signed in as <span className="font-semibold">{user.name}</span>
          </p>
          <SignOutButton />
        </div>
      </nav>
    </header>
  );
}
