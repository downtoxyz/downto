"use client";

import { useState, useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import * as db from "@/lib/db";
import type { Profile } from "@/lib/types";
import type { Person, Event, InterestCheck, Squad } from "@/lib/ui-types";
import { logError, logWarn } from "@/lib/logger";
import { formatTimeAgo } from "@/lib/utils";

const SQUAD_FORMED_MESSAGES = [
  '"{title}" squad just dropped',
  '"{title}" squad is locked tf in',
  'ok so "{title}" is actually happening',
  '"{title}" squad activated. god help us all',
  'the "{title}" era begins and no one is ready',
  '"{title}" squad but like for real this time',
  'new core memory unlocked: "{title}" squad',
  '"{title}" squad assembled. society is healing',
  'congrats you are now legally obligated to do "{title}"',
  'the group chat for "{title}" just got real',
];

const SQUAD_CONTEXT_CHECK = [
  '{author}\'s idea · you actually did something about it',
  '{author} manifested this · you made it real',
  'blame {author} for the idea · blame you for the squad',
  '{author} tweeted into the void · you responded',
  '{author} threw it out there · you chose violence',
];

const SQUAD_OPENERS = [
  // unhinged commitment
  "i cleared my schedule. i didn't have anything but still",
  "i just told my mom i have plans",
  "already mentally there tbh",
  "i'm getting ready rn and idc if it's in 3 days",
  "just cancelled plans i didn't have for this",
  "i've been manifesting this exact hangout",
  "i already know what i'm wearing",
  "mentally i'm already there waiting for you guys",
  // threatening (affectionately)
  "if anyone flakes i'm airing it out",
  "screenshot taken. evidence logged.",
  "i have everyone's location shared don't even think about it",
  "flaking is a federal offense btw",
  "i will be checking in hourly until this happens",
  "i'm setting reminders for all of you don't test me",
  // dramatic
  "the universe aligned for this exact moment",
  "historians will write about this squad",
  "main character energy activated",
  "the prophecy has been fulfilled",
  "we were put on this earth for this moment",
  "this is our origin story",
  // deadpan / dry
  "cool. no turning back now",
  "well that happened fast",
  "anyway i'm already dressed",
  "so this is really happening huh",
  "ok bet",
  "noted. see you there i guess",
  // chaotic
  "LETS GOOOOO",
  "oh this is gonna be unhinged",
  "everybody act normal",
  "nobody tell my therapist about this one",
  "this energy is immaculate",
  "i blacked out and now i'm in a squad",
];

const pickRandom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const pickFormedMessage = (title: string) =>
  pickRandom(SQUAD_FORMED_MESSAGES).replace("{title}", title);

const pickContextCheck = (author: string) =>
  pickRandom(SQUAD_CONTEXT_CHECK).replace("{author}", author);

const pickOpener = (title?: string) => {
  // ~25% chance to use the title in an unhinged way
  if (title && Math.random() < 0.25) {
    const titleOpeners = [
      `I CANT WAIT TO ${title.toUpperCase()} WITH YALL`,
      `we are about to ${title} SO HARD`,
      `${title} isn't ready for us`,
      `${title} will never be the same after we're done with it`,
    ];
    return titleOpeners[Math.floor(Math.random() * titleOpeners.length)];
  }
  return SQUAD_OPENERS[Math.floor(Math.random() * SQUAD_OPENERS.length)];
};

// ─── Hook ──────────────────────────────────────────────────────────────────

interface UseSquadsParams {
  userId: string | null;
  isDemoMode: boolean;
  profile: Profile | null;
  setChecks: Dispatch<SetStateAction<InterestCheck[]>>;
  showToast: (msg: string) => void;
  onSquadCreated?: () => void;
  onAutoDown?: (eventId: string) => Promise<void>;
}

export function useSquads({ userId, isDemoMode, profile, setChecks, showToast, onSquadCreated, onAutoDown }: UseSquadsParams) {
  const [squads, setSquads] = useState<Squad[]>([]);
  const [socialEvent, setSocialEvent] = useState<Event | null>(null);
  const [squadPoolMembers, setSquadPoolMembers] = useState<Person[]>([]);
  const [inSquadPool, setInSquadPool] = useState(false);
  const [squadNotification, setSquadNotification] = useState<{
    squadName: string;
    startedBy: string;
    ideaBy: string;
    members: string[];
    squadId: string;
  } | null>(null);
  const [creatingSquad, setCreatingSquad] = useState(false);
  const [autoSelectSquadId, setAutoSelectSquadId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("squadId");
    }
    return null;
  });

  const hydrateSquads = useCallback((squadsList: Awaited<ReturnType<typeof db.getSquads>>) => {
    const transformedSquads: Squad[] = squadsList.map((s) => {
      const myMembership = (s.members ?? []).find((m) => m.user_id === userId);
      const isWaitlisted = myMembership?.role === 'waitlist';
      const members = (s.members ?? []).filter((m) => m.role !== 'waitlist').map((m) => ({
        name: m.user_id === userId ? "You" : (m.user?.display_name ?? "Unknown"),
        avatar: m.user?.avatar_letter ?? m.user?.display_name?.charAt(0)?.toUpperCase() ?? "?",
        userId: m.user_id,
      }));
      const waitlistedMembers = (s.members ?? []).filter((m) => m.role === 'waitlist' && m.user_id !== userId).map((m) => ({
        name: m.user?.display_name ?? "Unknown",
        avatar: m.user?.avatar_letter ?? m.user?.display_name?.charAt(0)?.toUpperCase() ?? "?",
        userId: m.user_id,
      }));
      const memberIds = new Set(members.map((m) => m.userId));
      const waitlistedIds = new Set(waitlistedMembers.map((m) => m.userId));
      const downResponders = ((s.check as unknown as Record<string, unknown>)?.responses as Array<{ user_id: string; response: string; user?: { display_name?: string; avatar_letter?: string } }> ?? [])
        .filter((r) => r.response === 'down' && !memberIds.has(r.user_id) && !waitlistedIds.has(r.user_id))
        .map((r) => ({
          name: r.user?.display_name ?? 'Unknown',
          avatar: r.user?.avatar_letter ?? r.user?.display_name?.charAt(0)?.toUpperCase() ?? '?',
          userId: r.user_id,
        }));
      const sortedRawMessages = (s.messages ?? [])
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const lastRawMessage = sortedRawMessages.length > 0 ? sortedRawMessages[sortedRawMessages.length - 1] : null;
      const messages = sortedRawMessages.map((msg) => ({
          sender: msg.is_system ? "system" : (msg.sender_id === userId ? "You" : (msg.sender?.display_name ?? "Unknown")),
          text: msg.text,
          time: formatTimeAgo(new Date(msg.created_at)),
          isYou: msg.sender_id === userId,
          ...(msg.message_type === 'date_confirm' ? { messageType: 'date_confirm' as const, messageId: msg.id } : {}),
        }));
      const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
      return {
        id: s.id,
        name: s.name,
        event: s.event ? `${s.event.title} — ${s.event.date_display}` : undefined,
        eventDate: s.event?.date_display ?? undefined,
        eventIsoDate: s.locked_date ?? s.event?.date ?? undefined,
        eventTime: s.check?.event_time ?? undefined,
        dateFlexible: s.check?.date_flexible ?? true,
        timeFlexible: s.check?.time_flexible ?? true,
        maxSquadSize: s.check?.max_squad_size ?? undefined,
        dateStatus: (s.date_status === 'proposed' || s.date_status === 'locked') ? s.date_status : undefined,
        members,
        waitlistedMembers: waitlistedMembers.length > 0 ? waitlistedMembers : undefined,
        downResponders: downResponders.length > 0 ? downResponders : undefined,
        messages,
        lastMsg: lastMessage ? (lastMessage.sender === "system" ? lastMessage.text : `${lastMessage.sender}: ${lastMessage.text}`) : "",
        time: lastMessage ? lastMessage.time : formatTimeAgo(new Date(s.created_at)),
        checkId: s.check_id ?? undefined,
        checkAuthorId: s.check?.author_id ?? undefined,
        meetingSpot: s.meeting_spot ?? undefined,
        arrivalTime: s.arrival_time ?? undefined,
        transportNotes: s.transport_notes ?? undefined,
        expiresAt: s.expires_at ?? undefined,
        graceStartedAt: s.grace_started_at ?? undefined,
        isWaitlisted,
        lastActivityAt: lastRawMessage?.created_at ?? s.created_at,
      };
    });
    transformedSquads.sort((a, b) =>
      new Date(b.lastActivityAt!).getTime() - new Date(a.lastActivityAt!).getTime()
    );
    // Preserve hasUnread flags from previous state
    setSquads((prev) => {
      const unreadMap = new Map(prev.filter((s) => s.hasUnread).map((s) => [s.id, true]));
      if (unreadMap.size === 0) return transformedSquads;
      return transformedSquads.map((s) => unreadMap.has(s.id) ? { ...s, hasUnread: true } : s);
    });

    // Link checks to their squads (distinguish member vs waitlisted)
    const checkToSquad = new Map<string, { squadId: string; inSquad: boolean; isWaitlisted: boolean; eventIsoDate?: string; dateStatus?: string }>();
    for (const sq of transformedSquads) {
      if (sq.checkId) {
        checkToSquad.set(sq.checkId, { squadId: sq.id, inSquad: !sq.isWaitlisted, isWaitlisted: !!sq.isWaitlisted, eventIsoDate: sq.eventIsoDate, dateStatus: sq.dateStatus });
      }
    }
    setChecks((prev) => prev.map((c) => {
      const sq = checkToSquad.get(c.id);
      if (sq) {
        // Backfill check date from squad locked_date if check has no date
        const datePatch: Partial<InterestCheck> = {};
        if (!c.eventDate && sq.eventIsoDate) {
          const isProposed = sq.dateStatus === 'proposed';
          datePatch.eventDate = sq.eventIsoDate;
          datePatch.eventDateLabel = new Date(sq.eventIsoDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
          datePatch.dateFlexible = isProposed;
        }
        return { ...c, squadId: sq.squadId, inSquad: sq.inSquad, isWaitlisted: sq.isWaitlisted, ...datePatch };
      }
      // Clear stale inSquad/isWaitlisted for checks no longer in user's squads
      if (c.inSquad || c.isWaitlisted) return { ...c, inSquad: undefined, isWaitlisted: undefined };
      return c;
    }));
  }, [userId, setChecks]);

  const startSquadFromCheck = async (check: InterestCheck) => {
    if (creatingSquad) return;
    setCreatingSquad(true);
    const maxSize = check.maxSquadSize ?? 5;
    const allDown = check.responses.filter((r) => r.status === "down" && r.name !== "You");
    const squadName = check.text.slice(0, 30) + (check.text.length > 30 ? "..." : "");
    const opener = pickOpener(check.text);

    // Collect unique member IDs: author + creator (current user) + down responders, capped at maxSize
    const memberSet = new Set<string>();
    if (check.authorId) memberSet.add(check.authorId);
    if (userId) memberSet.add(userId);
    for (const p of allDown) {
      if (memberSet.size >= maxSize) break;
      if (p.odbc) memberSet.add(p.odbc);
    }
    const downPeople = allDown.filter((p) => p.odbc && memberSet.has(p.odbc));

    let squadDbId: string | undefined;
    if (!isDemoMode && check.id) {
      try {
        const memberIds = Array.from(memberSet);
        const dbSquad = await db.createSquad(squadName, memberIds, undefined, check.id);
        await db.sendMessage(dbSquad.id, opener);
        squadDbId = dbSquad.id;
      } catch (err: unknown) {
        logError("createSquadFromCheck", err, { checkId: check.id });
        showToast(`Failed to create squad: ${err instanceof Error ? err.message : "Unknown error"}`);
        setCreatingSquad(false);
        return;
      }
    }

    const newSquad: Squad = {
      id: squadDbId ?? `local-squad-${Date.now()}`,
      name: squadName,
      event: `${check.author}'s idea \u00b7 ${check.expiresIn} left`,
      members: [
        { name: "You", avatar: profile?.avatar_letter ?? "?" },
        ...downPeople.map((p) => ({ name: p.name, avatar: p.avatar })),
        ...(!check.isYours ? [{ name: check.author, avatar: check.author.charAt(0).toUpperCase() }] : []),
      ],
      messages: [
        { sender: "system", text: pickFormedMessage(check.text), time: "now" },
        { sender: "system", text: pickContextCheck(check.author), time: "now" },
        { sender: "You", text: opener, time: "now", isYou: true },
      ],
      lastMsg: `You: ${opener}`,
      time: "now",
    };
    setSquads((prev) => [newSquad, ...prev]);
    setChecks((prev) => prev.map((c) => c.id === check.id ? { ...c, squadId: newSquad.id } : c));

    setSquadNotification({
      squadName: check.text,
      startedBy: "You",
      ideaBy: check.author,
      members: downPeople.map((p) => p.name),
      squadId: newSquad.id,
    });
    setTimeout(() => setSquadNotification(null), 4000);

    setCreatingSquad(false);
    onSquadCreated?.();
  };

  const startSquadFromEvent = async (event: Event, selectedUserIds: string[]) => {
    if (creatingSquad) return;
    setCreatingSquad(true);
    const squadName = event.title.slice(0, 30) + (event.title.length > 30 ? "..." : "");
    const opener = pickOpener(event.title);

    let squadDbId: string | undefined;
    if (!isDemoMode && event.id) {
      try {
        const dbSquad = await db.createSquad(squadName, selectedUserIds, event.id);
        await db.sendMessage(dbSquad.id, opener);
        squadDbId = dbSquad.id;
      } catch (err: unknown) {
        logError("createSquadFromEvent", err, { eventId: event.id });
        showToast(`Failed to create squad: ${err instanceof Error ? err.message : "Unknown error"}`);
        setCreatingSquad(false);
        return;
      }
    }

    const allCandidates = [...event.peopleDown, ...squadPoolMembers];
    const selectedPeople = allCandidates.filter((p) => p.userId && selectedUserIds.includes(p.userId));

    const poolSelectedIds = squadPoolMembers
      .filter((p) => p.userId && selectedUserIds.includes(p.userId))
      .map((p) => p.userId!);
    if (poolSelectedIds.length > 0 && event.id) {
      const allToRemove = inSquadPool ? [userId!, ...poolSelectedIds] : poolSelectedIds;
      db.removeFromCrewPool(event.id, allToRemove).catch((err) => logWarn("removeFromCrewPool", "Failed", { error: err }));
      setSquadPoolMembers((prev) => prev.filter((p) => !poolSelectedIds.includes(p.userId!)));
      if (inSquadPool) setInSquadPool(false);
    }

    const newSquad: Squad = {
      id: squadDbId ?? `local-squad-${Date.now()}`,
      name: squadName,
      event: `${event.title} \u2014 ${event.date}`,
      eventDate: event.date,
      members: [
        { name: "You", avatar: profile?.avatar_letter ?? "?" },
        ...selectedPeople.map((p) => ({ name: p.name, avatar: p.avatar })),
      ],
      messages: [
        { sender: "system", text: pickFormedMessage(event.title), time: "now" },
        { sender: "system", text: `\u{1F4CD} ${event.venue} \u00b7 ${event.date} ${event.time}`, time: "now" },
        { sender: "You", text: opener, time: "now", isYou: true },
      ],
      lastMsg: `You: ${opener}`,
      time: "now",
    };
    setSquads((prev) => [newSquad, ...prev]);

    setSquadNotification({
      squadName: event.title,
      startedBy: "You",
      ideaBy: "event",
      members: selectedPeople.map((p) => p.name),
      squadId: newSquad.id,
    });
    setTimeout(() => setSquadNotification(null), 4000);

    setSocialEvent(null);
    setCreatingSquad(false);
    onSquadCreated?.();
  };

  const handleJoinSquadPool = async (event: Event) => {
    if (!event.id || isDemoMode) return;

    try {
      if (inSquadPool) {
        await db.leaveCrewPool(event.id);
        setInSquadPool(false);
        setSquadPoolMembers((prev) => prev.filter((p) => p.userId !== userId));
        setSocialEvent((prev) => prev ? {
          ...prev,
          poolCount: Math.max(0, (prev.poolCount ?? 1) - 1),
          userInPool: false,
        } : prev);
        showToast("Left squad pool");
        return;
      }

      // Auto-mark as down if not already
      if (!event.isDown && onAutoDown) {
        await onAutoDown(event.id);
        setSocialEvent({ ...event, isDown: true });
      }

      await db.joinCrewPool(event.id);
      setInSquadPool(true);
      setSocialEvent((prev) => prev ? {
        ...prev,
        poolCount: (prev.poolCount ?? 0) + 1,
        userInPool: true,
      } : prev);
      showToast("You're looking for a squad!");

      const pool = await db.getCrewPool(event.id);
      const poolPeople: Person[] = pool
        .filter((entry) => entry.user_id !== userId)
        .map((entry) => ({
          name: entry.user?.display_name ?? "Unknown",
          avatar: entry.user?.avatar_letter ?? "?",
          mutual: false,
          userId: entry.user_id,
        }));
      setSquadPoolMembers(poolPeople);
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? err.code : '';
      if (code === '23505') {
        showToast("Already looking for a squad");
        return;
      }
      logError("joinSquadPool", err, { eventId: event.id });
      showToast("Something went wrong");
    }
  };

  // Load squad pool members when EventLobby opens and enrich peopleDown with inPool flags
  useEffect(() => {
    if (!socialEvent?.id || isDemoMode) {
      setSquadPoolMembers([]);
      setInSquadPool(false);
      return;
    }
    (async () => {
      try {
        const pool = await db.getCrewPool(socialEvent.id);
        const userIsInPool = pool.some((entry) => entry.user_id === userId);
        setInSquadPool(userIsInPool);
        const poolUserIds = new Set(pool.map((entry) => entry.user_id));
        const poolPeople: Person[] = pool
          .filter((entry) => entry.user_id !== userId)
          .map((entry) => ({
            name: entry.user?.display_name ?? "Unknown",
            avatar: entry.user?.avatar_letter ?? "?",
            mutual: false,
            userId: entry.user_id,
          }));
        setSquadPoolMembers(poolPeople);

        // Enrich socialEvent.peopleDown with fresh inPool flags
        const poolCount = pool.length;
        setSocialEvent((prev) => prev ? {
          ...prev,
          poolCount,
          userInPool: userIsInPool,
          peopleDown: prev.peopleDown.map((p) => ({
            ...p,
            inPool: p.userId ? poolUserIds.has(p.userId) : false,
          })),
        } : prev);
      } catch (err) {
        logWarn("loadSquadPool", "Failed to load squad pool", { eventId: socialEvent?.id });
      }
    })();
  }, [socialEvent?.id, isDemoMode, userId]);

  return {
    squads,
    setSquads,
    socialEvent,
    setSocialEvent,
    squadPoolMembers,
    inSquadPool,
    squadNotification,
    setSquadNotification,
    creatingSquad,
    autoSelectSquadId,
    setAutoSelectSquadId,
    hydrateSquads,
    startSquadFromCheck,
    startSquadFromEvent,
    handleJoinSquadPool,
  };
}
