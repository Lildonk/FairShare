import { config } from 'dotenv';
import path from 'path';
import { defineConfig } from 'vitest/config';

// Integration tests use the PostgreSQL database in DATABASE_URL (see README).
// Variables already set in the environment (for example in CI) take precedence over .env.
config({ quiet: true });

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.{test,spec}.ts'],
    // Test files share one database, so run them one at a time.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
