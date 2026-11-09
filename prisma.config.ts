import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// A Prisma config file turns off Prisma's automatic .env loading, so load it here.
// Variables already set in the environment (for example in CI) take precedence.
config({ quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
});
