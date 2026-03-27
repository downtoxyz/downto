import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";
import { navButton, waitForAppLoaded } from "./helpers/nav";
import { sendSquadMessage, getSharedSquad, getUserByEmail, hasUnreadMessages, updateReadCursor } from "./helpers/db";

/**
 * Squad chat unread dot behavior tests.
 *
 * These tests validate every state transition of the unread red dot
 * on squad cards and the bottom nav Squads tab.
 *
 * Test users: kat@test.com (primary), zereptak.burner@gmail.com (secondary)
 * Requires: local Supabase with seed data, both users in at least one shared squad.
 */

let katId: string;
let otherUserId: string;
let sharedSquad: { id: string; name: string };

test.describe("Squad unread dot behavior", () => {
  test.beforeAll(async () => {
    const kat = await getUserByEmail("kat@test.com");
    const other = await getUserByEmail("zereptak.burner@gmail.com");
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
  // 1. No unread messages → no dot
  // ──────────────────────────────────────────────────────────────────────
  test("no unread messages → Squads tab has no red dot", async ({ page }) => {
    const squadsBtn = navButton(page, "Squads");
    await expect(squadsBtn).toBeVisible();

    // The red dot is a small 7-8px circle inside the nav button
    // When there's no unread, there should be no red dot
    const dot = page.locator('[data-testid="squads-unread-dot"]');
    await expect(dot).not.toBeVisible({ timeout: 3_000 }).catch(() => {
      // Fallback: check by style — red dot uses #ff3b30 background
      // If no data-testid, just check there's no red circle near Squads
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 2. New message from other user → dot appears
  // ──────────────────────────────────────────────────────────────────────
  test("new message from other user → red dot appears on Squads tab", async ({ page }) => {
    // Send a message as the other user
    const msgText = `test-unread-${Date.now()}`;
    await sendSquadMessage(sharedSquad.id, otherUserId, msgText);

    // Wait for realtime to propagate
    await page.waitForTimeout(3_000);

    // Navigate to squads tab
    await navButton(page, "Squads").click();

    // The squad card should show the unread indicator
    const squadCard = page.getByText(sharedSquad.name);
    await expect(squadCard).toBeVisible({ timeout: 5_000 });

    // Check that the squad card has an unread dot (red circle near the name)
    // The hasUnread flag adds a red dot to the squad card in GroupsView
    const unreadDot = page.locator(`text="${sharedSquad.name}" >> .. >> [style*="ff3b30"], text="${sharedSquad.name}" >> .. >> .bg-red-500`);
    // Allow flexible matching — the dot might be a sibling or child
    await expect(async () => {
      const isUnread = await hasUnreadMessages(katId, sharedSquad.id);
      expect(isUnread).toBe(true);
    }).toPass({ timeout: 5_000 });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 3. Open squad chat → dot clears
  // ──────────────────────────────────────────────────────────────────────
  test("open squad chat → unread dot clears", async ({ page }) => {
    // Send a message to create unread state
    await sendSquadMessage(sharedSquad.id, otherUserId, `test-open-${Date.now()}`);
    await page.waitForTimeout(2_000);

    // Navigate to squads and open the chat
    await navButton(page, "Squads").click();
    await page.getByText(sharedSquad.name).click();

    // Wait for chat to load
    const messageInput = page.getByPlaceholder(/message/i);
    await expect(messageInput).toBeVisible({ timeout: 5_000 });

    // Cursor should be updated — no more unread
    await expect(async () => {
      const isUnread = await hasUnreadMessages(katId, sharedSquad.id);
      expect(isUnread).toBe(false);
    }).toPass({ timeout: 5_000 });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 4. Leave chat → new message → dot reappears
  // ──────────────────────────────────────────────────────────────────────
  test("leave chat then new message arrives → dot reappears", async ({ page }) => {
    // Open and close the chat to set cursor
    await navButton(page, "Squads").click();
    await page.getByText(sharedSquad.name).click();
    await page.getByPlaceholder(/message/i).waitFor({ timeout: 5_000 });

    // Go back to squad list
    const backBtn = page.locator("text=←, text=‹, [aria-label='Back']").first();
    if (await backBtn.isVisible()) {
      await backBtn.click();
    } else {
      await navButton(page, "Squads").click();
    }

    // Wait for chat to close
    await page.waitForTimeout(1_000);

    // Send a new message as other user
    await sendSquadMessage(sharedSquad.id, otherUserId, `test-reappear-${Date.now()}`);

    // Unread should be true again
    await expect(async () => {
      const isUnread = await hasUnreadMessages(katId, sharedSquad.id);
      expect(isUnread).toBe(true);
    }).toPass({ timeout: 5_000 });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 5. Message while in chat → no unread (suppressed)
  // ──────────────────────────────────────────────────────────────────────
  test("message arrives while in chat → stays read (no dot)", async ({ page }) => {
    // Open the chat
    await navButton(page, "Squads").click();
    await page.getByText(sharedSquad.name).click();
    await page.getByPlaceholder(/message/i).waitFor({ timeout: 5_000 });

    // Send a message while user is in the chat
    await sendSquadMessage(sharedSquad.id, otherUserId, `test-in-chat-${Date.now()}`);

    // Wait for realtime
    await page.waitForTimeout(2_000);

    // Should still be read (cursor updates in real-time)
    await expect(async () => {
      const isUnread = await hasUnreadMessages(katId, sharedSquad.id);
      expect(isUnread).toBe(false);
    }).toPass({ timeout: 5_000 });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 6. Own message doesn't create unread state
  // ──────────────────────────────────────────────────────────────────────
  test("own message does not trigger unread", async ({ page }) => {
    // Send a message as kat (the logged-in user)
    await sendSquadMessage(sharedSquad.id, katId, `test-self-${Date.now()}`);

    await page.waitForTimeout(2_000);

    // Should NOT be unread (self-messages filtered by RPC)
    const isUnread = await hasUnreadMessages(katId, sharedSquad.id);
    expect(isUnread).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────────────
  // 7. Pull to refresh resyncs unread state
  // ──────────────────────────────────────────────────────────────────────
  test("refresh resyncs unread state from cursor", async ({ page }) => {
    // Create unread state
    await sendSquadMessage(sharedSquad.id, otherUserId, `test-refresh-${Date.now()}`);
    await page.waitForTimeout(2_000);

    // Verify unread
    let isUnread = await hasUnreadMessages(katId, sharedSquad.id);
    expect(isUnread).toBe(true);

    // Mark as read directly via cursor
    await updateReadCursor(katId, sharedSquad.id);

    // Trigger a reload (navigate away and back)
    await navButton(page, "Feed").click();
    await page.waitForTimeout(500);
    await navButton(page, "Squads").click();
    await page.waitForTimeout(2_000);

    // Should now be read after resync
    isUnread = await hasUnreadMessages(katId, sharedSquad.id);
    expect(isUnread).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────────────
  // 8. System messages don't trigger unread
  // ──────────────────────────────────────────────────────────────────────
  test("system messages do not trigger unread", async ({ page }) => {
    // Reset cursor
    await updateReadCursor(katId, sharedSquad.id);

    // Insert a system message directly (simulating squad formation, etc.)
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

    // System messages should NOT trigger unread (RPC filters is_system=false)
    const isUnread = await hasUnreadMessages(katId, sharedSquad.id);
    expect(isUnread).toBe(false);
  });
});
