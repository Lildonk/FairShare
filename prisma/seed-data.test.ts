// @vitest-environment node
import { Role, SettlementStatus, SplitType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { seedData } from './seed-data';

const { users, groups, memberships, expenses, settlements } = seedData;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function isMember(groupId: string, userId: string): boolean {
  return memberships.some((m) => m.groupId === groupId && m.userId === userId);
}

describe('seed data', () => {
  it('uses fixed, unique UUIDs so every seed run produces the same rows', () => {
    const ids = [
      ...users.map((u) => u.id),
      ...groups.flatMap((g) => [g.id, g.inviteCode]),
      ...memberships.map((m) => m.id),
      ...expenses.flatMap((e) => [e.id, ...e.splits.map((s) => s.id)]),
      ...settlements.map((s) => s.id),
    ];

    for (const id of ids) expect(id).toMatch(UUID);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses fixed timestamps so expenses and settlements sort the same on every run', () => {
    const timestamps = [...expenses, ...settlements].map((row) => row.createdAt);

    for (const timestamp of timestamps) {
      expect(new Date(timestamp).toISOString()).toBe(timestamp);
    }
  });

  it('gives every user a unique email on the reserved .test domain', () => {
    const emails = users.map((u) => u.email);

    for (const email of emails) expect(email).toMatch(/^[a-z0-9.+-]+@[a-z0-9-]+\.test$/);
    expect(new Set(emails).size).toBe(emails.length);
  });

  it('lists each user at most once per group', () => {
    const keys = memberships.map((m) => `${m.groupId}:${m.userId}`);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('stores every amount as a positive safe integer number of cents', () => {
    for (const expense of expenses) {
      expect(Number.isSafeInteger(expense.amountCents), expense.title).toBe(true);
      expect(expense.amountCents, expense.title).toBeGreaterThan(0);

      for (const split of expense.splits) {
        expect(Number.isSafeInteger(split.owedCents), expense.title).toBe(true);
        expect(split.owedCents, expense.title).toBeGreaterThanOrEqual(0);
      }
    }

    for (const settlement of settlements) {
      expect(Number.isSafeInteger(settlement.amountCents)).toBe(true);
      expect(settlement.amountCents).toBeGreaterThan(0);
    }
  });

  it('allocates every expense exactly: shares add up to the total in cents', () => {
    for (const expense of expenses) {
      const allocatedCents = expense.splits.reduce((sum, split) => sum + split.owedCents, 0);

      expect(allocatedCents, expense.title).toBe(expense.amountCents);
    }
  });

  it('gives each participant at most one share per expense', () => {
    for (const expense of expenses) {
      const userIds = expense.splits.map((s) => s.userId);

      expect(new Set(userIds).size, expense.title).toBe(userIds.length);
    }
  });

  it('only lets members of the group pay, owe, or settle in it', () => {
    for (const expense of expenses) {
      expect(isMember(expense.groupId, expense.payerId), expense.title).toBe(true);

      for (const split of expense.splits) {
        expect(isMember(expense.groupId, split.userId), expense.title).toBe(true);
      }
    }

    for (const settlement of settlements) {
      expect(isMember(settlement.groupId, settlement.fromUserId)).toBe(true);
      expect(isMember(settlement.groupId, settlement.toUserId)).toBe(true);
    }
  });

  it('records percentage splits in basis points that total 100%, and no basis points elsewhere', () => {
    for (const expense of expenses) {
      const basisPoints = expense.splits.map((s) => s.allocatedBps ?? null);

      if (expense.splitType === SplitType.PERCENTAGE) {
        for (const bps of basisPoints) expect(Number.isSafeInteger(bps), expense.title).toBe(true);
        expect(
          basisPoints.reduce<number>((sum, bps) => sum + (bps ?? 0), 0),
          expense.title,
        ).toBe(10_000);
      } else {
        for (const bps of basisPoints) expect(bps, expense.title).toBeNull();
      }
    }
  });

  it('only records settlements between two different people', () => {
    for (const settlement of settlements) {
      expect(settlement.fromUserId).not.toBe(settlement.toUserId);
    }
  });

  it('covers every split type and settlement status for local testing', () => {
    expect(new Set(expenses.map((e) => e.splitType))).toEqual(new Set(Object.values(SplitType)));
    expect(new Set(settlements.map((s) => s.status))).toEqual(
      new Set(Object.values(SettlementStatus)),
    );
  });

  it('includes a platform admin and an archived group for admin testing', () => {
    expect(users.some((u) => u.role === Role.ADMIN)).toBe(true);
    expect(groups.some((g) => g.isArchived)).toBe(true);
  });
});
