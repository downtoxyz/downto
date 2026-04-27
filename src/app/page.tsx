"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { usePullToRefresh } from "@/app/hooks/usePullToRefresh";
import { useAppNavigation } from "@/app/hooks/useAppNavigation";
import { useEvents } from "@/features/events/hooks/useEvents";
import { supabase } from "@/lib/supabase";
import * as db from "@/lib/db";
import { API_BASE } from "@/lib/db";
import { color } from "@/lib/styles";
import { sanitize, sanitizeVibes, parseDateToISO, toLocalISODate } from "@/lib/utils";
import { setPushNavigationHandler, type NavigateAction } from "@/lib/pushNavigation";
import type { Profile } from "@/lib/types";
import type { Person, Event, Tab, ScrapedEvent, Squad } from "@/lib/ui-types";
import { useOnboarding } from "@/features/auth/hooks/useOnboarding";
import EditEventModal from "@/features/events/components/EditEventModal";
import EventLobby from "@/features/events/components/EventLobby";
import AddModal from "@/features/events/components/CreateModal";
import UserProfileOverlay from "@/features/friends/components/UserProfileOverlay";
import FeedView from "@/features/feed/components/FeedView";
import { FeedContext } from "@/features/checks/context/FeedContext";
import FriendsModal from "@/features/friends/components/FriendsModal";
import OnboardingFriendsPopup from "@/features/friends/components/OnboardingFriendsPopup";
import GroupsView from "@/features/squads/components/GroupsView";
import SquadChat from "@/features/squads/components/SquadChat";
import ProfileView from "@/features/profile/components/ProfileView";
import Header, { HEADER_HEIGHT_PX, HEADER_HEIGHT_WITH_TABS_PX, HEADER_OFFSET_PX } from "@/app/components/Header";
import BottomNav from "@/app/components/BottomNav";
import FriendRequestBanner, { FRIEND_REQUEST_BANNER_HEIGHT_PX } from "@/app/components/FriendRequestBanner";
import Toast from "@/app/components/Toast";
import NotificationsPanel from "@/features/notifications/components/NotificationsPanel";
import DeletedCheckScreen from "@/features/checks/components/DeletedCheckScreen";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useToast } from "@/app/hooks/useToast";
import { usePushNotifications } from "@/features/auth/hooks/usePushNotifications";
import { useChecks } from "@/features/checks/hooks/useChecks";
import { CheckActionType } from "@/features/checks/reducers/checksReducer";
import { useSquads } from "@/features/squads/hooks/useSquads";
import { useFriends } from "@/features/friends/hooks/useFriends";
import { useNotifications } from "@/features/notifications/hooks/useNotifications";
import { useRealtimeNotifications } from "@/app/hooks/useRealtimeNotifications";
import { logError, logWarn } from "@/lib/logger";


// ─── Main App ───────────────────────────────────────────────────────────────

export default function Home() {
  const { isLoggedIn, setIsLoggedIn, isLoading, userId, setUserId, profile, setProfile } = useAuth();
  const { toastMsg, setToastMsg, toastAction, setToastAction, showToast, showToastWithAction, showToastRef } = useToast();
  const { pushEnabled, pushSupported, handleTogglePush } = usePushNotifications(isLoggedIn, showToast);

  // ─── Tab / routing state ────────────────────────────────────────────────
  const {
    tab, setTab,
    squadChatOrigin, setSquadChatOrigin,
    chatOpen, setChatOpen,
    scrolledDown, setScrolledDown,
  } = useAppNavigation();
  const [feedLoaded, setFeedLoaded] = useState(false);
  const [sortBy, setSortBy] = useState<'recent' | 'upcoming'>('recent');

  // ─── loadRealData ref (declared early so hooks can receive it) ──────────
  const loadRealDataRef = useRef<() => Promise<void>>(async () => {});

  // ─── Event state ─────────────────────────────────────────────────────────
  const eventsHook = useEvents({ userId, showToast, loadRealDataRef });
  const {
    events, setEvents,
    editingEvent, setEditingEvent,
    newlyAddedId, setNewlyAddedId,
    archivedChecks, setArchivedChecks,
    hydrateEvents, hydrateSocialData,
    toggleDown, handleEditEvent,
  } = eventsHook;

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addModalDefaultMode, setAddModalDefaultMode] = useState<"paste" | "idea" | "manual" | null>(null);
  const [deletedCheckInfo, setDeletedCheckInfo] = useState<{ checkId: string; isMine: boolean } | null>(null);

  // ─── Misc page-level state ──────────────────────────────────────────────
  const [selectedSquad, setSelectedSquad] = useState<Squad | null>(null);
  const selectedSquadIdRef = useRef<string | null>(null);
  selectedSquadIdRef.current = selectedSquad?.id ?? null;
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);

  // ─── Ref for onboarding hook's setShowAddGlow (declared after checksHook) ──
  const clearAddGlowRef = useRef(() => {});

  // ─── Domain hooks ───────────────────────────────────────────────────────
  // Order matters: hooks whose input lambdas reference *other* hooks need
  // those other hooks declared first so the deps arrays of the useCallbacks
  // below resolve. notificationsHook is up here because checksHook's
  // onCoAuthorRespond touches it.
  const friendsHook = useFriends({
    userId,
    showToast,
    loadRealDataRef,
  });

  const notificationsHook = useNotifications({ userId });

  // ─── Stable input lambdas for the domain hooks ─────────────────────────
  // Each domain hook captures these via closure. If they're inline, every
  // Home render gives the hook a fresh callback identity, which cascades
  // into every useCallback'd handler the hook returns and ultimately into
  // the FeedContext value. Stabilizing them here is the prerequisite for
  // React.memo on CheckCard / EventCard.

  const onCheckCreated = useCallback(() => {
    setTab("feed");
    clearAddGlowRef.current();
  }, [setTab]);

  const onDownResponse = useCallback(() => {
    loadRealDataRef.current();
  }, []);

  const onCoAuthorRespond = useCallback((checkId: string) => {
    // Mark check_tag notification as read when user accepts/declines
    const tagNotif = notificationsHook.notifications.find(
      (n) => n.type === "check_tag" && n.related_check_id === checkId && !n.is_read
    );
    if (tagNotif) {
      if (userId) db.markNotificationRead(tagNotif.id);
      notificationsHook.setNotifications((prev) =>
        prev.map((n) => n.id === tagNotif.id ? { ...n, is_read: true } : n)
      );
      notificationsHook.setUnreadCount((prev) => Math.max(0, prev - 1));
    }
  }, [
    notificationsHook.notifications,
    notificationsHook.setNotifications,
    notificationsHook.setUnreadCount,
    userId,
  ]);

  const checksHook = useChecks({
    userId,
    profile,
    friendCount: friendsHook.friends.length,
    showToast,
    onCheckCreated,
    onDownResponse,
    onCoAuthorRespond,
  });

  // Keep a ref to the latest checks so useSquads can read current state without a stale closure
  const checksRef = useRef(checksHook.checks);
  checksRef.current = checksHook.checks;

  // onSquadCreated forward-refs squadsHook.setAutoSelectSquadId (we're
  // about to define squadsHook). The setter is a stable useState reference
  // even though the wrapping object is reborn each render, so closure
  // semantics give us the right setter at call time. tab goes in the deps
  // array because we want the originating tab captured at squad-form
  // moment (so the back-from-squad nav lands the user where they were).
  const onSquadCreated = useCallback((squadId: string) => {
    showToastWithAction("squad formed!", () => {
      setSquadChatOrigin(tab);
      squadsHook.setAutoSelectSquadId(squadId);
    }, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, showToastWithAction, setSquadChatOrigin]);

  const onAutoDown = useCallback(async (eventId: string) => {
    await db.saveEvent(eventId).catch(() => {});
    await db.toggleDown(eventId, true);
    setEvents((prev) =>
      prev.map((e) => e.id === eventId ? { ...e, isDown: true, saved: true } : e)
    );
    showToast("You're down! ✦");
  }, [setEvents, showToast]);

  const squadsHook = useSquads({
    userId,
    profile,
    checksRef,
    dispatch: checksHook.dispatch,
    showToast,
    openSquadIdRef: selectedSquadIdRef,
    onSquadCreated,
    onAutoDown,
  });

  // ─── Onboarding hook ───────────────────────────────────────────────────
  const onboarding = useOnboarding({
    isLoggedIn, isLoading, userId, profile, feedLoaded,
    setIsLoggedIn, setProfile, setTab,
    checks: checksHook.checks,
    dispatch: checksHook.dispatch,
    handleCreateCheck: checksHook.handleCreateCheck,
    suggestions: friendsHook.suggestions,
    setSuggestions: friendsHook.setSuggestions,
  });

  // Wire up the ref now that the hook is initialized
  clearAddGlowRef.current = () => { onboarding.setShowAddGlow(false); localStorage.removeItem("showAddGlow"); };

  // ─── loadRealData (thin coordinator) ────────────────────────────────────

  const isLoadingRef = useRef(false);

  const loadRealData = useCallback(async () => {
    if (!userId) return;
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
        unreadSquadIds,
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
        db.getUnreadSquadIds().catch(() => [] as string[]),
      ]);

      // Phase 2: Transform events via useEvents hook
      hydrateEvents(savedEvents, publicEvents, friendsEvents);

      // Phase 3: Hydrate domain hooks
      friendsHook.hydrateFriends(friendsList, pendingRequests, suggestedUsers, outgoingRequests);
      checksHook.hydrateChecks(activeChecks, hiddenIds, fofAnnotations);
      squadsHook.hydrateSquads(squadsList, unreadSquadIds);
      setArchivedChecks(archivedChecksList);
      checksHook.hydrateLeftChecks(leftChecksList);

      // Phase 4: Fetch social data before showing feed so it doesn't pop in
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

      setFeedLoaded(true);

      // Reload notifications AFTER squads are hydrated to avoid race condition
      // where onUnreadSquadIds sets hasUnread on stale squad state
      notificationsHook.loadNotifications();

    } catch (err) {
      // Session can drop mid-request; not a bug worth paging on.
      if (err instanceof Error && err.message === "Not authenticated") {
        logWarn("loadRealData", "auth lost mid-request", { error: err.message });
      } else {
        logError("loadRealData", err);
      }
    } finally {
      isLoadingRef.current = false;
      setFeedLoaded(true);
    }
  }, [userId, checksHook.hydrateChecks, squadsHook.hydrateSquads, friendsHook.hydrateFriends, hydrateEvents, hydrateSocialData, notificationsHook.loadNotifications]);

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
    enabledTabs: ["feed", "squads"],
    chatOpen,
    tab,
    disabled: !feedLoaded,
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
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Deep-link params from SW cold-open
    if (params.get("openFriends")) {
      friendsHook.setFriendsInitialTab("friends");
      friendsHook.setFriendsOpen(true);
      window.history.replaceState({}, "", `/?tab=${params.get("tab") || "profile"}`);
    }
    const checkId = params.get("checkId");
    if (checkId) {
      checksHook.dispatch({ type: CheckActionType.SET_NEWLY_ADDED, checkId });
      setTimeout(() => checksHook.dispatch({ type: CheckActionType.SET_NEWLY_ADDED, checkId: null }), 3000);
      window.history.replaceState({}, "", "/?tab=feed");
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

  // Trigger data load when logged in + sync timezone
  useEffect(() => {
    if (isLoggedIn) {
      loadRealData();
      // Sync user's timezone to profile (fire-and-forget)
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && userId) {
        db.updateProfile({ timezone: tz } as Partial<Profile>).catch(() => {});
      }
    }
  }, [isLoggedIn, loadRealData, userId]);

  // Reload data when user returns to the app
  useEffect(() => {
    if (!isLoggedIn) return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        loadRealDataRef.current();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [isLoggedIn]);

  // Subscribe to realtime notifications
  useRealtimeNotifications({
    isLoggedIn,
    userId,
    selectedSquadIdRef,
    showToastRef,
    loadRealDataRef,
    setSquads: squadsHook.setSquads,
    setNotifications: notificationsHook.setNotifications,
    setUnreadCount: notificationsHook.setUnreadCount,
    setSuggestions: friendsHook.setSuggestions,
    setFriends: friendsHook.setFriends,
  });

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
          if (relatedId) {
            setSquadChatOrigin(tab);
            squadsHook.setAutoSelectSquadId(relatedId);
          } else {
            setTab('squads');
          }
        } else if (nType === 'date_confirm') {
          if (relatedId) {
            setSquadChatOrigin(tab);
            squadsHook.setAutoSelectSquadId(relatedId);
          } else {
            setTab('squads');
          }
        } else if (nType === 'check_response' || nType === 'friend_check' || nType === 'check_tag') {
          setTab('feed');
          if (relatedId) {
            checksHook.dispatch({ type: CheckActionType.SET_NEWLY_ADDED, checkId: relatedId });
            setTimeout(() => checksHook.dispatch({ type: CheckActionType.SET_NEWLY_ADDED, checkId: null }), 3000);
          }
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  // ─── Auto-select squad (from notification deep-link) ────────────────────
  useEffect(() => {
    if (!squadsHook.autoSelectSquadId) return;
    const squad = squadsHook.squads.find(s => s.id === squadsHook.autoSelectSquadId);
    if (squad) {
      setSelectedSquad({ ...squad, hasUnread: false });
      squadsHook.setAutoSelectSquadId(null);
      db.markSquadRead(squad.id).catch(() => {});
      // Clear OS push notifications for this squad
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistration().then((reg) => {
          if (!reg) return;
          const tags = ["squad_message", "squad_invite", "squad_mention", "date_confirm", "poll_created"];
          tags.forEach((tag) => {
            reg.getNotifications({ tag: `${tag}-${squad.id}` }).then((notifs) => {
              notifs.forEach((n) => n.close());
            });
          });
        });
      }
      if (squad.hasUnread) {
        squadsHook.setSquads((prev) => prev.map((s) => s.id === squad.id ? { ...s, hasUnread: false } : s));
      }
    }
  }, [squadsHook.autoSelectSquadId, squadsHook.squads]);

  // Close squad chat if user is no longer a member (e.g. after un-downing)
  useEffect(() => {
    if (!selectedSquad) return;
    const stillIn = squadsHook.squads.some(s => s.id === selectedSquad.id);
    if (!stillIn) {
      setSelectedSquad(null);
      setSquadChatOrigin(null);
    }
  }, [squadsHook.squads, selectedSquad]);

  // Single source of truth for "user navigated from a notification" — used by
  // both the in-app NotificationsPanel onNavigate prop AND the native push
  // tap handler (see lib/pushNavigation.ts), so an OS push tap and an in-app
  // bell tap end up at the same surface.
  const handleNotificationNavigate = useCallback((action: NavigateAction) => {
    if (action.type === "friends") {
      friendsHook.setFriendsInitialTab(action.tab);
      friendsHook.setFriendsOpen(true);
    } else if (action.type === "groups") {
      setSquadChatOrigin(tab);
      // Always switch to squads tab so the user lands somewhere useful even
      // if the target squad isn't loadable (e.g. membership dropped).
      setTab("squads");
      if (action.squadId) {
        squadsHook.setAutoSelectSquadId(action.squadId);
      }
    } else if (action.type === "feed") {
      setTab("feed");
      if (action.checkId) {
        checksHook.dispatch({ type: CheckActionType.SET_NEWLY_ADDED, checkId: action.checkId });
        setTimeout(() => checksHook.dispatch({ type: CheckActionType.SET_NEWLY_ADDED, checkId: null }), 3000);
      }
    }
  }, [tab, friendsHook, squadsHook, checksHook, setTab, setSquadChatOrigin]);

  // Register the same handler for native-push taps. dispatchPushAction in
  // lib/pushNotifications.ts will call this on `pushNotificationActionPerformed`.
  useEffect(() => {
    setPushNavigationHandler(handleNotificationNavigate);
    return () => setPushNavigationHandler(null);
  }, [handleNotificationNavigate]);

  // ─── Squad API handlers ──────────────────────────────────────────────────

  const handleSetSquadDate = async (squadDbId: string, date: string, time?: string | null, locked?: boolean) => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;
    const res = await fetch(`${API_BASE}/api/squads/set-date`, {
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
      const check = checksHook.checks.find((c) => c.id === squad.checkId);
      if (check) checksHook.dispatch({ type: CheckActionType.UPSERT_CHECK, check: {
        ...check,
        eventDate: date,
        eventDateLabel: dateLabel,
        eventTime: time ?? check.eventTime,
        dateFlexible: isProposal,
        ...(time ? { timeFlexible: isProposal } : {}),
      }});
    }
  };

  const handleClearSquadDate = async (squadDbId: string) => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;
    const res = await fetch(`${API_BASE}/api/squads/set-date`, {
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
      const check = checksHook.checks.find((c) => c.id === squad.checkId);
      if (check) checksHook.dispatch({ type: CheckActionType.UPSERT_CHECK, check: {
        ...check, eventDate: undefined, eventDateLabel: undefined, eventTime: undefined,
      }});
    }
  };

  const handleUpdateSquadSize = async (checkId: string, newSize: number) => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;
    const res = await fetch(`${API_BASE}/api/squads/update-size`, {
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
    const res = await fetch(`${API_BASE}/api/squads/set-member-role`, {
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
    const res = await fetch(`${API_BASE}/api/squads/kick-member`, {
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
    const res = await fetch(`${API_BASE}/api/squads/add-member`, {
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

  const handleAddModalSubmit = async (e: ScrapedEvent, visibility: 'public' | 'friends') => {
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
    const raUrl = e.raUrl || null;
    const eventNote = e.note ? sanitize(e.note, 200) : null;
    const movieMetadata = e.type === "movie" && e.movieTitle
      ? { title: e.movieTitle, year: e.year, director: e.director, thumbnail: e.thumbnail, vibes: e.vibe }
      : null;

    if (userId) {
      try {
        let dbEvent: Awaited<ReturnType<typeof db.createEvent>> | null = null;
        if (igUrl) {
          dbEvent = await db.findEventByIgUrl(igUrl);
        } else if (diceUrl) {
          dbEvent = await db.findEventByDiceUrl(diceUrl);
        } else if (letterboxdUrl) {
          dbEvent = await db.findEventByLetterboxdUrl(letterboxdUrl);
        } else if (raUrl) {
          dbEvent = await db.findEventByRaUrl(raUrl);
        }

        if (dbEvent && imageUrl && dbEvent.image_url !== imageUrl) {
          dbEvent = await db.updateEvent(dbEvent.id, { image_url: imageUrl });
        }

        if (!dbEvent) {
          const dateISO = parseDateToISO(dateDisplay);
          // Compute date_display from ISO date to ensure correct day-of-week
          const computedDateDisplay = dateISO
            ? new Date(dateISO + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
            : dateDisplay;
          dbEvent = await db.createEvent({
            title,
            venue,
            neighborhood: null,
            date: dateISO,
            date_display: computedDateDisplay,
            time_display: timeDisplay,
            vibes,
            image_url: imageUrl,
            ig_handle: igHandle,
            ig_url: igUrl,
            dice_url: diceUrl,
            letterboxd_url: letterboxdUrl,
            ra_url: raUrl,
            movie_metadata: movieMetadata,
            note: eventNote,
            is_public: visibility === 'public',
            visibility,
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
          isPublic: dbEvent.is_public ?? (visibility === 'public'),
          visibility: dbEvent.visibility ?? visibility,
          peopleDown: [],
        };
        setEvents((prev) => [newEvent, ...prev]);
        setNewlyAddedId(newEvent.id);
        setTimeout(() => setNewlyAddedId(null), 2500);
      } catch (err) {
        logError("saveEvent", err, {
          userId,
          title,
          venue,
          dateISO,
          visibility,
          igUrl,
          diceUrl,
          letterboxdUrl,
          raUrl,
          hasMovie: !!movieMetadata,
        });
        showToast("Failed to save - try again");
        return;
      }
    }

    setTab("feed");
    const openFriends = () => friendsHook.setFriendsOpen(true);
    if (e.type === "movie") {
      showToastWithAction("Movie night saved! Rally friends?", openFriends);
    } else {
      showToastWithAction("Event saved! Rally friends?", openFriends);
    }
  };

  // ─── Stable callback identities ─────────────────────────────────────────
  // Inline arrow handlers passed as props (especially to FeedView, which
  // hands them to memoized children) cascade fresh function identities on
  // every Home re-render and prevent downstream memoization from skipping
  // work. The setters / refs these capture are all stable, so empty deps
  // are safe.
  //
  // All useCallback / useMemo declarations in this section sit above the
  // onboarding early-return below so the hook order is identical every
  // render (Rules of Hooks). Moving them after the return crashed prod
  // hydration before — keep them up here.

  const handleOpenSocial = useCallback((e: Event) => squadsHook.setSocialEvent(e), [squadsHook.setSocialEvent]);
  const handleEditEventClick = useCallback((e: Event) => setEditingEvent(e), [setEditingEvent]);
  const handleOpenAdd = useCallback(() => {
    setAddModalOpen(true);
    clearAddGlowRef.current();
  }, []);
  const handleOpenFriends = useCallback((tabName?: 'friends' | 'add') => {
    if (tabName) friendsHook.setFriendsInitialTab(tabName);
    friendsHook.setFriendsOpen(true);
  }, [friendsHook.setFriendsInitialTab, friendsHook.setFriendsOpen]);
  const handleViewProfile = useCallback((uid: string) => setViewingUserId(uid), []);
  const handleSortChange = useCallback((s: 'recent' | 'upcoming') => {
    setSortBy(s);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [scrollRef]);
  // Captures the current `tab` so users land back on the originating tab
  // when they exit the squad; that means a new identity per tab change
  // (still much better than per-render).
  const handleNavigateToGroups = useCallback((squadId?: string) => {
    setSquadChatOrigin(tab);
    if (squadId) {
      squadsHook.setAutoSelectSquadId(squadId);
    } else {
      setTab("squads");
    }
  }, [tab, setSquadChatOrigin, squadsHook.setAutoSelectSquadId, setTab]);

  // Accepted-friends list, projected to {id,name,avatar} — used by AddModal,
  // CheckCard's mention pickers, and other consumers. Memoized to keep
  // identity stable across renders; otherwise a fresh array fires on every
  // Home re-render and downstream memoization is defeated.
  const acceptedFriendsList = useMemo(
    () => friendsHook.friends
      .filter((f) => f.status === "friend")
      .map((f) => ({ id: f.id, name: f.name, avatar: f.avatar })),
    [friendsHook.friends],
  );

  // Memoize the FeedContext value so consumers don't all re-render on every
  // unrelated state change in Home() (tabs, modals, viewing-user, etc.).
  const feedContextValue = useMemo(() => ({
    checks: checksHook.checks,
    myCheckResponses: checksHook.myCheckResponses,
    hiddenCheckIds: checksHook.hiddenCheckIds,
    pendingDownCheckIds: checksHook.pendingDownCheckIds,
    newlyAddedCheckId: checksHook.newlyAddedCheckId,
    leftChecks: checksHook.leftChecks,
    respondToCheck: checksHook.respondToCheck,
    clearResponse: checksHook.clearResponse,
    acceptCoAuthorTag: checksHook.acceptCoAuthorTag,
    declineCoAuthorTag: checksHook.declineCoAuthorTag,
    hideCheck: checksHook.hideCheck,
    unhideCheck: checksHook.unhideCheck,
    redownFromLeft: checksHook.redownFromLeft,
    events: eventsHook.events,
    newlyAddedEventId: eventsHook.newlyAddedId,
    toggleDown: eventsHook.toggleDown,
  }), [
    checksHook.checks,
    checksHook.myCheckResponses,
    checksHook.hiddenCheckIds,
    checksHook.pendingDownCheckIds,
    checksHook.newlyAddedCheckId,
    checksHook.leftChecks,
    checksHook.respondToCheck,
    checksHook.clearResponse,
    checksHook.acceptCoAuthorTag,
    checksHook.declineCoAuthorTag,
    checksHook.hideCheck,
    checksHook.unhideCheck,
    checksHook.redownFromLeft,
    eventsHook.events,
    eventsHook.newlyAddedId,
    eventsHook.toggleDown,
  ]);

  // ─── Render ─────────────────────────────────────────────────────────────

  if (onboarding.onboardingScreen) return onboarding.onboardingScreen;

  // Count incoming (pending inbound) friend requests — drives the sticky
  // banner + the profile-tab dot.
  const pendingFriendRequestCount = friendsHook.suggestions.filter(
    (s) => s.status === "incoming",
  ).length;

  return (
    <FeedContext.Provider value={feedContextValue}>
    <div className="flex flex-col h-dvh overflow-x-hidden">
      <Header
        unreadCount={notificationsHook.unreadCount}
        onOpenNotifications={() => {
          notificationsHook.setNotificationsOpen(true);
          if (notificationsHook.unreadCount > 0) {
            if (userId) {
              db.markAllNotificationsRead();
            }
            notificationsHook.setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
            notificationsHook.setUnreadCount(0);
          }
        }}
        onOpenAdd={handleOpenAdd}
        glowAdd={onboarding.showAddGlow}
        sortBy={sortBy}
        onSortChange={handleSortChange}
        showSort={tab === 'feed'}
        scrolled={scrolledDown}
      />

      {/* Sticky banner: surfaces pending incoming friend requests. Stays visible
          on every tab until the viewer has accepted / rejected all of them.
          Incoming-requests list renders on the "add" tab, so jump there directly. */}
      <FriendRequestBanner
        count={pendingFriendRequestCount}
        onOpen={() => {
          friendsHook.setFriendsInitialTab("add");
          friendsHook.setFriendsOpen(true);
        }}
      />

      {/* Scroll area with fade edges */}
      <div className="flex-1 relative overflow-hidden">
        {/* Top fade — visible when scrolled */}
        <div
          className="absolute top-0 left-0 right-0 z-10 pointer-events-none transition-opacity duration-500"
          style={{
            height: 15,
            background: `linear-gradient(${color.bg}, transparent)`,
            opacity: scrolledDown ? 1 : 0,
          }}
        />
        {/* Bottom fade — removed for cleaner look */}
        {/* Scroll container */}
        <div
          ref={scrollRef}
          className="h-full overflow-y-auto"
          style={{ paddingTop: `calc(env(safe-area-inset-top, 16px) + ${(HEADER_HEIGHT_PX) + HEADER_OFFSET_PX + (pendingFriendRequestCount > 0 ? FRIEND_REQUEST_BANNER_HEIGHT_PX : 0)}px)`, paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px))" }}
          onScroll={() => {
            const scrolled = (scrollRef.current?.scrollTop ?? 0) > 0;
            if (scrolled !== scrolledDown) setScrolledDown(scrolled);
          }}
          onTouchStart={handlePullStart}
          onTouchMove={handlePullMove}
          onTouchEnd={handlePullEnd}
        >
        {/* Inner wrapper — translated by pull-to-refresh */}
        <div ref={innerRef} className="relative">
        {/* Pull-to-refresh spinner */}
        <div
          ref={spinnerWrapRef}
          className="absolute left-0 right-0 flex justify-center"
          style={{ top: -50, willChange: "transform, opacity", opacity: 0 }}
        >
          <div
            ref={spinnerRef}
            className="w-[22px] h-[22px] rounded-full"
            style={{
              border: `2px solid ${color.borderMid}`,
              borderTopColor: color.accent,
              willChange: "transform",
            }}
          />
        </div>
        {!feedLoaded && (
          <div className="flex flex-col items-center justify-center px-5 gap-3" style={{ paddingTop: 80, paddingBottom: 80 }}>
            <div
              className="w-6 h-6 rounded-full"
              style={{
                border: `2px solid ${color.borderMid}`,
                borderTopColor: color.accent,
                animation: "spin 0.8s linear infinite",
              }}
            />
            <p className="font-mono text-xs text-dim">
              loading your feed...
            </p>
          </div>
        )}
        {feedLoaded && tab === "feed" && (
          <FeedView
            sharedCheckId={onboarding.sharedCheckGlowId}
            friends={friendsHook.friends}
            userId={userId}
            profile={profile}
            loadRealData={loadRealData}
            showToast={showToast}
            showToastWithAction={showToastWithAction}
            onOpenSocial={handleOpenSocial}
            onEditEvent={handleEditEventClick}
            onOpenAdd={handleOpenAdd}
            onOpenFriends={handleOpenFriends}
            onNavigateToGroups={handleNavigateToGroups}
            onViewProfile={handleViewProfile}
            showInstallBanner={
              !onboarding.installDismissed
              || (onboarding.installDismissed && pushSupported && !pushEnabled && !onboarding.notifBannerDismissed)
            }
            installBannerVariant={!onboarding.installDismissed ? "install" : "notifications"}
            onDismissInstallBanner={!onboarding.installDismissed ? onboarding.dismissInstall : onboarding.dismissNotifBanner}
            onEnableNotifications={handleTogglePush}
            sortBy={sortBy}
            onSortChange={handleSortChange}
          />
        )}
        {feedLoaded && tab === "squads" && (
          <GroupsView
            squads={squadsHook.squads}
            onSelectSquad={(squad) => {
              setSelectedSquad(squad);
              setSquadChatOrigin("squads");
              db.markSquadRead(squad.id).catch(() => {});
              if (squad.hasUnread) {
                squadsHook.setSquads((prev) => prev.map((s) => s.id === squad.id ? { ...s, hasUnread: false } : s));
              }
              if ("serviceWorker" in navigator) {
                navigator.serviceWorker.getRegistration().then((reg) => {
                  if (!reg) return;
                  const tags = ["squad_message", "squad_invite", "squad_mention", "date_confirm", "poll_created"];
                  tags.forEach((tag) => {
                    reg.getNotifications({ tag: `${tag}-${squad.id}` }).then((notifs) => {
                      notifs.forEach((n) => n.close());
                    });
                  });
                });
              }
            }}
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
            }}
            profile={profile}
            pushEnabled={pushEnabled}
            pushSupported={pushSupported}
            onTogglePush={handleTogglePush}
            showToast={showToast}
            onUpdateProfile={async (updates) => {
              const updated = await db.updateProfile(updates);
              setProfile(updated);
            }}
            onAvailabilityChange={async (status) => {
              try {
                const updated = await db.updateProfile({ availability: status });
                setProfile(updated);
              } catch (err) {
                logError("updateAvailability", err, { status });
              }
            }}
            archivedChecks={archivedChecks}
            onRestoreCheck={async (checkId) => {
              setArchivedChecks((prev) => prev.filter((c) => c.id !== checkId));
              try {
                await db.reviveInterestCheck(checkId);
                loadRealDataRef.current();
              } catch (err) {
                logError("reviveCheck", err, { checkId });
              }
              showToast("Check restored");
            }}
          />
        )}
        </div>{/* end inner wrapper */}
      </div>{/* end scroll container */}
      </div>{/* end scroll area with fades */}

      {/* Squad chat overlay — rendered independently so origin tab stays visible underneath */}
      {feedLoaded && selectedSquad && (
        <SquadChat
          squad={selectedSquad}
          userId={userId}
          onClose={() => {
            const origin = squadChatOrigin;
            const closingSquadId = selectedSquad?.id;
            setSelectedSquad(null);
            setSquadChatOrigin(null);
            // Update cursor and clear dot on close (catches messages that arrived during session)
            if (closingSquadId) {
              db.markSquadRead(closingSquadId).catch(() => {});
              squadsHook.setSquads((prev) => prev.map((s) => s.id === closingSquadId ? { ...s, hasUnread: false } : s));
            }
            if (origin && origin !== tab) {
              setTab(origin);
            }
          }}
          onSquadUpdate={squadsHook.setSquads}
          onChatOpen={setChatOpen}
          onViewProfile={handleViewProfile}
          onSendMessage={async (squadDbId, text, mentions, image) => {
            let imageMeta: { path: string; width: number; height: number } | undefined;
            if (image) {
              const path = await db.uploadChatImage(squadDbId, image.blob);
              imageMeta = { path, width: image.width, height: image.height };
            }
            const saved = await db.sendMessage(squadDbId, text, mentions, imageMeta);
            return { id: saved.id, image_path: saved.image_path };
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
          onCreatePoll={async (squadId, question, options, multiSelect, pollType) => {
            await db.createPoll(squadId, question, options, multiSelect, pollType);
          }}
          pendingJoinRequests={squadsHook.pendingJoinRequests}
          onRespondToJoinRequest={squadsHook.handleRespondToJoinRequest}
        />
      )}

      <div>
        <BottomNav
          tab={tab}
          onTabChange={(t) => {
            setTab(t);
            scrollRef.current?.scrollTo(0, 0);
            if (t === "squads") {
              if (userId) loadRealData();
            }
            if (t === "feed" && userId) loadRealData();
            if (t !== "feed") checksHook.dispatch({ type: CheckActionType.SET_NEWLY_ADDED, checkId: null });
          }}
          hasSquadsUnread={squadsHook.squads.some((s) => s.hasUnread) || notificationsHook.notifications.some((n) => n.type === "squad_invite" && !n.is_read)}
        />
      </div>

      {toastMsg && (
        <Toast
          message={toastMsg}
          action={toastAction}
          onDismiss={() => { setToastMsg(null); setToastAction(null); }}
          dismissible={!!toastAction}
        />
      )}

      <AddModal
        open={addModalOpen}
        onClose={() => { setAddModalOpen(false); setAddModalDefaultMode(null); }}
        defaultMode={addModalDefaultMode}
        onSubmit={handleAddModalSubmit}
        onInterestCheck={checksHook.handleCreateCheck}
        friends={acceptedFriendsList}
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
          }
          squadsHook.setSocialEvent(null);
        }}
        onStartSquad={squadsHook.startSquadFromEvent}
        onJoinSquadPool={squadsHook.handleJoinSquadPool}
        squadPoolMembers={squadsHook.squadPoolMembers}
        inSquadPool={squadsHook.inSquadPool}
        onViewProfile={handleViewProfile}
        existingSquadId={squadsHook.socialEvent?.id ? squadsHook.eventToSquad.get(squadsHook.socialEvent.id) : undefined}
        onGoToSquad={(squadId) => {
          squadsHook.setSocialEvent(null);
          squadsHook.setAutoSelectSquadId(squadId);
          setTab("squads");
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
        userId={userId}
        setUnreadCount={notificationsHook.setUnreadCount}
        friends={friendsHook.friends}
        onDeletedCheck={(info) => setDeletedCheckInfo(info)}
        onNavigate={handleNotificationNavigate}
      />

      <DeletedCheckScreen
        open={!!deletedCheckInfo}
        onClose={() => setDeletedCheckInfo(null)}
        isMine={deletedCheckInfo?.isMine ?? false}
        onRevive={async () => {
          const checkId = deletedCheckInfo?.checkId;
          if (!checkId) return;
          try {
            await db.reviveInterestCheck(checkId);
            await loadRealDataRef.current();
            setTab("feed");
            checksHook.dispatch({ type: CheckActionType.SET_NEWLY_ADDED, checkId });
            setTimeout(() => checksHook.dispatch({ type: CheckActionType.SET_NEWLY_ADDED, checkId: null }), 3000);
          } catch (err) {
            logError("reviveCheck", err, { checkId });
            showToast("Couldn't revive — try again");
          }
        }}
      />

      <EditEventModal
        event={editingEvent}
        open={!!editingEvent}
        onClose={() => setEditingEvent(null)}
        onSave={handleEditEvent}
        linkedSquads={editingEvent ? squadsHook.squads.filter((s) => s.eventId === editingEvent.id) : []}
        pendingJoinRequestsBySquad={(() => {
          const map: Record<string, number> = {};
          for (const r of squadsHook.pendingJoinRequests) {
            map[r.squadId] = (map[r.squadId] ?? 0) + 1;
          }
          return map;
        })()}
        onOpenSquad={(squadId) => {
          setEditingEvent(null);
          setSquadChatOrigin(tab);
          squadsHook.setAutoSelectSquadId(squadId);
        }}
        onShare={editingEvent ? async () => {
          const url = editingEvent.igUrl || editingEvent.diceUrl || editingEvent.letterboxdUrl || `${window.location.origin}`;
          const text = `${editingEvent.title}${editingEvent.venue && editingEvent.venue !== "TBD" ? ` @ ${editingEvent.venue}` : ""}`;
          if (navigator.share) {
            try { await navigator.share({ title: editingEvent.title, text, url }); } catch { /* cancelled */ }
          } else {
            try { await navigator.clipboard.writeText(`${text}\n${url}`); showToast("Link copied!"); } catch { /* fallback */ }
          }
        } : undefined}
      />
      {onboarding.friendGate.show && (
        <OnboardingFriendsPopup
          suggestions={friendsHook.suggestions}
          checkAuthorId={onboarding.friendGate.checkAuthorId}
          onAddFriend={friendsHook.addFriend}
          onCancelRequest={friendsHook.cancelRequest}
          onSearchUsers={friendsHook.searchUsers}
          onDone={onboarding.friendGate.onDone}
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
        onViewProfile={handleViewProfile}
      />
      {viewingUserId && (
        <UserProfileOverlay
          targetUserId={viewingUserId}
          currentUserId={userId}
          onClose={() => setViewingUserId(null)}
          onFriendAction={() => {
            if (userId) loadRealData();
          }}
          showToast={showToast}
        />
      )}
    </div>
    </FeedContext.Provider>
  );
}
