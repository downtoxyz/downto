import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";
import { navButton, waitForAppLoaded } from "./helpers/nav";

test.describe("Smoke tests", () => {
  test("login via magic link lands on feed", async ({ page }) => {
    await loginAsTestUser(page);
    await waitForAppLoaded(page);
  });

  test("bottom nav tabs are visible and tappable", async ({ page }) => {
    await loginAsTestUser(page);
    await waitForAppLoaded(page);

    // Switch to Squads tab and verify
    await navButton(page, "Squads").click();
    await expect(page.getByText("Drinks Crew")).toBeVisible({ timeout: 5_000 });

    // Switch to You tab
    await navButton(page, "You").click();

    // Switch back to Feed tab. The seed data doesn't render a "For You"
    // header (that's an empty-state copy that only appears when the feed
    // is empty for non-onboarded users), so just assert the nav round-trip
    // doesn't error.
    await navButton(page, "Feed").click();
    await expect(navButton(page, "Feed")).toBeVisible();
  });
});
