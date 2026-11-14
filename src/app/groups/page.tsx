import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CreateGroupForm } from '@/components/groups/create-group-form';
import { GroupList } from '@/components/groups/group-list';
import { JoinGroupForm } from '@/components/groups/join-group-form';
import { getSignedInUser } from '@/lib/auth/current-user';
import { groupsForUser } from '@/lib/db/groups';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your groups · FairShare' };

const CARD = 'rounded-xl border border-gray-200 bg-white p-5 shadow-sm';

/** /groups (#50): the signed-in user's groups, plus forms to create one or join one by invite code. */
export default async function GroupsPage() {
  const user = await getSignedInUser();
  if (!user) redirect('/login?next=/groups');
  const groups = await groupsForUser(user.id);

  return (
    // Light background and dark text, whatever the system color scheme (see globals.css).
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <header>
          <h1 className="text-2xl font-semibold">Your groups</h1>
          <p className="mt-1 text-sm text-gray-600">Signed in as {user.name}.</p>
        </header>
        <section aria-label="Group list" className={CARD}>
          <GroupList groups={groups} />
        </section>
        <div className="grid gap-6 md:grid-cols-2">
          <section aria-labelledby="create-group-heading" className={CARD}>
            <h2 id="create-group-heading" className="mb-4 text-lg font-semibold">
              Create a group
            </h2>
            <CreateGroupForm />
          </section>
          <section aria-labelledby="join-group-heading" className={CARD}>
            <h2 id="join-group-heading" className="mb-4 text-lg font-semibold">
              Join a group
            </h2>
            <JoinGroupForm />
          </section>
        </div>
      </div>
    </main>
  );
}
