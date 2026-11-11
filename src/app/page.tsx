import { DollarSign } from 'lucide-react';
import Link from 'next/link';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { getSignedInUser } from '@/lib/auth/current-user';

export default async function HomePage() {
  const user = await getSignedInUser();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="flex items-center gap-3 mb-4">
        <DollarSign className="h-10 w-10 text-emerald-600" aria-hidden="true" />
        <h1 className="text-4xl font-bold text-gray-900">FairShare</h1>
      </div>
      <p className="text-lg text-gray-600 max-w-md text-center">
        Split expenses fairly. Settle debts simply.
      </p>

      {user ? (
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <p className="text-gray-700">
            Signed in as <span className="font-semibold">{user.name}</span>
          </p>
          <SignOutButton />
        </div>
      ) : (
        <div className="mt-8 flex gap-3">
          <Link
            href="/login"
            className="rounded-md bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-800 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          >
            Create account
          </Link>
        </div>
      )}
    </main>
  );
}
