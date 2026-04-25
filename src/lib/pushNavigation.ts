/**
 * Bridges native push notifications to the in-app navigation logic.
 *
 * The push listener (in lib/pushNotifications.ts) lives outside React, so it
 * can't call hooks or dispatch directly. Instead it calls dispatchPushAction()
 * here, which delegates to whatever handler page.tsx registered on mount.
 *
 * Type mapping deliberately mirrors NotificationsPanel so a tap on the in-app
 * notification row and a tap on the OS push notification end up at the same
 * place.
 */

export type NavigateAction =
  | { type: "friends"; tab: "friends" | "add" }
  | { type: "groups"; squadId?: string }
  | { type: "feed"; checkId?: string };

type PushNavigationHandler = (action: NavigateAction) => void;

let handler: PushNavigationHandler | null = null;
let pendingAction: NavigateAction | null = null;

/** Register the navigation handler. Call from page.tsx on mount, pass null on unmount. */
export function setPushNavigationHandler(h: PushNavigationHandler | null): void {
  handler = h;
  // If a push fired before page.tsx mounted (cold launch from a notification tap),
  // replay it now.
  if (h && pendingAction) {
    h(pendingAction);
    pendingAction = null;
  }
}

/**
 * Called from the push listener when the user taps a notification. Reads the
 * APN/web-push payload, maps to a navigation action, and routes via the
 * registered handler.
 */
export function dispatchPushAction(payload: unknown): void {
  if (!payload || typeof payload !== "object") return;
  const data = payload as { type?: unknown; relatedId?: unknown };
  if (typeof data.type !== "string") return;
  const relatedId = typeof data.relatedId === "string" ? data.relatedId : undefined;

  const action = mapPushToNavigateAction(data.type, relatedId);
  if (!action) return;

  if (handler) {
    handler(action);
  } else {
    // Cold-launch race: push fires before page.tsx registers. Stash the most
    // recent action and replay when the handler arrives.
    pendingAction = action;
  }
}

/**
 * Map a notification `type` (from the notifications.type CHECK constraint)
 * + optional related id to a navigation action.
 *
 * Mirrors the routing in NotificationsPanel.tsx click handlers.
 */
export function mapPushToNavigateAction(
  notifType: string,
  relatedId?: string,
): NavigateAction | null {
  if (notifType === "friend_request") return { type: "friends", tab: "add" };
  if (notifType === "friend_accepted") return { type: "friends", tab: "friends" };

  // Squad-related → squads tab + auto-select the squad.
  if (
    notifType === "squad_message" ||
    notifType === "squad_invite" ||
    notifType === "squad_mention" ||
    notifType === "squad_join_request" ||
    notifType === "poll_created" ||
    notifType === "date_confirm"
  ) {
    return { type: "groups", squadId: relatedId };
  }

  // Check-related → feed + highlight the check card.
  if (
    notifType === "friend_check" ||
    notifType === "check_response" ||
    notifType === "check_tag" ||
    notifType === "check_date_updated" ||
    notifType === "check_text_updated" ||
    notifType === "check_comment" ||
    notifType === "comment_mention"
  ) {
    return { type: "feed", checkId: relatedId };
  }

  // Event-related → feed (no specific card highlight; events scroll into view
  // via the feed's own logic).
  if (
    notifType === "event_down" ||
    notifType === "friend_event" ||
    notifType === "event_date_updated" ||
    notifType === "event_comment" ||
    notifType === "event_reminder"
  ) {
    return { type: "feed" };
  }

  return null;
}
