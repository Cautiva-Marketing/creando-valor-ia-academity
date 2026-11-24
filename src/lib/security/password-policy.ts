import 'server-only';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PASSWORD_ISSUE_MESSAGES, basicPasswordIssues, type PasswordIssue } from './password-rules';

/**
 * Server password policy (FR-014, research.md §R6): minimum 10, different from the email and its
 * local part, not in the local top-10,000 list (SecLists, MIT) and not breached according to HIBP
 * Pwned Passwords (k-anonymity range API with Add-Padding). HIBP failures/timeouts (1.5 s) fail
 * open with a PII-free metric.
 */
export const HIBP_TIMEOUT_MS = 1500;

let commonPasswords: Set<string> | undefined;

function loadCommonPasswords(): Set<string> {
  if (!commonPasswords) {
    const file = path.join(process.cwd(), 'src/lib/security/common-passwords.txt');
    commonPasswords = new Set(
      readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim().toLowerCase())
        .filter(Boolean),
    );
  }
  return commonPasswords;
}

export function isCommonPassword(password: string, list = loadCommonPasswords()): boolean {
  return list.has(password.trim().toLowerCase());
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Returns true if breached, false if not, null if HIBP could not answer (fail-open). */
export async function isPwnedPassword(
  password: string,
  fetchImpl: FetchLike = fetch,
  timeoutMs = HIBP_TIMEOUT_MS,
): Promise<boolean | null> {
  const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const response = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'creando-valor-ia-password-check' },
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
    if (!response.ok) return recordFailOpen('http_error');
    const body = await response.text();
    for (const line of body.split(/\r?\n/)) {
      const [hashSuffix, count] = line.trim().split(':');
      if (hashSuffix === suffix && Number(count) > 0) return true;
    }
    return false;
  } catch {
    return recordFailOpen('timeout_or_network');
  }
}

function recordFailOpen(reason: string): null {
  // Metric without PII: only the reason.
  console.warn(`[password-policy] hibp_fail_open reason=${reason}`);
  return null;
}

export interface PasswordCheck {
  ok: boolean;
  issues: PasswordIssue[];
  messages: string[];
}

export async function checkPasswordPolicy(
  password: string,
  email: string | undefined,
  options: { fetchImpl?: FetchLike; commonList?: Set<string> } = {},
): Promise<PasswordCheck> {
  const issues = basicPasswordIssues(password, email);
  if (!issues.includes('too_short') && !issues.includes('too_long')) {
    if (isCommonPassword(password, options.commonList)) {
      issues.push('common');
    } else if (issues.length === 0) {
      const pwned = await isPwnedPassword(password, options.fetchImpl);
      if (pwned === true) issues.push('pwned');
    }
  }
  return {
    ok: issues.length === 0,
    issues,
    messages: issues.map((i) => PASSWORD_ISSUE_MESSAGES[i]),
  };
}
