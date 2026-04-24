import * as Sentry from "@sentry/nextjs";

const isProd = process.env.VERCEL_ENV === "production";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN && isProd,
  tracesSampleRate: 0.1,
});
