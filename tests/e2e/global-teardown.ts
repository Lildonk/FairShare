import { prisma } from '../../src/lib/db/prisma';
import type { Prisma } from '@prisma/client';
import { E2E_EMAIL_DOMAIN, E2E_GROUP_PREFIX } from './fixtures';

/**
 * Removes what the E2E run created: the audit events of E2E groups and accounts, groups made only
 * of E2E accounts (and named with the E2E prefix, their expenses and payments go with them), then
 * the E2E accounts themselves. Seed groups an E2E account joined are left alone; the
 * membership goes with the account. Prisma reads DATABASE_URL from the environment or .env.
 */
export default async function globalTeardown(): Promise<void> {
  const e2eEmail = { endsWith: `@${E2E_EMAIL_DOMAIN}` };
  const e2eGroups: Prisma.GroupWhereInput = {
    name: { startsWith: E2E_GROUP_PREFIX },
    members: { every: { user: { email: e2eEmail } } },
  };
  try {
    // The audit trail is append-only; only the maintenance switch lets these go, and they restrict
    // deleting their group and actor, so they go first.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL fairshare.audit_maintenance = 'on'`;
      await tx.auditEvent.deleteMany({ where: { OR: [{ group: e2eGroups }, { actor: { email: e2eEmail } }] } });
    });
    await prisma.group.deleteMany({ where: e2eGroups });
    await prisma.user.deleteMany({ where: { email: e2eEmail } });
  } finally {
    await prisma.$disconnect();
  }
}
