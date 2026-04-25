"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import * as db from "@/lib/db";
import type { AppNotification } from "@/features/notifications/hooks/useNotifications";
import type { Squad } from "@/lib/ui-types";
import type { Friend } from "@/lib/ui-types";
import { logWarn } from "@/lib/logger";

interface UseRealtimeNotificationsParams {
  isLoggedIn: boolean;
  userId: string | null;
  selectedSquadIdRef: MutableRefObject<string | null>;
  showToastRef: MutableRefObject<(msg: string) => void>;
  loadRealDataRef: MutableRefObject<() => Promise<void>>;
  setSquads: React.Dispatch<React.SetStateAction<Squad[]>>;
  setNotifications: React.Dispatch<React.SetStateAction<AppNotification[]>>;
  setUnreadCount: React.Dispatch<React.SetStateAction<number>>;
  setSuggestions: React.Dispatch<React.SetStateAction<Friend[]>>;
  setFriends: React.Dispatch<React.SetStateAction<Friend[]>>;
}

/**
 * Subscribes to realtime notification inserts and handles each type:
 * - squad_message/squad_mention: set hasUnread or auto-mark read if chat is open
 * - friend_request: add to suggestions as incoming
 * - friend_accepted: move from suggestions to friends
 * - squad_invite, friend_check, check_tag: toast + reload
 * - event_down, friend_event: mark read
 */
export function useRealtimeNotifications({
  isLoggedIn,
  userId,
  selectedSquadIdRef,
  showToastRef,
  loadRealDataRef,
  setSquads,
  setNotifications,
  setUnreadCount,
  setSuggestions,
  setFriends,
}: UseRealtimeNotificationsParams) {
  // Keep refs to avoid stale closures in the subscription callback
  const setSquadsRef = useRef(setSquads);
  setSquadsRef.current = setSquads;
  const setNotificationsRef = useRef(setNotifications);
  setNotificationsRef.current = setNotifications;
  const setUnreadCountRef = useRef(setUnreadCount);
  setUnreadCountRef.current = setUnreadCount;
  const setSuggestionsRef = useRef(setSuggestions);
  setSuggestionsRef.current = setSuggestions;
  const setFriendsRef = useRef(setFriends);
  setFriendsRef.current = setFriends;

  useEffect(() => {
    if (!isLoggedIn || !userId) return;

    const channel = db.subscribeToNotifications(userId, async (newNotif) => {
      if (newNotif.type === "squad_message" || newNotif.type === "squad_mention") {
        // Skip own messages
        if (newNotif.related_user_id === userId) return;
        // Auto-mark read if chat is open
        if (newNotif.related_squad_id && newNotif.related_squad_id === selectedSquadIdRef.current) {
          db.markSquadRead(newNotif.related_squad_id).catch(() => {});
          return;
        }
        // Set hasUnread on the squad
        if (newNotif.related_squad_id) {
          setSquadsRef.current((prev) => prev.map((s) =>
            s.id === newNotif.related_squad_id ? { ...s, hasUnread: true } : s
          ));
        }
      } else {
        // Non-squad notification: add to bell list
        const isOpenSquad = newNotif.related_squad_id && newNotif.related_squad_id === selectedSquadIdRef.current;
        if (isOpenSquad) {
          db.markNotificationRead(newNotif.id).catch(() => {});
          setNotificationsRef.current((prev) => [{ ...newNotif, is_read: true }, ...prev]);
        } else {
          setNotificationsRef.current((prev) => [newNotif, ...prev]);
          setUnreadCountRef.current((prev) => prev + 1);
        }
      }

      // Type-specific side effects
      if (newNotif.type === "friend_request" && newNotif.related_user_id) {
        if (newNotif.body) showToastRef.current(newNotif.body);
        try {
          const [reqProfile, friendship] = await Promise.all([
            db.getProfileById(newNotif.related_user_id),
            db.getFriendshipWith(newNotif.related_user_id),
          ]);
          if (reqProfile) {
            const incoming = {
              id: reqProfile.id,
              friendshipId: friendship?.id ?? undefined,
              name: reqProfile.display_name,
              username: reqProfile.username,
              avatar: reqProfile.avatar_letter,
              status: "incoming" as const,
              igHandle: reqProfile.ig_handle ?? undefined,
            };
            setSuggestionsRef.current((prev) => {
              if (prev.some((s) => s.id === reqProfile.id)) return prev;
              return [incoming, ...prev];
            });
          }
        } catch (err) {
          logWarn("fetchIncomingFriend", "Failed to fetch incoming friend profile", { relatedUserId: newNotif.related_user_id });
        }
      } else if (newNotif.type === "squad_invite") {
        if (newNotif.body) showToastRef.current(newNotif.body);
        loadRealDataRef.current();
      } else if (newNotif.type === "friend_check") {
        if (newNotif.body) showToastRef.current(newNotif.body);
        loadRealDataRef.current();
      } else if (newNotif.type === "check_tag") {
        if (newNotif.body) showToastRef.current(newNotif.title + ": " + newNotif.body);
        loadRealDataRef.current();
      } else if (newNotif.type === "check_archived" || newNotif.type === "check_revived") {
        // Realtime on `interest_checks` is RLS-gated: once a check is
        // archived, the recipient loses SELECT visibility and so the
        // UPDATE event never reaches them — their cached checks list
        // would otherwise still show the row. Same in reverse on revive
        // when the row was previously hidden. Fall through to a full
        // refresh so the feed converges to the new state.
        loadRealDataRef.current();
      } else if (newNotif.type === "friend_accepted" && newNotif.related_user_id) {
        if (newNotif.body) showToastRef.current(newNotif.body);
        loadRealDataRef.current();
        const relatedId = newNotif.related_user_id;
        setSuggestionsRef.current((prev) => {
          const person = prev.find((s) => s.id === relatedId);
          if (person) {
            setFriendsRef.current((prevFriends) => {
              if (prevFriends.some((f) => f.id === relatedId)) return prevFriends;
              return [...prevFriends, { ...person, status: "friend" as const, availability: "open" as const }];
            });
            return prev.filter((s) => s.id !== relatedId);
          }
          db.getProfileById(relatedId).then((p) => {
            if (p) {
              setFriendsRef.current((prevFriends) => {
                if (prevFriends.some((f) => f.id === relatedId)) return prevFriends;
                return [...prevFriends, {
                  id: p.id,
                  name: p.display_name,
                  username: p.username,
                  avatar: p.avatar_letter,
                  status: "friend" as const,
                  availability: "open" as const,
                }];
              });
            }
          }).catch((err) => logWarn("fetchFriendProfile", "Failed", { error: err }));
          return prev;
        });
      }
    });

    return () => { channel.unsubscribe(); };
  }, [isLoggedIn, userId, selectedSquadIdRef, showToastRef, loadRealDataRef]);
}
