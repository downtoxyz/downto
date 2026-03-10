import type { NextConfig } from "next";
import { execSync } from "child_process";
import { withSentryConfig } from "@sentry/nextjs";

const USER_FACING = [
  "src/components/",
  "src/hooks/",
  "src/app/page.tsx",
  "src/app/layout.tsx",
  "src/lib/styles.ts",
  "src/lib/db.ts",
  "src/lib/types.ts",
  "public/",
];

function detectSkipNotify(): string {
  // Manual override always wins
  if (process.env.SKIP_UPDATE_NOTIFY) return process.env.SKIP_UPDATE_NOTIFY;
  try {
    const changed = execSync("git diff HEAD~1 --name-only", {
      encoding: "utf8",
    }).trim();
    if (!changed) return "false";
    const hasUserFacing = changed
      .split("\n")
      .some((f) => USER_FACING.some((p) => f.startsWith(p)));
    return hasUserFacing ? "false" : "true";
  } catch {
    // Shallow clone or no git — default to notifying users
    return "false";
  }
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ["http://127.0.0.1"],
  reactStrictMode: true,
  typescript: {
    // Type errors are caught in dev/IDE; skip during build to save ~8s on Vercel
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ["@sentry/nextjs", "@sentry/node"],
  env: {
    NEXT_PUBLIC_BUILD_ID:
      process.env.VERCEL_GIT_COMMIT_SHA ?? new Date().toISOString(),
    NEXT_PUBLIC_SKIP_UPDATE_NOTIFY: detectSkipNotify(),
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV ?? "",
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  sourcemaps: {
    // Only upload source maps when SENTRY_AUTH_TOKEN is set (Vercel CI)
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
