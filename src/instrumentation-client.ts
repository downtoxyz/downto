// Client-side Sentry init. Next.js 15+ loads this file automatically
// (the older `sentry.client.config.ts` at the project root is no longer
// auto-picked up on the client — that's why DSN-set deploys were still silent).
import "../sentry.client.config";

import * as Sentry from "@sentry/nextjs";
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
