import { NextResponse, type NextRequest } from 'next/server';
import { refreshSession } from '@/lib/supabase/proxy';

/**
 * Session refresh + per-request CSP nonce + security headers + optimistic redirects
 * (research.md §R19). Real authorization happens in the server (getRequestContext / guards).
 */
// /api/* stays out on purpose: Route Handlers answer 401 themselves (002 contracts/route-handlers.md).
const PRIVATE_PREFIXES = [
  '/inicio',
  '/onboarding',
  '/perfil',
  '/admin',
  '/design',
  '/productos',
  '/practicar',
  '/practicas',
  '/historial',
];
const NO_REFERRER_PREFIXES = ['/invitacion/', '/auth/confirm'];

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== 'production';
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const connect = [
    "'self'",
    supabase,
    supabase.replace(/^http/, 'ws'),
    'https://*.ingest.sentry.io',
    'https://*.ingest.us.sentry.io',
    'https://vitals.vercel-insights.com',
  ].filter(Boolean);
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connect.join(' ')}`,
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "worker-src 'self' blob:",
  ];
  if (!isDev) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce);
  const { pathname, search } = request.nextUrl;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);
  requestHeaders.set('x-pathname', `${pathname}${search}`);

  const makeResponse = () => NextResponse.next({ request: { headers: requestHeaders } });
  const { response: refreshed, hasUser } = await refreshSession(request, makeResponse);

  let response = refreshed;
  const isPrivate = PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isPrivate && !hasUser) {
    const url = request.nextUrl.clone();
    url.pathname = '/iniciar-sesion';
    url.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
    response = NextResponse.redirect(url);
    for (const cookie of refreshed.cookies.getAll()) response.cookies.set(cookie);
  }

  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set(
    'Referrer-Policy',
    NO_REFERRER_PREFIXES.some((p) => pathname.startsWith(p))
      ? 'no-referrer'
      : 'strict-origin-when-cross-origin',
  );
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  );
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload',
    );
  }
  return response;
}

export const config = {
  matcher: [
    {
      source:
        '/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|api/auth/send-email).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
