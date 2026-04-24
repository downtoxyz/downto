import * as Sentry from "@sentry/nextjs";

const SENSITIVE_KEYS = ["note", "rawCaption", "caption", "email", "password"];

// Preview deploys race the staging Supabase migrations workflow, so they
// produce transient schema-cache errors that aren't real bugs. Only page
// from production; dev (no DSN) and preview both stay silent.
const isProd = process.env.NEXT_PUBLIC_VERCEL_ENV === "production";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN && isProd,
  release: process.env.NEXT_PUBLIC_BUILD_ID,
  tracesSampleRate: 0.1,
  // Transient failures the app already recovers from — not actionable as bugs.
  ignoreErrors: [
    // Network drops / aborted requests (user lost wifi, cellular hiccup, tab backgrounded).
    "Load failed", // Safari / WebKit
    "Failed to fetch", // Chrome, Firefox, Edge
    "NetworkError when attempting to fetch resource", // Firefox
    "The network connection was lost", // iOS
    "The Internet connection appears to be offline", // iOS
    "cancelled", // Safari aborted request
    // Supabase auth lock stolen between tabs / across Strict Mode remounts.
    // The stealing side recovers (supabase-js/locks.ts); the stolen side's
    // in-flight query rejects with this AbortError and re-runs on next refresh.
    // Chrome and Safari word this differently; match both.
    "Lock broken by another request with the 'steal' option", // Chrome / V8
    "Lock was stolen by another request", // Safari / WebKit
    // Stale refresh token — the session row is gone server-side (expired, or
    // the user signed out elsewhere). supabase-js already signs the user out
    // locally and emits SIGNED_OUT; the thrown AuthApiError is just leaked.
    "Invalid Refresh Token: Refresh Token Not Found",
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
