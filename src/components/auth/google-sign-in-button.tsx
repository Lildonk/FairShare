/**
 * A plain link, not client-side navigation: the browser must leave the app for Google's sign-in
 * page and come back through /api/v1/auth/google/callback.
 */
export function GoogleSignInButton() {
  return (
    <a
      href="/api/v1/auth/google"
      className="flex w-full items-center justify-center gap-3 rounded-md border border-slate-300 bg-white px-4 py-2.5 font-medium text-slate-800 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
    >
      <span
        aria-hidden="true"
        className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-sm font-bold text-slate-700"
      >
        G
      </span>
      Continue with Google
    </a>
  );
}
