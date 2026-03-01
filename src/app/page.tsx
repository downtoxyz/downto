"use client";

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import * as db from "@/lib/db";
import { font, color } from "@/lib/styles";
import { sanitize, sanitizeVibes, parseDateToISO, toLocalISODate } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import type { Person, Event, Tab } from "@/lib/ui-types";
import { DEMO_EVENTS, DEMO_CHECKS, DEMO_TONIGHT, DEMO_SQUADS, DEMO_FRIENDS, DEMO_SUGGESTIONS, DEMO_NOTIFICATIONS, DEMO_SEARCH_USERS } from "@/lib/demo-data";
import GlobalStyles from "@/components/GlobalStyles";
import Grain from "@/components/Grain";
import AuthScreen from "@/components/AuthScreen";
import ProfileSetupScreen from "@/components/ProfileSetupScreen";
import EnableNotificationsScreen from "@/components/EnableNotificationsScreen";
import EditEventModal from "@/components/events/EditEventModal";
import EventLobby from "@/components/events/EventLobby";
import AddModal from "@/components/events/PasteModal";
import UserProfileOverlay from "@/components/friends/UserProfileOverlay";
import FeedView from "@/components/events/FeedView";
import FriendsModal from "@/components/friends/FriendsModal";
import CalendarView from "@/components/calendar/CalendarView";
import GroupsView from "@/components/squads/GroupsView";
import ProfileView from "@/components/profile/ProfileView";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import Toast from "@/components/Toast";
import SquadNotificationBanner from "@/components/SquadNotificationBanner";
import IOSInstallBanner from "@/components/IOSInstallBanner";
import NotificationsPanel from "@/components/NotificationsPanel";
import FirstCheckScreen from "@/components/FirstCheckScreen";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useChecks } from "@/hooks/useChecks";
import { useSquads } from "@/hooks/useSquads";
import { useFriends } from "@/hooks/useFriends";
import { useNotifications } from "@/hooks/useNotifications";
import { logError, logWarn } from "@/lib/logger";


// ─── Main App ───────────────────────────────────────────────────────────────

export default function Home() {
  const { isLoggedIn, setIsLoggedIn, isLoading, userId, setUserId, profile, setProfile, isDemoMode, setIsDemoMode } = useAuth();
  const { toastMsg, setToastMsg, toastAction, setToastAction, showToast, showToastWithAction, showToastRef } = useToast();
  const { pushEnabled, pushSupported, handleTogglePush } = usePushNotifications(isLoggedIn, isDemoMode, showToast);

  // ─── Tab / routing state ────────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search).get("tab");
      if (p === "feed" || p === "groups" || p === "profile" || p === "calendar") return p;
    }
    return "feed";
  });
  const [feedMode, setFeedMode] = useState<"foryou" | "tonight">("foryou");
  const [feedLoaded, setFeedLoaded] = useState(false);

  // ─── Event state (stays in page.tsx) ────────────────────────────────────
  const [events, setEvents] = useState<Event[]>([]);
  const [tonightEvents, setTonightEvents] = useState<Event[]>([]);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [newlyAddedId, setNewlyAddedId] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addModalDefaultMode, setAddModalDefaultMode] = useState<"paste" | "idea" | "manual" | null>(null);

  // ─── Misc page-level state ──────────────────────────────────────────────
  const [squadChatOrigin, setSquadChatOrigin] = useState<Tab | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [onboardingFriendGate, setOnboardingFriendGate] = useState(false);
  const [showFirstCheck, setShowFirstCheck] = useState(false);
  const [showAddGlow, setShowAddGlow] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("showAddGlow") === "true";
    }
    return false;
  });

  // ─── Pull-to-refresh state ──────────────────────────────────────────────
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const chatOpenRef = useRef(chatOpen);
  chatOpenRef.current = chatOpen;
  const pullOffsetRef = useRef(0);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);
  const isAnimatingRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const spinnerWrapRef = useRef<HTMLDivElement>(null);
  const spinnerRef = useRef<HTMLDivElement>(null);

  // ─── loadRealData ref (declared early so hooks can receive it) ──────────
  const loadRealDataRef = useRef<() => Promise<void>>(async () => {});

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
        suggestedUsers,
        activeChecks,
        squadsList,
        hiddenIds,
        fofAnnotations,
      ] = await Promise.all([
        db.getSavedEvents(),
        db.getPublicEvents(),
        db.getFriendsEvents(),
        db.getFriends(),
        db.getPendingRequests(),
        db.getSuggestedUsers().catch((err) => { logWarn("loadSuggestions", "Failed", { error: err }); return [] as Awaited<ReturnType<typeof db.getSuggestedUsers>>; }),
        db.getActiveChecks().catch((err) => { logWarn("loadChecks", "Failed", { error: err }); return [] as Awaited<ReturnType<typeof db.getActiveChecks>>; }),
        db.getSquads().catch((err) => { logWarn("loadSquads", "Failed", { error: err }); return [] as Awaited<ReturnType<typeof db.getSquads>>; }),
        db.getHiddenCheckIds().catch((err) => { logWarn("loadHiddenChecks", "Failed", { error: err }); return [] as string[]; }),
        db.getFofAnnotations().catch((err) => { logWarn("loadFofAnnotations", "Failed", { error: err }); return [] as { check_id: string; via_friend_name: string }[]; }),
      ]);

      // Phase 2: Transform events (stays in page.tsx)
      const savedEventIds = savedEvents.map((se) => se.event!.id);
      const savedEventIdSet = new Set(savedEventIds);
      const savedDownMap = new Map(savedEvents.map((se) => [se.event!.id, se.is_down]));
      const today = toLocalISODate(new Date());

      setEvents((prev) => {
        const prevPeopleDown = new Map(prev.map((e) => [e.id, e.peopleDown]));
        const combined = [
          ...savedEvents.map((se) => ({
            id: se.event!.id,
            createdBy: se.event!.created_by ?? undefined,
            title: se.event!.title,
            venue: se.event!.venue ?? "",
            date: se.event!.date_display ?? "",
            time: se.event!.time_display ?? "",
            vibe: se.event!.vibes,
            image: se.event!.image_url ?? "",
            igHandle: se.event!.ig_handle ?? "",
            igUrl: se.event!.ig_url ?? undefined,
            diceUrl: se.event!.dice_url ?? undefined,
            letterboxdUrl: se.event!.letterboxd_url ?? undefined,
            saved: true,
            isDown: se.is_down,
            isPublic: se.event!.is_public ?? false,
            peopleDown: prevPeopleDown.get(se.event!.id) ?? [],
            neighborhood: se.event!.neighborhood ?? undefined,
            rawDate: se.event!.date ?? undefined,
          })),
          ...friendsEvents
            .filter((e) => !savedEventIdSet.has(e.id))
            .map((e) => ({
              id: e.id,
              createdBy: e.created_by ?? undefined,
              title: e.title,
              venue: e.venue ?? "",
              date: e.date_display ?? "",
              time: e.time_display ?? "",
              vibe: e.vibes,
              image: e.image_url ?? "",
              igHandle: e.ig_handle ?? "",
              igUrl: e.ig_url ?? undefined,
              diceUrl: e.dice_url ?? undefined,
              letterboxdUrl: e.letterboxd_url ?? undefined,
              saved: false,
              isDown: false,
              peopleDown: prevPeopleDown.get(e.id) ?? [],
              neighborhood: e.neighborhood ?? undefined,
              rawDate: e.date ?? undefined,
            })),
        ];
        return combined
          .filter((e) => !e.rawDate || e.rawDate >= today)
          .sort((a, b) => {
            if (!a.rawDate && !b.rawDate) return 0;
            if (!a.rawDate) return 1;
            if (!b.rawDate) return -1;
            return a.rawDate.localeCompare(b.rawDate);
          });
      });

      setTonightEvents((prev) => {
        const prevPeopleDown = new Map(prev.map((e) => [e.id, e.peopleDown]));
        return publicEvents
          .filter((e) => e.venue && e.date_display)
          .filter((e) => !e.date || e.date === today)
          .map((e) => ({
            id: e.id,
            createdBy: e.created_by ?? undefined,
            title: e.title,
            venue: e.venue ?? "",
            date: e.date_display ?? "Tonight",
            time: e.time_display ?? "",
            vibe: e.vibes,
            image: e.image_url ?? "",
            igHandle: e.ig_handle ?? "",
            igUrl: e.ig_url ?? undefined,
            diceUrl: e.dice_url ?? undefined,
            letterboxdUrl: e.letterboxd_url ?? undefined,
            saved: savedEventIdSet.has(e.id),
            isDown: savedDownMap.get(e.id) ?? false,
            isPublic: true,
            peopleDown: prevPeopleDown.get(e.id) ?? [],
            neighborhood: e.neighborhood ?? undefined,
          }));
      });

      // Phase 3: Hydrate domain hooks
      friendsHook.hydrateFriends(friendsList, pendingRequests, suggestedUsers);
      checksHook.hydrateChecks(activeChecks, hiddenIds, fofAnnotations);
      squadsHook.hydrateSquads(squadsList);

      setFeedLoaded(true);

      // Phase 4: Backfill social data (peopleDown + crew pool)
      const allEventIds = [...new Set([...savedEventIds, ...publicEvents.map((e) => e.id), ...friendsEvents.map((e) => e.id)])];
      if (allEventIds.length > 0) {
        try {
          const [peopleDownMap, crewPoolMap, userPoolEventIds] = await Promise.all([
            db.getPeopleDownBatch(allEventIds),
            db.getCrewPoolBatch(allEventIds),
            db.getUserPoolEventIds(allEventIds),
          ]);

          const enrichEvent = (e: Event): Event => {
            const pd = peopleDownMap[e.id] ?? e.peopleDown;
            const poolMembers = crewPoolMap[e.id] ?? [];
            const poolUserIds = new Set(poolMembers.map((p) => p.userId));
            const enrichedPd = pd.map((p) => ({
              ...p,
              inPool: p.userId ? poolUserIds.has(p.userId) : false,
            }));
            const poolCount = poolMembers.length + (userPoolEventIds.has(e.id) ? 1 : 0);
            return {
              ...e,
              peopleDown: enrichedPd,
              poolCount,
              userInPool: userPoolEventIds.has(e.id),
            };
          };

          setEvents((prev) => prev.map(enrichEvent));
          setTonightEvents((prev) => prev.map(enrichEvent));
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
  }, [isDemoMode, userId, checksHook.hydrateChecks, squadsHook.hydrateSquads, friendsHook.hydrateFriends]);

  loadRealDataRef.current = loadRealData;

  // ─── Pull-to-refresh helpers ───────────────────────────────────────────

  const applyPullOffset = useCallback((offset: number) => {
    pullOffsetRef.current = offset;
    if (contentRef.current) {
      contentRef.current.style.transform = offset > 0 ? `translateY(${offset}px)` : "none";
    }
    if (spinnerWrapRef.current) {
      spinnerWrapRef.current.style.opacity = String(Math.min(offset / 60, 1));
    }
    if (spinnerRef.current) {
      spinnerRef.current.style.transform = `rotate(${offset * 4}deg)`;
      spinnerRef.current.style.animation = offset > 60 ? "spin 0.8s linear infinite" : "none";
    }
  }, []);

  const snapBack = useCallback(() => {
    isAnimatingRef.current = true;
    const content = contentRef.current;
    const wrap = spinnerWrapRef.current;
    if (content) {
      content.style.transition = "transform 0.25s ease";
      content.style.transform = "none";
    }
    if (wrap) {
      wrap.style.transition = "opacity 0.25s ease";
      wrap.style.opacity = "0";
    }
    setTimeout(() => {
      if (content) content.style.transition = "none";
      if (wrap) wrap.style.transition = "none";
      pullOffsetRef.current = 0;
      isAnimatingRef.current = false;
    }, 260);
  }, []);

  // ─── Pull-to-refresh handlers (React events + ref-based DOM updates) ──

  const handlePullStart = useCallback((e: React.TouchEvent) => {
    if (isAnimatingRef.current) return;
    if (tabRef.current !== "feed" && tabRef.current !== "cal") return;
    if (chatOpenRef.current) return;
    touchStartY.current = e.touches[0].clientY;
    isPulling.current = false;
    // Clear any leftover transition from snap-back
    if (contentRef.current) contentRef.current.style.transition = "none";
    if (spinnerWrapRef.current) spinnerWrapRef.current.style.transition = "none";
  }, []);

  const handlePullMove = useCallback((e: React.TouchEvent) => {
    if (isAnimatingRef.current) return;
    if (chatOpenRef.current) return;
    if (window.scrollY > 0) {
      isPulling.current = false;
      if (pullOffsetRef.current > 0) applyPullOffset(0);
      return;
    }
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy > 0) {
      isPulling.current = true;
      applyPullOffset(Math.min(dy * 0.4, 100));
    } else {
      isPulling.current = false;
      if (pullOffsetRef.current > 0) applyPullOffset(0);
    }
  }, [applyPullOffset]);

  const handlePullEnd = useCallback(async () => {
    if (!isPulling.current) {
      if (pullOffsetRef.current > 0) snapBack();
      return;
    }
    isPulling.current = false;
    if (pullOffsetRef.current > 60) {
      isAnimatingRef.current = true; // block new gestures during refresh
      applyPullOffset(60);
      if (spinnerRef.current) {
        spinnerRef.current.style.transform = "";
        spinnerRef.current.style.animation = "spin 0.8s linear infinite";
      }
      await loadRealData();
      if (spinnerRef.current) spinnerRef.current.style.animation = "none";
      isAnimatingRef.current = false;
      snapBack();
    } else {
      snapBack();
    }
  }, [applyPullOffset, snapBack, loadRealData]);

  // Re-sync ref-managed styles after React re-renders (before paint)
  useLayoutEffect(() => {
    if (isAnimatingRef.current) return;
    applyPullOffset(pullOffsetRef.current);
  });

  // ─── Effects ────────────────────────────────────────────────────────────

  // Capture ?add= param on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const addUser = params.get("add");
    if (addUser) {
      localStorage.setItem("pendingAddUsername", addUser);
      window.history.replaceState({}, "", "/");
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
      if (newNotif.type === "squad_message") {
        notificationsHook.setHasUnreadSquadMessage(true);
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
        if (nType === 'friend_request' || nType === 'friend_accepted') {
          setTab('profile');
        } else if (nType === 'squad_message' || nType === 'squad_invite') {
          if (event.data.relatedId) squadsHook.setAutoSelectSquadId(event.data.relatedId);
          setTab('groups');
        } else if (nType === 'check_response' || nType === 'friend_check') {
          setTab('feed');
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  // ─── Event handlers (stay in page.tsx) ──────────────────────────────────

  const handleEditEvent = async (updated: { title: string; venue: string; date: string; time: string; vibe: string[] }) => {
    if (!editingEvent) return;

    const dateISO = parseDateToISO(updated.date);
    const dateDisplay = dateISO
      ? new Date(dateISO + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
      : updated.date;

    if (!isDemoMode && userId) {
      try {
        await db.updateEvent(editingEvent.id, {
          title: updated.title,
          venue: updated.venue,
          date: dateISO,
          date_display: dateDisplay,
          time_display: updated.time,
          vibes: updated.vibe,
        });
      } catch (err) {
        logError("updateEvent", err, { eventId: editingEvent.id });
        showToast("Failed to update - try again");
        return;
      }
    }

    const updateList = (prev: Event[]) =>
      prev.map((e) =>
        e.id === editingEvent.id
          ? { ...e, title: updated.title, venue: updated.venue, date: dateDisplay, time: updated.time, vibe: updated.vibe, rawDate: dateISO ?? undefined }
          : e
      );
    setEvents(updateList);
    setTonightEvents(updateList);
    setEditingEvent(null);
    showToast("Event updated!");
  };

  const toggleSave = (id: string) => {
    const event = events.find((e) => e.id === id);
    if (!event) return;
    const newSaved = !event.saved;
    setEvents((prev) =>
      prev.map((e) => e.id === id ? { ...e, saved: newSaved } : e)
    );
    showToast(newSaved ? "Added to your calendar \u2713" : "Removed from calendar");
    if (!isDemoMode && event.id) {
      (newSaved ? db.saveEvent(event.id) : db.unsaveEvent(event.id))
        .catch((err) => {
          logError("toggleSave", err, { eventId: id });
          setEvents((prev) =>
            prev.map((e) => e.id === id ? { ...e, saved: !newSaved } : e)
          );
          showToast("Failed to save \u2014 try again");
        });
    }
  };

  const toggleDown = async (id: string) => {
    const event = events.find((e) => e.id === id);
    if (!event) return;
    const newDown = !event.isDown;
    const prevSaved = event.saved;
    setEvents((prev) =>
      prev.map((e) => e.id === id ? { ...e, isDown: newDown, saved: newDown ? true : e.saved } : e)
    );
    showToast(newDown ? "You're down! \u{1F919}" : "Maybe next time");
    if (!isDemoMode && event.id) {
      try {
        if (newDown && !prevSaved) {
          await db.saveEvent(event.id);
        }
        await db.toggleDown(event.id, newDown);
        // Un-downing triggers DB auto-removal from squads — refresh to sync UI
        if (!newDown) loadRealData();
      } catch (err: unknown) {
        const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
        if (code !== '23505') {
          logError("toggleDown", err, { eventId: id });
          setEvents((prev) =>
            prev.map((e) => e.id === id ? { ...e, isDown: !newDown, saved: prevSaved } : e)
          );
          showToast("Failed to update \u2014 try again");
        }
      }
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  if (isLoading) {
    return <div style={{ minHeight: "100vh", background: color.bg }} />;
  }

  if (!isLoggedIn) {
    return (
      <AuthScreen
        onLogin={() => setIsLoggedIn(true)}
      />
    );
  }

  if (profile && !profile.onboarded && !profile.username) {
    return (
      <ProfileSetupScreen
        profile={profile}
        onComplete={(updated) => {
          setProfile(updated);
        }}
      />
    );
  }

  if (profile && !profile.onboarded) {
    return (
      <EnableNotificationsScreen
        onComplete={async () => {
          localStorage.setItem("pushAutoPrompted", "1");
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
          friendsHook.setFriendsInitialTab("add");
          friendsHook.setFriendsOpen(true);
          setOnboardingFriendGate(true);
        }}
      />
    );
  }

  if (showFirstCheck) {
    return (
      <FirstCheckScreen
        onComplete={(idea, expiresInHours, eventDate, maxSquadSize, eventTime) => {
          checksHook.handleCreateCheck(idea, expiresInHours, eventDate, maxSquadSize, undefined, eventTime);
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
    <div>
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

      {/* Pull-to-refresh indicator — outer div handles translateY, inner handles rotation */}
      {/* Content */}
      <div
        ref={contentRef}
        style={{
          position: "relative",
          paddingBottom: 90,
        }}
        onTouchStart={handlePullStart}
        onTouchMove={handlePullMove}
        onTouchEnd={handlePullEnd}
      >
        {/* Pull-to-refresh spinner — sits above content, moves with it */}
        <div
          ref={spinnerWrapRef}
          style={{
            position: "absolute",
            top: -38,
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
            editingCheckId={checksHook.editingCheckId}
            setEditingCheckId={checksHook.setEditingCheckId}
            editingCheckText={checksHook.editingCheckText}
            setEditingCheckText={checksHook.setEditingCheckText}
            events={events}
            setEvents={setEvents}
            tonightEvents={tonightEvents}
            setTonightEvents={setTonightEvents}
            newlyAddedId={newlyAddedId}
            newlyAddedCheckId={checksHook.newlyAddedCheckId}
            friends={friendsHook.friends}
            suggestions={friendsHook.suggestions}
            setSuggestions={friendsHook.setSuggestions}
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
          />
        )}
        {feedLoaded && tab === "calendar" && (
          <CalendarView
            events={events}
            onToggleSave={toggleSave}
            onToggleDown={toggleDown}
            onOpenSocial={(e) => squadsHook.setSocialEvent(e)}
            onEditEvent={(e) => setEditingEvent(e)}
            userId={userId ?? undefined}
            isDemoMode={isDemoMode}
          />
        )}
        {feedLoaded && tab === "groups" && (
          <GroupsView
            squads={squadsHook.squads}
            onSquadUpdate={squadsHook.setSquads}
            autoSelectSquadId={squadsHook.autoSelectSquadId}
            clearAutoSelectSquadId={() => squadsHook.setAutoSelectSquadId(null)}
            onSendMessage={async (squadDbId, text) => {
              await db.sendMessage(squadDbId, text);
            }}
            onLeaveSquad={async (squadDbId) => {
              await db.leaveSquad(squadDbId);
            }}
            onSetSquadDate={async (squadDbId, date, time) => {
              const token = (await supabase.auth.getSession()).data.session?.access_token;
              if (!token) return;
              const res = await fetch('/api/squads/set-date', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ squadId: squadDbId, date, time: time ?? null }),
              });
              if (!res.ok) throw new Error('Failed to set date');
              const { expires_at } = await res.json();
              squadsHook.setSquads((prev) => prev.map((s) => s.id === squadDbId ? {
                ...s,
                eventIsoDate: date,
                expiresAt: expires_at,
                graceStartedAt: undefined,
              } : s));
            }}
            onClearSquadDate={async (squadDbId) => {
              const token = (await supabase.auth.getSession()).data.session?.access_token;
              if (!token) return;
              const res = await fetch('/api/squads/set-date', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ squadId: squadDbId, clear: true }),
              });
              if (!res.ok) throw new Error('Failed to clear date');
              squadsHook.setSquads((prev) => prev.map((s) => s.id === squadDbId ? {
                ...s,
                eventIsoDate: undefined,
              } : s));
            }}
            userId={userId}
            onViewProfile={(uid) => setViewingUserId(uid)}
            onChatOpen={setChatOpen}
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
          />
        )}
      </div>

      {!chatOpen && (
        <BottomNav
          tab={tab}
          onTabChange={(t) => {
            setTab(t);
            window.scrollTo(0, 0);
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

      {squadsHook.squadNotification && (
        <SquadNotificationBanner
          notification={squadsHook.squadNotification}
          onOpen={(squadId) => {
            setSquadChatOrigin(tab);
            squadsHook.setAutoSelectSquadId(squadId);
            setTab("groups");
            squadsHook.setSquadNotification(null);
          }}
        />
      )}

      <IOSInstallBanner />

      <AddModal
        open={addModalOpen}
        onClose={() => { setAddModalOpen(false); setAddModalDefaultMode(null); }}
        defaultMode={addModalDefaultMode}
        onSubmit={async (e, sharePublicly) => {
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
        }}
        onInterestCheck={checksHook.handleCreateCheck}
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
      <FriendsModal
        open={friendsHook.friendsOpen}
        onClose={() => {
          friendsHook.setFriendsOpen(false);
          friendsHook.setFriendsInitialTab("friends");
          if (onboardingFriendGate) {
            setOnboardingFriendGate(false);
            setShowFirstCheck(true);
          }
        }}
        initialTab={friendsHook.friendsInitialTab}
        friends={friendsHook.friends}
        suggestions={friendsHook.suggestions}
        onAddFriend={friendsHook.addFriend}
        onAcceptRequest={friendsHook.acceptRequest}
        onRemoveFriend={friendsHook.removeFriend}
        onSearchUsers={friendsHook.searchUsers}
        onViewProfile={(uid) => setViewingUserId(uid)}
        preventClose={onboardingFriendGate}
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
