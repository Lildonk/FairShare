/**
 * Server-side authentication and authorization guards. Every private route handler calls one of
 * the `require*` functions; each throws an HttpError (401, 403, or 404) that `errorResponse` turns
 * into a JSON response.
 */
import type { Group, User } from '@prisma/client';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { HttpError } from '@/lib/http/responses';
import { SESSION_COOKIE, verifySessionToken } from './session';

async function userForToken(token: string | undefined): Promise<User | null> {
  const session = await verifySessionToken(token);
  return session ? prisma.user.findUnique({ where: { id: session.userId } }) : null;
}

/** The signed-in user for an API request, or null. Also null if the account no longer exists. */
export function getSessionUser(request: NextRequest): Promise<User | null> {
  return userForToken(request.cookies.get(SESSION_COOKIE)?.value);
}

/** The signed-in user for a server component, or null. */
export function getSignedInUser(): Promise<User | null> {
  return userForToken(cookies().get(SESSION_COOKIE)?.value);
}

export async function requireUser(request: NextRequest): Promise<User> {
  const user = await getSessionUser(request);
  if (!user) throw new HttpError(401, 'unauthorized', 'Sign in to continue.');
  return user;
}

export async function requireAdmin(request: NextRequest): Promise<User> {
  const user = await requireUser(request);
  // The role comes from the database, not the token, so a demoted admin loses access at once.
  if (user.role !== 'ADMIN') throw new HttpError(403, 'forbidden', 'Only admins can do this.');
  return user;
}

export async function requireGroupMember(
  request: NextRequest,
  groupId: string,
): Promise<{ user: User; group: Group }> {
  const user = await requireUser(request);
  // One lookup covers both cases: a group you aren't in gets the same 404 as one that doesn't
  // exist, so the answer never reveals which group IDs are real.
  const membership = await prisma.groupMember.findUnique({
    where: { userId_groupId: { userId: user.id, groupId } },
    include: { group: true },
  });
  if (!membership) throw new HttpError(404, 'not_found', 'Group not found.');
  return { user, group: membership.group };
}
