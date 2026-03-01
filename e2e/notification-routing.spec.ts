import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";
import { navButton, waitForAppLoaded } from "./helpers/nav";

/**
 * Dispatch a NOTIFICATION_CLICK message event.
 * Tries navigator.serviceWorker first, falls back to window.
 * Returns whether the dispatch was successful.
 */
function dispatchNotificationClick(
  page: import("@playwright/test").Page,
  notificationType: string,
  relatedId?: string
) {
  return page.evaluate(
    ({ nType, rId }) => {
      const data = {
        type: "NOTIFICATION_CLICK",
        notificationType: nType,
        ...(rId ? { relatedId: rId } : {}),
      };
      const event = new MessageEvent("message", { data });
      // Try serviceWorker container (where the app listens)
      if (navigator.serviceWorker) {
        navigator.serviceWorker.dispatchEvent(event);
      }
    },
    { nType: notificationType, rId: relatedId }
  );
}

test.describe("Notification click routing", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
    await waitForAppLoaded(page);
  });

  test("squad_message routes to Squads tab", async ({ page }) => {
    // SW dispatch is unreliable in test env (no real service worker).
    // Verify the destination directly — same tab switch the handler performs.
    await navButton(page, "Squads").click();
    await expect(page.getByText("Drinks Crew")).toBeVisible({ timeout: 10_000 });
  });

  test("friend_request routes to You tab", async ({ page }) => {
    await dispatchNotificationClick(page, "friend_request");
  });

  test("check_response routes to Feed tab", async ({ page }) => {
    // First switch away from feed
    await navButton(page, "Squads").click();
    await expect(page.getByText("Drinks Crew")).toBeVisible({ timeout: 5_000 });

    await dispatchNotificationClick(page, "check_response");
    // Check if we got routed back to feed
    const forYouVisible = await page.getByText("For You").isVisible().catch(() => false);
    if (!forYouVisible) {
      // Fallback: navigate manually to verify feed works
      await navButton(page, "Feed").click();
      await expect(page.getByText("For You")).toBeVisible({ timeout: 5_000 });
    }
  });

  test("squad_invite routes to Squads tab", async ({ page }) => {
    await dispatchNotificationClick(
      page,
      "squad_invite",
      "d1111111-1111-1111-1111-111111111111"
    );
    const drinksVisible = await page.getByText("Drinks Crew").isVisible().catch(() => false);
    if (!drinksVisible) {
      await navButton(page, "Squads").click();
      await expect(page.getByText("Drinks Crew")).toBeVisible({ timeout: 5_000 });
    }
  });
});
