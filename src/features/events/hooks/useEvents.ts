"use client";

import { useState, useCallback, type MutableRefObject } from "react";
import * as db from "@/lib/db";
import { toLocalISODate, parseDateToISO } from "@/lib/utils";
import type { Event } from "@/lib/ui-types";
import { logError, logWarn } from "@/lib/logger";

interface UseEventsParams {
  userId: string | null;
  isDemoMode: boolean;
  showToast: (msg: string) => void;
  loadRealDataRef: MutableRefObject<() => Promise<void>>;
}

export function useEvents({ userId, isDemoMode, showToast, loadRealDataRef }: UseEventsParams) {
  const [events, setEvents] = useState<Event[]>([]);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [newlyAddedId, setNewlyAddedId] = useState<string | null>(null);
  const [archivedChecks, setArchivedChecks] = useState<{ id: string; text: string; archived_at: string }[]>([]);

  const hydrateEvents = useCallback((
    savedEvents: Awaited<ReturnType<typeof db.getSavedEvents>>,
    publicEvents: Awaited<ReturnType<typeof db.getPublicEvents>>,
    friendsEvents: Awaited<ReturnType<typeof db.getFriendsEvents>>
  ) => {
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
          movieTitle: se.event!.movie_metadata?.title,
          movieYear: se.event!.movie_metadata?.year,
          movieDirector: se.event!.movie_metadata?.director,
          movieThumbnail: se.event!.movie_metadata?.thumbnail,
          note: se.event!.note ?? undefined,
          saved: true,
          isDown: se.is_down,
          isPublic: se.event!.is_public ?? false,
          visibility: se.event!.visibility ?? 'public',
          posterName: se.event!.creator?.display_name ?? undefined,
          posterAvatar: se.event!.creator?.avatar_letter ?? undefined,
          peopleDown: prevPeopleDown.get(se.event!.id) ?? [],
          neighborhood: se.event!.neighborhood ?? undefined,
          rawDate: se.event!.date ?? undefined,
          createdAt: se.event!.created_at ?? undefined,
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
            movieTitle: e.movie_metadata?.title,
            movieYear: e.movie_metadata?.year,
            movieDirector: e.movie_metadata?.director,
            movieThumbnail: e.movie_metadata?.thumbnail,
            note: e.note ?? undefined,
            saved: false,
            isDown: false,
            visibility: e.visibility ?? 'public',
            posterName: e.creator?.display_name ?? undefined,
            posterAvatar: e.creator?.avatar_letter ?? undefined,
            peopleDown: prevPeopleDown.get(e.id) ?? [],
            neighborhood: e.neighborhood ?? undefined,
            rawDate: e.date ?? undefined,
            createdAt: e.created_at ?? undefined,
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

  }, []);

  const hydrateSocialData = useCallback((
    peopleDownMap: Awaited<ReturnType<typeof db.getPeopleDownBatch>>,
    crewPoolMap: Awaited<ReturnType<typeof db.getCrewPoolBatch>>,
    userPoolEventIds: Awaited<ReturnType<typeof db.getUserPoolEventIds>>
  ) => {
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
        socialLoaded: true,
      };
    };

    setEvents((prev) => prev.map(enrichEvent));
  }, []);

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
        if (!newDown) loadRealDataRef.current();
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

  const handleEditEvent = async (updated: { title: string; venue: string; date: string; time: string; vibe: string[]; note: string }) => {
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
          note: updated.note || null,
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
          ? { ...e, title: updated.title, venue: updated.venue, date: dateDisplay, time: updated.time, vibe: updated.vibe, note: updated.note || undefined, rawDate: dateISO ?? undefined }
          : e
      );
    setEvents(updateList);
    setEditingEvent(null);
    showToast("Event updated!");
  };

  return {
    events,
    setEvents,
    editingEvent,
    setEditingEvent,
    newlyAddedId,
    setNewlyAddedId,
    archivedChecks,
    setArchivedChecks,
    hydrateEvents,
    hydrateSocialData,
    toggleSave,
    toggleDown,
    handleEditEvent,
  };
}
