import * as Sentry from "@sentry/nextjs";

const SENSITIVE_KEYS = ["note", "rawCaption", "caption", "email", "password"];

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  release: process.env.NEXT_PUBLIC_BUILD_ID,
  tracesSampleRate: 0.1,
  beforeSend(event) {
    // Defensive: strip free-text fields (event notes, scraped captions) that
    // could leak user content. Call sites should already avoid sending these
    // via logError context — this is a safety net.
    if (event.extra) {
      for (const k of SENSITIVE_KEYS) {
        if (k in event.extra) delete event.extra[k];
      }
    }
    return event;
  },
});
