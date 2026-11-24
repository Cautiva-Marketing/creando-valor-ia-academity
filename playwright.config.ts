import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

const mobile = { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true };
const desktop = { viewport: { width: 1280, height: 800 } };

/**
 * Four parallel projects (360 px and desktop × light and dark) exclude `@global` tests; the serial
 * `global` project runs only `@global` tests after them (tasks.md → Path Conventions).
 */
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    locale: 'es-PE',
    timezoneId: 'America/Lima',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile-360-light',
      grepInvert: /@global/,
      use: { ...devices['Desktop Chrome'], ...mobile, colorScheme: 'light' },
    },
    {
      name: 'mobile-360-dark',
      grepInvert: /@global/,
      use: { ...devices['Desktop Chrome'], ...mobile, colorScheme: 'dark' },
    },
    {
      name: 'desktop-light',
      grepInvert: /@global/,
      use: { ...devices['Desktop Chrome'], ...desktop, colorScheme: 'light' },
    },
    {
      name: 'desktop-dark',
      grepInvert: /@global/,
      use: { ...devices['Desktop Chrome'], ...desktop, colorScheme: 'dark' },
    },
    {
      name: 'global',
      grep: /@global/,
      fullyParallel: false,
      dependencies: ['mobile-360-light', 'mobile-360-dark', 'desktop-light', 'desktop-dark'],
      use: { ...devices['Desktop Chrome'], ...desktop, colorScheme: 'light' },
    },
  ],
  webServer: {
    command: 'pnpm build && pnpm start',
    url: baseURL,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    // Allows the test-only E2E_EMAIL_FAIL_DOMAIN switch under `next start` (see src/lib/env.ts).
    // Empty DSNs keep the suite's deliberate errors out of Sentry (process env wins over .env.local).
    env: { E2E: '1', SENTRY_DSN: '', NEXT_PUBLIC_SENTRY_DSN: '' },
  },
});
