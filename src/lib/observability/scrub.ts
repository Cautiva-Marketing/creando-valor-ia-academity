/**
 * PII/secret scrubbing for Sentry (research.md §R21): emails, form bodies, cookies, invitation
 * tokens in URLs (/invitacion/<token>) and `token_hash` parameters never leave the process.
 * Framework-agnostic so it can be unit tested and shared by server, edge and client configs.
 */
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const INVITATION_PATH = /\/invitacion\/[^/?#\s"']+/gi;
const TOKEN_PARAMS = /([?&](?:token_hash|token|code|access_token|refresh_token)=)[^&#\s"']*/gi;

export function scrubString(value: string): string {
  return value
    .replace(INVITATION_PATH, '/invitacion/[token]')
    .replace(TOKEN_PARAMS, '$1[filtered]')
    .replace(EMAIL, '[email]');
}

const SENSITIVE_KEYS =
  /^(password|contrase(n|ñ)a|code|token|token_hash|secret|cookie|cookies|authorization|email|correo|set-cookie)$/i;

export function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[truncated]';
  if (typeof value === 'string') return scrubString(value);
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEYS.test(key) ? '[filtered]' : scrubValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

interface EventLike {
  request?: {
    url?: string;
    data?: unknown;
    cookies?: unknown;
    headers?: Record<string, string>;
    query_string?: unknown;
  };
  user?: Record<string, unknown>;
  [key: string]: unknown;
}

export function scrubEvent<T extends object>(event: T): T {
  const copy = scrubValue(event) as EventLike;
  if (copy.request) {
    delete copy.request.data;
    delete copy.request.cookies;
    if (copy.request.headers) {
      for (const header of Object.keys(copy.request.headers)) {
        if (/^(cookie|authorization|x-forwarded-for|x-real-ip)$/i.test(header)) {
          delete copy.request.headers[header];
        }
      }
    }
    if (typeof copy.request.query_string === 'string') {
      copy.request.query_string = scrubString(`?${copy.request.query_string}`).slice(1);
    }
  }
  if (copy.user) copy.user = copy.user.id ? { id: copy.user.id } : {};
  return copy as T;
}

interface BreadcrumbLike {
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export function scrubBreadcrumb<T extends object>(breadcrumb: T): T | null {
  // Form/input breadcrumbs can contain typed values.
  if ((breadcrumb as BreadcrumbLike).category === 'ui.input') return null;
  return scrubValue(breadcrumb) as T;
}

/** Sentry v11 equivalent of sendDefaultPii: false — collect no user info, cookies, headers, bodies or query. */
export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
} as const;
