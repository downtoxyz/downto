"use client";

import { useState, useEffect, useRef, type Dispatch, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import * as db from "@/lib/db";
import type { Profile } from "@/lib/types";
import type { InterestCheck, Tab, Friend } from "@/lib/ui-types";
import { type ChecksAction, CheckActionType } from "@/features/checks/reducers/checksReducer";
import { isIOSNotStandalone, isPushSupported } from "@/lib/pushNotifications";
import AuthScreen from "@/features/auth/components/AuthScreen";
import ProfileSetupScreen from "@/features/auth/components/ProfileSetupScreen";
import EnableNotificationsScreen, { IOSInstallScreen } from "@/features/auth/components/EnableNotificationsScreen";
import FirstCheckScreen from "@/features/checks/components/FirstCheckScreen";
import { logError } from "@/lib/logger";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeExpiry(expiresAt: string | null, createdAt: string): { expiresIn: string; expiryPercent: number } {
  if (!expiresAt) return { expiresIn: "open", expiryPercent: 0 };
  const now = Date.now();
  const expires = new Date(expiresAt).getTime();
  const created = new Date(createdAt).getTime();
  const total = expires - created;
  const elapsed = now - created;
  const remaining = expires - now;
  if (remaining <= 0) return { expiresIn: "expired", expiryPercent: 100 };
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const mins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  return {
    expiresIn: hours > 0 ? `${hours}h` : `${mins}m`,
    expiryPercent: Math.min(100, (elapsed / total) * 100),
  };
}

async function buildSharedCheck(
  shared: NonNullable<Awaited<ReturnType<typeof db.getSharedCheck>>>,
  avatarLetter: string,
): Promise<InterestCheck> {
  const { formatTimeAgo } = await import("@/lib/utils");
  return {
    id: shared.id,
    text: shared.text,
    author: shared.author_name,
    authorId: shared.author_id,
    timeAgo: formatTimeAgo(new Date(shared.created_at)),
    ...computeExpiry(shared.expires_at, shared.created_at),
    responses: shared.myResponse === "down"
      ? [{ name: "You", avatar: avatarLetter, status: "down" as const }]
      : [],
    eventDate: shared.event_date ?? undefined,
    eventTime: shared.event_time ?? undefined,
    location: shared.location ?? undefined,
    viaFriendName: "shared link",
    squadId: shared.squadId ?? undefined,
    squadMemberCount: shared.squadMemberCount,
    inSquad: shared.inSquad,
  };
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface UseOnboardingParams {
  // Auth
  isLoggedIn: boolean;
  isLoading: boolean;
  userId: string | null;
  profile: Profile | null;
  feedLoaded: boolean;
  setIsLoggedIn: (v: boolean) => void;
  setProfile: (v: Profile | null | ((prev: Profile | null) => Profile | null)) => void;
  setTab: (tab: Tab) => void;
  // Checks
  checks: InterestCheck[];
  dispatch: Dispatch<ChecksAction>;
  handleCreateCheck: (
    idea: string,
    expiresInHours: number | null,
    eventDate: string | null,
    maxSquadSize: number | null,
    movieData?: { letterboxdUrl: string; title: string; year?: string; director?: string; thumbnail?: string; vibes?: string[] },
    eventTime?: string | null,
    dateFlexible?: boolean,
    timeFlexible?: boolean,
    taggedFriendIds?: string[],
    location?: string | null,
  ) => void;
  // Friends
  suggestions: Friend[];
  setSuggestions: React.Dispatch<React.SetStateAction<Friend[]>>;
}

interface UseOnboardingReturn {
  /** The full-screen onboarding gate to render, or null if onboarding is done */
  onboardingScreen: ReactNode | null;
  /** Shared check glow ID for FeedView */
  sharedCheckGlowId: string | null;
  /** Whether the + button should glow */
  showAddGlow: boolean;
  setShowAddGlow: (v: boolean) => void;
  /** OnboardingFriendsPopup state */
  friendGate: {
    show: boolean;
    checkAuthorId: string | null;
    onDone: () => Promise<void>;
  };
  /** Whether the install banner should show in feed */
  installDismissed: boolean;
  /** Dismiss the install banner */
  dismissInstall: () => void;
  /** Whether the notifications banner has been dismissed */
  notifBannerDismissed: boolean;
  /** Dismiss the notifications banner */
  dismissNotifBanner: () => void;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useOnboarding({
  isLoggedIn,
  isLoading,
  userId,
  profile,
  feedLoaded,
  setIsLoggedIn,
  setProfile,
  setTab,
  checks,
  dispatch,
  handleCreateCheck,
  suggestions,
  setSuggestions,
}: UseOnboardingParams): UseOnboardingReturn {

  // ─── Install gate ──────────────────────────────────────────────────────
  const [installDismissed, setInstallDismissed] = useState(true);
  useEffect(() => {
    setInstallDismissed(
      !isIOSNotStandalone() || localStorage.getItem("pwa-install-dismissed") === "1"
    );
  }, []);

  // ─── Notifications banner ────────────────────────────────────────────
  const [notifBannerDismissed, setNotifBannerDismissed] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("notif-banner-dismissed") === "1";
    return true;
  });

  // ─── Onboarding state ─────────────────────────────────────────────────
  const [profileSetupDone, setProfileSetupDone] = useState(false);
  const [notificationsDone, setNotificationsDone] = useState(false);
  const [showFirstCheck, setShowFirstCheck] = useState(false);
  const [showAddGlow, setShowAddGlow] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("showAddGlow") === "true";
    }
    return false;
  });

  // ─── Friend gate ──────────────────────────────────────────────────────
  const [onboardingFriendGate, setOnboardingFriendGate] = useState(false);
  const friendGateInitRef = useRef(false);
  const referralPersistedRef = useRef(false);
  const [onboardingCheckAuthorId, setOnboardingCheckAuthorId] = useState<string | null>(null);

  // ─── Shared check state ───────────────────────────────────────────────
  const [pendingSharedCheckId, setPendingSharedCheckId] = useState<string | null>(null);
  const [activeSharedCheckId, setActiveSharedCheckId] = useState<string | null>(() => {
    if (typeof window !== "undefined") return localStorage.getItem("activeSharedCheckId");
    return null;
  });
  const [sharedCheckGlowId, setSharedCheckGlowId] = useState<string | null>(null);

  // ─── Shared check effects ─────────────────────────────────────────────

  // Process pendingCheck after auth + onboarding complete
  useEffect(() => {
    if (!isLoggedIn || !userId || !profile?.onboarded) return;
    const checkId = localStorage.getItem("pendingCheckId");
    if (checkId) {
      localStorage.removeItem("pendingCheckId");
      setPendingSharedCheckId(checkId);
      setTab("feed");
      dispatch({ type: CheckActionType.SET_NEWLY_ADDED, checkId });
      setTimeout(() => dispatch({ type: CheckActionType.SET_NEWLY_ADDED, checkId: null }), 3000);
      return;
    }
    // PWA recovery: no localStorage, check DB for referred_by_check_id
    if (!activeSharedCheckId) {
      (async () => {
        const referralId = await db.getReferralCheckId();
        if (referralId) {
          setPendingSharedCheckId(referralId);
          setTab("feed");
        }
      })();
    }
  }, [isLoggedIn, userId, profile?.onboarded]);

  // Inject shared check into feed once feedLoaded
  useEffect(() => {
    if (!pendingSharedCheckId || !feedLoaded) return;
    const checkId = pendingSharedCheckId;
    setPendingSharedCheckId(null);

    (async () => {
      const alreadyInFeed = checks.some((c) => c.id === checkId);
      if (!alreadyInFeed) {
        const shared = await db.getSharedCheck(checkId);
        if (shared) {
          if (shared.myResponse === "down" || shared.myResponse === "waitlist") {
            dispatch({ type: CheckActionType.MERGE_RESPONSES, responses: { [shared.id]: shared.myResponse as "down" | "waitlist" } });
          }
          const injected = await buildSharedCheck(shared, profile?.avatar_letter ?? "?");
          if (!checks.some((c) => c.id === checkId)) {
            dispatch({ type: CheckActionType.UPSERT_CHECK, check: injected });
          }
        }
      }
      setActiveSharedCheckId(checkId);
      localStorage.setItem("activeSharedCheckId", checkId);
      setSharedCheckGlowId(checkId);
      setTimeout(() => setSharedCheckGlowId(null), 5000);
      dispatch({ type: CheckActionType.SET_NEWLY_ADDED, checkId });
      setTimeout(() => dispatch({ type: CheckActionType.SET_NEWLY_ADDED, checkId: null }), 5000);
    })();
  }, [pendingSharedCheckId, feedLoaded]);

  // Re-inject shared check if removed by data reload or page refresh
  const sharedCheckCache = useRef<InterestCheck | null>(null);
  useEffect(() => {
    if (!activeSharedCheckId || !feedLoaded) return;
    const found = checks.find((c) => c.id === activeSharedCheckId);
    if (found) { sharedCheckCache.current = found; return; }
    if (sharedCheckCache.current) {
      if (!checks.some((c) => c.id === activeSharedCheckId)) {
        dispatch({ type: CheckActionType.UPSERT_CHECK, check: sharedCheckCache.current });
      }
      return;
    }
    (async () => {
      const shared = await db.getSharedCheck(activeSharedCheckId);
      if (!shared) {
        setActiveSharedCheckId(null);
        localStorage.removeItem("activeSharedCheckId");
        return;
      }
      if (shared.myResponse === "down" || shared.myResponse === "waitlist") {
        dispatch({ type: CheckActionType.MERGE_RESPONSES, responses: { [shared.id]: shared.myResponse as "down" | "waitlist" } });
      }
      const injected = await buildSharedCheck(shared, profile?.avatar_letter ?? "?");
      sharedCheckCache.current = injected;
      if (!checks.some((c) => c.id === activeSharedCheckId)) {
        dispatch({ type: CheckActionType.UPSERT_CHECK, check: injected });
      }
    })();
  }, [activeSharedCheckId, feedLoaded, checks]);

  // ─── Friend gate onDone ───────────────────────────────────────────────

  const handleFriendGateDone = async () => {
    try {
      const updated = await db.updateProfile({ onboarded: true } as Partial<Profile>);
      setProfile(updated);
    } catch (err) {
      logError("finishOnboarding", err);
      setProfile((prev: Profile | null) => prev ? { ...prev, onboarded: true } : prev);
    }
    setOnboardingFriendGate(false);
    setOnboardingCheckAuthorId(null);
    const hasSharedCheck = !!localStorage.getItem("pendingCheckId") || !!activeSharedCheckId || !!pendingSharedCheckId;
    if (!hasSharedCheck && checks.length === 0) {
      setShowFirstCheck(true);
    } else if (!hasSharedCheck) {
      setShowAddGlow(true);
      localStorage.setItem("showAddGlow", "true");
    }
  };

  // ─── Onboarding screen computation ────────────────────────────────────

  const dismissInstall = () => {
    localStorage.setItem("pwa-install-dismissed", "1");
    setInstallDismissed(true);
  };

  const dismissNotifBanner = () => {
    localStorage.setItem("notif-banner-dismissed", "1");
    setNotifBannerDismissed(true);
  };

  const computeOnboardingScreen = (): ReactNode | null => {
    if (isLoading) {
      return <div style={{ minHeight: "100vh", background: "#111" }} />;
    }

    // Eagerly persist pendingCheck from URL to localStorage (before any gate checks)
    if (typeof window !== "undefined") {
      const urlCheckId = new URLSearchParams(window.location.search).get("pendingCheck");
      if (urlCheckId && !localStorage.getItem("pendingCheckId")) {
        localStorage.setItem("pendingCheckId", urlCheckId);
      }
    }

    // Normal visit (no shared check): show install prompt before auth
    const hasPendingCheck = typeof window !== "undefined" && !!localStorage.getItem("pendingCheckId");
    if (!isLoggedIn && !installDismissed && !hasPendingCheck) {
      return <IOSInstallScreen onComplete={dismissInstall} />;
    }

    if (!isLoggedIn) {
      return <AuthScreen onLogin={() => setIsLoggedIn(true)} />;
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

    // After profile setup: onboarding gates
    if (profile && !profile.onboarded && (profileSetupDone || !!profile.display_name) && !onboardingFriendGate) {
      const pendingCheckId = localStorage.getItem("pendingCheckId");
      const isSharedCheckFlow = !!pendingCheckId;
      const isInPWA = typeof window !== "undefined" && (
        (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
        window.matchMedia("(display-mode: standalone)").matches
      );
      // Shared check flow: fire-and-forget referral persist, skip install/notifications
      if (isSharedCheckFlow) {
        if (!referralPersistedRef.current) {
          referralPersistedRef.current = true;
          (async () => {
            const token = (await supabase.auth.getSession()).data.session?.access_token;
            if (token) {
              fetch("/api/checks/respond-shared", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ checkId: pendingCheckId, response: "down" }),
              }).catch(() => {});
            }
          })();
        }
        // Fall through to feed wait → friend gate (no install/notifications screens)
      } else {
        // Normal flow: show install prompt for iOS non-standalone, then notifications
        if (!isInPWA && !installDismissed && isIOSNotStandalone()) {
          return <IOSInstallScreen onComplete={dismissInstall} />;
        }

        // Show notifications screen for any browser that supports push
        // (PWA on iOS, Chrome/Firefox/Safari on desktop or Android)
        const canShowNotifications = isInPWA || isPushSupported();
        if (!notificationsDone && canShowNotifications) {
          return (
            <EnableNotificationsScreen
              onComplete={async () => {
                localStorage.setItem("pushAutoPrompted", "1");
                setNotificationsDone(true);
              }}
            />
          );
        }
      }

      // Auto-redeem pending friend link (from /friend?token=xxx flow)
      const pendingFriendToken = typeof window !== "undefined" ? localStorage.getItem("pendingFriendToken") : null;
      if (pendingFriendToken) {
        localStorage.removeItem("pendingFriendToken");
        db.redeemFriendLink(pendingFriendToken).catch(() => {});
      }

      // Wait for feed data before setting up friend gate
      if (!feedLoaded) return <div style={{ minHeight: "100vh", background: "#111" }} />;

      // Set up friend gate with check author suggestion
      if (!friendGateInitRef.current) {
        friendGateInitRef.current = true;
        (async () => {
          try {
            let checkId = pendingCheckId;
            if (!checkId) {
              checkId = await db.getReferralCheckId();
            }
            if (checkId) {
              const authorProfile = await db.getCheckAuthorProfile(checkId);
              if (authorProfile && authorProfile.id !== userId) {
                setOnboardingCheckAuthorId(authorProfile.id);
                setSuggestions((prev) => {
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
            }
          } catch {}
          setOnboardingFriendGate(true);
        })();
      }
      // Block rendering until friend gate is ready
      return <div style={{ minHeight: "100vh", background: "#111" }} />;
    }

    if (showFirstCheck) {
      return (
        <FirstCheckScreen
          onComplete={(idea, expiresInHours, eventDate, maxSquadSize, eventTime, dateFlexible, timeFlexible, location) => {
            handleCreateCheck(idea, expiresInHours, eventDate, maxSquadSize, undefined, eventTime, dateFlexible, timeFlexible, undefined, location);
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

    return null;
  };

  const onboardingScreen = computeOnboardingScreen();

  return {
    onboardingScreen,
    sharedCheckGlowId,
    showAddGlow,
    setShowAddGlow,
    friendGate: {
      show: onboardingFriendGate,
      checkAuthorId: onboardingCheckAuthorId,
      onDone: handleFriendGateDone,
    },
    installDismissed,
    dismissInstall,
    notifBannerDismissed,
    dismissNotifBanner,
  };
}
