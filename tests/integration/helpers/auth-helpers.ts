import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import type { Group, Prisma, Role, User } from '@prisma/client';
import { hashPassword } from '@/lib/auth/password';
import { SESSION_COOKIE, createSessionToken } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

// Every test file tags the users and groups it creates with its own run id and deletes them
// afterwards, so these tests never touch other rows in a development database.
const runTag = randomUUID().slice(0, 8);
const createdGroupIds: string[] = [];

export const BASE_URL = 'http://localhost:3000';

export function testEmail(name: string): string {
  return `${name.toLowerCase()}.${runTag}@auth-test.test`;
}

export function testGoogleSub(name: string): string {
  return `google-${name.toLowerCase()}-${runTag}`;
}

export async function createTestUser(
  name: string,
  options: { password?: string; role?: Role; googleSub?: string } = {},
): Promise<User> {
  return prisma.user.create({
    data: {
      name,
      email: testEmail(name),
      role: options.role ?? 'MEMBER',
      passwordHash: options.password ? await hashPassword(options.password) : null,
      googleSub: options.googleSub ?? null,
    },
  });
}

export async function createTestGroup(name: string, memberIds: string[]): Promise<Group> {
  const group = await prisma.group.create({
    data: { name: `${name} ${runTag}`, members: { create: memberIds.map((userId) => ({ userId })) } },
  });
  createdGroupIds.push(group.id);
  return group;
}

/** A Cookie header value that signs the request in as `user`. */
export async function sessionCookie(user: Pick<User, 'id' | 'role'>): Promise<string> {
  return `${SESSION_COOKIE}=${await createSessionToken({ userId: user.id, role: user.role })}`;
}

export function jsonRequest(
  path: string,
  options: { method?: string; body?: unknown; rawBody?: string; cookie?: string } = {},
): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.cookie) headers.cookie = options.cookie;
  return new NextRequest(new URL(path, BASE_URL), {
    method: options.method ?? 'GET',
    headers,
    body: options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
  });
}

/** The Set-Cookie header for `name`, split into its value and the full header text. */
export function setCookie(response: Response, name: string): { value: string; header: string } | undefined {
  const header = response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${name}=`));
  if (!header) return undefined;
  return { value: decodeURIComponent(header.slice(name.length + 1).split(';')[0]), header };
}

export function sessionCookieFrom(response: Response) {
  return setCookie(response, SESSION_COOKIE);
}

/**
 * Deletes audit events, which the database allows only in a transaction that turns on the
 * maintenance switch (#8). Test cleanup only: application code never sets it.
 */
export async function deleteAuditEventsAsMaintenance(where: Prisma.AuditEventWhereInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL fairshare.audit_maintenance = 'on'`;
    await tx.auditEvent.deleteMany({ where });
  });
}

export async function cleanupTestData(): Promise<void> {
  const testEmail = { endsWith: `.${runTag}@auth-test.test` };
  // Also groups created through the API, which createTestGroup never saw.
  const testGroups = { OR: [{ id: { in: createdGroupIds } }, { members: { some: { user: { email: testEmail } } } }] };
  // Audit events restrict deleting their group and actor, so they go first.
  await deleteAuditEventsAsMaintenance({ OR: [{ group: testGroups }, { actor: { email: testEmail } }] });
  await prisma.group.deleteMany({ where: testGroups });
  await prisma.user.deleteMany({ where: { email: testEmail } });
}
