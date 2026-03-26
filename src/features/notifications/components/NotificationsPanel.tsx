"use client";

import { useRef, useState, useEffect } from "react";
import * as db from "@/lib/db";
import { font, color } from "@/lib/styles";
import { formatTimeAgo } from "@/lib/utils";
import { useModalTransition } from "@/shared/hooks/useModalTransition";
import type { Tab } from "@/lib/ui-types";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  related_user_id: string | null;
  related_squad_id: string | null;
  related_check_id: string | null;
  is_read: boolean;
  created_at: string;
}

const NotificationsPanel = ({
  open,
  onClose,
  notifications,
  setNotifications,
  isDemoMode,
  userId,
  setUnreadCount,
  friends,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  notifications: Notification[];
  setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
  isDemoMode: boolean;
  userId: string | null;
  setUnreadCount: React.Dispatch<React.SetStateAction<number>>;
  friends: { id: string }[];
  onNavigate: (action: { type: "friends"; tab: "friends" | "add" } | { type: "groups"; squadId?: string } | { type: "feed"; checkId?: string }) => void;
}) => {
  const { visible, entering, closing, close } = useModalTransition(open, onClose);
  const touchStartY = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // Lock body scroll when panel is open
  useEffect(() => {
    if (!visible) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [visible]);

  const handleSwipeStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    isDragging.current = false;
  };
  const handleSwipeMove = (e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy > 0) {
      isDragging.current = true;
      setDragOffset(dy);
    }
  };
  const handleSwipeEnd = () => {
    if (dragOffset > 60) {
      setDragOffset(0);
      close();
    } else {
      setDragOffset(0);
    }
    isDragging.current = false;
  };

  // Scroll-area: start dragging when at top and pulling down
  const handleScrollTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    isDragging.current = false;
  };
  const handleScrollTouchMove = (e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - touchStartY.current;
    const atTop = scrollRef.current ? scrollRef.current.scrollTop <= 0 : true;
    if (atTop && dy > 0) {
      isDragging.current = true;
      e.preventDefault();
      setDragOffset(dy);
    }
  };
  const handleScrollTouchEnd = () => {
    if (isDragging.current) {
      handleSwipeEnd();
    }
  };

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={close}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: (entering || closing) ? "blur(0px)" : "blur(8px)",
          WebkitBackdropFilter: (entering || closing) ? "blur(0px)" : "blur(8px)",
          opacity: (entering || closing) ? 0 : 1,
          transition: "opacity 0.3s ease, backdrop-filter 0.3s ease, -webkit-backdrop-filter 0.3s ease",
        }}
      />
      <div
        ref={panelRef}
        style={{
          position: "relative",
          background: color.surface,
          borderRadius: "24px 24px 0 0",
          width: "100%",
          maxWidth: 420,
          maxHeight: "80vh",
          padding: "24px 0 0",
          animation: closing ? undefined : "slideUp 0.3s ease-out",
          transform: closing ? "translateY(100%)" : `translateY(${dragOffset}px)`,
          transition: closing ? "transform 0.2s ease-in" : (dragOffset === 0 ? "transform 0.2s ease-out" : "none"),
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          onTouchStart={handleSwipeStart}
          onTouchMove={handleSwipeMove}
          onTouchEnd={handleSwipeEnd}
          style={{ touchAction: "none" }}
        >
          <div
            style={{
              width: 40,
              height: 4,
              background: color.faint,
              borderRadius: 2,
              margin: "0 auto 16px",
            }}
          />
        </div>
        <div
          onTouchStart={handleSwipeStart}
          onTouchMove={handleSwipeMove}
          onTouchEnd={handleSwipeEnd}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0 20px 16px",
            borderBottom: `1px solid ${color.border}`,
            touchAction: "none",
          }}
        >
          <h2
            style={{
              fontFamily: font.serif,
              fontSize: 22,
              color: color.text,
              fontWeight: 400,
            }}
          >
            Notifications
          </h2>
          {notifications.some((n) => !n.is_read) && (
            <button
              onClick={() => {
                if (!isDemoMode && userId) {
                  db.markAllNotificationsRead();
                }
                // Keep pending friend_request notifications unread
                const pendingFriendRequestIds = new Set(
                  notifications
                    .filter((n) => !n.is_read && n.type === "friend_request" && n.related_user_id && !friends.some((f) => f.id === n.related_user_id))
                    .map((n) => n.id)
                );
                setNotifications((prev) => prev.map((n) => pendingFriendRequestIds.has(n.id) ? n : { ...n, is_read: true }));
                setUnreadCount(pendingFriendRequestIds.size);
              }}
              style={{
                background: "none",
                border: "none",
                color: color.accent,
                fontFamily: font.mono,
                fontSize: 11,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Mark all read
            </button>
          )}
        </div>
        <div
          ref={scrollRef}
          onTouchStart={handleScrollTouchStart}
          onTouchMove={handleScrollTouchMove}
          onTouchEnd={handleScrollTouchEnd}
          style={{
            overflowY: isDragging.current ? "hidden" : "auto",
            overflowX: "hidden",
            flex: 1,
            padding: "0 0 32px",
          }}
        >
          {notifications.length === 0 ? (
            <div
              style={{
                padding: "40px 20px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontFamily: font.serif,
                  fontSize: 18,
                  color: color.muted,
                  marginBottom: 8,
                }}
              >
                No notifications yet
              </div>
              <p
                style={{
                  fontFamily: font.mono,
                  fontSize: 11,
                  color: color.faint,
                }}
              >
                You&apos;ll see friend requests, check responses, and squad invites here
              </p>
            </div>
          ) : (
            [...notifications].sort((a, b) => {
              // Pin unread friend_request notifications to the top
              const aPin = !a.is_read && a.type === "friend_request" ? 1 : 0;
              const bPin = !b.is_read && b.type === "friend_request" ? 1 : 0;
              return bPin - aPin;
            }).map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  // Navigate based on type
                  if (n.type === "friend_request" || n.type === "friend_accepted") {
                    // friend_accepted: mark read on click
                    // friend_request: only mark read if already actioned (accepted/declined)
                    const alreadyFriends = n.type === "friend_request" && n.related_user_id &&
                      friends.some((f) => f.id === n.related_user_id);
                    if (!n.is_read && (n.type === "friend_accepted" || alreadyFriends)) {
                      if (!isDemoMode && userId) db.markNotificationRead(n.id);
                      setNotifications((prev) =>
                        prev.map((notif) => notif.id === n.id ? { ...notif, is_read: true } : notif)
                      );
                      setUnreadCount((prev) => Math.max(0, prev - 1));
                    }
                    onClose();
                    onNavigate({
                      type: "friends",
                      tab: n.type === "friend_request" && !alreadyFriends ? "add" : "friends",
                    });
                  } else if (n.type === "squad_message" || n.type === "squad_invite" || n.type === "date_confirm" || n.type === "squad_join_request" || n.type === "squad_mention") {
                    // Mark all notifications for this squad as read
                    const squadId = n.related_squad_id;
                    if (squadId) {
                      if (!isDemoMode && userId) db.markSquadNotificationsRead(squadId);
                      const clearedCount = notifications.filter(
                        (notif) => !notif.is_read && notif.related_squad_id === squadId
                      ).length;
                      setNotifications((prev) =>
                        prev.map((notif) =>
                          notif.related_squad_id === squadId ? { ...notif, is_read: true } : notif
                        )
                      );
                      setUnreadCount((prev) => Math.max(0, prev - clearedCount));
                    } else if (!n.is_read) {
                      if (!isDemoMode && userId) db.markNotificationRead(n.id);
                      setNotifications((prev) =>
                        prev.map((notif) => notif.id === n.id ? { ...notif, is_read: true } : notif)
                      );
                      setUnreadCount((prev) => Math.max(0, prev - 1));
                    }
                    onClose();
                    onNavigate({ type: "groups", squadId: squadId ?? undefined });
                  } else if (n.type === "event_down" || n.type === "friend_event") {
                    if (!n.is_read) {
                      if (!isDemoMode && userId) db.markNotificationRead(n.id);
                      setNotifications((prev) =>
                        prev.map((notif) => notif.id === n.id ? { ...notif, is_read: true } : notif)
                      );
                      setUnreadCount((prev) => Math.max(0, prev - 1));
                    }
                    onClose();
                    onNavigate({ type: "feed" });
                  } else if (n.type === "check_response" || n.type === "friend_check" || n.type === "check_tag") {
                    // Mark single notification as read (except check_tag — cleared on accept/decline)
                    if (!n.is_read && n.type !== "check_tag") {
                      if (!isDemoMode && userId) db.markNotificationRead(n.id);
                      setNotifications((prev) =>
                        prev.map((notif) => notif.id === n.id ? { ...notif, is_read: true } : notif)
                      );
                      setUnreadCount((prev) => Math.max(0, prev - 1));
                    }
                    onClose();
                    onNavigate({ type: "feed", checkId: n.related_check_id ?? undefined });
                  }
                }}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "14px 20px",
                  background: n.is_read ? "transparent" : "rgba(232, 255, 90, 0.04)",
                  border: "none",
                  borderBottom: `1px solid ${color.border}`,
                  cursor: "pointer",
                  width: "100%",
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: n.type === "friend_request" ? "#E8FF5A22"
                      : n.type === "friend_accepted" ? "#34C75922"
                      : n.type === "check_response" ? "#FF9F0A22"
                      : n.type === "squad_invite" ? "#AF52DE22"
                      : n.type === "date_confirm" ? "#E8FF5A22"
                      : n.type === "check_tag" ? "#E8FF5A22"
                      : n.type === "squad_join_request" ? "#AF52DE22"
                      : n.type === "event_down" ? "#E8FF5A22"
                      : n.type === "friend_event" ? "#E8FF5A22"
                      : "#5856D622",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    flexShrink: 0,
                  }}
                >
                  {n.type === "friend_request" ? "👋"
                    : n.type === "friend_accepted" ? "🤝"
                    : n.type === "check_response" ? "🔥"
                    : n.type === "squad_invite" ? "🚀"
                    : n.type === "date_confirm" ? "📅"
                    : n.type === "check_tag" ? "🏷️"
                    : n.type === "squad_join_request" ? "🙋"
                    : n.type === "event_down" ? "✋"
                    : n.type === "friend_event" ? "🎉"
                    : "💬"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: font.mono,
                      fontSize: 12,
                      color: n.is_read ? color.muted : color.text,
                      fontWeight: n.is_read ? 400 : 700,
                      marginBottom: 2,
                    }}
                  >
                    {n.title}
                  </div>
                  {n.body && (
                    <div
                      style={{
                        fontFamily: font.mono,
                        fontSize: 11,
                        color: color.dim,
                        lineHeight: 1.4,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        wordBreak: "break-all",
                      }}
                    >
                      {n.body}
                    </div>
                  )}
                  <div
                    style={{
                      fontFamily: font.mono,
                      fontSize: 10,
                      color: color.faint,
                      marginTop: 4,
                    }}
                  >
                    {formatTimeAgo(new Date(n.created_at))}
                  </div>
                </div>
                {!n.is_read && (
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: color.accent,
                      flexShrink: 0,
                      alignSelf: "center",
                    }}
                  />
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationsPanel;
