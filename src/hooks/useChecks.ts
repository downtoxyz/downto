"use client";

import { useState, useCallback, useEffect } from "react";
import * as db from "@/lib/db";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import type { InterestCheck } from "@/lib/ui-types";
import { logError, logWarn } from "@/lib/logger";
import { formatTimeAgo } from "@/lib/utils";

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
    eventDate: c.event_date ?? undefined,
    eventDateLabel: c.event_date ? new Date(c.event_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : undefined,
    eventTime: c.event_time?.replace(/AM/gi, 'am').replace(/PM/gi, 'pm') ?? undefined,
    dateFlexible: c.date_flexible,
    timeFlexible: c.time_flexible,
    location: (c as Record<string, unknown>).location as string | undefined,
    movieTitle: mm?.title,
    year: mm?.year,
    director: mm?.director,
    thumbnail: mm?.thumbnail,
    letterboxdUrl: c.letterboxd_url ?? undefined,
    vibes: mm?.vibes,
    coAuthors,
    isCoAuthor,
    pendingTagForYou,
  };
}

function mergeChecks(prev: InterestCheck[], transformed: InterestCheck[]): InterestCheck[] {
  const prevMap = new Map(prev.map((c) => [c.id, c]));
  return transformed.map((c) => {
    const existing = prevMap.get(c.id);
    if (existing) {
      return { ...c, squadId: c.squadId ?? existing.squadId, viaFriendName: c.viaFriendName ?? existing.viaFriendName };
    }
    return c;
  });
}

// ─── Hook ──────────────────────────────────────────────────────────────────

interface UseChecksParams {
  userId: string | null;
  isDemoMode: boolean;
  profile: Profile | null;
  friendCount: number;
  showToast: (msg: string) => void;
  onCheckCreated?: () => void;
  onDownResponse?: () => Promise<void> | void;
  onCoAuthorRespond?: (checkId: string) => void;
}

export function useChecks({ userId, isDemoMode, profile, friendCount, showToast, onCheckCreated, onDownResponse, onCoAuthorRespond }: UseChecksParams) {
  const [checks, setChecks] = useState<InterestCheck[]>([]);
  const [myCheckResponses, setMyCheckResponses] = useState<Record<string, "down" | "waitlist">>({});
  const [hiddenCheckIds, setHiddenCheckIds] = useState<Set<string>>(new Set());
  const [pendingDownCheckIds, setPendingDownCheckIds] = useState<Set<string>>(new Set());
  const [newlyAddedCheckId, setNewlyAddedCheckId] = useState<string | null>(null);
  const [leftChecks, setLeftChecks] = useState<InterestCheck[]>([]);

  const loadChecks = useCallback(async () => {
    if (isDemoMode || !userId) return;
    try {
      const [activeChecks, fofAnnotations] = await Promise.all([
        db.getActiveChecks(),
        db.getFofAnnotations().catch(() => [] as { check_id: string; via_friend_name: string }[]),
      ]);
      const transformedChecks = activeChecks.map((c) => transformCheck(c, userId));
      if (fofAnnotations.length > 0) {
        const viaMap = new Map(fofAnnotations.map((a) => [a.check_id, a.via_friend_name]));
        for (const c of transformedChecks) {
          if (c.isYours || c.isCoAuthor) continue; // co-authors see it as friend-priority
          const via = viaMap.get(c.id);
          if (via) c.viaFriendName = via;
        }
      }
      setChecks((prev) => mergeChecks(prev, transformedChecks));
    } catch (err) {
      logWarn("loadChecks", "Failed to load checks", { error: err });
    }
  }, [isDemoMode, userId]);

  const hydrateChecks = useCallback((
    activeChecks: Awaited<ReturnType<typeof db.getActiveChecks>>,
    hiddenIds: string[],
    fofAnnotations?: { check_id: string; via_friend_name: string }[]
  ) => {
    const transformedChecks = activeChecks.map((c) => transformCheck(c, userId));
    if (fofAnnotations && fofAnnotations.length > 0) {
      const viaMap = new Map(fofAnnotations.map((a) => [a.check_id, a.via_friend_name]));
      for (const c of transformedChecks) {
        if (c.isYours || c.isCoAuthor) continue; // co-authors see it as friend-priority
        const via = viaMap.get(c.id);
        if (via) c.viaFriendName = via;
      }
    }
    setChecks((prev) => mergeChecks(prev, transformedChecks));
    setHiddenCheckIds(new Set(hiddenIds));

    // Hydrate myCheckResponses from existing responses
    const restoredResponses: Record<string, "down" | "waitlist"> = {};
    for (const c of transformedChecks) {
      const myResponse = c.responses.find((r) => r.name === "You");
      if (myResponse && (myResponse.status === "down" || myResponse.status === "waitlist")) {
        restoredResponses[c.id] = myResponse.status;
      }
    }
    if (Object.keys(restoredResponses).length > 0) {
      setMyCheckResponses((prev) => ({ ...prev, ...restoredResponses }));
    }
  }, [userId]);

  const respondToCheck = (checkId: string) => {
    const check = checks.find((c) => c.id === checkId);
    setMyCheckResponses((prev) => ({ ...prev, [checkId]: "down" }));
    setChecks((prev) =>
      prev.map((c) => {
        if (c.id === checkId) {
          const alreadyResponded = c.responses.some((r) => r.name === "You");
          if (alreadyResponded) {
            return {
              ...c,
              responses: c.responses.map((r) =>
                r.name === "You" ? { ...r, status: "down" as const } : r
              ),
            };
          }
          return {
            ...c,
            responses: [...c.responses, { name: "You", avatar: profile?.avatar_letter ?? "?", status: "down" as const }],
          };
        }
        return c;
      })
    );
    showToast("You're down! \u{1F919}");
    if (!isDemoMode && check?.id) {
      setPendingDownCheckIds((prev) => new Set(prev).add(checkId));
      db.respondToCheck(check.id, 'down')
        .then(async (result) => {
          // Server may have converted to waitlist via trigger
          if (result.response === 'waitlist') {
            setMyCheckResponses((prev) => ({ ...prev, [checkId]: "waitlist" }));
            setChecks((prev) =>
              prev.map((c) =>
                c.id === checkId
                  ? { ...c, responses: c.responses.map((r) => r.name === "You" ? { ...r, status: "waitlist" as const } : r) }
                  : c
              )
            );
            showToast("Check is full — you're on the waitlist");
          }
          // Full reload: DB trigger may have auto-joined user to a squad
          if (onDownResponse) await onDownResponse();
          else await loadChecks();
          setPendingDownCheckIds((prev) => { const next = new Set(prev); next.delete(checkId); return next; });
        })
        .catch((err) => {
          setPendingDownCheckIds((prev) => { const next = new Set(prev); next.delete(checkId); return next; });
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
    taggedFriendIds?: string[]
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

    if (!isDemoMode && userId) {
      try {
        const dbCheck = await db.createInterestCheck(idea, expiresInHours, eventDate, maxSquadSize, movieData, eventTime ?? null, dateFlexible ?? true, timeFlexible ?? true);
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
          maxSquadSize: maxSquadSize ?? undefined,
          eventDate: eventDate ?? undefined,
          eventDateLabel: dateLabel,
          eventTime: eventTime?.replace(/AM/gi, 'am').replace(/PM/gi, 'pm') ?? undefined,
          dateFlexible: dateFlexible ?? true,
          timeFlexible: timeFlexible ?? true,
          ...movieFields,
        };
        setChecks((prev) => [newCheck, ...prev]);
        setNewlyAddedCheckId(newCheck.id);
        showToast(friendCount > 0 ? "Sent to friends & their friends! \u{1F4E3}" : "Check posted! Add friends to share it \u{1F4E3}");
        onCheckCreated?.();
      } catch (err) {
        logError("createCheck", err);
        showToast("Failed to send - try again");
      }
    } else {
      const newCheck: InterestCheck = {
        id: `local-check-${Date.now()}`,
        text: idea,
        author: "You",
        timeAgo: "now",
        expiresIn: expiresLabel,
        expiryPercent: 0,
        responses: [],
        isYours: true,
        maxSquadSize: maxSquadSize ?? undefined,
        eventDate: eventDate ?? undefined,
        eventDateLabel: dateLabel,
        eventTime: eventTime?.replace(/AM/gi, 'am').replace(/PM/gi, 'pm') ?? undefined,
        dateFlexible: dateFlexible ?? true,
        ...movieFields,
      };
      setChecks((prev) => [newCheck, ...prev]);
      setNewlyAddedCheckId(newCheck.id);
      showToast(friendCount > 0 ? "Sent to friends & their friends! \u{1F4E3}" : "Check posted! Add friends to share it \u{1F4E3}");
      onCheckCreated?.();

      setTimeout(() => {
        setChecks((prev) =>
          prev.map((c) =>
            c.id === newCheck.id
              ? { ...c, responses: [{ name: "Sara", avatar: "S", status: "down" as const }] }
              : c
          )
        );
      }, 3000);
      setTimeout(() => {
        setChecks((prev) =>
          prev.map((c) =>
            c.id === newCheck.id
              ? {
                  ...c,
                  responses: [
                    ...c.responses,
                    { name: "Nickon", avatar: "N", status: "down" as const },
                  ],
                }
              : c
          )
        );
      }, 6000);
    }
  };

  const acceptCoAuthorTag = async (checkId: string) => {
    if (isDemoMode) return;
    try {
      await db.respondToCoAuthorTag(checkId, true);
      setChecks(prev => prev.map(c =>
        c.id === checkId
          ? {
              ...c,
              isCoAuthor: true,
              pendingTagForYou: false,
              coAuthors: c.coAuthors?.map(ca =>
                ca.userId === userId ? { ...ca, status: 'accepted' as const } : ca
              ),
            }
          : c
      ));
      // DB trigger auto-responds "down" — update local state too
      setMyCheckResponses(prev => ({ ...prev, [checkId]: 'down' }));
      setChecks(prev => prev.map(c => {
        if (c.id !== checkId) return c;
        const alreadyResponded = c.responses.some(r => r.name === 'You');
        if (alreadyResponded) {
          return { ...c, responses: c.responses.map(r => r.name === 'You' ? { ...r, status: 'down' as const } : r) };
        }
        return { ...c, responses: [...c.responses, { name: 'You', avatar: profile?.avatar_letter ?? '?', status: 'down' as const }] };
      }));
      showToast("You're now a co-author!");
      onCoAuthorRespond?.(checkId);
      loadChecks();
    } catch (err) {
      logError('acceptCoAuthorTag', err, { checkId });
      showToast('Failed to accept tag');
    }
  };

  const declineCoAuthorTag = async (checkId: string) => {
    if (isDemoMode) return;
    try {
      await db.respondToCoAuthorTag(checkId, false);
      setChecks(prev => prev.map(c =>
        c.id === checkId
          ? {
              ...c,
              pendingTagForYou: false,
              coAuthors: c.coAuthors?.map(ca =>
                ca.userId === userId ? { ...ca, status: 'declined' as const } : ca
              ),
            }
          : c
      ));
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
      // Filter out expired checks
      if (r.check.expires_at && new Date(r.check.expires_at) < now) return false;
      // Filter out past-date checks
      if (r.check.event_date && r.check.event_date < todayIso) return false;
      return true;
    });
    setLeftChecks(filtered.map((r) => ({
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
      eventTime: r.check.event_time?.replace(/AM/gi, 'am').replace(/PM/gi, 'pm') ?? undefined,
    })));
  }, []);

  const redownFromLeft = useCallback((checkId: string) => {
    // Optimistically remove from leftChecks
    setLeftChecks((prev) => prev.filter((c) => c.id !== checkId));
    // Re-down via normal flow
    respondToCheck(checkId);
    // Backup: explicitly remove left_checks row (trigger should handle it, but be safe)
    db.removeLeftCheck(checkId).catch((err) => logError('removeLeftCheck', err, { checkId }));
  }, [respondToCheck]);

  const hideCheck = async (checkId: string) => {
    setHiddenCheckIds((prev) => new Set(prev).add(checkId));
    if (!isDemoMode) {
      db.hideCheck(checkId).catch((err) => logError("hideCheck", err, { checkId }));
    }
  };

  const unhideCheck = async (checkId: string) => {
    setHiddenCheckIds((prev) => {
      const next = new Set(prev);
      next.delete(checkId);
      return next;
    });
    if (!isDemoMode) {
      db.unhideCheck(checkId).catch((err) => logError("unhideCheck", err, { checkId }));
    }
  };

  // Subscribe to realtime interest check changes
  useEffect(() => {
    if (isDemoMode || !userId) return;
    const sub = db.subscribeToChecks(() => { loadChecks(); });
    return () => { sub.unsubscribe(); };
  }, [isDemoMode, userId, loadChecks]);

  return {
    checks,
    setChecks,
    myCheckResponses,
    setMyCheckResponses,
    hiddenCheckIds,
    pendingDownCheckIds,
    newlyAddedCheckId,
    setNewlyAddedCheckId,
    loadChecks,
    hydrateChecks,
    respondToCheck,
    handleCreateCheck,
    acceptCoAuthorTag,
    declineCoAuthorTag,
    hideCheck,
    unhideCheck,
    leftChecks,
    hydrateLeftChecks,
    redownFromLeft,
  };
}
