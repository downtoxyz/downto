"use client";

import { useState, useCallback, useEffect, type MutableRefObject } from "react";
import * as db from "@/lib/db";
import type { Profile } from "@/lib/types";
import type { Friend } from "@/lib/ui-types";
import { DEMO_SEARCH_USERS } from "@/lib/demo-data";
import { logError, logWarn } from "@/lib/logger";

// ─── Hook ──────────────────────────────────────────────────────────────────

interface UseFriendsParams {
  userId: string | null;
  isDemoMode: boolean;
  showToast: (msg: string) => void;
  loadRealDataRef: MutableRefObject<() => Promise<void>>;
}

export function useFriends({ userId, isDemoMode, showToast, loadRealDataRef }: UseFriendsParams) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [suggestions, setSuggestions] = useState<Friend[]>([]);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [friendsInitialTab, setFriendsInitialTab] = useState<"friends" | "add">("friends");

  const hydrateFriends = useCallback((
    friendsList: Awaited<ReturnType<typeof db.getFriends>>,
    pendingRequests: Awaited<ReturnType<typeof db.getPendingRequests>>,
    suggestedUsers: Profile[]
  ) => {
    const transformedFriends: Friend[] = friendsList.map(({ profile: p, friendshipId }) => ({
      id: p.id,
      friendshipId,
      name: p.display_name,
      username: p.username,
      avatar: p.avatar_letter,
      status: "friend" as const,
      availability: p.availability,
      igHandle: p.ig_handle ?? undefined,
    }));
    setFriends(transformedFriends);

    const incomingFriends: Friend[] = pendingRequests.map((f) => ({
      id: f.requester!.id,
      friendshipId: f.id,
      name: f.requester!.display_name,
      username: f.requester!.username,
      avatar: f.requester!.avatar_letter,
      status: "incoming" as const,
      igHandle: f.requester!.ig_handle ?? undefined,
    }));
    const suggestedFriends: Friend[] = suggestedUsers.map((p) => ({
      id: p.id,
      name: p.display_name,
      username: p.username,
      avatar: p.avatar_letter,
      status: "none" as const,
      igHandle: p.ig_handle ?? undefined,
    }));
    setSuggestions([...incomingFriends, ...suggestedFriends]);
  }, []);

  const addFriend = async (id: string) => {
    if (isDemoMode) {
      setSuggestions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: "pending" as const } : s))
      );
      showToast("Friend request sent! \u{1F91D}");
      return;
    }

    try {
      await db.sendFriendRequest(id);
      setSuggestions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: "pending" as const } : s))
      );
      showToast("Friend request sent! \u{1F91D}");
    } catch (err) {
      logError("sendFriendRequest", err, { friendId: id });
      showToast("Failed to send request");
    }
  };

  const acceptRequest = async (id: string) => {
    const person = suggestions.find((s) => s.id === id);
    if (!person) return;

    if (!person.friendshipId) {
      setFriends((prev) => [...prev, { ...person, status: "friend" as const, availability: "open" as const }]);
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
      showToast(`${person.name} added! \u{1F389}`);
      return;
    }

    try {
      await db.acceptFriendRequest(person.friendshipId);
      setFriends((prev) => [...prev, { ...person, status: "friend" as const, availability: "open" as const }]);
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
      showToast(`${person.name} added! \u{1F389}`);
      loadRealDataRef.current();
    } catch (err) {
      logError("acceptFriendRequest", err, { friendId: person.id });
      showToast("Failed to accept request");
    }
  };

  const removeFriend = async (id: string) => {
    const person = friends.find((f) => f.id === id);
    if (!person) return;

    if (!person.friendshipId) {
      setFriends((prev) => prev.filter((f) => f.id !== id));
      showToast(`Removed ${person.name}`);
      return;
    }

    try {
      await db.removeFriend(person.friendshipId);
      setFriends((prev) => prev.filter((f) => f.id !== id));
      showToast(`Removed ${person.name}`);
    } catch (err) {
      logError("removeFriend", err, { friendId: person.id });
      showToast("Failed to remove friend");
    }
  };

  const searchUsers = !isDemoMode && userId ? async (query: string) => {
    // Fetch search results + outgoing pending requests in parallel
    const [results, outgoing] = await Promise.all([
      db.searchUsers(query),
      db.getOutgoingPendingIds(),
    ]);
    const friendIds = new Set(friends.map((f) => f.id));
    const pendingIds = new Set([
      ...suggestions.filter((s) => s.status === "pending" || s.status === "incoming").map((s) => s.id),
      ...outgoing,
    ]);

    return results
      .filter((p) => p.id !== userId)
      .map((p) => ({
        id: p.id,
        name: p.display_name,
        username: p.username,
        avatar: p.avatar_letter,
        status: friendIds.has(p.id)
          ? "friend" as const
          : pendingIds.has(p.id)
            ? "pending" as const
            : "none" as const,
        availability: p.availability,
        igHandle: p.ig_handle ?? undefined,
      }));
  } : isDemoMode ? async (query: string) => {
    return DEMO_SEARCH_USERS.filter(u =>
      u.name.toLowerCase().includes(query.toLowerCase()) ||
      u.username.toLowerCase().includes(query.toLowerCase())
    );
  } : undefined;

  // Subscribe to realtime friendship changes
  useEffect(() => {
    if (isDemoMode || !userId) return;

    const sub = db.subscribeToFriendships(userId, async (event, friendship) => {
      const otherUserId = friendship.requester_id === userId
        ? friendship.addressee_id
        : friendship.requester_id;

      if (event === "DELETE") {
        setFriends((prev) => prev.filter((f) => f.id !== otherUserId));
        setSuggestions((prev) => prev.filter((s) => s.id !== otherUserId));
      } else if (event === "UPDATE" && friendship.status === "accepted") {
        setSuggestions((prev) => {
          const person = prev.find((s) => s.id === otherUserId);
          if (person) {
            setFriends((prevFriends) => {
              if (prevFriends.some((f) => f.id === otherUserId)) return prevFriends;
              return [...prevFriends, { ...person, status: "friend" as const, availability: "open" as const }];
            });
            return prev.filter((s) => s.id !== otherUserId);
          }
          return prev;
        });
        loadRealDataRef.current();
      } else if (event === "INSERT" && friendship.status === "pending" && friendship.addressee_id === userId) {
        try {
          const profile = await db.getProfileById(otherUserId);
          if (profile) {
            setSuggestions((prev) => {
              if (prev.some((s) => s.id === otherUserId)) return prev;
              return [{
                id: profile.id,
                friendshipId: friendship.id,
                name: profile.display_name,
                username: profile.username,
                avatar: profile.avatar_letter,
                status: "incoming" as const,
              }, ...prev];
            });
          }
        } catch (err) {
          logWarn("fetchFriendProfile", "Failed to fetch friend profile", { otherUserId });
        }
      }
    });

    return () => { sub.unsubscribe(); };
  }, [isDemoMode, userId, loadRealDataRef]);

  return {
    friends,
    setFriends,
    suggestions,
    setSuggestions,
    friendsOpen,
    setFriendsOpen,
    friendsInitialTab,
    setFriendsInitialTab,
    hydrateFriends,
    addFriend,
    acceptRequest,
    removeFriend,
    searchUsers,
  };
}
