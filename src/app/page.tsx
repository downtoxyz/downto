"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePullToRefresh } from "@/app/hooks/usePullToRefresh";
import { useAppNavigation } from "@/app/hooks/useAppNavigation";
import { useEvents } from "@/features/events/hooks/useEvents";
import { supabase } from "@/lib/supabase";
import * as db from "@/lib/db";
import { font, color } from "@/lib/styles";
import { sanitize, sanitizeVibes, parseDateToISO, toLocalISODate } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import type { Person, Event, Tab, ScrapedEvent, InterestCheck } from "@/lib/ui-types";
import { DEMO_EVENTS, DEMO_CHECKS, DEMO_TONIGHT, DEMO_SQUADS, DEMO_FRIENDS, DEMO_SUGGESTIONS, DEMO_NOTIFICATIONS, DEMO_SEARCH_USERS } from "@/lib/demo-data";
import Grain from "@/app/components/Grain";
import AuthScreen from "@/features/auth/components/AuthScreen";
import ProfileSetupScreen from "@/features/auth/components/ProfileSetupScreen";
import EnableNotificationsScreen, { IOSInstallScreen } from "@/features/auth/components/EnableNotificationsScreen";
import EditEventModal from "@/features/events/components/EditEventModal";
import EventLobby from "@/features/events/components/EventLobby";
import AddModal from "@/features/events/components/CreateModal";
import UserProfileOverlay from "@/features/friends/components/UserProfileOverlay";
import FeedView from "@/features/feed/components/FeedView";
import FriendsModal from "@/features/friends/components/FriendsModal";
import OnboardingFriendsPopup from "@/features/friends/components/OnboardingFriendsPopup";
import CalendarView from "@/features/calendar/components/CalendarView";
import GroupsView from "@/features/squads/components/GroupsView";
import ProfileView from "@/features/profile/components/ProfileView";
import Header from "@/app/components/Header";
import BottomNav from "@/app/components/BottomNav";
import Toast from "@/app/components/Toast";
import { isIOSNotStandalone } from "@/lib/pushNotifications";
import NotificationsPanel from "@/features/notifications/components/NotificationsPanel";
import FirstCheckScreen from "@/features/checks/components/FirstCheckScreen";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useToast } from "@/app/hooks/useToast";
import { usePushNotifications } from "@/features/auth/hooks/usePushNotifications";
import { useChecks } from "@/features/checks/hooks/useChecks";
import { useSquads } from "@/features/squads/hooks/useSquads";
import { useFriends } from "@/features/friends/hooks/useFriends";
import { useNotifications } from "@/features/notifications/hooks/useNotifications";
import { useCheckComments } from "@/features/checks/hooks/useCheckComments";
import { logError, logWarn } from "@/lib/logger";


// ─── Main App ───────────────────────────────────────────────────────────────

export default function Home() {
  const { isLoggedIn, setIsLoggedIn, isLoading, userId, setUserId, profile, setProfile, isDemoMode, setIsDemoMode } = useAuth();
  const { toastMsg, setToastMsg, toastAction, setToastAction, showToast, showToastWithAction, showToastRef } = useToast();
  const { pushEnabled, pushSupported, handleTogglePush } = usePushNotifications(isLoggedIn, isDemoMode, showToast);

  // ─── Tab / routing state ────────────────────────────────────────────────
  const {
    tab, setTab,
    feedMode, setFeedMode,
    squadChatOrigin, setSquadChatOrigin,
    chatOpen, setChatOpen,
    scrolledDown, setScrolledDown,
  } = useAppNavigation();
  const [feedLoaded, setFeedLoaded] = useState(false);

  // ─── loadRealData ref (declared early so hooks can receive it) ──────────
  const loadRealDataRef = useRef<() => Promise<void>>(async () => {});

  // ─── Event state ─────────────────────────────────────────────────────────
  const eventsHook = useEvents({ userId, isDemoMode, showToast, loadRealDataRef });
  const {
    events, setEvents,
    tonightEvents, setTonightEvents,
    editingEvent, setEditingEvent,
    newlyAddedId, setNewlyAddedId,
    archivedChecks, setArchivedChecks,
    hydrateEvents, hydrateSocialData,
    toggleSave, toggleDown, handleEditEvent,
  } = eventsHook;

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addModalDefaultMode, setAddModalDefaultMode] = useState<"paste" | "idea" | "manual" | null>(null);

  // ─── PWA install gate (iOS Safari, pre-auth) ───────────────────────────
  const [installDismissed, setInstallDismissed] = useState(true); // default true to avoid flash
  useEffect(() => {
    setInstallDismissed(
      !isIOSNotStandalone() || localStorage.getItem("pwa-install-dismissed") === "1"
    );
  }, []);

  // ─── Misc page-level state ──────────────────────────────────────────────
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [onboardingFriendGate, setOnboardingFriendGate] = useState(false);
  const [onboardingCheckAuthorId, setOnboardingCheckAuthorId] = useState<string | null>(null);
  const [profileSetupDone, setProfileSetupDone] = useState(false);
  const [notificationsDone, setNotificationsDone] = useState(false);
  const [showFirstCheck, setShowFirstCheck] = useState(false);
  const [pendingSharedCheckId, setPendingSharedCheckId] = useState<string | null>(null);
  const [activeSharedCheckId, setActiveSharedCheckId] = useState<string | null>(null);
  const [showAddGlow, setShowAddGlow] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("showAddGlow") === "true";
    }
    return false;
  });

  // ─── Domain hooks ───────────────────────────────────────────────────────
  const friendsHook = useFriends({
    userId,
    isDemoMode,
    showToast,
    loadRealDataRef,
  });

  const checksHook = useChecks({
    userId,
    isDemoMode,
    profile,
    friendCount: friendsHook.friends.length,
    showToast,
    onCheckCreated: () => { setTab("feed"); setFeedMode("foryou"); setShowAddGlow(false); localStorage.removeItem("showAddGlow"); },
    onDownResponse: () => { loadRealDataRef.current(); },
    onAutoSquad: (checkId: string) => {
      const check = checksHook.checks.find((c) => c.id === checkId);
      if (check && !check.squadId) {
        squadsHook.startSquadFromCheck(check);
      }
    },
    onCoAuthorRespond: (checkId: string) => {
      // Mark check_tag notification as read when user accepts/declines
      const tagNotif = notificationsHook.notifications.find(
        (n) => n.type === "check_tag" && n.related_check_id === checkId && !n.is_read
      );
      if (tagNotif) {
        if (!isDemoMode && userId) db.markNotificationRead(tagNotif.id);
        notificationsHook.setNotifications((prev) =>
          prev.map((n) => n.id === tagNotif.id ? { ...n, is_read: true } : n)
        );
        notificationsHook.setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    },
  });

  const squadsHook = useSquads({
    userId,
    isDemoMode,
    profile,
    setChecks: checksHook.setChecks,
    showToast,
    onSquadCreated: () => { setSquadChatOrigin(tab); setTab("groups"); },
    onAutoDown: async (eventId: string) => {
      await db.saveEvent(eventId).catch(() => {});
      await db.toggleDown(eventId, true);
      setEvents((prev) =>
        prev.map((e) => e.id === eventId ? { ...e, isDown: true, saved: true } : e)
      );
      showToast("You're down! \u{1F919}");
    },
  });

  const commentsHook = useCheckComments({ userId, profile, isDemoMode });

  const notificationsHook = useNotifications({
    userId,
    isDemoMode,
    onUnreadSquadIds: (ids) => {
      squadsHook.setSquads((prev) => prev.map((s) =>
        ids.includes(s.id) ? { ...s, hasUnread: true } : s
      ));
    },
  });

  // ─── loadRealData (thin coordinator) ────────────────────────────────────

  const isLoadingRef = useRef(false);

  const loadRealData = useCallback(async () => {
    if (isDemoMode || !userId) return;
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;

    try {
      // Phase 1: Fetch all independent data in parallel
      const [
        savedEvents,
        publicEvents,
        friendsEvents,
        friendsList,
        pendingRequests,
        outgoingRequests,
        suggestedUsers,
        activeChecks,
        squadsList,
        hiddenIds,
        fofAnnotations,
        archivedChecksList,
        leftChecksList,
      ] = await Promise.all([
        db.getSavedEvents(),
        db.getPublicEvents(),
        db.getFriendsEvents(),
        db.getFriends(),
        db.getPendingRequests(),
        db.getOutgoingPendingRequests().catch((err) => { logWarn("loadOutgoingRequests", "Failed", { error: err }); return [] as Awaited<ReturnType<typeof db.getOutgoingPendingRequests>>; }),
        db.getSuggestedUsers().catch((err) => { logWarn("loadSuggestions", "Failed", { error: err }); return [] as Awaited<ReturnType<typeof db.getSuggestedUsers>>; }),
        db.getActiveChecks().catch((err) => { logWarn("loadChecks", "Failed", { error: err }); return [] as Awaited<ReturnType<typeof db.getActiveChecks>>; }),
        db.getSquads().catch((err) => { logWarn("loadSquads", "Failed", { error: err }); return [] as Awaited<ReturnType<typeof db.getSquads>>; }),
        db.getHiddenCheckIds().catch((err) => { logWarn("loadHiddenChecks", "Failed", { error: err }); return [] as string[]; }),
        db.getFofAnnotations().catch((err) => { logWarn("loadFofAnnotations", "Failed", { error: err }); return [] as { check_id: string; via_friend_name: string }[]; }),
        db.getArchivedChecks().catch((err) => { logWarn("loadArchivedChecks", "Failed", { error: err }); return [] as { id: string; text: string; archived_at: string }[]; }),
        db.getLeftChecks().catch((err) => { logWarn("loadLeftChecks", "Failed", { error: err }); return [] as Awaited<ReturnType<typeof db.getLeftChecks>>; }),
      ]);

      // Phase 2: Transform events via useEvents hook
      hydrateEvents(savedEvents, publicEvents, friendsEvents);

      // Phase 3: Hydrate domain hooks
      friendsHook.hydrateFriends(friendsList, pendingRequests, suggestedUsers, outgoingRequests);
      checksHook.hydrateChecks(activeChecks, hiddenIds, fofAnnotations);
      squadsHook.hydrateSquads(squadsList);
      setArchivedChecks(archivedChecksList);
      checksHook.hydrateLeftChecks(leftChecksList);

      // Hydrate comment counts
      const activeCheckIds = activeChecks.map(c => c.id);
      if (activeCheckIds.length > 0) {
        db.getCheckCommentCounts(activeCheckIds)
          .then(counts => commentsHook.hydrateCommentCounts(counts))
          .catch(() => {});
      }

      setFeedLoaded(true);

      // Phase 4: Backfill social data (peopleDown + crew pool)
      const savedEventIds = savedEvents.map((se) => se.event!.id);
      const allEventIds = [...new Set([...savedEventIds, ...publicEvents.map((e) => e.id), ...friendsEvents.map((e) => e.id)])];
      if (allEventIds.length > 0) {
        try {
          const [peopleDownMap, crewPoolMap, userPoolEventIds] = await Promise.all([
            db.getPeopleDownBatch(allEventIds),
            db.getCrewPoolBatch(allEventIds),
            db.getUserPoolEventIds(allEventIds),
          ]);
          hydrateSocialData(peopleDownMap, crewPoolMap, userPoolEventIds);
        } catch (err) {
          logWarn("loadPeopleDown", "Failed to load social data", { error: err });
        }
      }

    } catch (err) {
      logError("loadRealData", err);
    } finally {
      isLoadingRef.current = false;
      setFeedLoaded(true);
    }
  }, [isDemoMode, userId, checksHook.hydrateChecks, squadsHook.hydrateSquads, friendsHook.hydrateFriends, hydrateEvents, hydrateSocialData]);

  loadRealDataRef.current = loadRealData;

  // ─── Pull-to-refresh ──────────────────────────────────────────────────
  const {
    scrollRef,
    innerRef,
    spinnerWrapRef,
    spinnerRef,
    handleTouchStart: handlePullStart,
    handleTouchMove: handlePullMove,
    handleTouchEnd: handlePullEnd,
  } = usePullToRefresh({
    onRefresh: loadRealData,
    enabledTabs: ["feed", "calendar", "groups"],
    chatOpen,
    tab,
  });

  // ─── Effects ────────────────────────────────────────────────────────────

  // Capture ?add= and ?pendingCheck= params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const addUser = params.get("add");
    if (addUser) {
      localStorage.setItem("pendingAddUsername", addUser);
      window.history.replaceState({}, "", "/");
    }
    const pendingCheck = params.get("pendingCheck");
    if (pendingCheck) {
      localStorage.setItem("pendingCheckId", pendingCheck);
      window.history.replaceState({}, "", "/");
    }
    // Deep-link params from SW cold-open
    if (params.get("openFriends")) {
      friendsHook.setFriendsInitialTab("friends");
      friendsHook.setFriendsOpen(true);
      window.history.replaceState({}, "", `/?tab=${params.get("tab") || "profile"}`);
    }
    const checkId = params.get("checkId");
    if (checkId) {
      setFeedMode("foryou");
      checksHook.setNewlyAddedCheckId(checkId);
      setTimeout(() => checksHook.setNewlyAddedCheckId(null), 3000);
      window.history.replaceState({}, "", "/?tab=feed");
    }
  }, []);

  // Activate demo mode via ?demo=true
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "true") {
      window.history.replaceState({}, "", "/");
      setIsLoggedIn(true);
      setIsDemoMode(true);
      setFeedLoaded(true);
      setEvents(DEMO_EVENTS);
      checksHook.setChecks(DEMO_CHECKS);
      squadsHook.setSquads(DEMO_SQUADS);
      friendsHook.setFriends(DEMO_FRIENDS);
      setTonightEvents(DEMO_TONIGHT);
      friendsHook.setSuggestions(DEMO_SUGGESTIONS);
      notificationsHook.setNotifications(DEMO_NOTIFICATIONS);
      notificationsHook.setUnreadCount(DEMO_NOTIFICATIONS.filter(n => !n.is_read).length);
    }
  }, []);

  // Process ?add= param after auth + onboarding complete
  useEffect(() => {
    if (!isLoggedIn || !userId || !profile?.onboarded) return;
    const username = localStorage.getItem("pendingAddUsername");
    if (!username) return;
    localStorage.removeItem("pendingAddUsername");
    if (username === profile.username) return;

    (async () => {
      const target = await db.getProfileByUsername(username);
      if (target) {
        setViewingUserId(target.id);
      } else {
        showToast("User not found");
      }
    })();
  }, [isLoggedIn, userId, profile?.onboarded]);

  // Process pendingCheck after auth + onboarding complete
  useEffect(() => {
    if (!isLoggedIn || !userId || !profile?.onboarded) return;
    const checkId = localStorage.getItem("pendingCheckId");
    if (!checkId) return;
    localStorage.removeItem("pendingCheckId");
    setPendingSharedCheckId(checkId);
    setTab("feed");
    setFeedMode("foryou");
  }, [isLoggedIn, userId, profile?.onboarded]);

  // Inject shared check into feed once feedLoaded is true
  useEffect(() => {
    if (!pendingSharedCheckId || !feedLoaded) return;
    const checkId = pendingSharedCheckId;
    setPendingSharedCheckId(null);

    (async () => {
      // Check if already in feed (e.g. already friends)
      const alreadyInFeed = checksHook.checks.some((c) => c.id === checkId);
      if (!alreadyInFeed) {
        const shared = await db.getSharedCheck(checkId);
        if (shared) {
          const { formatTimeAgo } = await import("@/lib/utils");
          checksHook.setChecks((prev) => {
            if (prev.some((c) => c.id === checkId)) return prev;
            return [{
              id: shared.id,
              text: shared.text,
              author: shared.author_name,
              authorId: shared.author_id,
              timeAgo: formatTimeAgo(new Date(shared.created_at)),
              expiresIn: shared.expires_at ? "expiring" : "open",
              expiryPercent: 0,
              responses: [],
              eventDate: shared.event_date ?? undefined,
              eventTime: shared.event_time ?? undefined,
              location: shared.location ?? undefined,
              viaFriendName: "shared link",
            }, ...prev];
          });
        }
      }
      setActiveSharedCheckId(checkId);
      checksHook.setNewlyAddedCheckId(checkId);
      setTimeout(() => checksHook.setNewlyAddedCheckId(null), 5000);
    })();
  }, [pendingSharedCheckId, feedLoaded]);

  // Re-inject shared check if it gets removed by a data reload
  const sharedCheckCache = useRef<InterestCheck | null>(null);
  useEffect(() => {
    if (!activeSharedCheckId) return;
    // Cache the shared check when it exists
    const found = checksHook.checks.find((c) => c.id === activeSharedCheckId);
    if (found) { sharedCheckCache.current = found; return; }
    // Re-inject from cache if it was removed
    if (sharedCheckCache.current) {
      checksHook.setChecks((prev) => {
        if (prev.some((c) => c.id === activeSharedCheckId)) return prev;
        return [sharedCheckCache.current!, ...prev];
      });
    }
  }, [activeSharedCheckId, checksHook.checks]);

  // Trigger data load when logged in
  useEffect(() => {
    if (isLoggedIn && !isDemoMode) {
      loadRealData();
    }
  }, [isLoggedIn, isDemoMode, loadRealData]);

  // Reload data when user returns to the app
  useEffect(() => {
    if (!isLoggedIn || isDemoMode) return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        loadRealDataRef.current();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [isLoggedIn, isDemoMode]);

  // Subscribe to realtime notifications (cross-domain — stays here)
  useEffect(() => {
    if (!isLoggedIn || isDemoMode || !userId) return;

    const channel = db.subscribeToNotifications(userId, async (newNotif) => {
      if (newNotif.type === "squad_message" || newNotif.type === "squad_mention") {
        notificationsHook.setHasUnreadSquadMessage(true);
        notificationsHook.setUnreadSquadCount((prev) => prev + 1);
        if (newNotif.related_squad_id) {
          squadsHook.setSquads((prev) => prev.map((s) =>
            s.id === newNotif.related_squad_id ? { ...s, hasUnread: true } : s
          ));
        }
      } else {
        notificationsHook.setNotifications((prev) => [newNotif, ...prev]);
        notificationsHook.setUnreadCount((prev) => prev + 1);
      }

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
            friendsHook.setSuggestions((prev) => {
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
      } else if (newNotif.type === "friend_accepted" && newNotif.related_user_id) {
        if (newNotif.body) showToastRef.current(newNotif.body);
        loadRealDataRef.current();
        const relatedId = newNotif.related_user_id;
        friendsHook.setSuggestions((prev) => {
          const person = prev.find((s) => s.id === relatedId);
          if (person) {
            friendsHook.setFriends((prevFriends) => {
              if (prevFriends.some((f) => f.id === relatedId)) return prevFriends;
              return [...prevFriends, { ...person, status: "friend" as const, availability: "open" as const }];
            });
            return prev.filter((s) => s.id !== relatedId);
          }
          db.getProfileById(relatedId).then((p) => {
            if (p) {
              friendsHook.setFriends((prevFriends) => {
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
  }, [isLoggedIn, isDemoMode, userId]);

  // Listen for service worker notification click messages
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'NOTIFICATION_CLICK') {
        const nType = event.data.notificationType;
        const relatedId = event.data.relatedId;
        if (nType === 'friend_request' || nType === 'friend_accepted') {
          setTab('profile');
          friendsHook.setFriendsInitialTab("friends");
          friendsHook.setFriendsOpen(true);
        } else if (nType === 'squad_message' || nType === 'squad_invite' || nType === 'squad_mention') {
          if (relatedId) squadsHook.setAutoSelectSquadId(relatedId);
          setTab('groups');
        } else if (nType === 'date_confirm') {
          if (relatedId) squadsHook.setAutoSelectSquadId(relatedId);
          setTab('groups');
        } else if (nType === 'check_response' || nType === 'friend_check' || nType === 'check_tag') {
          setTab('feed');
          setFeedMode('foryou');
          if (relatedId) {
            checksHook.setNewlyAddedCheckId(relatedId);
            setTimeout(() => checksHook.setNewlyAddedCheckId(null), 3000);
          }
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  // ─── Squad API handlers ──────────────────────────────────────────────────

  const handleSetSquadDate = async (squadDbId: string, date: string, time?: string | null, locked?: boolean) => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;
    const res = await fetch('/api/squads/set-date', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ squadId: squadDbId, date, time: time ?? null, locked: !!locked }),
    });
    if (!res.ok) throw new Error('Failed to set date');
    const { expires_at, date_status } = await res.json();
    squadsHook.setSquads((prev) => prev.map((s) => s.id === squadDbId ? {
      ...s,
      eventIsoDate: date,
      eventTime: time ?? s.eventTime,
      expiresAt: expires_at,
      graceStartedAt: undefined,
      dateStatus: date_status === 'locked' ? 'locked' : date_status === 'proposed' ? 'proposed' : undefined,
      dateFlexible: date_status === 'proposed',
      timeFlexible: date_status === 'proposed',
    } : s));
    const squad = squadsHook.squads.find((s) => s.id === squadDbId);
    if (squad?.checkId) {
      const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const isProposal = date_status === 'proposed';
      checksHook.setChecks((prev) => prev.map((c) => c.id === squad.checkId ? {
        ...c,
        eventDate: date,
        eventDateLabel: dateLabel,
        eventTime: time ?? c.eventTime,
        dateFlexible: isProposal,
        ...(time ? { timeFlexible: isProposal } : {}),
      } : c));
    }
  };

  const handleClearSquadDate = async (squadDbId: string) => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;
    const res = await fetch('/api/squads/set-date', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ squadId: squadDbId, clear: true }),
    });
    if (!res.ok) throw new Error('Failed to clear date');
    squadsHook.setSquads((prev) => prev.map((s) => s.id === squadDbId ? {
      ...s, eventIsoDate: undefined, dateStatus: undefined,
    } : s));
    const squad = squadsHook.squads.find((s) => s.id === squadDbId);
    if (squad?.checkId) {
      checksHook.setChecks((prev) => prev.map((c) => c.id === squad.checkId ? {
        ...c, eventDate: undefined, eventDateLabel: undefined, eventTime: undefined,
      } : c));
    }
  };

  const handleUpdateSquadSize = async (checkId: string, newSize: number) => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;
    const res = await fetch('/api/squads/update-size', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ checkId, maxSquadSize: newSize }),
    });
    if (!res.ok) {
      const data = await res.json();
      showToast(data.error ?? 'Failed to update squad size');
      return;
    }
    const freshSquads = await db.getSquads();
    squadsHook.hydrateSquads(freshSquads);
  };

  const handleSetMemberRole = async (squadId: string, targetUserId: string, role: string) => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;
    const res = await fetch('/api/squads/set-member-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ squadId, userId: targetUserId, role }),
    });
    if (!res.ok) {
      const data = await res.json();
      showToast(data.error ?? 'Failed to update role');
      return;
    }
    const freshSquads = await db.getSquads();
    squadsHook.hydrateSquads(freshSquads);
  };

  const handleKickMember = async (squadId: string, targetUserId: string) => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;
    const res = await fetch('/api/squads/kick-member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ squadId, userId: targetUserId }),
    });
    if (!res.ok) {
      const data = await res.json();
      showToast(data.error ?? 'Failed to kick member');
      return;
    }
    const freshSquads = await db.getSquads();
    squadsHook.hydrateSquads(freshSquads);
  };

  const handleAddMember = async (squadId: string, targetUserId: string) => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;
    const res = await fetch('/api/squads/add-member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ squadId, userId: targetUserId }),
    });
    if (!res.ok) {
      const data = await res.json();
      showToast(data.error ?? 'Failed to add member');
      return;
    }
    const freshSquads = await db.getSquads();
    squadsHook.hydrateSquads(freshSquads);
  };

  // ─── AddModal submit handler ──────────────────────────────────────────────

  const handleAddModalSubmit = async (e: ScrapedEvent, sharePublicly: boolean) => {
    const rawTitle = e.type === "movie" ? (e.movieTitle || e.title) : e.title;
    const title = sanitize(rawTitle, 100);
    if (!title) { showToast("Event needs a title"); return; }
    const venue = sanitize(e.venue || "TBD", 100);
    const rawDate = sanitize(e.date || "TBD", 50);
    const dateISO = parseDateToISO(rawDate);
    const dateDisplay = dateISO
      ? new Date(dateISO + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
      : rawDate;
    const timeDisplay = sanitize(e.time || "TBD", 50);
    const vibes = sanitizeVibes(e.vibe);
    const imageUrl = e.thumbnail || "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&q=80";
    const igHandle = sanitize(e.igHandle || "", 30);
    const igUrl = e.igUrl || null;
    const diceUrl = e.diceUrl || null;
    const letterboxdUrl = e.letterboxdUrl || null;
    const eventNote = e.note ? sanitize(e.note, 200) : null;
    const movieMetadata = e.type === "movie" && e.movieTitle
      ? { title: e.movieTitle, year: e.year, director: e.director, thumbnail: e.thumbnail, vibes: e.vibe }
      : null;

    if (!isDemoMode && userId) {
      try {
        let dbEvent: Awaited<ReturnType<typeof db.createEvent>> | null = null;
        if (igUrl) {
          dbEvent = await db.findEventByIgUrl(igUrl);
        } else if (diceUrl) {
          dbEvent = await db.findEventByDiceUrl(diceUrl);
        } else if (letterboxdUrl) {
          dbEvent = await db.findEventByLetterboxdUrl(letterboxdUrl);
        }

        if (dbEvent && imageUrl && dbEvent.image_url !== imageUrl) {
          dbEvent = await db.updateEvent(dbEvent.id, { image_url: imageUrl });
        }

        if (!dbEvent) {
          dbEvent = await db.createEvent({
            title,
            venue,
            neighborhood: null,
            date: parseDateToISO(dateDisplay),
            date_display: dateDisplay,
            time_display: timeDisplay,
            vibes,
            image_url: imageUrl,
            ig_handle: igHandle,
            ig_url: igUrl,
            dice_url: diceUrl,
            letterboxd_url: letterboxdUrl,
            movie_metadata: movieMetadata,
            note: eventNote,
            is_public: sharePublicly,
            created_by: userId,
          });
        }

        try {
          await db.saveEvent(dbEvent.id);
        } catch (saveErr: unknown) {
          const code = saveErr && typeof saveErr === 'object' && 'code' in saveErr ? (saveErr as { code: string }).code : '';
          if (code !== '23505') throw saveErr;
        }
        await db.toggleDown(dbEvent.id, true);

        const mm = dbEvent.movie_metadata ?? movieMetadata;
        const newEvent: Event = {
          id: dbEvent.id,
          createdBy: userId,
          title: dbEvent.title || title,
          venue: dbEvent.venue || venue,
          date: dbEvent.date_display || dateDisplay,
          time: dbEvent.time_display || timeDisplay,
          vibe: dbEvent.vibes || vibes,
          image: dbEvent.image_url || imageUrl,
          igHandle: dbEvent.ig_handle || igHandle,
          igUrl: dbEvent.ig_url ?? undefined,
          diceUrl: dbEvent.dice_url ?? undefined,
          letterboxdUrl: dbEvent.letterboxd_url ?? undefined,
          movieTitle: mm?.title,
          movieYear: mm?.year,
          movieDirector: mm?.director,
          movieThumbnail: mm?.thumbnail,
          note: dbEvent.note ?? eventNote ?? undefined,
          saved: true,
          isDown: true,
          isPublic: dbEvent.is_public ?? sharePublicly,
          peopleDown: [],
        };
        setEvents((prev) => [newEvent, ...prev]);
        setNewlyAddedId(newEvent.id);
        setTimeout(() => setNewlyAddedId(null), 2500);
      } catch (err) {
        logError("saveEvent", err, { title });
        showToast("Failed to save - try again");
        return;
      }
    } else {
      const newEvent: Event = {
        id: `local-event-${Date.now()}`,
        title,
        venue,
        date: dateDisplay,
        time: timeDisplay,
        vibe: vibes,
        image: imageUrl,
        igHandle,
        igUrl: e.igUrl,
        diceUrl: e.diceUrl,
        letterboxdUrl: e.letterboxdUrl,
        movieTitle: movieMetadata?.title,
        movieYear: movieMetadata?.year,
        movieDirector: movieMetadata?.director,
        movieThumbnail: movieMetadata?.thumbnail,
        note: eventNote ?? undefined,
        saved: true,
        isDown: true,
        isPublic: sharePublicly,
        peopleDown: [],
      };
      setEvents((prev) => [newEvent, ...prev]);
      setNewlyAddedId(newEvent.id);
      setTimeout(() => setNewlyAddedId(null), 2500);
    }

    setTab("feed");
    setFeedMode("foryou");
    const openFriends = () => friendsHook.setFriendsOpen(true);
    if (e.type === "movie") {
      showToastWithAction("Movie night saved! Rally friends?", openFriends);
    } else {
      showToastWithAction("Event saved! Rally friends?", openFriends);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  if (isLoading) {
    return <div style={{ minHeight: "100vh", background: color.bg }} />;
  }

  if (!installDismissed) {
    return (
      <IOSInstallScreen
        onComplete={() => {
          localStorage.setItem("pwa-install-dismissed", "1");
          setInstallDismissed(true);
        }}
      />
    );
  }

  if (!isLoggedIn) {
    return (
      <AuthScreen
        onLogin={() => setIsLoggedIn(true)}
      />
    );
  }

  if (profile && !profile.onboarded && !profileSetupDone && !profile.display_name) {
    return (
      <ProfileSetupScreen
        profile={profile}
        onComplete={(updated) => {
          setProfile(updated);
          setProfileSetupDone(true);
        }}
      />
    );
  }

  if (profile && !profile.onboarded && !notificationsDone) {
    return (
      <EnableNotificationsScreen
        onComplete={async () => {
          localStorage.setItem("pushAutoPrompted", "1");
          // If user came from a shared check, suggest the check author first
          const pendingCheckId = localStorage.getItem("pendingCheckId");
          if (pendingCheckId) {
            try {
              const authorProfile = await db.getCheckAuthorProfile(pendingCheckId);
              if (authorProfile && authorProfile.id !== userId) {
                setOnboardingCheckAuthorId(authorProfile.id);
                friendsHook.setSuggestions((prev) => {
                  const without = prev.filter((s) => s.id !== authorProfile.id);
                  return [{
                    id: authorProfile.id,
                    name: authorProfile.display_name,
                    username: authorProfile.username,
                    avatar: authorProfile.avatar_letter,
                    status: "none" as const,
                    igHandle: authorProfile.ig_handle ?? undefined,
                  }, ...without];
                });
              }
            } catch {}
          }
          setNotificationsDone(true);
          setOnboardingFriendGate(true);
        }}
      />
    );
  }

  if (showFirstCheck) {
    return (
      <FirstCheckScreen
        onComplete={(idea, expiresInHours, eventDate, maxSquadSize, eventTime, dateFlexible, timeFlexible, location) => {
          checksHook.handleCreateCheck(idea, expiresInHours, eventDate, maxSquadSize, undefined, eventTime, dateFlexible, timeFlexible, undefined, location);
          setShowFirstCheck(false);
        }}
        onSkip={() => {
          setShowFirstCheck(false);
          setShowAddGlow(true);
          localStorage.setItem("showAddGlow", "true");
        }}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh" }}>
      <Header
        unreadCount={notificationsHook.unreadCount}
        onOpenNotifications={() => {
          notificationsHook.setNotificationsOpen(true);
          if (notificationsHook.unreadCount > 0) {
            if (!isDemoMode && userId) {
              db.markAllNotificationsRead();
            }
            notificationsHook.setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
            notificationsHook.setUnreadCount(0);
          }
        }}
        onOpenAdd={() => { setAddModalOpen(true); setShowAddGlow(false); localStorage.removeItem("showAddGlow"); }}
        glowAdd={showAddGlow}
      />

      {/* Scroll area with fade edges */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* Top fade — visible when scrolled */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 15,
          background: `linear-gradient(${color.bg}, transparent)`,
          zIndex: 10, pointerEvents: "none",
          opacity: scrolledDown ? 1 : 0,
          transition: "opacity 0.5s ease",
        }} />
        {/* Bottom fade */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 15,
          background: `linear-gradient(transparent, ${color.bg})`,
          zIndex: 10, pointerEvents: "none",
        }} />
        {/* Scroll container */}
        <div
          ref={scrollRef}
          style={{
            height: "100%",
            overflowY: "auto",
          }}
          onScroll={() => {
            const scrolled = (scrollRef.current?.scrollTop ?? 0) > 0;
            if (scrolled !== scrolledDown) setScrolledDown(scrolled);
          }}
          onTouchStart={handlePullStart}
          onTouchMove={handlePullMove}
          onTouchEnd={handlePullEnd}
        >
        {/* Inner wrapper — translated by pull-to-refresh */}
        <div ref={innerRef} style={{ position: "relative" }}>
        {/* Pull-to-refresh spinner */}
        <div
          ref={spinnerWrapRef}
          style={{
            position: "absolute",
            top: -50,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            willChange: "transform, opacity",
          }}
        >
          <div
            ref={spinnerRef}
            style={{
              width: 22,
              height: 22,
              border: `2px solid ${color.borderMid}`,
              borderTopColor: color.accent,
              borderRadius: "50%",
              willChange: "transform",
            }}
          />
        </div>
        {!feedLoaded && !isDemoMode && (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "80px 20px",
            gap: 12,
          }}>
            <div style={{
              width: 24,
              height: 24,
              border: `2px solid ${color.borderMid}`,
              borderTopColor: color.accent,
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }} />
            <p style={{ fontFamily: font.mono, fontSize: 12, color: color.dim }}>
              loading your feed...
            </p>
          </div>
        )}
        {feedLoaded && tab === "feed" && (
          <FeedView
            feedMode={feedMode}
            setFeedMode={setFeedMode}
            checks={checksHook.checks}
            setChecks={checksHook.setChecks}
            myCheckResponses={checksHook.myCheckResponses}
            setMyCheckResponses={checksHook.setMyCheckResponses}
            events={events}
            setEvents={setEvents}
            tonightEvents={tonightEvents}
            setTonightEvents={setTonightEvents}
            newlyAddedId={newlyAddedId}
            newlyAddedCheckId={checksHook.newlyAddedCheckId}
            sharedCheckId={activeSharedCheckId}
            friends={friendsHook.friends}
            userId={userId}
            isDemoMode={isDemoMode}
            profile={profile}
            toggleSave={toggleSave}
            toggleDown={toggleDown}
            respondToCheck={checksHook.respondToCheck}
            startSquadFromCheck={squadsHook.startSquadFromCheck}
            loadRealData={loadRealData}
            showToast={showToast}
            onOpenSocial={(e) => squadsHook.setSocialEvent(e)}
            onEditEvent={(e) => setEditingEvent(e)}
            onOpenAdd={() => setAddModalOpen(true)}
            onOpenFriends={(tab) => {
              if (tab) friendsHook.setFriendsInitialTab(tab);
              friendsHook.setFriendsOpen(true);
            }}
            onNavigateToGroups={(squadId) => {
              setSquadChatOrigin(tab);
              if (squadId) squadsHook.setAutoSelectSquadId(squadId);
              setTab("groups");
            }}
            hiddenCheckIds={checksHook.hiddenCheckIds}
            pendingDownCheckIds={checksHook.pendingDownCheckIds}
            onHideCheck={checksHook.hideCheck}
            onUnhideCheck={checksHook.unhideCheck}
            acceptCoAuthorTag={checksHook.acceptCoAuthorTag}
            declineCoAuthorTag={checksHook.declineCoAuthorTag}
            onViewProfile={(uid) => setViewingUserId(uid)}
            commentCounts={commentsHook.commentCounts}
            commentsByCheck={commentsHook.commentsByCheck}
            expandedCommentCheckId={commentsHook.expandedCommentCheckId}
            onToggleComments={commentsHook.toggleComments}
            onPostComment={commentsHook.postComment}
          />
        )}
        {feedLoaded && tab === "calendar" && (
          <CalendarView
            events={events}
            checks={checksHook.checks}
            myCheckResponses={checksHook.myCheckResponses}
            onToggleSave={toggleSave}
            onToggleDown={toggleDown}
            onOpenSocial={(e) => squadsHook.setSocialEvent(e)}
            onEditEvent={(e) => setEditingEvent(e)}
            userId={userId ?? undefined}
            isDemoMode={isDemoMode}
            leftChecks={checksHook.leftChecks}
            onRedownFromLeft={checksHook.redownFromLeft}
          />
        )}
        {feedLoaded && tab === "groups" && (
          <GroupsView
            squads={squadsHook.squads}
            onSquadUpdate={squadsHook.setSquads}
            autoSelectSquadId={squadsHook.autoSelectSquadId}
            clearAutoSelectSquadId={() => squadsHook.setAutoSelectSquadId(null)}
            onSendMessage={async (squadDbId, text, mentions) => {
              await db.sendMessage(squadDbId, text, mentions);
            }}
            onLeaveSquad={async (squadDbId) => {
              await db.leaveSquad(squadDbId);
              await loadRealData();
            }}
            onSetSquadDate={handleSetSquadDate}
            onClearSquadDate={handleClearSquadDate}
            onConfirmDate={async (squadDbId, response) => {
              await db.respondToDateConfirm(squadDbId, response);
            }}
            onUpdateSquadSize={handleUpdateSquadSize}
            onSetMemberRole={handleSetMemberRole}
            onKickMember={handleKickMember}
            onAddMember={handleAddMember}
            userId={userId}
            onViewProfile={(uid) => setViewingUserId(uid)}
            onChatOpen={setChatOpen}
            onSquadRead={() => notificationsHook.setUnreadSquadCount((prev) => Math.max(0, prev - 1))}
            onCreatePoll={async (squadId, question, options, multiSelect) => {
              await db.createPoll(squadId, question, options, multiSelect);
            }}
            onVotePoll={async (pollId, optionIndex) => {
              await db.votePoll(pollId, optionIndex);
            }}
            onClosePoll={async (pollId) => {
              await db.closePoll(pollId);
            }}
            pendingJoinRequests={squadsHook.pendingJoinRequests}
            onRespondToJoinRequest={squadsHook.handleRespondToJoinRequest}
            onBack={squadChatOrigin ? () => {
              setTab(squadChatOrigin);
              setSquadChatOrigin(null);
            } : undefined}
          />
        )}
        {feedLoaded && tab === "profile" && (
          <ProfileView
            friends={friendsHook.friends}
            onOpenFriends={() => friendsHook.setFriendsOpen(true)}
            onLogout={async () => {
              await supabase.auth.signOut();
              setIsLoggedIn(false);
              setUserId(null);
              setProfile(null);
              setIsDemoMode(false);
            }}
            profile={profile}
            pushEnabled={pushEnabled}
            pushSupported={pushSupported}
            onTogglePush={handleTogglePush}
            showToast={showToast}
            onUpdateProfile={async (updates) => {
              if (!isDemoMode) {
                const updated = await db.updateProfile(updates);
                setProfile(updated);
              }
            }}
            onAvailabilityChange={async (status) => {
              if (!isDemoMode) {
                try {
                  const updated = await db.updateProfile({ availability: status });
                  setProfile(updated);
                } catch (err) {
                  logError("updateAvailability", err, { status });
                }
              }
            }}
            archivedChecks={archivedChecks}
            onRestoreCheck={async (checkId) => {
              setArchivedChecks((prev) => prev.filter((c) => c.id !== checkId));
              if (!isDemoMode) {
                try {
                  await db.unarchiveInterestCheck(checkId);
                  loadRealDataRef.current();
                } catch (err) {
                  logError("unarchiveCheck", err, { checkId });
                }
              }
              showToast("Check restored");
            }}
          />
        )}
        </div>{/* end inner wrapper */}
      </div>{/* end scroll container */}
      </div>{/* end scroll area with fades */}

      {!chatOpen && (
        <BottomNav
          tab={tab}
          onTabChange={(t) => {
            setTab(t);
            scrollRef.current?.scrollTo(0, 0);
            if (t === "groups") {
              if (!isDemoMode && userId) loadRealData();
            }
            if (t === "feed" && !isDemoMode && userId) loadRealData();
            if (t !== "feed") checksHook.setNewlyAddedCheckId(null);
          }}
          hasGroupsUnread={squadsHook.squads.some((s) => s.hasUnread) || notificationsHook.notifications.some((n) => n.type === "squad_invite" && !n.is_read)}
        />
      )}

      {toastMsg && (
        <Toast
          message={toastMsg}
          action={toastAction}
          onDismiss={() => { setToastMsg(null); setToastAction(null); }}
        />
      )}

      <AddModal
        open={addModalOpen}
        onClose={() => { setAddModalOpen(false); setAddModalDefaultMode(null); }}
        defaultMode={addModalDefaultMode}
        onSubmit={handleAddModalSubmit}
        onInterestCheck={checksHook.handleCreateCheck}
        friends={friendsHook.friends.filter(f => f.status === 'friend').map(f => ({ id: f.id, name: f.name, avatar: f.avatar }))}
      />
      <EventLobby
        event={squadsHook.socialEvent}
        open={!!squadsHook.socialEvent}
        onClose={() => {
          const ev = squadsHook.socialEvent;
          if (ev?.id) {
            const patch = { poolCount: ev.poolCount, userInPool: ev.userInPool, isDown: ev.isDown };
            const apply = (e: Event) => e.id === ev.id ? { ...e, ...patch } : e;
            setEvents((prev) => prev.map(apply));
            setTonightEvents((prev) => prev.map(apply));
          }
          squadsHook.setSocialEvent(null);
        }}
        onStartSquad={squadsHook.startSquadFromEvent}
        onJoinSquadPool={squadsHook.handleJoinSquadPool}
        squadPoolMembers={squadsHook.squadPoolMembers}
        inSquadPool={squadsHook.inSquadPool}
        isDemoMode={isDemoMode}
        onViewProfile={(uid) => setViewingUserId(uid)}
        existingSquadId={squadsHook.socialEvent?.id ? squadsHook.eventToSquad.get(squadsHook.socialEvent.id) : undefined}
        onGoToSquad={(squadId) => {
          squadsHook.setSocialEvent(null);
          squadsHook.setAutoSelectSquadId(squadId);
          setTab("groups");
        }}
        onRequestToJoin={squadsHook.handleRequestToJoin}
        pendingRequestSquadIds={squadsHook.pendingRequestSquadIds}
        socialDataLoaded={squadsHook.socialDataLoaded}
      />
      <NotificationsPanel
        open={notificationsHook.notificationsOpen}
        onClose={() => notificationsHook.setNotificationsOpen(false)}
        notifications={notificationsHook.notifications}
        setNotifications={notificationsHook.setNotifications}
        isDemoMode={isDemoMode}
        userId={userId}
        setUnreadCount={notificationsHook.setUnreadCount}
        friends={friendsHook.friends}
        onNavigate={(action) => {
          if (action.type === "friends") {
            friendsHook.setFriendsInitialTab(action.tab);
            friendsHook.setFriendsOpen(true);
          } else if (action.type === "groups") {
            setSquadChatOrigin(tab);
            if (action.squadId) squadsHook.setAutoSelectSquadId(action.squadId);
            setTab("groups");
          } else if (action.type === "feed") {
            setTab("feed");
            setFeedMode("foryou");
            if (action.checkId) {
              checksHook.setNewlyAddedCheckId(action.checkId);
              setTimeout(() => checksHook.setNewlyAddedCheckId(null), 3000);
            }
          }
        }}
      />

      <EditEventModal
        event={editingEvent}
        open={!!editingEvent}
        onClose={() => setEditingEvent(null)}
        onSave={handleEditEvent}
      />
      {onboardingFriendGate && (
        <OnboardingFriendsPopup
          suggestions={friendsHook.suggestions}
          checkAuthorId={onboardingCheckAuthorId}
          onAddFriend={friendsHook.addFriend}
          onCancelRequest={friendsHook.cancelRequest}
          onSearchUsers={friendsHook.searchUsers}
          onDone={async () => {
            // Mark onboarded now that friend gate is passed
            if (!isDemoMode) {
              try {
                const updated = await db.updateProfile({ onboarded: true } as Partial<Profile>);
                setProfile(updated);
              } catch (err) {
                logError("finishOnboarding", err);
                setProfile((prev) => prev ? { ...prev, onboarded: true } : prev);
              }
            } else {
              setProfile((prev) => prev ? { ...prev, onboarded: true } : prev);
            }
            setOnboardingFriendGate(false);
            setOnboardingCheckAuthorId(null);
            setShowFirstCheck(true);
          }}
        />
      )}
      <FriendsModal
        open={friendsHook.friendsOpen}
        onClose={() => {
          friendsHook.setFriendsOpen(false);
          friendsHook.setFriendsInitialTab("friends");
        }}
        initialTab={friendsHook.friendsInitialTab}
        friends={friendsHook.friends}
        suggestions={friendsHook.suggestions}
        onAddFriend={friendsHook.addFriend}
        onAcceptRequest={friendsHook.acceptRequest}
        onRemoveFriend={friendsHook.removeFriend}
        onCancelRequest={friendsHook.cancelRequest}
        onSearchUsers={friendsHook.searchUsers}
        onViewProfile={(uid) => setViewingUserId(uid)}
      />
      {viewingUserId && (
        <UserProfileOverlay
          targetUserId={viewingUserId}
          currentUserId={userId}
          onClose={() => setViewingUserId(null)}
          onFriendAction={() => {
            if (!isDemoMode && userId) loadRealData();
          }}
        />
      )}
    </div>
  );
}
