import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
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

