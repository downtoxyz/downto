import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  release: process.env.NEXT_PUBLIC_BUILD_ID,
  tracesSampleRate: 0.1,
});
