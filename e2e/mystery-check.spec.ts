import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";
import { waitForAppLoaded } from "./helpers/nav";

/**
 * Mystery check creation — regression coverage for the prod bug where the
 * Send button stayed permanently disabled when the mystery toggle was on
 * (the CreateModal referenced an undefined `parsedDate` after the
 * useDateTimeInput hook was refactored to expose `parsedDateISO` instead).
 *
 * Goldens this test guards:
 *   1. Toggling the mystery switch flips the submit button's label to
 *      "Send Mystery Check →" and disables it until idea + date + location
 *      are all filled.
 *   2. Filling only the date leaves the button disabled (location still
 *      required by the DB CHECK constraint mirror in the UI gate).
 *   3. Filling all three enables the button — *this* assertion is the one
 *      that would have caught the prod bug before it shipped.
 *   4. Submitting actually creates the check and renders it in the feed.
 *      The author always sees their own mystery check unredacted, so the
 *      idea text shows up directly without a "███████" name placeholder.
 */
test.describe("Mystery check creation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
    await waitForAppLoaded(page);
  });

  test("toggling mystery on with all fields filled enables the Send Mystery Check button", async ({ page }) => {
    await page.getByRole("button", { name: "+" }).click();

    const dateTimeInput = page.getByPlaceholder("e.g. tmr 7pm");
    await expect(dateTimeInput).toBeVisible({ timeout: 5_000 });

    const ideaText = `playwright mystery ${Date.now()}`;
    const ideaTextarea = page.locator("textarea").first();
    await ideaTextarea.fill(ideaText);

    // Before toggling: regular Send button is enabled with just an idea.
    const regularButton = page.getByRole("button", { name: /Send (Interest|Movie) Check/ });
    await expect(regularButton).toBeEnabled();

    // Toggle mystery mode on — the toggle is a button containing "Mystery mode".
    await page.getByRole("button", { name: /Mystery mode/ }).click();

    // The submit-button label should flip to the mystery variant…
    const mysteryButton = page.getByRole("button", { name: /Send Mystery Check/ });
    await expect(mysteryButton).toBeVisible();

    // …and it should be disabled because date + location are missing.
    await expect(mysteryButton).toBeDisabled();

    // Fill date only — still disabled (location required).
    await dateTimeInput.fill("tmr 7pm");
    await expect(mysteryButton).toBeDisabled();

    // Fill location — NOW the button enables. This is the regression check
    // for the prod bug; before the fix this stayed disabled forever.
    await page.getByPlaceholder("location").fill("Somewhere downtown");
    await expect(mysteryButton).toBeEnabled({ timeout: 5_000 });

    // Submit and confirm the check lands in the feed. The author always sees
    // their own mystery check unredacted, so the idea text is searchable.
    await mysteryButton.click();
    await expect(dateTimeInput).toBeHidden({ timeout: 5_000 });
    await expect(page.getByText(ideaText, { exact: false })).toBeVisible({ timeout: 5_000 });
  });

  test("toggling mystery off after filling fields restores the regular Send Interest Check button", async ({ page }) => {
    await page.getByRole("button", { name: "+" }).click();
    await expect(page.getByPlaceholder("e.g. tmr 7pm")).toBeVisible({ timeout: 5_000 });

    await page.locator("textarea").first().fill(`playwright toggle ${Date.now()}`);

    // Toggle on, then off.
    const toggle = page.getByRole("button", { name: /Mystery mode/ });
    await toggle.click();
    await expect(page.getByRole("button", { name: /Send Mystery Check/ })).toBeVisible();
    await toggle.click();

    // Back to the regular label, enabled even without date/location.
    const regularButton = page.getByRole("button", { name: /Send (Interest|Movie) Check/ });
    await expect(regularButton).toBeVisible();
    await expect(regularButton).toBeEnabled();
  });
});
