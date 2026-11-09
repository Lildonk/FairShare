// Pure helpers, safe to import from client components.

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  account_exists:
    'An account with this email already exists. Sign in with your password, then choose Continue with Google to connect it.',
  email_unverified: "Your Google email address isn't verified. Verify it with Google, or sign in with email.",
  google_linked_elsewhere: 'That Google account is already connected to a different FairShare account.',
  already_linked_other: 'Your FairShare account is already connected to a different Google account.',
  google_failed: "Google sign-in didn't complete. Please try again.",
  google_unavailable: "Google sign-in isn't set up yet. Use your email and password instead.",
};

/** Returns `next` only if it is a path on this site; anything else falls back to the home page. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  return next;
}

/** The message for an `?error=` code on the login page, or null for unknown codes. */
export function authErrorMessage(code: string | null | undefined): string | null {
  return code && Object.hasOwn(AUTH_ERROR_MESSAGES, code) ? AUTH_ERROR_MESSAGES[code] : null;
}
