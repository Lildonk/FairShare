// Entry point for `npm run db:seed` (and `prisma migrate reset`). The work happens in seed-database.ts.
import { prisma } from '../src/lib/db/prisma';
import { seedDatabase } from './seed-database';

seedDatabase(prisma)
  .then(() => console.log('Seeded FairShare sample data.'))
  .catch((error: unknown) => {
    console.error('Seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
