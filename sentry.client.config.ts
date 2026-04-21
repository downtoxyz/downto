import * as Sentry from "@sentry/nextjs";

const SENSITIVE_KEYS = ["note", "rawCaption", "caption", "email", "password"];

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  release: process.env.NEXT_PUBLIC_BUILD_ID,
  tracesSampleRate: 0.1,
  // Transient network failures (user lost wifi, cellular hiccup, request aborted).
  // Not actionable — the app already catches and retries on refocus.
  ignoreErrors: [
    "Load failed", // Safari / WebKit
    "Failed to fetch", // Chrome, Firefox, Edge
    "NetworkError when attempting to fetch resource", // Firefox
    "The network connection was lost", // iOS
    "The Internet connection appears to be offline", // iOS
    "cancelled", // Safari aborted request
  ],
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
