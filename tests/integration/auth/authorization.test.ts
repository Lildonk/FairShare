import { randomUUID } from 'node:crypto';
import type { Group, User } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET as listAllGroupsForAdmin } from '@/app/api/v1/admin/groups/route';
import { GET as getGroup } from '@/app/api/v1/groups/[groupId]/route';
import { GET as listMyGroups } from '@/app/api/v1/groups/route';
import { SESSION_COOKIE, createSessionToken } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { cleanupTestData, createTestGroup, createTestUser, jsonRequest, sessionCookie } from '../helpers/auth-helpers';

let alice: User;
let bob: User;
let admin: User;
let groupA: Group;
let groupB: Group;

function groupRequest(groupId: string, cookie?: string) {
  return getGroup(jsonRequest(`/api/v1/groups/${groupId}`, { cookie }), { params: Promise.resolve({ groupId }) });
}

beforeAll(async () => {
  alice = await createTestUser('Alice');
  bob = await createTestUser('Bob');
  admin = await createTestUser('Admin', { role: 'ADMIN' });
  groupA = await createTestGroup('Group A', [alice.id]);
  groupB = await createTestGroup('Group B', [bob.id]);
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe('GET /api/v1/groups', () => {
  it('returns 401 without a session', async () => {
    const response = await listMyGroups(jsonRequest('/api/v1/groups'));

    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe('unauthorized');
  });

  it('lists only the groups the signed-in user belongs to', async () => {
    const response = await listMyGroups(jsonRequest('/api/v1/groups', { cookie: await sessionCookie(alice) }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      groups: [
        {
          id: groupA.id,
          name: groupA.name,
          description: null,
          currency: 'USD',
          isArchived: false,
          memberCount: 1,
        },
      ],
    });
  });
});

describe('GET /api/v1/groups/[groupId]', () => {
  it('shows a group to its members, with member names but no emails or secrets', async () => {
    const response = await groupRequest(groupA.id, await sessionCookie(alice));
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({
      group: {
        id: groupA.id,
        name: groupA.name,
        description: null,
        currency: 'USD',
        isArchived: false,
        members: [{ id: alice.id, name: 'Alice' }],
      },
    });
    expect(text).not.toMatch(/@auth-test\.test|passwordHash|googleSub/);
  });

  it('gives a non-member the same 404 as a group that does not exist', async () => {
    const cookie = await sessionCookie(bob);
    const notTheirs = await groupRequest(groupA.id, cookie);
    const unknown = await groupRequest(randomUUID(), cookie);

    // Identical answers, so a signed-in user can't tell a real group ID from a made-up one.
    expect(notTheirs.status).toBe(404);
    expect(await notTheirs.json()).toEqual(await unknown.json());
  });

  it('returns 404 for a group that does not exist', async () => {
    const response = await groupRequest(randomUUID(), await sessionCookie(alice));

    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe('not_found');
  });

  it('returns 401 for an invalid token before revealing anything about the group', async () => {
    const response = await groupRequest(groupA.id, `${SESSION_COOKIE}=garbage`);

    expect(response.status).toBe(401);
  });
});

describe('GET /api/v1/admin/groups', () => {
  it('returns 401 without a session', async () => {
    const response = await listAllGroupsForAdmin(jsonRequest('/api/v1/admin/groups'));

    expect(response.status).toBe(401);
  });

  it('returns 403 to members', async () => {
    const response = await listAllGroupsForAdmin(
      jsonRequest('/api/v1/admin/groups', { cookie: await sessionCookie(alice) }),
    );

    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('forbidden');
  });

  it('lists every group with member, expense, and dispute counts for admins', async () => {
    const response = await listAllGroupsForAdmin(
      jsonRequest('/api/v1/admin/groups', { cookie: await sessionCookie(admin) }),
    );
    const { groups } = await response.json();

    expect(response.status).toBe(200);
    for (const group of [groupA, groupB]) {
      expect(groups).toContainEqual({
        id: group.id,
        name: group.name,
        isArchived: false,
        memberCount: 1,
        expenseCount: 0,
        disputedExpenseCount: 0,
      });
    }
  });

  it('checks the role in the database, not only the role in the token', async () => {
    const staleAdminToken = await createSessionToken({ userId: alice.id, role: 'ADMIN' });
    const response = await listAllGroupsForAdmin(
      jsonRequest('/api/v1/admin/groups', { cookie: `${SESSION_COOKIE}=${staleAdminToken}` }),
    );

    expect(response.status).toBe(403);
  });
});
