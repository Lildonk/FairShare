import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // Test-only signing key, so tests never depend on a developer's real .env secret.
    env: { JWT_SECRET: 'test-only-jwt-secret-not-used-anywhere-else' },
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'prisma/**/*.{test,spec}.ts',
      'tests/**/*.{test,spec}.{ts,tsx}',
    ],
    // Database tests need PostgreSQL and run with `npm run test:integration`; browser tests run with `npm run test:e2e`.
    exclude: [...configDefaults.exclude, 'tests/integration/**', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: [
        'node_modules/',
        '.next/',
        'src/test-setup.ts',
        '**/*.d.ts',
      ],
      thresholds: {
        // Blueprint target: 100% coverage for the debt and tax/tip engines (all of src/lib/finance).
        'src/lib/finance/**': { statements: 100, branches: 100, functions: 100, lines: 100 },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

