import Link from 'next/link';
import type { GroupSummary } from '@/lib/db/groups';

/** The signed-in user's groups, each linking to its dashboard (#50). */
export function GroupList({ groups }: { groups: GroupSummary[] }) {
  if (groups.length === 0) {
    return (
      <p className="text-sm text-gray-600">
        You’re not in any groups yet. Create one below, or join one with an invite code from a friend.
      </p>
    );
  }
  return (
    <ul aria-label="Your groups" className="divide-y divide-gray-100">
      {groups.map((group) => (
        <li key={group.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
          <Link
            href={`/groups/${group.id}`}
            className="rounded font-medium text-gray-900 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
          >
            {group.name}
          </Link>
          <span className="flex items-center gap-2 text-sm text-gray-600">
            {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
            {group.isArchived && (
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-800">Archived</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
