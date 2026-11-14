import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AccessDenied } from '@/components/admin/access-denied';
import { AdminPortal } from '@/components/admin/admin-portal';
import { getSignedInUser } from '@/lib/auth/current-user';
import { adminGroupOverview, disputedExpenses } from '@/lib/db/admin';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Admin · FairShare' };

/**
 * /admin (#11): platform-wide oversight for ADMIN accounts. The role comes from the database, so a
 * demoted admin loses access at once, and members get an explanation instead of a silent redirect.
 */
export default async function AdminPage() {
  const user = await getSignedInUser();
  if (!user) redirect('/login?next=/admin');
  if (user.role !== 'ADMIN') return <AccessDenied name={user.name} />;

  const [groups, disputes] = await Promise.all([adminGroupOverview(), disputedExpenses()]);
  return (
    // Light background and dark text like the other pages, whatever the system color scheme
    // (globals.css switches the body to light text in dark mode).
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-2xl font-semibold text-gray-900">Admin</h1>
        <p className="mt-1 text-sm text-gray-600">
          Every group on FairShare. Archiving a group freezes its ledger: members can still read it, but nobody can
          change its expenses or payments.
        </p>
        <AdminPortal groups={groups} disputes={disputes} />
      </div>
    </main>
  );
}
