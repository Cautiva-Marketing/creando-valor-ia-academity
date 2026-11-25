/**
 * PII/secret scrubbing for Sentry (research.md §R21): emails, form bodies, cookies, invitation
 * tokens in URLs (/invitacion/<token>) and `token_hash` parameters never leave the process.
 * Framework-agnostic so it can be unit tested and shared by server, edge and client configs.
 * 002 (FR-057): practice conversations never reach Sentry — content keys are filtered everywhere and
 * request/response bodies of /api/practicas/* and /api/internal/* are dropped.
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
  /^(password|contrase(n|ñ)a|code|token|token_hash|secret|cookie|cookies|authorization|email|correo|set-cookie|content|reply|text|prompt)$/i;

/** Endpoints whose bodies carry conversation content or internal secrets. */
const CONTENT_ENDPOINT = /\/api\/(practicas|internal)\//i;
const BODY_KEY = /body|^data$/i;

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
  if (copy.request?.url && CONTENT_ENDPOINT.test(copy.request.url)) {
    const contexts = copy.contexts as Record<string, Record<string, unknown>> | undefined;
    if (contexts?.response) delete contexts.response.data;
  }
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
  const copy = scrubValue(breadcrumb) as BreadcrumbLike;
  const url = copy.data?.url;
  if (copy.data && typeof url === 'string' && CONTENT_ENDPOINT.test(url)) {
    for (const key of Object.keys(copy.data)) if (BODY_KEY.test(key)) delete copy.data[key];
  }
  return copy as T;
}

/** Sentry v11 equivalent of sendDefaultPii: false — collect no user info, cookies, headers, bodies or query. */
export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
} as const;
