import { createHash, randomInt } from 'node:crypto';
import type { TestInfo } from '@playwright/test';

/** Headers the app reads for the client IP (rate-limit-config.ts → clientIpFrom). */
export function ipHeaders(ip: string): Record<string, string> {
  return { 'x-forwarded-for': ip, 'x-real-ip': ip };
}

/** Random IP in 10.0.0.0/8 so per-IP limits never collide between tests. */
export function uniqueClientIp(): string {
  return `10.${randomInt(0, 256)}.${randomInt(0, 256)}.${randomInt(1, 255)}`;
}

/** Per-process salt: reruns (and retries, which use a new worker) never reuse a previous counter. */
const RUN_SALT = randomInt(0, 2 ** 31).toString(36);

/**
 * Stable IP for a whole test (every request shares it), different between tests, projects and
 * runs: derived from the test id, the project name and a per-run salt. Used by per-IP limit tests.
 */
export function fixedClientIp(testInfo: Pick<TestInfo, 'testId' | 'project'>): string {
  const digest = createHash('sha256')
    .update(`${RUN_SALT}:${testInfo.project.name}:${testInfo.testId}`)
    .digest();
  return `172.${16 + (digest[0]! % 16)}.${digest[1]!}.${1 + (digest[2]! % 254)}`;
}
