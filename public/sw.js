// down to — Service Worker for Web Push Notifications

// Track which squad chat is currently open (suppresses push for that squad)
let openSquadId = null;

self.addEventListener("message", (event) => {
  if (event.data?.type === "SQUAD_OPEN") {
    openSquadId = event.data.squadId || null;
  } else if (event.data?.type === "SQUAD_CLOSED") {
    openSquadId = null;
  }
});

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "down to", body: event.data.text() };
  }

  const { title = "down to", body = "", type, relatedId } = data;

  // Suppress notification if user is viewing this squad's chat
  const isSquadType = type === "squad_message" || type === "squad_mention" || type === "squad_invite";
  if (isSquadType && relatedId && relatedId === openSquadId) {
    return; // don't show notification, don't increment badge
  }

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: type ? `${type}-${relatedId || "default"}` : undefined,
        data: { type, relatedId },
      }),
      // Increment PWA app icon badge
      self.registration.getNotifications().then((notifs) => {
        // Count visible notifications as a proxy for unread count
        if (navigator.setAppBadge) {
          navigator.setAppBadge(notifs.length + 1);
        }
      }),
    ])
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // Update app badge: decrement or clear
  self.registration.getNotifications().then((notifs) => {
    if (navigator.setAppBadge && notifs.length > 0) {
      navigator.setAppBadge(notifs.length);
    } else if (navigator.clearAppBadge) {
      navigator.clearAppBadge();
    }
  });

  const { type, relatedId } = event.notification.data || {};

  // Map notification type to a tab
  let tab = "/";
  if (type === "friend_request" || type === "friend_accepted") {
    tab = "/?tab=profile&openFriends=1";
  } else if (type === "squad_message" || type === "squad_invite" || type === "squad_join_request" || type === "squad_mention") {
    tab = relatedId ? `/?tab=groups&squadId=${relatedId}` : "/?tab=groups";
  } else if (type === "check_response" || type === "friend_check" || type === "check_comment" || type === "comment_mention") {
    tab = relatedId ? `/?tab=feed&checkId=${relatedId}` : "/?tab=feed";
  } else if (type === "date_confirm" || type === "poll_created") {
    tab = relatedId ? `/?tab=groups&squadId=${relatedId}` : "/?tab=groups";
  } else if (type === "event_reminder") {
    tab = "/?tab=calendar";
  } else if (type === "event_down" || type === "friend_event") {
    tab = "/?tab=feed";
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus existing window and navigate
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin) {
          return client.focus().then((focused) => {
            if (focused) {
              focused.postMessage({
                type: "NOTIFICATION_CLICK",
                notificationType: type,
                relatedId: relatedId,
              });
            }
          });
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(tab);
    })
  );
});
