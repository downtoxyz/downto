"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import * as db from "@/lib/db";
import { logWarn } from "@/lib/logger";

// ─── Hook ──────────────────────────────────────────────────────────────────

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  related_user_id: string | null;
  related_squad_id: string | null;
  related_check_id: string | null;
  is_read: boolean;
  created_at: string;
};

interface UseNotificationsParams {
  userId: string | null;
  isDemoMode: boolean;
  onUnreadSquadIds?: (ids: string[]) => void;
}

export function useNotifications({ userId, isDemoMode, onUnreadSquadIds }: UseNotificationsParams) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasUnreadSquadMessage, setHasUnreadSquadMessage] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const onUnreadSquadIdsRef = useRef(onUnreadSquadIds);
  onUnreadSquadIdsRef.current = onUnreadSquadIds;

  const loadNotifications = useCallback(async () => {
    try {
      const [notifs, count, unreadSquadIds] = await Promise.all([
        db.getNotifications(),
        db.getUnreadCount(),
        db.getUnreadSquadIds(),
      ]);
      setNotifications(notifs);
      setUnreadCount(count);
      if (unreadSquadIds.length > 0) {
        setHasUnreadSquadMessage(true);
        onUnreadSquadIdsRef.current?.(unreadSquadIds);
      }
    } catch (err) {
      logWarn("loadNotifications", "Failed to load notifications", { error: err });
    }
  }, []);

  const loadNotificationsRef = useRef(loadNotifications);
  loadNotificationsRef.current = loadNotifications;

  // Load initial notifications
  useEffect(() => {
    if (isDemoMode || !userId) return;
    loadNotificationsRef.current();
  }, [isDemoMode, userId]);

  // Sync unread count to PWA app badge
  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;
    if (unreadCount > 0) {
      navigator.setAppBadge(unreadCount).catch(() => {});
    } else {
      navigator.clearAppBadge().catch(() => {});
    }
  }, [unreadCount]);

  // Reload notifications on app focus
  useEffect(() => {
    if (isDemoMode || !userId) return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        loadNotificationsRef.current();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [isDemoMode, userId]);

  return {
    notifications,
    setNotifications,
    unreadCount,
    setUnreadCount,
    hasUnreadSquadMessage,
    setHasUnreadSquadMessage,
    notificationsOpen,
    setNotificationsOpen,
    loadNotifications,
    loadNotificationsRef,
  };
}
