"use client";

import { useCallback, useEffect, useReducer } from "react";
import * as db from "@/lib/db";
import type { Profile } from "@/lib/types";
import type { InterestCheck } from "@/lib/ui-types";
import { logError, logWarn } from "@/lib/logger";
import { formatTimeAgo } from "@/lib/utils";
import { checksReducer, initialChecksState, CheckActionType } from "@/features/checks/reducers/checksReducer";
import { isMysteryUnrevealed, isMysteryGuestsHidden } from "@/features/checks/lib/mystery";

// ─── Shared transform helpers ──────────────────────────────────────────────

type ActiveCheck = Awaited<ReturnType<typeof db.getActiveChecks>>[number];

function transformCheck(c: ActiveCheck, userId: string | null, displayName?: string): InterestCheck {
  const now = new Date();
  const created = new Date(c.created_at);
  const msElapsed = now.getTime() - created.getTime();

  // Mystery checks. Two redactions in play, both lifted at reveal time
  // (event_date crossing into the viewer's local today):
  //   • author identity — hidden from non-authors only (author sees their own
  //     name; non-authors see "???")
  //   • guest list      — hidden from EVERYONE pre-reveal, including the author.
  //     Total ritual; the host doesn't know if the room filled until the reveal.
  //     The viewer's own response is preserved so the "you're down" UI still works.
  const isMystery = !!(c as unknown as { mystery?: boolean }).mystery;
  const isUnrevealed = isMysteryUnrevealed(
    { mystery: isMystery, authorId: c.author_id, eventDate: c.event_date },
    userId,
    now,
  );
  const guestsHidden = isMysteryGuestsHidden(
    { mystery: isMystery, eventDate: c.event_date },
    now,
  );

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
    author: isUnrevealed ? "???" : c.author.display_name,
    // authorId stays accessible even when unrevealed — the display name is
    // what's redacted, but downstream features (host tag on comments,
    // notification routing) still need the real id. Components must check
    // mysteryUnrevealed before rendering authorId visibly.
    authorId: c.author_id,
    timeAgo: formatTimeAgo(created),
    expiresIn,
    expiryPercent,
    // Pre-reveal mystery checks: hide every other responder for everyone
    // (author included). Preserve the viewer's own response so the
    // "you're down" UI still works.
    responses: guestsHidden
      ? c.responses.filter((r) => r.user_id === userId).map((r) => ({
          name: displayName ?? r.user?.display_name ?? "You",
          avatar: r.user?.avatar_letter ?? "?",
          status: r.response,
          odbc: r.user_id,
        }))
      : c.responses.map((r) => ({
          name: r.user_id === userId ? (displayName ?? r.user?.display_name ?? "You") : (r.user?.display_name ?? "Unknown"),
          avatar: r.user?.avatar_letter ?? "?",
          status: r.response,
          odbc: r.user_id,
        })),
    isYours: c.author_id === userId,
    maxSquadSize: c.max_squad_size,
    squadId: guestsHidden ? undefined : c.squads?.find((s) => !s.archived_at)?.id,
    squadMemberCount: guestsHidden ? 0 : (() => {
      const squad = c.squads?.find((s) => !s.archived_at);
      const fromMembers = squad?.members?.filter((m) => (m as { role?: string }).role !== 'waitlist')?.length;
      // Fall back to check_responses count when squad_members is empty due to RLS
      return (fromMembers && fromMembers > 0) ? fromMembers : c.responses.filter((r) => r.response === 'down').length;
    })(),
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
    coAuthors: isUnrevealed ? [] : coAuthors,
    isCoAuthor,
    pendingTagForYou,
    mystery: isMystery,
    mysteryUnrevealed: isUnrevealed,
    mysteryGuestsHidden: guestsHidden,
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
  onCoAuthorRespond?: (checkId: string) => void;
}

export function useChecks({ userId, profile, friendCount, showToast, onCheckCreated, onDownResponse, onCoAuthorRespond }: UseChecksParams) {
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
      const transformedChecks = activeChecks.map((c) => transformCheck(c, userId, profile?.display_name));
      if (fofAnnotations.length > 0) {
        const viaMap = new Map(fofAnnotations.map((a) => [a.check_id, a.via_friend_name]));
        for (const c of transformedChecks) {
          if (c.isYours || c.isCoAuthor) continue;
          const via = viaMap.get(c.id);
          if (via) c.viaFriendName = via;
        }
      }

      // Rebuild myCheckResponses from server data — same shape as
      // hydrateChecks. Without this, a check that re-appears via the
      // realtime sub (e.g. after a revive) leaves the local responses
      // map stale, so the "DOWN" button indicator doesn't switch back to
      // "✓ DOWN" until the next full hydrate. patchYouResponses inside
      // SYNC_CHECKS still re-applies any optimistic in-flight responses.
      const restoredResponses: Record<string, "down" | "waitlist"> = {};
      for (const c of transformedChecks) {
        const myResponse = c.responses.find((r) => r.odbc === userId);
        if (myResponse && (myResponse.status === "down" || myResponse.status === "waitlist")) {
          restoredResponses[c.id] = myResponse.status;
        }
      }

      dispatch({
        type: CheckActionType.SYNC_CHECKS,
        checks: transformedChecks,
        responses: restoredResponses,
        avatarLetter: profile?.avatar_letter,
        userId,
      });
    } catch (err) {
      logWarn("loadChecks", "Failed to load checks", { error: err });
    }
  }, [userId, profile?.display_name, profile?.avatar_letter]);

  const hydrateChecks = useCallback((
    activeChecks: Awaited<ReturnType<typeof db.getActiveChecks>>,
    hiddenIds: string[],
    fofAnnotations?: { check_id: string; via_friend_name: string }[]
  ) => {
    const transformedChecks = activeChecks.map((c) => transformCheck(c, userId, profile?.display_name));
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
      const myResponse = c.responses.find((r) => r.odbc === userId);
      if (myResponse && (myResponse.status === "down" || myResponse.status === "waitlist")) {
        restoredResponses[c.id] = myResponse.status;
      }
    }

    dispatch({
      type: CheckActionType.SYNC_CHECKS,
      checks: transformedChecks,
      hiddenIds,
      responses: restoredResponses,
      avatarLetter: profile?.avatar_letter,
      userId,
    });
  }, [userId]);

  const respondToCheck = useCallback((checkId: string) => {
    const check = checks.find((c) => c.id === checkId);
    dispatch({ type: CheckActionType.SET_RESPONSE, checkId, status: "down", avatarLetter: profile?.avatar_letter ?? "?", userId });
    showToast("You're down! ✦");
    if (check?.id) {
      dispatch({ type: CheckActionType.SET_PENDING, checkId, pending: true });
      db.respondToCheck(check.id, 'down')
        .then(async (result) => {
          if (result.response === 'waitlist') {
            dispatch({ type: CheckActionType.SET_RESPONSE, checkId, status: "waitlist", avatarLetter: profile?.avatar_letter ?? "?", userId });
            showToast("Check is full — you're on the waitlist");
          }
          if (onDownResponse) await onDownResponse();
          else await loadChecks();
          dispatch({ type: CheckActionType.SET_PENDING, checkId, pending: false });
        })
        .catch((err) => {
          dispatch({ type: CheckActionType.SET_PENDING, checkId, pending: false });
          logError("respondToCheck", err, { checkId: check?.id });
        });
    }
  }, [checks, profile?.avatar_letter, userId, showToast, onDownResponse, loadChecks]);

  const handleCreateCheck = useCallback(async (
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
    mystery?: boolean,
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
        const dbCheck = await db.createInterestCheck(idea, expiresInHours, eventDate, maxSquadSize, movieData, eventTime ?? null, dateFlexible ?? true, timeFlexible ?? true, location ?? null, !!mystery);
        if (taggedFriendIds && taggedFriendIds.length > 0) {
          await db.tagCoAuthors(dbCheck.id, taggedFriendIds);
        }
        const newCheck: InterestCheck = {
          id: dbCheck.id,
          text: idea,
          author: profile?.display_name ?? profile?.username ?? "",
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
          mystery: !!mystery,
          mysteryUnrevealed: false, // author always sees their own check unredacted
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
  }, [userId, profile?.display_name, profile?.username, friendCount, showToast, onCheckCreated]);

  const acceptCoAuthorTag = useCallback(async (checkId: string) => {
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
  }, [userId, profile?.avatar_letter, showToast, onCoAuthorRespond, loadChecks]);

  const declineCoAuthorTag = useCallback(async (checkId: string) => {
    try {
      await db.respondToCoAuthorTag(checkId, false);
      dispatch({ type: CheckActionType.SET_CO_AUTHOR, checkId, userId: userId!, accepted: false });
      onCoAuthorRespond?.(checkId);
    } catch (err) {
      logError('declineCoAuthorTag', err, { checkId });
    }
  }, [userId, onCoAuthorRespond]);

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

  const clearResponse = useCallback((checkId: string) => {
    dispatch({ type: CheckActionType.CLEAR_RESPONSE, checkId, userId });
  }, [userId]);

  const hideCheck = useCallback(async (checkId: string) => {
    dispatch({ type: CheckActionType.SET_HIDDEN, checkId, hidden: true });
    db.hideCheck(checkId).catch((err) => logError("hideCheck", err, { checkId }));
  }, []);

  const unhideCheck = useCallback(async (checkId: string) => {
    dispatch({ type: CheckActionType.SET_HIDDEN, checkId, hidden: false });
    db.unhideCheck(checkId).catch((err) => logError("unhideCheck", err, { checkId }));
  }, []);

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
    clearResponse,
    handleCreateCheck,
    acceptCoAuthorTag,
    declineCoAuthorTag,
    hideCheck,
    unhideCheck,
    hydrateLeftChecks,
    redownFromLeft,
  };
}
