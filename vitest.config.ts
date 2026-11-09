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
    // Database tests need PostgreSQL; they run with `npm run test:integration`.
    exclude: [...configDefaults.exclude, 'tests/integration/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: [
        'node_modules/',
        '.next/',
        'src/test-setup.ts',
        '**/*.d.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

