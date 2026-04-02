"use client";

import { useCallback, useEffect, useReducer } from "react";
import * as db from "@/lib/db";
import type { Profile } from "@/lib/types";
import type { InterestCheck } from "@/lib/ui-types";
import { logError, logWarn } from "@/lib/logger";
import { formatTimeAgo } from "@/lib/utils";
import { checksReducer, initialChecksState, CheckActionType } from "@/features/checks/reducers/checksReducer";

// ─── Shared transform helpers ──────────────────────────────────────────────

type ActiveCheck = Awaited<ReturnType<typeof db.getActiveChecks>>[number];

function transformCheck(c: ActiveCheck, userId: string | null): InterestCheck {
  const now = new Date();
  const created = new Date(c.created_at);
  const msElapsed = now.getTime() - created.getTime();

  let expiresIn: string;
  let expiryPercent: number;
  if (!c.expires_at) {
    expiresIn = "open";
    expiryPercent = 0;
  } else {
    const expires = new Date(c.expires_at);
    const totalDuration = expires.getTime() - created.getTime();
    expiryPercent = Math.min(100, (msElapsed / totalDuration) * 100);
    const msRemaining = expires.getTime() - now.getTime();
    const hoursRemaining = Math.floor(msRemaining / (1000 * 60 * 60));
    const minsRemaining = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));
    expiresIn = hoursRemaining > 0 ? `${hoursRemaining}h` : minsRemaining > 0 ? `${minsRemaining}m` : "expired";
  }

  const coAuthors = (c.co_authors ?? []).map(ca => ({
    userId: ca.user_id,
    name: ca.user?.display_name ?? "Unknown",
    avatar: ca.user?.avatar_letter ?? "?",
    status: ca.status as 'pending' | 'accepted' | 'declined',
  }));

  const isCoAuthor = userId
    ? coAuthors.some(ca => ca.userId === userId && ca.status === 'accepted')
    : false;

  const pendingTagForYou = userId
    ? coAuthors.some(ca => ca.userId === userId && ca.status === 'pending')
    : false;

  const mm = c.movie_metadata;
  return {
    id: c.id,
    text: c.text,
    author: c.author.display_name,
    authorId: c.author_id,
    timeAgo: formatTimeAgo(created),
    expiresIn,
    expiryPercent,
    responses: c.responses.map((r) => ({
      name: r.user_id === userId ? "You" : (r.user?.display_name ?? "Unknown"),
      avatar: r.user?.avatar_letter ?? "?",
      status: r.response,
      odbc: r.user_id,
    })),
    isYours: c.author_id === userId,
    maxSquadSize: c.max_squad_size,
    squadId: c.squads?.find((s) => !s.archived_at)?.id,
    squadMemberCount: c.squads?.find((s) => !s.archived_at)?.members?.filter((m) => (m as { role?: string }).role !== 'waitlist')?.length ?? 0,
    inSquad: !!userId && !!(c.squads?.find((s) => !s.archived_at)?.members?.some((m) => (m as { user_id?: string }).user_id === userId && (m as { role?: string }).role !== 'waitlist')),
    isWaitlisted: !!userId && !!(c.squads?.find((s) => !s.archived_at)?.members?.some((m) => (m as { user_id?: string }).user_id === userId && (m as { role?: string }).role === 'waitlist')),
    eventDate: c.event_date ?? undefined,
    eventDateLabel: c.event_date ? new Date(c.event_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : undefined,
    eventTime: c.event_time?.replace(/\s*[Aa][Mm]/g, 'am').replace(/\s*[Pp][Mm]/g, 'pm') ?? undefined,
    dateFlexible: c.date_flexible,
    timeFlexible: c.time_flexible,
    location: c.location ?? undefined,
    movieTitle: mm?.title,
    year: mm?.year,
    director: mm?.director,
    thumbnail: mm?.thumbnail,
    letterboxdUrl: c.letterboxd_url ?? undefined,
    vibes: mm?.vibes,
    createdAt: c.created_at,
    expiresAt: c.expires_at ?? undefined,
    coAuthors,
    isCoAuthor,
    pendingTagForYou,
  };
}

// ─── Hook ──────────────────────────────────────────────────────────────────

interface UseChecksParams {
  userId: string | null;
  profile: Profile | null;
  friendCount: number;
  showToast: (msg: string) => void;
  onCheckCreated?: () => void;
  onDownResponse?: () => Promise<void> | void;
  onAutoSquad?: (checkId: string) => void;
  onCoAuthorRespond?: (checkId: string) => void;
}

export function useChecks({ userId, profile, friendCount, showToast, onCheckCreated, onDownResponse, onAutoSquad, onCoAuthorRespond }: UseChecksParams) {
  // Single reducer replaces 6x useState
  const [state, dispatch] = useReducer(checksReducer, initialChecksState);
  const { checks, myCheckResponses, hiddenCheckIds, pendingDownCheckIds, newlyAddedCheckId, leftChecks } = state;

  const loadChecks = useCallback(async () => {
    if (!userId) return;
    try {
      const [activeChecks, fofAnnotations] = await Promise.all([
        db.getActiveChecks(),
        db.getFofAnnotations().catch(() => [] as { check_id: string; via_friend_name: string }[]),
      ]);
      const transformedChecks = activeChecks.map((c) => transformCheck(c, userId));
      if (fofAnnotations.length > 0) {
        const viaMap = new Map(fofAnnotations.map((a) => [a.check_id, a.via_friend_name]));
        for (const c of transformedChecks) {
          if (c.isYours || c.isCoAuthor) continue;
          const via = viaMap.get(c.id);
          if (via) c.viaFriendName = via;
        }
      }
      dispatch({ type: CheckActionType.SYNC_CHECKS, checks: transformedChecks });
    } catch (err) {
      logWarn("loadChecks", "Failed to load checks", { error: err });
    }
  }, [userId]);

  const hydrateChecks = useCallback((
    activeChecks: Awaited<ReturnType<typeof db.getActiveChecks>>,
    hiddenIds: string[],
    fofAnnotations?: { check_id: string; via_friend_name: string }[]
  ) => {
    const transformedChecks = activeChecks.map((c) => transformCheck(c, userId));
    if (fofAnnotations && fofAnnotations.length > 0) {
      const viaMap = new Map(fofAnnotations.map((a) => [a.check_id, a.via_friend_name]));
      for (const c of transformedChecks) {
        if (c.isYours || c.isCoAuthor) continue;
        const via = viaMap.get(c.id);
        if (via) c.viaFriendName = via;
      }
    }

    // Build responses map from server data — passed to SYNC_CHECKS so it atomically
    // sets checks + hiddenIds + myCheckResponses in one render
    const restoredResponses: Record<string, "down" | "waitlist"> = {};
    for (const c of transformedChecks) {
      const myResponse = c.responses.find((r) => r.name === "You");
      if (myResponse && (myResponse.status === "down" || myResponse.status === "waitlist")) {
        restoredResponses[c.id] = myResponse.status;
      }
    }

    dispatch({
      type: CheckActionType.SYNC_CHECKS,
      checks: transformedChecks,
      hiddenIds,
      ...(Object.keys(restoredResponses).length > 0 && { responses: restoredResponses }),
    });
  }, [userId]);

  const respondToCheck = (checkId: string) => {
    const check = checks.find((c) => c.id === checkId);
    dispatch({ type: CheckActionType.SET_RESPONSE, checkId, status: "down", avatarLetter: profile?.avatar_letter ?? "?" });
    showToast("You're down! \u{1F919}");
    if (check?.id) {
      dispatch({ type: CheckActionType.SET_PENDING, checkId, pending: true });
      db.respondToCheck(check.id, 'down')
        .then(async (result) => {
          if (result.response === 'waitlist') {
            dispatch({ type: CheckActionType.SET_RESPONSE, checkId, status: "waitlist" });
            showToast("Check is full — you're on the waitlist");
          }
          if (onDownResponse) await onDownResponse();
          else await loadChecks();
          dispatch({ type: CheckActionType.SET_PENDING, checkId, pending: false });
          if (result.response === 'down' && onAutoSquad) {
            // Read latest checks after reload to check squad/down count
            const updated = checks.find((c) => c.id === checkId);
            if (updated && !updated.squadId) {
              const downCount = updated.responses.filter((r) => r.status === "down").length;
              if (downCount >= 2) {
                setTimeout(() => onAutoSquad(checkId), 300);
              }
            }
          }
        })
        .catch((err) => {
          dispatch({ type: CheckActionType.SET_PENDING, checkId, pending: false });
          logError("respondToCheck", err, { checkId: check?.id });
        });
    }
  };

  const handleCreateCheck = async (
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
  ) => {
    const expiresLabel = expiresInHours == null ? "open" : expiresInHours >= 24 ? "24h" : `${expiresInHours}h`;
    const dateLabel = eventDate ? new Date(eventDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : undefined;
    const movieFields = movieData ? {
      movieTitle: movieData.title,
      year: movieData.year,
      director: movieData.director,
      thumbnail: movieData.thumbnail,
      letterboxdUrl: movieData.letterboxdUrl,
      vibes: movieData.vibes,
    } : {};

    if (userId) {
      try {
        const dbCheck = await db.createInterestCheck(idea, expiresInHours, eventDate, maxSquadSize, movieData, eventTime ?? null, dateFlexible ?? true, timeFlexible ?? true, location ?? null);
        if (taggedFriendIds && taggedFriendIds.length > 0) {
          await db.tagCoAuthors(dbCheck.id, taggedFriendIds);
        }
        const newCheck: InterestCheck = {
          id: dbCheck.id,
          text: idea,
          author: profile?.display_name || "You",
          timeAgo: "now",
          expiresIn: expiresLabel,
          expiryPercent: 0,
          responses: [],
          isYours: true,
          createdAt: new Date().toISOString(),
          maxSquadSize: maxSquadSize ?? undefined,
          eventDate: eventDate ?? undefined,
          eventDateLabel: dateLabel,
          eventTime: eventTime?.replace(/\s*[Aa][Mm]/g, 'am').replace(/\s*[Pp][Mm]/g, 'pm') ?? undefined,
          dateFlexible: dateFlexible ?? true,
          timeFlexible: timeFlexible ?? true,
          location: location ?? undefined,
          ...movieFields,
        };
        dispatch({ type: CheckActionType.UPSERT_CHECK, check: newCheck });
        dispatch({ type: CheckActionType.SET_NEWLY_ADDED, checkId: newCheck.id });
        showToast(friendCount > 0 ? "Sent to friends & their friends! \u{1F4E3}" : "Check posted! Add friends to share it \u{1F4E3}");
        onCheckCreated?.();
      } catch (err) {
        logError("createCheck", err);
        showToast("Failed to send - try again");
      }
    }
  };

  const acceptCoAuthorTag = async (checkId: string) => {
    try {
      await db.respondToCoAuthorTag(checkId, true);
      dispatch({ type: CheckActionType.SET_CO_AUTHOR, checkId, userId: userId!, accepted: true, avatarLetter: profile?.avatar_letter ?? "?" });
      showToast("You're now a co-author!");
      onCoAuthorRespond?.(checkId);
      loadChecks();
    } catch (err) {
      logError('acceptCoAuthorTag', err, { checkId });
      showToast('Failed to accept tag');
    }
  };

  const declineCoAuthorTag = async (checkId: string) => {
    try {
      await db.respondToCoAuthorTag(checkId, false);
      dispatch({ type: CheckActionType.SET_CO_AUTHOR, checkId, userId: userId!, accepted: false });
      onCoAuthorRespond?.(checkId);
    } catch (err) {
      logError('declineCoAuthorTag', err, { checkId });
    }
  };

  const hydrateLeftChecks = useCallback((raw: Awaited<ReturnType<typeof db.getLeftChecks>>) => {
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const filtered = raw.filter((r) => {
      if (!r.check) return false;
      if (r.check.expires_at && new Date(r.check.expires_at) < now) return false;
      if (r.check.event_date && r.check.event_date < todayIso) return false;
      return true;
    });
    dispatch({
      type: CheckActionType.HYDRATE_LEFT_CHECKS,
      leftChecks: filtered.map((r) => ({
        id: r.check.id,
        text: r.check.text,
        author: r.check.author.display_name,
        authorId: r.check.author_id,
        timeAgo: '',
        expiresIn: '',
        expiryPercent: 0,
        responses: [],
        isYours: false,
        eventDate: r.check.event_date ?? undefined,
        eventDateLabel: r.check.event_date
          ? new Date(r.check.event_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          : undefined,
        eventTime: r.check.event_time?.replace(/\s*[Aa][Mm]/g, 'am').replace(/\s*[Pp][Mm]/g, 'pm') ?? undefined,
      })),
    });
  }, []);

  const redownFromLeft = useCallback((checkId: string) => {
    dispatch({ type: CheckActionType.REMOVE_FROM_LEFT, checkId });
    respondToCheck(checkId);
    db.removeLeftCheck(checkId).catch((err) => logError('removeLeftCheck', err, { checkId }));
  }, [respondToCheck]);

  const hideCheck = async (checkId: string) => {
    dispatch({ type: CheckActionType.SET_HIDDEN, checkId, hidden: true });
    db.hideCheck(checkId).catch((err) => logError("hideCheck", err, { checkId }));
  };

  const unhideCheck = async (checkId: string) => {
    dispatch({ type: CheckActionType.SET_HIDDEN, checkId, hidden: false });
    db.unhideCheck(checkId).catch((err) => logError("unhideCheck", err, { checkId }));
  };

  // Recalculate expiry every 30s so stale checks auto-hide
  useEffect(() => {
    const timer = setInterval(() => {
      dispatch({ type: CheckActionType.TICK_EXPIRY, now: new Date() });
    }, 30_000);
    return () => clearInterval(timer);
  }, []);

  // Subscribe to realtime interest check changes
  useEffect(() => {
    if (!userId) return;
    const sub = db.subscribeToChecks(() => { loadChecks(); });
    return () => { sub.unsubscribe(); };
  }, [userId, loadChecks]);

  return {
    checks,
    myCheckResponses,
    hiddenCheckIds,
    pendingDownCheckIds,
    newlyAddedCheckId,
    leftChecks,
    dispatch,
    loadChecks,
    hydrateChecks,
    respondToCheck,
    handleCreateCheck,
    acceptCoAuthorTag,
    declineCoAuthorTag,
    hideCheck,
    unhideCheck,
    hydrateLeftChecks,
    redownFromLeft,
  };
}
