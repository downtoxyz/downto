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
}

export function useNotifications({ userId, isDemoMode }: UseNotificationsParams) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const [notifs, count] = await Promise.all([
        db.getNotifications(),
        db.getUnreadCount(),
      ]);
      setNotifications(notifs);
      setUnreadCount(count);
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

  // Sync bell unread count to PWA app badge
  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;
    if (unreadCount > 0) {
      navigator.setAppBadge(unreadCount).catch(() => {});
    } else {
      navigator.clearAppBadge().catch(() => {});
    }
  }, [unreadCount]);

  return {
    notifications,
    setNotifications,
    unreadCount,
    setUnreadCount,
    notificationsOpen,
    setNotificationsOpen,
    loadNotifications,
    loadNotificationsRef,
  };
}
