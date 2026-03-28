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
import CalendarView from "@/features/calendar/components/CalendarView";
import GroupsView from "@/features/squads/components/GroupsView";
import SquadChat from "@/features/squads/components/SquadChat";
import ProfileView from "@/features/profile/components/ProfileView";
import Header from "@/app/components/Header";
import BottomNav from "@/app/components/BottomNav";
import Toast from "@/app/components/Toast";
import NotificationsPanel from "@/features/notifications/components/NotificationsPanel";
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
    toggleSave, toggleDown, handleEditEvent,
  } = eventsHook;

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addModalDefaultMode, setAddModalDefaultMode] = useState<"paste" | "idea" | "manual" | null>(null);

  // ─── Misc page-level state ──────────────────────────────────────────────
  const [selectedSquad, setSelectedSquad] = useState<Squad | null>(null);
  const selectedSquadIdRef = useRef<string | null>(null);
  selectedSquadIdRef.current = selectedSquad?.id ?? null;
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);

  // ─── Ref for onboarding hook's setShowAddGlow (declared after checksHook) ──
  const clearAddGlowRef = useRef(() => {});

  // ─── Domain hooks ───────────────────────────────────────────────────────
  const friendsHook = useFriends({
    userId,
    showToast,
    loadRealDataRef,
  });

  const checksHook = useChecks({
    userId,
    profile,
    friendCount: friendsHook.friends.length,
    showToast,
    onCheckCreated: () => { setTab("feed"); clearAddGlowRef.current(); },
    onDownResponse: () => { loadRealDataRef.current(); },
    onAutoSquad: (checkId: string) => {
      // Use latest checks state via ref to avoid stale closure
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
        if (userId) db.markNotificationRead(tagNotif.id);
        notificationsHook.setNotifications((prev) =>
          prev.map((n) => n.id === tagNotif.id ? { ...n, is_read: true } : n)
        );
        notificationsHook.setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    },
  });

  // Keep a ref to the latest checks so useSquads can read current state without a stale closure
  const checksRef = useRef(checksHook.checks);
  checksRef.current = checksHook.checks;

  const squadsHook = useSquads({
    userId,
    profile,
    checksRef,
    dispatch: checksHook.dispatch,
    showToast,
    openSquadIdRef: selectedSquadIdRef,
    onSquadCreated: (squadId: string) => {
      setSquadChatOrigin(tab);
      squadsHook.setAutoSelectSquadId(squadId);
    },
    onAutoDown: async (eventId: string) => {
      await db.saveEvent(eventId).catch(() => {});
      await db.toggleDown(eventId, true);
      setEvents((prev) =>
        prev.map((e) => e.id === eventId ? { ...e, isDown: true, saved: true } : e)
      );
      showToast("You're down! \u{1F919}");
    },
  });

  const notificationsHook = useNotifications({ userId });

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
      logError("loadRealData", err);
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

  // Trigger data load when logged in
  useEffect(() => {
    if (isLoggedIn) {
      loadRealData();
    }
  }, [isLoggedIn, loadRealData]);

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
            setTab('groups');
          }
        } else if (nType === 'date_confirm') {
          if (relatedId) {
            setSquadChatOrigin(tab);
            squadsHook.setAutoSelectSquadId(relatedId);
          } else {
            setTab('groups');
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
      const check = checksHook.checks.find((c) => c.id === squad.checkId);
      if (check) checksHook.dispatch({ type: CheckActionType.UPSERT_CHECK, check: {
        ...check, eventDate: undefined, eventDateLabel: undefined, eventTime: undefined,
      }});
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
        logError("saveEvent", err, { title });
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

  // ─── Render ─────────────────────────────────────────────────────────────

  if (onboarding.onboardingScreen) return onboarding.onboardingScreen;


  return (
    <FeedContext.Provider value={{
      checks: checksHook.checks,
      myCheckResponses: checksHook.myCheckResponses,
      hiddenCheckIds: checksHook.hiddenCheckIds,
      pendingDownCheckIds: checksHook.pendingDownCheckIds,
      newlyAddedCheckId: checksHook.newlyAddedCheckId,
      leftChecks: checksHook.leftChecks,
      respondToCheck: checksHook.respondToCheck,
      acceptCoAuthorTag: checksHook.acceptCoAuthorTag,
      declineCoAuthorTag: checksHook.declineCoAuthorTag,
      hideCheck: checksHook.hideCheck,
      unhideCheck: checksHook.unhideCheck,
      redownFromLeft: checksHook.redownFromLeft,
      events: eventsHook.events,
      newlyAddedEventId: eventsHook.newlyAddedId,
      toggleSave: eventsHook.toggleSave,
      toggleDown: eventsHook.toggleDown,
    }}>
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh" }}>
      <div>
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
          onOpenAdd={() => { setAddModalOpen(true); clearAddGlowRef.current(); }}
          glowAdd={onboarding.showAddGlow}
        />
      </div>

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
        {!feedLoaded && (
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
            sharedCheckId={onboarding.sharedCheckGlowId}
            friends={friendsHook.friends}
            userId={userId}
            profile={profile}
            startSquadFromCheck={squadsHook.startSquadFromCheck}
            loadRealData={loadRealData}
            showToast={showToast}
            showToastWithAction={showToastWithAction}
            onOpenSocial={(e) => squadsHook.setSocialEvent(e)}
            onEditEvent={(e) => setEditingEvent(e)}
            onOpenAdd={() => setAddModalOpen(true)}
            onOpenFriends={(tab) => {
              if (tab) friendsHook.setFriendsInitialTab(tab);
              friendsHook.setFriendsOpen(true);
            }}
            onNavigateToGroups={(squadId) => {
              setSquadChatOrigin(tab);
              if (squadId) {
                squadsHook.setAutoSelectSquadId(squadId);
              } else {
                setTab("groups");
              }
            }}
            onViewProfile={(uid) => setViewingUserId(uid)}
            showInstallBanner={
              !onboarding.installDismissed
              || (onboarding.installDismissed && pushSupported && !pushEnabled && !onboarding.notifBannerDismissed)
            }
            installBannerVariant={!onboarding.installDismissed ? "install" : "notifications"}
            onDismissInstallBanner={!onboarding.installDismissed ? onboarding.dismissInstall : onboarding.dismissNotifBanner}
            onEnableNotifications={handleTogglePush}
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
            leftChecks={checksHook.leftChecks}
            onRedownFromLeft={checksHook.redownFromLeft}
          />
        )}
        {feedLoaded && tab === "groups" && (
          <GroupsView
            squads={squadsHook.squads}
            onSelectSquad={(squad) => {
              setSelectedSquad(squad);
              setSquadChatOrigin("groups");
              db.markSquadRead(squad.id).catch(() => {});
              if (squad.hasUnread) {
                squadsHook.setSquads((prev) => prev.map((s) => s.id === squad.id ? { ...s, hasUnread: false } : s));
              }
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
                await db.unarchiveInterestCheck(checkId);
                loadRealDataRef.current();
              } catch (err) {
                logError("unarchiveCheck", err, { checkId });
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
          onViewProfile={(uid) => setViewingUserId(uid)}
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
          onCreatePoll={async (squadId, question, options, multiSelect) => {
            await db.createPoll(squadId, question, options, multiSelect);
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
            if (t === "groups") {
              if (userId) loadRealData();
            }
            if (t === "feed" && userId) loadRealData();
            if (t !== "feed") checksHook.dispatch({ type: CheckActionType.SET_NEWLY_ADDED, checkId: null });
          }}
          hasGroupsUnread={squadsHook.squads.some((s) => s.hasUnread) || notificationsHook.notifications.some((n) => n.type === "squad_invite" && !n.is_read)}
        />
      </div>

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
          }
          squadsHook.setSocialEvent(null);
        }}
        onStartSquad={squadsHook.startSquadFromEvent}
        onJoinSquadPool={squadsHook.handleJoinSquadPool}
        squadPoolMembers={squadsHook.squadPoolMembers}
        inSquadPool={squadsHook.inSquadPool}
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
        userId={userId}
        setUnreadCount={notificationsHook.setUnreadCount}
        friends={friendsHook.friends}
        onNavigate={(action) => {
          if (action.type === "friends") {
            friendsHook.setFriendsInitialTab(action.tab);
            friendsHook.setFriendsOpen(true);
          } else if (action.type === "groups") {
            setSquadChatOrigin(tab);
            if (action.squadId) {
              squadsHook.setAutoSelectSquadId(action.squadId);
            } else {
              setTab("groups");
            }
          } else if (action.type === "feed") {
            setTab("feed");
            if (action.checkId) {
              checksHook.dispatch({ type: CheckActionType.SET_NEWLY_ADDED, checkId: action.checkId });
              setTimeout(() => checksHook.dispatch({ type: CheckActionType.SET_NEWLY_ADDED, checkId: null }), 3000);
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
        onViewProfile={(uid) => setViewingUserId(uid)}
      />
      {viewingUserId && (
        <UserProfileOverlay
          targetUserId={viewingUserId}
          currentUserId={userId}
          onClose={() => setViewingUserId(null)}
          onFriendAction={() => {
            if (userId) loadRealData();
          }}
        />
      )}
    </div>
    </FeedContext.Provider>
  );
}
