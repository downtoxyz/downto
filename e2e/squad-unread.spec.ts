import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";
import { navButton, waitForAppLoaded } from "./helpers/nav";
import { sendSquadMessage, getSharedSquad, getUserByEmail, hasUnreadMessages, updateReadCursor } from "./helpers/db";

/**
 * Squad chat unread dot behavior tests.
 *
 * Validates both the DATA layer (cursor-based RPC) and the UI layer
 * (red dot visibility in BottomNav and squad card).
 *
 * Test users: kat@test.com (primary), sara@test.com (secondary)
 * Requires: local Supabase with seed data, both users in at least one shared squad.
 */

let katId: string;
let otherUserId: string;
let sharedSquad: { id: string; name: string };

const SQUADS_DOT = '[data-testid="squads-unread-dot"]';

test.describe("Squad unread dot behavior", () => {
  test.beforeAll(async () => {
    const kat = await getUserByEmail("kat@test.com");
    const other = await getUserByEmail("sara@test.com");
    if (!kat || !other) throw new Error("Test users not found — seed the database first");
    katId = kat.id;
    otherUserId = other.id;

    const squad = await getSharedSquad(katId, otherUserId);
    if (!squad) throw new Error("Test users not in a shared squad — seed data missing");
    sharedSquad = squad;
  });

  test.beforeEach(async ({ page }) => {
    // Reset: mark squad as read for kat so we start clean
    await updateReadCursor(katId, sharedSquad.id);
    await loginAsTestUser(page);
    await waitForAppLoaded(page);
  });

  // ──────────────────────────────────────────────────────────────────────
  // 1. No unread messages → no dot (DATA + UI)
  // ──────────────────────────────────────────────────────────────────────
  test("no unread messages → no red dot on Squads tab or squad card", async ({ page }) => {
    // DATA: cursor is up to date
    const isUnread = await hasUnreadMessages(katId, sharedSquad.id);
    expect(isUnread).toBe(false);

    // UI: no red dot on bottom nav Squads tab
    await expect(page.locator(SQUADS_DOT)).not.toBeVisible({ timeout: 3_000 });

    // UI: navigate to squads, no dot on the squad card
    await navButton(page, "Squads").click();
    await expect(page.getByText(sharedSquad.name)).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(`[data-testid="squad-unread-dot-${sharedSquad.id}"]`)).not.toBeVisible({ timeout: 2_000 });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 2. New message from other user → dot appears (DATA + UI)
  // ──────────────────────────────────────────────────────────────────────
  test("new message from other user → red dot appears on Squads tab and squad card", async ({ page }) => {
    // Send a message as the other user
    await sendSquadMessage(sharedSquad.id, otherUserId, `test-unread-${Date.now()}`);

    // DATA: RPC should show unread
    await expect(async () => {
      const isUnread = await hasUnreadMessages(katId, sharedSquad.id);
      expect(isUnread).toBe(true);
    }).toPass({ timeout: 5_000 });

    // UI: red dot appears on bottom nav Squads tab
    await expect(page.locator(SQUADS_DOT)).toBeVisible({ timeout: 8_000 });

    // UI: navigate to squads, dot on the squad card
    await navButton(page, "Squads").click();
    await expect(page.locator(`[data-testid="squad-unread-dot-${sharedSquad.id}"]`)).toBeVisible({ timeout: 5_000 });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 3. Open squad chat → dot clears (DATA + UI)
  // ──────────────────────────────────────────────────────────────────────
  test("open squad chat → dots clear on both tab and card", async ({ page }) => {
    // Create unread state
    await sendSquadMessage(sharedSquad.id, otherUserId, `test-open-${Date.now()}`);
    await page.waitForTimeout(2_000);

    // Navigate to squads and open the chat
    await navButton(page, "Squads").click();
    await expect(page.locator(`[data-testid="squad-unread-dot-${sharedSquad.id}"]`)).toBeVisible({ timeout: 5_000 });
    await page.getByText(sharedSquad.name).click();

    // Wait for chat to load
    await expect(page.getByPlaceholder(/message/i)).toBeVisible({ timeout: 5_000 });

    // DATA: cursor should be updated
    await expect(async () => {
      const isUnread = await hasUnreadMessages(katId, sharedSquad.id);
      expect(isUnread).toBe(false);
    }).toPass({ timeout: 5_000 });

    // Go back to squad list
    await page.locator("text=‹").first().click().catch(() => navButton(page, "Squads").click());
    await page.waitForTimeout(1_000);

    // UI: dot should be gone on squad card
    await expect(page.locator(`[data-testid="squad-unread-dot-${sharedSquad.id}"]`)).not.toBeVisible({ timeout: 3_000 });

    // UI: bottom nav dot should be gone (if this was the only unread squad)
    // Note: might still show if OTHER squads have unread — check data first
    const anyUnread = await hasUnreadMessages(katId, sharedSquad.id);
    if (!anyUnread) {
      await expect(page.locator(SQUADS_DOT)).not.toBeVisible({ timeout: 3_000 });
    }
  });

  // ──────────────────────────────────────────────────────────────────────
  // 3b. Swipe-to-dismiss clears dot (DATA + UI)
  // ──────────────────────────────────────────────────────────────────────
  test("swipe-to-dismiss squad chat → dot clears", async ({ page }) => {
    // Create unread state
    await sendSquadMessage(sharedSquad.id, otherUserId, `test-swipe-${Date.now()}`);
    await page.waitForTimeout(2_000);

    // Navigate to squads and open the chat
    await navButton(page, "Squads").click();
    await expect(page.locator(`[data-testid="squad-unread-dot-${sharedSquad.id}"]`)).toBeVisible({ timeout: 5_000 });
    await page.getByText(sharedSquad.name).click();
    await expect(page.getByPlaceholder(/message/i)).toBeVisible({ timeout: 5_000 });

    // Simulate swipe-to-dismiss (swipe right across the chat)
    const viewport = page.viewportSize()!;
    await page.mouse.move(50, viewport.height / 2);
    await page.mouse.down();
    // Swipe right past the 120px threshold
    for (let x = 50; x < 300; x += 25) {
      await page.mouse.move(x, viewport.height / 2);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();

    // Wait for close animation
    await page.waitForTimeout(500);

    // DATA: cursor should be updated on close
    await expect(async () => {
      const isUnread = await hasUnreadMessages(katId, sharedSquad.id);
      expect(isUnread).toBe(false);
    }).toPass({ timeout: 5_000 });

    // UI: dot should be gone
    await expect(page.locator(`[data-testid="squad-unread-dot-${sharedSquad.id}"]`)).not.toBeVisible({ timeout: 5_000 });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 4. Leave chat → new message → dot reappears (DATA + UI)
  // ──────────────────────────────────────────────────────────────────────
  test("leave chat then new message → dot reappears", async ({ page }) => {
    // Open and close the chat to set cursor
    await navButton(page, "Squads").click();
    await page.getByText(sharedSquad.name).click();
    await expect(page.getByPlaceholder(/message/i)).toBeVisible({ timeout: 5_000 });
    await page.locator("text=‹").first().click().catch(() => navButton(page, "Squads").click());
    await page.waitForTimeout(1_000);

    // UI: dot should be gone
    await expect(page.locator(`[data-testid="squad-unread-dot-${sharedSquad.id}"]`)).not.toBeVisible({ timeout: 3_000 });

    // Send a new message as other user
    await sendSquadMessage(sharedSquad.id, otherUserId, `test-reappear-${Date.now()}`);

    // DATA: should be unread again
    await expect(async () => {
      const isUnread = await hasUnreadMessages(katId, sharedSquad.id);
      expect(isUnread).toBe(true);
    }).toPass({ timeout: 5_000 });

    // UI: dot reappears on squad card
    await expect(page.locator(`[data-testid="squad-unread-dot-${sharedSquad.id}"]`)).toBeVisible({ timeout: 8_000 });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 5. Message while in chat → no dot (DATA + UI)
  // ──────────────────────────────────────────────────────────────────────
  test("message arrives while in chat → stays read, no dot", async ({ page }) => {
    // Open the chat
    await navButton(page, "Squads").click();
    await page.getByText(sharedSquad.name).click();
    await expect(page.getByPlaceholder(/message/i)).toBeVisible({ timeout: 5_000 });

    // Send a message while user is in the chat
    const msgText = `inchat-${Date.now()}`;
    await sendSquadMessage(sharedSquad.id, otherUserId, msgText);
    await page.waitForTimeout(3_000);

    // The message should appear in the chat
    await expect(page.getByText(msgText, { exact: true })).toBeVisible({ timeout: 5_000 });

    // DATA: cursor should be updated by realtime handler (async)
    await expect(async () => {
      const isUnread = await hasUnreadMessages(katId, sharedSquad.id);
      expect(isUnread).toBe(false);
    }).toPass({ timeout: 8_000 });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 6. Own message doesn't create unread (DATA)
  // ──────────────────────────────────────────────────────────────────────
  test("own message does not trigger unread", async ({ page }) => {
    await sendSquadMessage(sharedSquad.id, katId, `test-self-${Date.now()}`);
    await page.waitForTimeout(2_000);

    const isUnread = await hasUnreadMessages(katId, sharedSquad.id);
    expect(isUnread).toBe(false);

    // UI: no dot
    await expect(page.locator(SQUADS_DOT)).not.toBeVisible({ timeout: 3_000 });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 7. Tab switch resyncs unread state (DATA + UI)
  // ──────────────────────────────────────────────────────────────────────
  test("switching tabs resyncs unread state", async ({ page }) => {
    // Create unread
    await sendSquadMessage(sharedSquad.id, otherUserId, `test-resync-${Date.now()}`);
    await page.waitForTimeout(2_000);

    // Mark as read directly via cursor (simulating another device)
    await updateReadCursor(katId, sharedSquad.id);

    // Trigger resync by switching tabs
    await navButton(page, "Feed").click();
    await page.waitForTimeout(1_000);
    await navButton(page, "Squads").click();
    await page.waitForTimeout(3_000);

    // DATA: should be read
    const isUnread = await hasUnreadMessages(katId, sharedSquad.id);
    expect(isUnread).toBe(false);

    // UI: dot should be gone after resync
    await expect(page.locator(`[data-testid="squad-unread-dot-${sharedSquad.id}"]`)).not.toBeVisible({ timeout: 5_000 });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 8. System messages don't trigger unread (DATA)
  // ──────────────────────────────────────────────────────────────────────
  test("system messages do not trigger unread", async ({ page }) => {
    await updateReadCursor(katId, sharedSquad.id);

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        squad_id: sharedSquad.id,
        sender_id: null,
        text: "test system message",
        is_system: true,
      }),
    });

    await page.waitForTimeout(2_000);

    const isUnread = await hasUnreadMessages(katId, sharedSquad.id);
    expect(isUnread).toBe(false);

    // UI: no dot
    await expect(page.locator(SQUADS_DOT)).not.toBeVisible({ timeout: 3_000 });
  });
});
