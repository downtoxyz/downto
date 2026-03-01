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

    // Switch to Feed tab
    await navButton(page, "Feed").click();
    await expect(page.getByText("For You")).toBeVisible({ timeout: 5_000 });

    // Switch to Cal tab — use .last() because "Save to Cal" button also exists
    await navButton(page, "Cal").last().click();
  });
});
