import type { Page, Locator } from "@playwright/test";

/**
 * Get a bottom nav button by its label.
 * The nav bar renders buttons with text like "⚡ Feed", "📅 Cal", etc.
 */
export function navButton(page: Page, label: string): Locator {
  // Use getByRole with a regex. The accessible name includes the emoji.
  // We use a regex that ends with the label.
  const locator = page.getByRole("button", { name: new RegExp(`${label}$`) });
  // "Cal" collides with "Save to Cal" button — use .last() to get the nav one
  // (nav buttons render after content buttons in DOM order)
  if (label === "Cal") return locator.last();
  return locator;
}

/**
 * Wait for the app to finish loading after auth.
 * Waits for the bottom nav to actually render instead of a fixed delay.
 */
export async function waitForAppLoaded(page: Page) {
  await page.getByRole("button", { name: /Feed$/ }).waitFor({ timeout: 15_000 });
}
