import * as Sentry from '@sentry/nextjs';
import { SENTRY_DATA_COLLECTION, scrubBreadcrumb, scrubEvent } from './src/lib/observability/scrub';

Sentry.init({
  dsn: process.env.SENTRY_DSN || undefined,
  enabled: Boolean(process.env.SENTRY_DSN),
  dataCollection: { ...SENTRY_DATA_COLLECTION, httpBodies: [] },
  // Every trace locally (to verify), 10 % in production.
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1 : 0.1,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  beforeSend: (event) => scrubEvent(event),
  beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
});
