"use client";

import { useState, useCallback, useEffect } from "react";
import * as db from "@/lib/db";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import type { InterestCheck } from "@/lib/ui-types";
import { logError, logWarn } from "@/lib/logger";

// ─── Shared transform helpers ──────────────────────────────────────────────

type ActiveCheck = Awaited<ReturnType<typeof db.getActiveChecks>>[number];

function transformCheck(c: ActiveCheck, userId: string | null): InterestCheck {
  const now = new Date();
  const created = new Date(c.created_at);
  const msElapsed = now.getTime() - created.getTime();
  const minsElapsed = Math.floor(msElapsed / (1000 * 60));
  const hoursElapsed = Math.floor(msElapsed / (1000 * 60 * 60));

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

  const mm = c.movie_metadata;
  return {
    id: c.id,
    text: c.text,
    author: c.author.display_name,
    authorId: c.author_id,
    timeAgo: hoursElapsed > 0 ? `${hoursElapsed}h` : minsElapsed > 0 ? `${minsElapsed}m` : "now",
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
    squadMemberCount: c.squads?.find((s) => !s.archived_at)?.members?.length ?? 0,
    eventDate: c.event_date ?? undefined,
    eventDateLabel: c.event_date ? new Date(c.event_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : undefined,
    eventTime: c.event_time ?? undefined,
    dateFlexible: c.date_flexible,
    timeFlexible: c.time_flexible,
    movieTitle: mm?.title,
    year: mm?.year,
    director: mm?.director,
    thumbnail: mm?.thumbnail,
    letterboxdUrl: c.letterboxd_url ?? undefined,
    vibes: mm?.vibes,
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
}

export function useChecks({ userId, isDemoMode, profile, friendCount, showToast, onCheckCreated, onDownResponse }: UseChecksParams) {
  const [checks, setChecks] = useState<InterestCheck[]>([]);
  const [myCheckResponses, setMyCheckResponses] = useState<Record<string, "down" | "maybe">>({});
  const [hiddenCheckIds, setHiddenCheckIds] = useState<Set<string>>(new Set());
  const [pendingDownCheckIds, setPendingDownCheckIds] = useState<Set<string>>(new Set());
  const [editingCheckId, setEditingCheckId] = useState<string | null>(null);
  const [editingCheckText, setEditingCheckText] = useState("");
  const [newlyAddedCheckId, setNewlyAddedCheckId] = useState<string | null>(null);

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
        const via = viaMap.get(c.id);
        if (via) c.viaFriendName = via;
      }
    }
    setChecks((prev) => mergeChecks(prev, transformedChecks));
    setHiddenCheckIds(new Set(hiddenIds));

    // Hydrate myCheckResponses from existing responses
    const restoredResponses: Record<string, "down" | "maybe"> = {};
    for (const c of transformedChecks) {
      const myResponse = c.responses.find((r) => r.name === "You");
      if (myResponse && (myResponse.status === "down" || myResponse.status === "maybe")) {
        restoredResponses[c.id] = myResponse.status;
      }
    }
    if (Object.keys(restoredResponses).length > 0) {
      setMyCheckResponses((prev) => ({ ...prev, ...restoredResponses }));
    }
  }, [userId]);

  const respondToCheck = (checkId: string, status: "down" | "maybe") => {
    const check = checks.find((c) => c.id === checkId);
    setMyCheckResponses((prev) => ({ ...prev, [checkId]: status }));
    setChecks((prev) =>
      prev.map((c) => {
        if (c.id === checkId) {
          const alreadyResponded = c.responses.some((r) => r.name === "You");
          if (alreadyResponded) {
            return {
              ...c,
              responses: c.responses.map((r) =>
                r.name === "You" ? { ...r, status } : r
              ),
            };
          }
          return {
            ...c,
            responses: [...c.responses, { name: "You", avatar: profile?.avatar_letter ?? "?", status }],
          };
        }
        return c;
      })
    );
    showToast(status === "down" ? "You're down! \u{1F919}" : "Marked as maybe");
    if (!isDemoMode && check?.id) {
      if (status === "down") {
        setPendingDownCheckIds((prev) => new Set(prev).add(checkId));
      }
      db.respondToCheck(check.id, status)
        .then(async () => {
          if (status === "down") {
            // Full reload: DB trigger may have auto-joined user to a squad
            if (onDownResponse) await onDownResponse();
            else await loadChecks();
            setPendingDownCheckIds((prev) => { const next = new Set(prev); next.delete(checkId); return next; });
          }
        })
        .catch((err) => {
          setPendingDownCheckIds((prev) => { const next = new Set(prev); next.delete(checkId); return next; });
          logError("respondToCheck", err, { checkId: check?.id, status });
        });
    }
  };

  const handleCreateCheck = async (
    idea: string,
    expiresInHours: number | null,
    eventDate: string | null,
    maxSquadSize: number,
    movieData?: { letterboxdUrl: string; title: string; year?: string; director?: string; thumbnail?: string; vibes?: string[] },
    eventTime?: string | null,
    dateFlexible?: boolean,
    timeFlexible?: boolean
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
        const newCheck: InterestCheck = {
          id: dbCheck.id,
          text: idea,
          author: profile?.display_name || "You",
          timeAgo: "now",
          expiresIn: expiresLabel,
          expiryPercent: 0,
          responses: [],
          isYours: true,
          maxSquadSize,
          eventDate: eventDate ?? undefined,
          eventDateLabel: dateLabel,
          eventTime: eventTime ?? undefined,
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
        maxSquadSize,
        eventDate: eventDate ?? undefined,
        eventDateLabel: dateLabel,
        eventTime: eventTime ?? undefined,
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
    editingCheckId,
    setEditingCheckId,
    editingCheckText,
    setEditingCheckText,
    newlyAddedCheckId,
    setNewlyAddedCheckId,
    loadChecks,
    hydrateChecks,
    respondToCheck,
    handleCreateCheck,
    hideCheck,
    unhideCheck,
  };
}
