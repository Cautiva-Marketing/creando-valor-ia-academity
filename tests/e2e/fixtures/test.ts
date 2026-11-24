import { test as base, expect } from '@playwright/test';
import { signIn, type Credentials, type SeedLogin } from './auth';
import { ipHeaders, uniqueClientIp } from './network';

/**
 * Base test for every e2e spec: each test gets its own client IP (`x-forwarded-for` via the
 * context's extraHTTPHeaders) so per-IP rate limits never leak between tests or projects, plus a
 * `loginAs` helper. Per-IP limit tests override `extraHTTPHeaders` with `fixedClientIp(testInfo)`.
 */
export const test = base.extend<{ loginAs: (who: SeedLogin | Credentials) => Promise<void> }>({
  extraHTTPHeaders: async ({}, provide) => {
    await provide(ipHeaders(uniqueClientIp()));
  },
  loginAs: async ({ context, baseURL }, provide) => {
    await provide((who) => signIn(context, who, baseURL));
  },
});

export { expect };
