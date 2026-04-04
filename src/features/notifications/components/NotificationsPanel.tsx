"use client";

import { useRef, useState, useEffect } from "react";
import * as db from "@/lib/db";
import { color } from "@/lib/styles";
import { formatTimeAgo } from "@/lib/utils";
import { useModalTransition } from "@/shared/hooks/useModalTransition";
import cn from "@/lib/tailwindMerge";
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
  userId,
  setUnreadCount,
  friends,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  notifications: Notification[];
  setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
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
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <div
        onClick={close}
        className="absolute inset-0"
        style={{
          background: "rgba(0,0,0,0.7)",
          backdropFilter: (entering || closing) ? "blur(0px)" : "blur(8px)",
          WebkitBackdropFilter: (entering || closing) ? "blur(0px)" : "blur(8px)",
          opacity: (entering || closing) ? 0 : 1,
          transition: "opacity 0.3s ease, backdrop-filter 0.3s ease, -webkit-backdrop-filter 0.3s ease",
        }}
      />
      <div
        ref={panelRef}
        className="relative bg-surface w-full max-w-[420px] flex flex-col pt-6"
        style={{
          borderRadius: "24px 24px 0 0",
          maxHeight: "80vh",
          animation: closing ? undefined : "slideUp 0.3s ease-out",
          transform: closing ? "translateY(100%)" : `translateY(${dragOffset}px)`,
          transition: closing ? "transform 0.2s ease-in" : (dragOffset === 0 ? "transform 0.2s ease-out" : "none"),
        }}
      >
        <div
          onTouchStart={handleSwipeStart}
          onTouchMove={handleSwipeMove}
          onTouchEnd={handleSwipeEnd}
          className="touch-none"
        >
          <div className="w-10 h-1 bg-faint rounded-sm mx-auto mb-4" />
        </div>
        <div
          onTouchStart={handleSwipeStart}
          onTouchMove={handleSwipeMove}
          onTouchEnd={handleSwipeEnd}
          className="flex justify-between items-center px-5 pb-4 border-b border-border touch-none"
        >
          <h2 className="font-serif text-2xl text-primary font-normal">
            Notifications
          </h2>
          {notifications.some((n) => !n.is_read) && (
            <button
              onClick={() => {
                if (userId) {
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
              className="bg-transparent border-none text-dt font-mono text-xs cursor-pointer uppercase"
              style={{ letterSpacing: "0.08em" }}
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
          className={cn("overflow-x-hidden flex-1 pb-8", isDragging.current ? "overflow-y-hidden" : "overflow-y-auto")}
        >
          {notifications.length === 0 ? (
            <div className="py-10 px-5 text-center">
              <div className="font-serif text-lg text-muted mb-2">
                No notifications yet
              </div>
              <p className="font-mono text-xs text-faint">
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
                      if (userId) db.markNotificationRead(n.id);
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
                      if (userId) db.markSquadNotificationsRead(squadId);
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
                      if (userId) db.markNotificationRead(n.id);
                      setNotifications((prev) =>
                        prev.map((notif) => notif.id === n.id ? { ...notif, is_read: true } : notif)
                      );
                      setUnreadCount((prev) => Math.max(0, prev - 1));
                    }
                    onClose();
                    onNavigate({ type: "groups", squadId: squadId ?? undefined });
                  } else if (n.type === "event_down" || n.type === "friend_event") {
                    if (!n.is_read) {
                      if (userId) db.markNotificationRead(n.id);
                      setNotifications((prev) =>
                        prev.map((notif) => notif.id === n.id ? { ...notif, is_read: true } : notif)
                      );
                      setUnreadCount((prev) => Math.max(0, prev - 1));
                    }
                    onClose();
                    onNavigate({ type: "feed" });
                  } else if (n.type === "check_comment" || n.type === "comment_mention") {
                    if (!n.is_read) {
                      if (userId) db.markNotificationRead(n.id);
                      setNotifications((prev) =>
                        prev.map((notif) => notif.id === n.id ? { ...notif, is_read: true } : notif)
                      );
                      setUnreadCount((prev) => Math.max(0, prev - 1));
                    }
                    onClose();
                    onNavigate({ type: "feed", checkId: n.related_check_id ?? undefined });
                  } else if (n.type === "check_response" || n.type === "friend_check" || n.type === "check_tag") {
                    // Mark single notification as read (except check_tag — cleared on accept/decline)
                    if (!n.is_read && n.type !== "check_tag") {
                      if (userId) db.markNotificationRead(n.id);
                      setNotifications((prev) =>
                        prev.map((notif) => notif.id === n.id ? { ...notif, is_read: true } : notif)
                      );
                      setUnreadCount((prev) => Math.max(0, prev - 1));
                    }
                    onClose();
                    onNavigate({ type: "feed", checkId: n.related_check_id ?? undefined });
                  }
                }}
                className={cn(
                  "flex gap-3 w-full border-none border-b border-border cursor-pointer text-left",
                  n.is_read ? "bg-transparent" : "bg-[rgba(232,255,90,0.04)]"
                )}
                style={{ padding: "14px 20px", borderBottom: `1px solid ${color.border}` }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0"
                  style={{
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
                <div className="flex-1 min-w-0">
                  <div
                    className={cn(
                      "font-mono text-xs mb-0.5",
                      n.is_read ? "text-muted font-normal" : "text-primary font-bold"
                    )}
                  >
                    {n.title}
                  </div>
                  {n.body && (
                    <div
                      className="font-mono text-xs text-dim leading-relaxed overflow-hidden break-all line-clamp-2"
                    >
                      {n.body}
                    </div>
                  )}
                  <div className="font-mono text-tiny text-faint mt-1">
                    {formatTimeAgo(new Date(n.created_at))}
                  </div>
                </div>
                {!n.is_read && (
                  <div className="w-2 h-2 rounded-full bg-dt shrink-0 self-center" />
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
