import { Prisma, type User } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import type { GoogleIdentity } from './google';

export type GoogleSignInFailure =
  | 'email_unverified'
  | 'account_exists'
  | 'google_linked_elsewhere'
  | 'already_linked_other';

export type GoogleSignInResult = { ok: true; user: User } | { ok: false; reason: GoogleSignInFailure };

/**
 * Decides which FairShare account a verified Google identity signs in to.
 *
 * Accounts are never merged by email: FairShare does not verify the email on password accounts,
 * so someone could register a victim's address first. An existing account must be signed in
 * before Google can be connected to it.
 */
export async function resolveGoogleSignIn(
  identity: GoogleIdentity,
  signedInUser: User | null,
): Promise<GoogleSignInResult> {
  if (!identity.emailVerified) return { ok: false, reason: 'email_unverified' };

  const linkedUser = await prisma.user.findUnique({ where: { googleSub: identity.sub } });

  if (signedInUser) {
    if (linkedUser) {
      return linkedUser.id === signedInUser.id
        ? { ok: true, user: linkedUser }
        : { ok: false, reason: 'google_linked_elsewhere' };
    }
    if (signedInUser.googleSub) return { ok: false, reason: 'already_linked_other' };
    const user = await prisma.user.update({ where: { id: signedInUser.id }, data: { googleSub: identity.sub } });
    return { ok: true, user };
  }

  if (linkedUser) return { ok: true, user: linkedUser };

  const sameEmail = await prisma.user.findUnique({ where: { email: identity.email } });
  if (sameEmail) return { ok: false, reason: 'account_exists' };

  try {
    const user = await prisma.user.create({
      data: { email: identity.email, name: identity.name, googleSub: identity.sub },
    });
    return { ok: true, user };
  } catch (error) {
    // Someone registered the same email between the check above and this insert.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { ok: false, reason: 'account_exists' };
    }
    throw error;
  }
}
