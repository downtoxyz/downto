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

/** Probe the check; if it's archived/deleted, surface the "gone" screen
 *  instead of dumping the user into a feed where the check no longer appears. */
function navigateToCheckIfActive(
  checkId: string | null,
  onNavigate: (action: { type: "feed"; checkId?: string }) => void,
  onDeletedCheck: () => void,
) {
  if (!checkId) {
    onNavigate({ type: "feed" });
    return;
  }
  db.isInterestCheckActive(checkId).then((active) => {
    if (active) onNavigate({ type: "feed", checkId });
    else onDeletedCheck();
  }).catch(() => {
    // Network/DB hiccup — fall back to existing behavior so the user isn't stranded
    onNavigate({ type: "feed", checkId });
  });
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
  onDeletedCheck,
}: {
  open: boolean;
  onClose: () => void;
  notifications: Notification[];
  setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
  userId: string | null;
  setUnreadCount: React.Dispatch<React.SetStateAction<number>>;
  friends: { id: string }[];
  onNavigate: (action: { type: "friends"; tab: "friends" | "add" } | { type: "groups"; squadId?: string } | { type: "feed"; checkId?: string }) => void;
  onDeletedCheck: () => void;
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
                  } else if (n.type === "event_down" || n.type === "friend_event" || n.type === "event_date_updated" || n.type === "event_comment") {
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
                    navigateToCheckIfActive(n.related_check_id, onNavigate, onDeletedCheck);
                  } else if (n.type === "check_response" || n.type === "friend_check" || n.type === "check_tag" || n.type === "check_date_updated" || n.type === "check_text_updated") {
                    // Mark single notification as read (except check_tag — cleared on accept/decline)
                    if (!n.is_read && n.type !== "check_tag") {
                      if (userId) db.markNotificationRead(n.id);
                      setNotifications((prev) =>
                        prev.map((notif) => notif.id === n.id ? { ...notif, is_read: true } : notif)
                      );
                      setUnreadCount((prev) => Math.max(0, prev - 1));
                    }
                    onClose();
                    navigateToCheckIfActive(n.related_check_id, onNavigate, onDeletedCheck);
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
                      : n.type === "check_date_updated" ? "#E8FF5A22"
                      : n.type === "check_text_updated" ? "#E8FF5A22"
                      : n.type === "event_date_updated" ? "#E8FF5A22"
                      : n.type === "event_comment" ? "#5AC8FA22"
                      : "#5856D622",
                  }}
                >
                  {(() => {
                    const iconProps = { width: 16, height: 16, viewBox: "0 0 256 256", fill: "currentColor" };
                    switch (n.type) {
                      case "friend_request":
                        // Sparkle
                        return <svg {...iconProps}><path d="M208,144a15.78,15.78,0,0,1-10.42,14.94L146,178l-19,51.62a15.92,15.92,0,0,1-29.88,0L78,178l-51.62-19a15.92,15.92,0,0,1,0-29.88L78,110l19-51.62a15.92,15.92,0,0,1,29.88,0L146,110l51.62,19A15.78,15.78,0,0,1,208,144ZM152,48h16V64a8,8,0,0,0,16,0V48h16a8,8,0,0,0,0-16H184V16a8,8,0,0,0-16,0V32H152a8,8,0,0,0,0,16Zm88,32h-8V72a8,8,0,0,0-16,0v8h-8a8,8,0,0,0,0,16h8v8a8,8,0,0,0,16,0V96h8a8,8,0,0,0,0-16Z"/></svg>;
                      case "friend_accepted":
                        // Handshake
                        return <svg {...iconProps}><path d="M119.76,217.94A8,8,0,0,1,108.92,218l-42.84-44A8,8,0,0,1,64,169.71V48a8,8,0,0,1,8-8H200a8,8,0,0,1,8,8V169.71a8,8,0,0,1-2.08,4.3l-42.84,44A8,8,0,0,1,152.24,218Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16"/></svg>;
                      case "check_response":
                        // Lightning
                        return <svg {...iconProps}><path d="M215.79,118.17a8,8,0,0,0-5-5.66L153.18,90.9l14.66-73.33a8,8,0,0,0-13.69-7l-112,120a8,8,0,0,0,3,13l57.63,21.61L88.16,238.43a8,8,0,0,0,13.69,7l112-120A8,8,0,0,0,215.79,118.17Z"/></svg>;
                      case "squad_invite":
                        // UserPlus
                        return <svg {...iconProps}><path d="M256,136a8,8,0,0,1-8,8H232v16a8,8,0,0,1-16,0V144H200a8,8,0,0,1,0-16h16V112a8,8,0,0,1,16,0v16h16A8,8,0,0,1,256,136Zm-57.87,58.85a8,8,0,0,1-12.26,10.3C165.75,181.19,138.09,168,108,168s-57.75,13.19-77.87,37.15a8,8,0,0,1-12.26-10.3C34.41,175.4,60.92,159,92,152.83A64,64,0,1,1,124,152.83,131.36,131.36,0,0,1,198.13,194.85ZM108,136a48,48,0,1,0-48-48A48.05,48.05,0,0,0,108,136Z"/></svg>;
                      case "date_confirm":
                        // CalendarCheck
                        return <svg {...iconProps}><path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32Zm0,176H48V48H72v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24ZM165.66,117.66l-48,48a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l42.34-42.35a8,8,0,0,1,11.32,11.32Z"/></svg>;
                      case "check_tag":
                        // At
                        return <svg {...iconProps}><path d="M128,24A104,104,0,1,0,232,128a104.11,104.11,0,0,0-104-104Zm0,192a88,88,0,1,1,88-88,88.1,88.1,0,0,1-88,88Zm0-136a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Z"/></svg>;
                      case "squad_join_request":
                        // UserCirclePlus
                        return <svg {...iconProps}><path d="M256,136a8,8,0,0,1-8,8H232v16a8,8,0,0,1-16,0V144H200a8,8,0,0,1,0-16h16V112a8,8,0,0,1,16,0v16h16A8,8,0,0,1,256,136Zm-57.87,58.85a8,8,0,0,1-12.26,10.3C165.75,181.19,138.09,168,108,168s-57.75,13.19-77.87,37.15a8,8,0,0,1-12.26-10.3C34.41,175.4,60.92,159,92,152.83A64,64,0,1,1,124,152.83,131.36,131.36,0,0,1,198.13,194.85ZM108,136a48,48,0,1,0-48-48A48.05,48.05,0,0,0,108,136Z"/></svg>;
                      case "event_down":
                        // Check
                        return <svg {...iconProps}><path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/></svg>;
                      case "friend_event":
                        // Confetti
                        return <svg {...iconProps}><path d="M111.49,52.63a15.8,15.8,0,0,0-26,5.77L33,202.78A15.83,15.83,0,0,0,47.76,224a16,16,0,0,0,5.46-1l144.37-52.5a15.8,15.8,0,0,0,5.78-26Zm-2.92,13.11L160,117.18l-49.43,18L62.32,86.94Zm-45,109.83L41.56,214.44l38.67-106.3,48.26,48.26ZM152,32V16a8,8,0,0,1,16,0V32a8,8,0,0,1-16,0Zm74.26,37.75a8,8,0,0,1,0,11.31l-11.31,11.32a8,8,0,1,1-11.32-11.32L214.94,69.74A8,8,0,0,1,226.26,69.74ZM224,104a8,8,0,0,1,8,8v16a8,8,0,0,1-16,0V112A8,8,0,0,1,224,104Z"/></svg>;
                      case "check_date_updated":
                      case "event_date_updated":
                        // Clock / calendar
                        return <svg {...iconProps}><path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32Zm0,176H48V96H208V208ZM48,80V48H72v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80Zm84,56v32l27.58,15.76a8,8,0,0,1-7.94,13.87l-32-18.29a8,8,0,0,1-4-6.95V136a8,8,0,0,1,16,0Z"/></svg>;
                      case "check_text_updated":
                        // Pencil
                        return <svg {...iconProps}><path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z"/></svg>;
                      default:
                        // ChatTeardrop
                        return <svg {...iconProps}><path d="M132,24A100.11,100.11,0,0,0,32,124v84a16,16,0,0,0,16,16h84a100,100,0,0,0,0-200Zm0,184H48V124a84,84,0,1,1,84,84Z"/></svg>;
                    }
                  })()}
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
