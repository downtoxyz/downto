import type { Page } from "@playwright/test";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Where the magic-link redirect should land. Defaults to the playwright
// config's baseURL — overridable via PLAYWRIGHT_TEST_BASE_URL when
// test-e2e.sh routes the dev server to a non-default port. The chosen port
// must be present in supabase/config.toml's `additional_redirect_urls` or
// Supabase will reject the redirect.
const APP_BASE_URL =
  process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:3000";

/**
 * Log in a test user via Supabase magic link (admin API).
 * Navigates the page to the magic link URL, which authenticates the session.
 */
export async function loginAsTestUser(
  page: Page,
  email = "kat@test.com"
): Promise<void> {
  if (!SERVICE_ROLE) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for E2E auth. " +
        "Set it in env or .env.development.local."
    );
  }

  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "magiclink",
      email,
      // Pin the redirect explicitly. Without this Supabase falls back to the
      // site_url from config.toml, which is wrong when tests run on 3101.
      redirect_to: APP_BASE_URL,
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to generate magic link: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const actionLink = data?.properties?.action_link || data?.action_link;
  if (!actionLink) {
    throw new Error(`No action_link in magic link response: ${JSON.stringify(data).slice(0, 200)}`);
  }

  await page.goto(actionLink);
  // Wait for auth redirect to complete and app to render at the expected origin.
  const expectedHost = new URL(APP_BASE_URL).host;
  await page.waitForURL(new RegExp(expectedHost.replace(/\./g, "\\.")), { timeout: 15_000 });
}
