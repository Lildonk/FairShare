import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests (Issue #10), in tests/e2e. They run against a production build of the app on
 * port 3100 and the database in DATABASE_URL: the seeded development database locally, a fresh
 * one in CI. See "End-to-end tests" in the README.
 */
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  globalTeardown: './tests/e2e/global-teardown.ts',
  // The tests share one database, so they run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // CI builds in an earlier step. Locally this builds first, so the tests always see production code.
    command: process.env.CI ? `npm run start -- --port ${PORT}` : `npm run build && npm run start -- --port ${PORT}`,
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
