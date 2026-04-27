import { defineConfig } from "@playwright/test";

// Port + base URL are env-overridable so test-e2e.sh can bring up a dev
// server on a free port (avoiding clashes with `npm run dev:staging` which
// holds 3000), without each contributor having to remember to set both.
const PORT = process.env.PORT || "3000";
const BASE_URL =
  process.env.PLAYWRIGHT_TEST_BASE_URL || `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: BASE_URL,
    viewport: { width: 393, height: 852 },
    browserName: "chromium",
  },
  webServer: {
    command: `PORT=${PORT} npm run dev`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
