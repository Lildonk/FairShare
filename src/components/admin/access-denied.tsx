import Link from 'next/link';

/** Shown to a signed-in member who opens an admin page (#11). */
export function AccessDenied({ name }: { name: string }) {
  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-gray-900">Admins only</h1>
      <p className="mt-3 text-gray-700">
        You’re signed in as {name}. This page is for FairShare admins, who archive finished groups and review
        disputed expenses. Ask an admin if one of your groups needs archiving.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
      >
        Back to home
      </Link>
    </main>
  );
}
