import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { GroupDashboard } from '@/components/group-dashboard/group-dashboard';
import { getSignedInUser } from '@/lib/auth/current-user';
import { loadGroupDashboard } from '@/lib/db/group-dashboard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Group · FairShare' };

interface GroupPageProps {
  /** A promise since Next.js 15. */
  params: Promise<{ groupId: string }>;
}

/**
 * /groups/[groupId] (#7, #8): one group's balances, suggested transfers, transaction graph, and
 * activity. Members only: anyone else gets the same 404 as a group that doesn't exist.
 */
export default async function GroupPage({ params }: GroupPageProps) {
  const { groupId } = await params;
  const user = await getSignedInUser();
  if (!user) redirect(`/login?next=/groups/${encodeURIComponent(groupId)}`);

  const dashboard = await loadGroupDashboard(user.id, groupId);
  if (!dashboard) notFound();
  const { group } = dashboard;

  return (
    // Light background and dark text, whatever the system color scheme.
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <Link
          href="/groups"
          className="inline-flex items-center gap-1 rounded text-sm font-medium text-gray-700 hover:text-gray-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          All groups
        </Link>

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold">{group.name}</h1>
              {group.isArchived && (
                <span className="rounded-full bg-gray-200 px-3 py-1 text-sm font-medium text-gray-800">
                  Archived: read-only
                </span>
              )}
            </div>
            {group.description && <p className="mt-1 text-gray-600">{group.description}</p>}
            <p className="mt-2 text-sm text-gray-600">
              <span className="font-medium text-gray-700">Members: </span>
              <span>{group.members.map((m) => m.name).join(', ')}</span>
            </p>
          </div>
          {!group.isArchived && (
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm">
              <p className="text-gray-600">Invite code (share it to add people)</p>
              <code className="mt-1 block select-all break-all font-mono text-gray-900">{group.inviteCode}</code>
            </div>
          )}
        </header>

        <GroupDashboard
          currentUserId={user.id}
          group={group}
          expenses={dashboard.expenses}
          settlements={dashboard.settlements}
          transfers={dashboard.transfers}
          ledger={dashboard.ledger}
        />
      </div>
    </main>
  );
}
