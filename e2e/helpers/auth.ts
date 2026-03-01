import type { Page } from "@playwright/test";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "";

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
    body: JSON.stringify({ type: "magiclink", email }),
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
  // Wait for auth redirect to complete and app to render
  await page.waitForURL(/127\.0\.0\.1:3000/, { timeout: 15_000 });
}
