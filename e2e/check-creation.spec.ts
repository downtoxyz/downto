import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";
import { waitForAppLoaded } from "./helpers/nav";

/**
 * Interest check creation — exercises the natural-language date parser
 * (parseNaturalDate / parseNaturalTime in src/lib/utils.ts), the
 * createInterestCheck DB call, and the feed re-render that surfaces the
 * new check. Covers the specific concern that perf refactors might silently
 * break date handling on creation.
 */
test.describe("Interest check creation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
    await waitForAppLoaded(page);
  });

  test("creating a check with 'tmr 7pm' renders the parsed date and time on the new card", async ({ page }) => {
    // Open the AddModal (defaults to Interest Check mode).
    await page.getByRole("button", { name: "+" }).click();

    // The check textarea uses a placeholder rotation — match by role + the
    // adjacent Date/Time input as the anchor instead.
    const dateTimeInput = page.getByPlaceholder("e.g. tmr 7pm");
    await expect(dateTimeInput).toBeVisible({ timeout: 5_000 });

    // A unique idea string we can grep for in the feed afterwards.
    const ideaText = `playwright check ${Date.now()}`;

    // Find the idea textarea — it's the one whose placeholder includes
    // either "drop your idea" or one of the rotated check placeholders.
    // Easier: grab the first <textarea> in the modal.
    const ideaTextarea = page.locator("textarea").first();
    await ideaTextarea.fill(ideaText);

    // Natural-language date/time. The parser resolves "tmr 7pm" to
    // tomorrow's date + "7pm".
    await dateTimeInput.fill("tmr 7pm");

    // Submit. The button label changes between "Send Interest Check →"
    // and "Send Movie Check →" depending on whether a Letterboxd URL was
    // pasted; match either.
    await page.getByRole("button", { name: /Send (Interest|Movie) Check/ }).click();

    // Modal should close.
    await expect(dateTimeInput).toBeHidden({ timeout: 5_000 });

    // The new check should appear in the feed with the idea text.
    const newCard = page.getByText(ideaText, { exact: false });
    await expect(newCard).toBeVisible({ timeout: 5_000 });

    // The card should display tomorrow's weekday/month/day plus "7pm".
    // We don't hard-code the exact label string because the day-of-week
    // depends on when the test runs; just compute it the same way the
    // app's eventDateLabel formatter does.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const expectedDateLabel = tomorrow.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    // Walk up to the card root, then assert both pieces are present
    // somewhere inside it (they render in the same metadata row).
    const cardRoot = newCard.locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
    await expect(cardRoot).toContainText(expectedDateLabel);
    await expect(cardRoot).toContainText("7pm");
  });

  test("creating a check with no date renders without a date row", async ({ page }) => {
    await page.getByRole("button", { name: "+" }).click();

    const dateTimeInput = page.getByPlaceholder("e.g. tmr 7pm");
    await expect(dateTimeInput).toBeVisible({ timeout: 5_000 });

    const ideaText = `playwright dateless ${Date.now()}`;
    await page.locator("textarea").first().fill(ideaText);
    // Leave date input blank.

    await page.getByRole("button", { name: /Send (Interest|Movie) Check/ }).click();
    await expect(dateTimeInput).toBeHidden({ timeout: 5_000 });

    const newCard = page.getByText(ideaText, { exact: false });
    await expect(newCard).toBeVisible({ timeout: 5_000 });

    // No date label should appear on the card. We can't easily assert
    // negative presence on a regex, so instead assert the idea is the
    // only metadata-bearing text we expect.
    const cardRoot = newCard.locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
    await expect(cardRoot).not.toContainText(/\bMon|Tue|Wed|Thu|Fri|Sat|Sun\b/);
  });

  test("tapping 'DOWN ?' on someone else's check flips it to 'DOWN' with a confirmation toast", async ({ page }) => {
    // Sara's ramen check from the seed (c3333333…) is the cleanest
    // test target — authored by sara, no pre-existing responses, so kat
    // sees "DOWN ?" until she taps. (Sara's drinks check has kat already
    // marked down in the seed for the squad-formation fixture.)
    const ideaText = "looking for a group to try that new ramen spot";
    const checkBody = page.getByText(ideaText, { exact: false });
    await expect(checkBody).toBeVisible({ timeout: 5_000 });

    const cardRoot = checkBody.locator(
      "xpath=ancestor::div[contains(@class,'rounded-2xl')][1]"
    );
    const downButton = cardRoot.getByRole("button", { name: /DOWN \?/ });
    await expect(downButton).toBeVisible();

    await downButton.click();

    // Optimistic flip — the button label drops the "?" once the response
    // is registered. Toast confirms.
    await expect(cardRoot.getByRole("button", { name: /^DOWN$/ })).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText(/You're down/)).toBeVisible({ timeout: 5_000 });
  });
});
