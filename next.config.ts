import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: false,
  // `forbidden()` renders app/forbidden.tsx with HTTP 403 ("sin permiso", contracts/routes.md).
  experimental: { authInterrupts: true },
  serverExternalPackages: ['nodemailer'],
  // Files read with fs at runtime (password list, legal documents).
  outputFileTracingIncludes: {
    '/**': [
      './src/lib/security/common-passwords.txt',
      './content/legal/**/*.md',
      './src/styles/tokens.css',
    ],
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // Source maps are uploaded only when an auth token is configured (CI/Vercel).
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  telemetry: false,
});
