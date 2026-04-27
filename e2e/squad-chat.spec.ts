import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";
import { navButton, waitForAppLoaded } from "./helpers/nav";

test.describe("Squad chat flow", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
    await waitForAppLoaded(page);
  });

  test("open squad, see chat, send message, go back", async ({ page }) => {
    // Navigate to Squads tab
    await navButton(page, "Squads").click();

    // Should see the "Drinks Crew" squad from seed data
    const squadCard = page.getByText("Drinks Crew");
    await expect(squadCard).toBeVisible({ timeout: 5_000 });

    // Click to open the squad chat
    await squadCard.click();

    // Chat should open — message input should be visible
    const messageInput = page.getByPlaceholder(/message/i);
    await expect(messageInput).toBeVisible({ timeout: 5_000 });

    // Should see existing messages from seed data
    await expect(page.getByText("where should we meet")).toBeVisible();

    // Send a new message
    await messageInput.fill("sounds good, see you there!");
    await messageInput.press("Enter");

    // New message should appear in chat. `exact: true` because the squad's
    // truncated lastMsg preview (e.g. "You: sounds good, see you…") matches
    // the same substring in fuzzy mode and trips strict-mode violation.
    await expect(
      page.getByText("sounds good, see you there!", { exact: true })
    ).toBeVisible({ timeout: 5_000 });

    // Go back to squad list. The chat header's back button is a `‹` glyph
    // (not `←`); easiest to grab it by role since it's inside ChatHeader's
    // <button>. Bottom nav buttons are obscured by the chat overlay so
    // tapping the Squads tab doesn't work here.
    await page.getByRole("button", { name: "‹" }).click();

    // Squad list should be visible again
    await expect(page.getByText("Drinks Crew")).toBeVisible({ timeout: 5_000 });
  });
});
