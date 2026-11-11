import { randomUUID } from 'node:crypto';
import type { Group, User } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as joinGroup } from '@/app/api/v1/groups/join/route';
import { POST as createGroup } from '@/app/api/v1/groups/route';
import { prisma } from '@/lib/db/prisma';
import { cleanupTestData, createTestGroup, createTestUser, jsonRequest, sessionCookie } from '../helpers/auth-helpers';

let alice: User;
let bob: User;
let bookClub: Group;
let archived: Group;

async function create(body: unknown, user?: User) {
  const cookie = user ? await sessionCookie(user) : undefined;
  const response = await createGroup(jsonRequest('/api/v1/groups', { method: 'POST', body, cookie }));
  return { status: response.status, body: await response.json() };
}

async function join(body: unknown, user?: User) {
  const cookie = user ? await sessionCookie(user) : undefined;
  const response = await joinGroup(jsonRequest('/api/v1/groups/join', { method: 'POST', body, cookie }));
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  alice = await createTestUser('Alice');
  bob = await createTestUser('Bob');
  bookClub = await createTestGroup('Book club', [alice.id]);
  archived = await createTestGroup('Old trip', [alice.id]);
  await prisma.group.update({ where: { id: archived.id }, data: { isArchived: true } });
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe('POST /api/v1/groups', () => {
  it('creates a group with the signed-in user as its only member', async () => {
    const { status, body } = await create({ name: '  Ski trip  ', description: 'February' }, alice);

    expect(status).toBe(201);
    expect(body).toEqual({
      group: {
        id: expect.any(String),
        name: 'Ski trip',
        description: 'February',
        currency: 'USD',
        isArchived: false,
        inviteCode: expect.any(String),
        members: [{ id: alice.id, name: 'Alice' }],
      },
    });
    const members = await prisma.groupMember.findMany({ where: { groupId: body.group.id } });
    expect(members.map((m) => m.userId)).toEqual([alice.id]);
  });

  it('ignores fields the client may not set, such as isArchived and inviteCode', async () => {
    const { status, body } = await create({ name: 'Trip', isArchived: true, inviteCode: 'chosen-by-me', currency: 'EUR' }, alice);

    expect(status).toBe(201);
    expect(body.group.isArchived).toBe(false);
    expect(body.group.inviteCode).not.toBe('chosen-by-me');
    expect(body.group.currency).toBe('USD');
  });

  it('stores an empty description as none', async () => {
    const { body } = await create({ name: 'Trip', description: '   ' }, alice);

    expect(body.group.description).toBeNull();
  });

  it.each([
    ['name is missing', {}, 'name'],
    ['name is blank', { name: '   ' }, 'name'],
    ['name is too long', { name: 'x'.repeat(101) }, 'name'],
    ['description is not text', { name: 'Trip', description: 42 }, 'description'],
    ['description is too long', { name: 'Trip', description: 'x'.repeat(501) }, 'description'],
  ])('answers 400 when the %s', async (_case, body, field) => {
    const { status, body: error } = await create(body, alice);

    expect(status).toBe(400);
    expect(error.code).toBe('invalid_input');
    expect(error.fields).toHaveProperty([field]);
  });

  it('answers 401 without a session', async () => {
    const { status } = await create({ name: 'Trip' });

    expect(status).toBe(401);
  });
});

describe('POST /api/v1/groups/join', () => {
  it('adds the signed-in user to the group with that invite code', async () => {
    const { status, body } = await join({ inviteCode: bookClub.inviteCode }, bob);

    expect(status).toBe(200);
    expect(body.group).toMatchObject({ id: bookClub.id, name: bookClub.name, inviteCode: bookClub.inviteCode });
    expect(body.group.members).toEqual([
      { id: alice.id, name: 'Alice' },
      { id: bob.id, name: 'Bob' },
    ]);
  });

  it('changes nothing for someone who is already a member', async () => {
    const { status, body } = await join({ inviteCode: bookClub.inviteCode }, alice);

    expect(status).toBe(200);
    expect(body.group.members.filter((m: { id: string }) => m.id === alice.id)).toHaveLength(1);
  });

  it('answers 404 for an unknown invite code', async () => {
    const { status, body } = await join({ inviteCode: randomUUID() }, bob);

    expect(status).toBe(404);
    expect(body.code).toBe('not_found');
  });

  it('answers 409 for an archived group, and adds no one', async () => {
    const { status, body } = await join({ inviteCode: archived.inviteCode }, bob);

    expect(status).toBe(409);
    expect(body.code).toBe('group_archived');
    expect(await prisma.groupMember.count({ where: { groupId: archived.id, userId: bob.id } })).toBe(0);
  });

  it.each([
    ['is missing', {}],
    ['is not text', { inviteCode: 123 }],
    ['is blank', { inviteCode: ' ' }],
  ])('answers 400 when the invite code %s', async (_case, body) => {
    const { status, body: error } = await join(body, bob);

    expect(status).toBe(400);
    expect(error.fields).toHaveProperty(['inviteCode']);
  });

  it('answers 401 without a session', async () => {
    const { status } = await join({ inviteCode: bookClub.inviteCode });

    expect(status).toBe(401);
  });
});
