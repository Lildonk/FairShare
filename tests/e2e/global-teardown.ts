import { prisma } from '../../src/lib/db/prisma';
import { E2E_EMAIL_DOMAIN, E2E_GROUP_PREFIX } from './fixtures';

/**
 * Removes what the E2E run created: groups made only of E2E accounts (and named with the E2E
 * prefix), then the E2E accounts themselves. Seed groups an E2E account joined are left alone; the
 * membership goes with the account. Prisma reads DATABASE_URL from the environment or .env.
 */
export default async function globalTeardown(): Promise<void> {
  const e2eEmail = { endsWith: `@${E2E_EMAIL_DOMAIN}` };
  try {
    await prisma.group.deleteMany({
      where: { name: { startsWith: E2E_GROUP_PREFIX }, members: { every: { user: { email: e2eEmail } } } },
    });
    await prisma.user.deleteMany({ where: { email: e2eEmail } });
  } finally {
    await prisma.$disconnect();
  }
}
