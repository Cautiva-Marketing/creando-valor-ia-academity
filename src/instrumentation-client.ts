import * as Sentry from '@sentry/nextjs';
import { SENTRY_DATA_COLLECTION, scrubBreadcrumb, scrubEvent } from '@/lib/observability/scrub';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  dataCollection: { ...SENTRY_DATA_COLLECTION, httpBodies: [] },
  // Every trace locally (to verify), 10 % in production.
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1 : 0.1,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  beforeSend: (event) => scrubEvent(event),
  beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
