"use client";

import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import * as db from "@/lib/db";
import cn from "@/lib/tailwindMerge";
import type { Squad } from "@/lib/ui-types";
import { logError } from "@/lib/logger";
import { parseNaturalDate, parseNaturalTime, parseDateToISO, formatTimeAgo } from "@/lib/utils";
import ChatHeader from "./ChatHeader";
import MessageComposer from "./MessageComposer";
import ChatMessage from "./ChatMessage";
import SquadSettingsModal from "./SquadSettingsModal";

type WhenSlot = { date: string; startMin: number | null; endMin: number | null; label: string | null };
type PollEntry = {
  id: string; messageId: string; question: string;
  options: string[] | Array<{ date: string; time: string | null }> | WhenSlot[];
  status: string; createdBy: string;
  multiSelect: boolean;
  // 'dates' and 'availability' are legacy; new polls use 'when' with collectionStyle.
  pollType?: 'text' | 'dates' | 'availability' | 'when';
  collectionStyle?: 'preference' | 'availability';
  // Legacy 'availability' poll type stores grid params on the row directly.
  gridDates?: string[];
  gridHourStart?: number;
  gridHourEnd?: number;
  gridSlotMinutes?: 30 | 60;
};
type PollVote = { userId: string; optionIndex: number; displayName: string };
type PollAvailability = { userId: string; dayOffset: number; slotIndex: number; displayName: string };

function pollRowToEntry(p: { id: string; message_id: string; question: string; options: unknown; status: string; created_by: string; multi_select?: boolean | null }): PollEntry {
  const raw = p as Record<string, unknown>;
  const pollType = (raw.poll_type as PollEntry['pollType']) ?? 'text';
  return {
    id: p.id,
    messageId: p.message_id,
    question: p.question,
    options: p.options as PollEntry['options'],
    status: p.status,
    createdBy: p.created_by,
    multiSelect: p.multi_select ?? true,
    pollType,
    ...(pollType === 'when' ? {
      collectionStyle: raw.collection_style as 'preference' | 'availability' | undefined,
    } : {}),
    ...(pollType === 'availability' ? {
      gridDates: raw.grid_dates as string[],
      gridHourStart: raw.grid_hour_start as number,
      gridHourEnd: raw.grid_hour_end as number,
      gridSlotMinutes: raw.grid_slot_minutes as 30 | 60,
    } : {}),
  };
}

// A poll uses the squad_poll_availability cell table only when it's the legacy
// 'availability' poll_type. Everything else (text/dates/when) uses squad_poll_votes.
function pollUsesCellTable(p: { pollType?: PollEntry['pollType'] }): boolean {
  return p.pollType === 'availability';
}


interface SquadChatProps {
  squad: Squad;
  userId: string | null;
  onClose: () => void;
  onSquadUpdate: (updater: Squad[] | ((prev: Squad[]) => Squad[])) => void;
  onChatOpen?: (open: boolean) => void;
  onViewProfile?: (userId: string) => void;
  onSendMessage?: (squadDbId: string, text: string, mentions?: string[], image?: { blob: Blob; width: number; height: number }) => Promise<{ id: string; image_path?: string | null } | void>;
  onLeaveSquad?: (squadDbId: string) => Promise<void>;
  onSetSquadDate?: (squadDbId: string, date: string, time?: string | null, locked?: boolean) => Promise<void>;
  onClearSquadDate?: (squadDbId: string) => Promise<void>;
  onConfirmDate?: (squadDbId: string, response: 'yes' | 'no') => Promise<void>;
  onUpdateSquadSize?: (checkId: string, newSize: number) => Promise<void>;
  onAddMember?: (squadId: string, userId: string) => Promise<void>;
  onSetMemberRole?: (squadId: string, userId: string, role: 'member' | 'waitlist') => Promise<void>;
  onKickMember?: (squadId: string, userId: string) => Promise<void>;
  onCreatePoll?: (
    squadId: string,
    question: string,
    options: string[] | Array<{ date: string; time: string | null }>,
    multiSelect: boolean,
    pollType?: 'text' | 'dates',
  ) => Promise<void>;
  pendingJoinRequests?: { squadId: string; userId: string; name: string; avatar: string }[];
  onRespondToJoinRequest?: (squadId: string, userId: string, accept: boolean) => Promise<void>;
}

const SquadChat = ({
  squad,
  userId,
  onClose,
  onSquadUpdate,
  onChatOpen,
  onViewProfile,
  onSendMessage,
  onLeaveSquad,
  onSetSquadDate,
  onClearSquadDate,
  onConfirmDate,
  onUpdateSquadSize,
  onAddMember,
  onSetMemberRole,
  onKickMember,
  onCreatePoll,
  pendingJoinRequests,
  onRespondToJoinRequest,
}: SquadChatProps) => {
  const onSquadUpdateRef = useRef(onSquadUpdate);
  onSquadUpdateRef.current = onSquadUpdate;

  // Local messages state (decoupled from squad prop for realtime updates)
  const [messages, setMessages] = useState(squad.messages);
  // path -> signed URL for chat image attachments
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  // Local squad state for non-message fields (members, sizes, dates, etc.)
  const [localSquad, setLocalSquad] = useState(squad);

  // Sync non-message fields when parent squad prop updates (e.g. after loadRealData)
  useEffect(() => {
    setLocalSquad((prev) => ({
      ...prev,
      dateStatus: squad.dateStatus,
      eventIsoDate: squad.eventIsoDate,
      eventTime: squad.eventTime,
      members: squad.members,
      waitlistedMembers: squad.waitlistedMembers,
      downResponders: squad.downResponders,
      maxSquadSize: squad.maxSquadSize,
      expiresAt: squad.expiresAt,
      meetingSpot: squad.meetingSpot,
    }));
  }, [squad.dateStatus, squad.eventIsoDate, squad.eventTime, squad.members, squad.waitlistedMembers, squad.downResponders, squad.maxSquadSize, squad.expiresAt, squad.meetingSpot]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [entering, setEntering] = useState(true);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  // showImOutConfirm removed — "can't make it" is now a soft inline action
  const [kickTarget, setKickTarget] = useState<{ name: string; userId: string } | null>(null);
  const [showSquadPopup, setShowSquadPopup] = useState(false);
  const [showEditEvent, setShowEditEvent] = useState(false);
  const [editEventTitle, setEditEventTitle] = useState("");
  const [editWhenInput, setEditWhenInput] = useState("");
  const [editWhereInput, setEditWhereInput] = useState("");
  const [savingEvent, setSavingEvent] = useState(false);
  const [dateConfirmStatus, setDateConfirmStatus] = useState<'yes' | 'no' | 'pending' | 'none' | 'loading'>('loading');
  const [dateConfirms, setDateConfirms] = useState<Map<string, 'yes' | 'no' | null>>(new Map());
  const [confirmLoading, setConfirmLoading] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  // Poll state — multiple polls can be active at once, so we index by message_id
  // (each poll row maps to exactly one chat message).
  const [pollsByMessageId, setPollsByMessageId] = useState<Map<string, PollEntry>>(new Map());
  const [pollVotesByPollId, setPollVotesByPollId] = useState<Map<string, PollVote[]>>(new Map());
  const [pollAvailabilityByPollId, setPollAvailabilityByPollId] = useState<Map<string, PollAvailability[]>>(new Map());
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [pollVariant, setPollVariant] = useState<'text' | 'dates' | 'grid'>('text');
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollMultiSelect, setPollMultiSelect] = useState(true);
  const [pollCreating, setPollCreating] = useState(false);
  const [pollDateInput, setPollDateInput] = useState("");
  const [pollDateOptions, setPollDateOptions] = useState<Array<{ date: string; time: string | null }>>([]);
  // Grid creator state — defaults to next 7 days, 6pm–11pm, 1h slots
  const [gridRangePreset, setGridRangePreset] = useState<'weekend' | 'next-7' | 'next-14' | 'custom'>('next-7');
  const [gridCustomMode, setGridCustomMode] = useState<'range' | 'specific'>('range');
  const [gridCustomStart, setGridCustomStart] = useState<string>('');
  const [gridCustomEnd, setGridCustomEnd] = useState<string>('');
  const [gridSpecificInput, setGridSpecificInput] = useState<string>('');
  const [gridSpecificDates, setGridSpecificDates] = useState<string[]>([]);
  const [gridWindow, setGridWindow] = useState<'evenings' | 'afternoons' | 'all-day'>('evenings');
  const [gridSlotMinutes, setGridSlotMinutes] = useState<30 | 60>(60);
  const pollMessageRef = useRef<HTMLDivElement>(null);

  // Notify parent + service worker when chat opens/closes
  useEffect(() => {
    onChatOpen?.(true);
    // Tell service worker to suppress push notifications for this squad
    navigator.serviceWorker?.controller?.postMessage({ type: "SQUAD_OPEN", squadId: squad.id });
    let touchStartY = 0;
    const recordTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
    };
    const blockTouch = (e: TouchEvent) => {
      const target = e.target as Node;
      // Find the nearest scrollable ancestor inside the chat
      let el = target instanceof Element ? target : target.parentElement;
      while (el && el !== chatContainerRef.current) {
        const style = window.getComputedStyle(el);
        const isScrollable = (style.overflowY === "auto" || style.overflowY === "scroll") && el.scrollHeight > el.clientHeight;
        if (isScrollable) {
          // Block if at scroll boundary to prevent the whole container from moving
          const atTop = el.scrollTop <= 0;
          const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
          const deltaY = e.touches[0].clientY - touchStartY;
          if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
            e.preventDefault();
          }
          return;
        }
        el = el.parentElement;
      }
      // No scrollable ancestor found — block to prevent underlying page scroll
      e.preventDefault();
    };
    document.addEventListener("touchstart", recordTouchStart, { passive: true });
    document.addEventListener("touchmove", blockTouch, { passive: false });
    return () => {
      onChatOpen?.(false);
      navigator.serviceWorker?.controller?.postMessage({ type: "SQUAD_CLOSED" });
      document.removeEventListener("touchstart", recordTouchStart);
      document.removeEventListener("touchmove", blockTouch);
    };
  }, [onChatOpen, squad.id]);

  // Prevent pinch-to-zoom in PWA
  useEffect(() => {
    const prevent = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    document.addEventListener("touchstart", prevent, { passive: false });
    return () => document.removeEventListener("touchstart", prevent);
  }, []);

  // Slide in from right on mount
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setEntering(false));
    });
  }, []);

  // ─── iOS keyboard handling ─────────────────────────────────────────────
  // Container is position:fixed so it stays pinned to the screen.
  // We listen to focus/blur on the message input (not visualViewport.resize)
  // to avoid feedback loops. After the keyboard animation settles we shrink
  // the container to the visual viewport height so the input sits above it.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let timeoutId: ReturnType<typeof setTimeout>;
    let inputFocused = false;

    const apply = () => {
      if (!chatContainerRef.current) return;
      if (inputFocused) {
        chatContainerRef.current.style.transition = "none";
        chatContainerRef.current.style.height = `${vv.height}px`;
        // Pin body to prevent older iOS from scrolling behind the fixed container
        document.body.style.position = "fixed";
        document.body.style.width = "100%";
        document.body.style.top = "0";
        document.body.style.overflow = "hidden";
        window.scrollTo(0, 0);
        { const p = messagesEndRef.current?.parentElement; if (p) p.scrollTop = p.scrollHeight; }
      } else {
        document.body.style.position = "";
        document.body.style.width = "";
        document.body.style.top = "";
        document.body.style.overflow = "";
        chatContainerRef.current.style.transition = "height 0.15s ease-out";
        chatContainerRef.current.style.height = "100dvh";
      }
    };

    const onFocusIn = (e: FocusEvent) => {
      if (!(e.target instanceof HTMLTextAreaElement)) return;
      inputFocused = true;
      clearTimeout(timeoutId);
      // Wait for iOS keyboard animation to finish (~300ms)
      timeoutId = setTimeout(apply, 350);
    };

    const onFocusOut = (e: FocusEvent) => {
      if (!(e.target instanceof HTMLTextAreaElement)) return;
      inputFocused = false;
      clearTimeout(timeoutId);
      timeoutId = setTimeout(apply, 100);
    };

    // Handle predictive text bar or keyboard height changes while focused
    const onResize = () => {
      if (!inputFocused) return;
      clearTimeout(timeoutId);
      timeoutId = setTimeout(apply, 150);
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    vv.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      vv.removeEventListener("resize", onResize);
      clearTimeout(timeoutId);
      // Restore body scroll in case unmounted while input focused
      document.body.style.position = "";
      document.body.style.width = "";
      document.body.style.top = "";
      document.body.style.overflow = "";
    };
  }, []);

  // Scroll to bottom before paint when chat opens, messages change, or confirm bar appears
  useLayoutEffect(() => {
    const p = messagesEndRef.current?.parentElement;
    if (p) p.scrollTop = p.scrollHeight;
  }, [squad.id, messages.length, dateConfirmStatus]);

  // Load date confirm status when entering a squad with a proposed date
  useEffect(() => {
    if (!localSquad.id || localSquad.dateStatus !== 'proposed' || !userId) {
      setDateConfirmStatus('none');
      setDateConfirms(new Map());
      return;
    }
    db.getDateConfirms(localSquad.id).then((confirms) => {
      const map = new Map<string, 'yes' | 'no' | null>();
      for (const c of confirms) map.set(c.userId, c.response);
      setDateConfirms(map);
      const mine = confirms.find((c) => c.userId === userId);
      if (!mine) { setDateConfirmStatus('none'); return; }
      setDateConfirmStatus(mine.response ?? 'pending');
    }).catch(() => { setDateConfirmStatus('none'); });
  }, [localSquad.id, localSquad.dateStatus, userId]);

  // Load active poll when entering a squad
  useEffect(() => {
    if (!localSquad.id) {
      setPollsByMessageId(new Map());
      setPollVotesByPollId(new Map());
      setPollAvailabilityByPollId(new Map());
      return;
    }
    let stale = false;
    db.getSquadPolls(localSquad.id).then(async (polls) => {
      if (stale) return;
      const entries = polls.map(pollRowToEntry);
      setPollsByMessageId(new Map(entries.map((e) => [e.messageId, e])));
      // Fetch per-poll data in parallel — option votes for everything except legacy
      // availability polls (which use squad_poll_availability cells).
      const voteResults = await Promise.all(
        entries
          .filter((e) => !pollUsesCellTable(e))
          .map((e) => db.getPollVotes(e.id).then((v) => [e.id, v] as const).catch(() => [e.id, [] as PollVote[]] as const))
      );
      const availResults = await Promise.all(
        entries
          .filter(pollUsesCellTable)
          .map((e) => db.getPollAvailability(e.id).then((a) => [e.id, a] as const).catch(() => [e.id, [] as PollAvailability[]] as const))
      );
      if (stale) return;
      setPollVotesByPollId(new Map(voteResults));
      setPollAvailabilityByPollId(new Map(availResults));
    }).catch(() => {});
    return () => { stale = true; };
  }, [localSquad.id]);

  // Realtime subscriptions — one channel per active poll, by type.
  const activeOptionPollIds = Array.from(pollsByMessageId.values())
    .filter((p) => p.status === 'active' && !pollUsesCellTable(p))
    .map((p) => p.id)
    .sort()
    .join(',');
  const activeGridPollIds = Array.from(pollsByMessageId.values())
    .filter((p) => p.status === 'active' && pollUsesCellTable(p))
    .map((p) => p.id)
    .sort()
    .join(',');
  useEffect(() => {
    if (!activeOptionPollIds) return;
    const ids = activeOptionPollIds.split(',').filter(Boolean);
    const channels = ids.map((pollId) =>
      db.subscribeToPollVotes(pollId, () => {
        db.getPollVotes(pollId).then((votes) => {
          setPollVotesByPollId((prev) => {
            const next = new Map(prev);
            next.set(pollId, votes);
            return next;
          });
        }).catch(() => {});
      })
    );
    return () => { channels.forEach((c) => c.unsubscribe()); };
  }, [activeOptionPollIds]);
  useEffect(() => {
    if (!activeGridPollIds) return;
    const ids = activeGridPollIds.split(',').filter(Boolean);
    const channels = ids.map((pollId) =>
      db.subscribeToPollAvailability(pollId, () => {
        db.getPollAvailability(pollId).then((cells) => {
          setPollAvailabilityByPollId((prev) => {
            const next = new Map(prev);
            next.set(pollId, cells);
            return next;
          });
        }).catch(() => {});
      })
    );
    return () => { channels.forEach((c) => c.unsubscribe()); };
  }, [activeGridPollIds]);

  // Fetch fresh messages when chat opens (covers gap before realtime subscribes)
  useEffect(() => {
    if (!localSquad.id) return;
    let stale = false;
    db.getSquadMessages(localSquad.id).then((raw) => {
      if (stale) return;
      const msgs = raw.map((msg) => ({
        id: msg.id,
        sender: msg.is_system || !msg.sender_id ? "system" : (msg.sender_id === userId ? "You" : (msg.sender?.display_name ?? "Unknown")),
        text: msg.text ?? "",
        time: formatTimeAgo(new Date(msg.created_at)),
        isYou: msg.sender_id === userId,
        ...(msg.message_type === 'date_confirm' ? { messageType: 'date_confirm' as const, messageId: msg.id } : {}),
        ...(msg.message_type === 'poll' ? { messageType: 'poll' as const, messageId: msg.id } : {}),
        ...(msg.image_path ? {
          imagePath: msg.image_path,
          imageWidth: msg.image_width ?? undefined,
          imageHeight: msg.image_height ?? undefined,
        } : {}),
      }));
      const last = msgs.length > 0 ? msgs[msgs.length - 1] : null;
      // Merge: keep any realtime messages that arrived before this fetch completed
      setMessages((prev) => {
        const fetchedIds = new Set(msgs.map((m) => m.id));
        const realtimeOnly = prev.filter((m) => m.id && !fetchedIds.has(m.id));
        const merged = [...msgs, ...realtimeOnly];
        return merged;
      });
      const previewForLast = (m: typeof msgs[number]) => {
        const body = m.text && m.text.length > 0 ? m.text : (m.imagePath ? "📷" : "");
        return m.sender === "system" ? body : `${m.sender}: ${body}`;
      };
      onSquadUpdateRef.current((prev) =>
        prev.map((s) =>
          s.id === localSquad.id
            ? { ...s, messages: msgs, lastMsg: last ? previewForLast(last) : s.lastMsg }
            : s
        )
      );
    }).catch(() => {});
    return () => { stale = true; };
  }, [localSquad.id, userId]);

  // Batch-fetch signed URLs for any new image paths. Signed URLs expire after
  // 1h; if a chat stays open longer than that, the page will reload or
  // re-enter, which re-runs this effect against the fresh message list.
  useEffect(() => {
    const needed = messages
      .map((m) => m.imagePath)
      .filter((p): p is string => !!p && !imageUrls.has(p));
    if (needed.length === 0) return;
    const unique = Array.from(new Set(needed));
    let stale = false;
    db.getChatImageSignedUrls(unique).then((urls) => {
      if (stale || urls.size === 0) return;
      setImageUrls((prev) => {
        const next = new Map(prev);
        for (const [k, v] of urls) next.set(k, v);
        return next;
      });
    }).catch((err) => logError("getChatImageSignedUrls", err));
    return () => { stale = true; };
  }, [messages, imageUrls]);

  // Subscribe to realtime messages for the squad
  useEffect(() => {
    if (!localSquad.id) return;
    const channel = db.subscribeToMessages(localSquad.id, (newMessage) => {
      // Skip messages from current user (already added optimistically)
      if (userId && newMessage.sender_id === userId) return;
      const isSystem = newMessage.is_system || newMessage.sender_id === null;
      const senderName = isSystem ? "system" : (newMessage.sender?.display_name ?? "Unknown");
      const msg = {
        id: newMessage.id,
        sender: senderName,
        text: newMessage.text ?? "",
        time: "now",
        isYou: false,
        ...(newMessage.message_type === 'date_confirm' ? { messageType: 'date_confirm' as const, messageId: newMessage.id } : {}),
        ...(newMessage.message_type === 'poll' ? { messageType: 'poll' as const, messageId: newMessage.id } : {}),
        ...(newMessage.image_path ? {
          imagePath: newMessage.image_path,
          imageWidth: newMessage.image_width ?? undefined,
          imageHeight: newMessage.image_height ?? undefined,
        } : {}),
      };
      // Refresh poll data when a poll message arrives — a new poll may have
      // just been created, or one may have transitioned to closed.
      if (newMessage.message_type === 'poll' && localSquad.id) {
        db.getSquadPolls(localSquad.id).then(async (polls) => {
          const entries = polls.map(pollRowToEntry);
          setPollsByMessageId(new Map(entries.map((e) => [e.messageId, e])));
          const voteResults = await Promise.all(
            entries
              .filter((e) => !pollUsesCellTable(e))
              .map((e) => db.getPollVotes(e.id).then((v) => [e.id, v] as const).catch(() => [e.id, [] as PollVote[]] as const))
          );
          const availResults = await Promise.all(
            entries
              .filter(pollUsesCellTable)
              .map((e) => db.getPollAvailability(e.id).then((a) => [e.id, a] as const).catch(() => [e.id, [] as PollAvailability[]] as const))
          );
          setPollVotesByPollId(new Map(voteResults));
          setPollAvailabilityByPollId(new Map(availResults));
        }).catch(() => {});
      }
      const bodyPreview = newMessage.text && newMessage.text.length > 0
        ? newMessage.text
        : (newMessage.image_path ? "📷" : "");
      const lastMsgPreview = isSystem ? bodyPreview : `${senderName}: ${bodyPreview}`;
      setMessages((prev) => {
        if (prev.some((m) => m.id && m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      // Also update the squad list
      onSquadUpdateRef.current((prev) =>
        prev.map((s) =>
          s.id === newMessage.squad_id
            ? { ...s, messages: [...s.messages, msg], lastMsg: lastMsgPreview, time: "now" }
            : s
        )
      );
    });
    return () => {
      channel.unsubscribe();
    };
  }, [localSquad.id, userId]);

  const handleSend = async (
    text: string,
    mentionIds: string[],
    image?: { blob: Blob; width: number; height: number },
  ) => {
    const previewUrl = image ? URL.createObjectURL(image.blob) : undefined;
    // Client-generated id so we can find this exact message later to swap in
    // server data (real id + image_path) or remove on failure.
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newMsgObj = {
      id: tempId,
      sender: "You",
      text,
      time: "now",
      isYou: true,
      ...(image ? {
        imageWidth: image.width,
        imageHeight: image.height,
        imagePreviewUrl: previewUrl,
      } : {}),
    };
    const lastMsgPreview = image && !text ? "You: 📷" : `You: ${text}`;
    const now = new Date().toISOString();

    setMessages((prev) => [...prev, newMsgObj]);
    onSquadUpdate((prev) => {
      const updated = prev.map((s) => {
        if (s.id !== localSquad.id) return s;
        return { ...s, messages: [...s.messages, newMsgObj], lastMsg: lastMsgPreview, time: "now", lastActivityAt: now };
      });
      updated.sort((a, b) =>
        new Date(b.lastActivityAt!).getTime() - new Date(a.lastActivityAt!).getTime()
      );
      return updated;
    });

    if (localSquad.id && onSendMessage) {
      try {
        const saved = await onSendMessage(
          localSquad.id,
          text,
          mentionIds.length > 0 ? mentionIds : undefined,
          image,
        );
        if (saved) {
          // Swap the optimistic entry for server truth (real id + image_path).
          // Keep imagePreviewUrl so the image stays visible until a signed URL
          // resolves (effect in useEffect below picks up the new imagePath).
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempId
                ? { ...m, id: saved.id, imagePath: saved.image_path ?? undefined }
                : m
            )
          );
          onSquadUpdate((prev) =>
            prev.map((s) =>
              s.id !== localSquad.id
                ? s
                : {
                    ...s,
                    messages: s.messages.map((m) =>
                      m.id === tempId
                        ? { ...m, id: saved.id, imagePath: saved.image_path ?? undefined }
                        : m
                    ),
                  }
            )
          );
        }
      } catch (err) {
        logError("sendMessage", err, { squadId: localSquad.id });
        // Roll back the optimistic message and free the blob URL.
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        onSquadUpdate((prev) =>
          prev.map((s) =>
            s.id !== localSquad.id
              ? s
              : { ...s, messages: s.messages.filter((m) => m.id !== tempId) }
          )
        );
      }
    }
  };

  // Drawer swipe-to-close
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const [dragX, setDragX] = useState(0);
  const [closing, setClosing] = useState(false);
  const isDragging = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isDragging.current = false;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.touches[0].clientY - touchStartY.current);
    // Only activate swipe-to-dismiss when horizontal movement clearly dominates vertical
    if (!isDragging.current && dx > 20 && dx > dy * 2.5) {
      isDragging.current = true;
    }
    if (isDragging.current && dx > 0) {
      setDragX(dx);
    }
  };
  const handleTouchEnd = () => {
    if (dragX > 120) {
      setClosing(true);
      setTimeout(() => {
        onClose();
        setClosing(false);
        setDragX(0);
      }, 250);
    } else {
      setDragX(0);
    }
    isDragging.current = false;
  };

  // Backdrop opacity: fully opaque when open, fades as user swipes to dismiss
  const backdropOpacity = closing ? 0 : entering ? 0 : dragX > 0 ? Math.max(0, 1 - dragX / 300) : 1;

  return (
    <>
    {/* Dark overlay that covers underlying content during swipe-to-dismiss */}
    <div
      className="fixed inset-0 z-[48]"
      style={{
        backgroundColor: `rgba(0,0,0,${0.7 * backdropOpacity})`,
        backdropFilter: `blur(${8 * backdropOpacity}px)`,
        WebkitBackdropFilter: `blur(${8 * backdropOpacity}px)`,
        opacity: (entering && backdropOpacity === 0) ? 0 : 1,
        transition: closing ? "opacity 0.25s ease-in" : entering ? "opacity 0.3s ease-out" : "none",
        pointerEvents: backdropOpacity === 0 ? "none" : "auto",
      }}
    />
    {/* Full-screen backdrop so iOS keyboard gap shows bg color, not content behind */}
    <div
      className="fixed inset-0 bg-bg z-[49]"
      style={{
        transform: (closing || entering) ? "translateX(100%)" : `translateX(${dragX}px)`,
        transition: closing ? "transform 0.25s ease-in" : (entering || dragX === 0) ? "transform 0.3s ease-out" : "none",
      }}
    />
    <div
      ref={chatContainerRef}
      className="flex flex-col fixed top-0 left-0 right-0 h-dvh z-50 bg-bg overflow-hidden overscroll-none"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        transform: (closing || entering) ? "translateX(100%)" : `translateX(${dragX}px)`,
        transition: closing ? "transform 0.25s ease-in" : (entering || dragX === 0) ? "transform 0.3s ease-out" : "none",
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <ChatHeader
        squad={localSquad}
        dateConfirms={dateConfirms}
        userId={userId}
        hasOpenModal={showSquadPopup || showEditEvent}
        onBack={onClose}
        onOpenSettings={() => setShowSquadPopup(true)}
      />

      {/* Leave squad confirmation */}
      {showLeaveConfirm && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999]"
          onClick={() => setShowLeaveConfirm(false)}
        >
          <div
            className="bg-deep border border-border rounded-2xl px-5 py-6 w-[90%] max-w-[300px] text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-serif text-lg text-primary mb-1.5" style={{ fontWeight: 400 }}>
              Leave {localSquad.name}?
            </p>
            <p className="font-mono text-xs text-dim mb-5">
              You won&apos;t see messages from this squad anymore.
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 py-2.5 bg-transparent border border-border rounded-lg text-primary font-mono text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (localSquad.id && onLeaveSquad) {
                    try {
                      await onLeaveSquad(localSquad.id);
                      onSquadUpdate((prev) => prev.filter((s) => s.id !== localSquad.id));
                      onClose();
                    } catch (err) {
                      logError("leaveSquad", err, { squadId: localSquad.id });
                    }
                  }
                  setShowLeaveConfirm(false);
                }}
                className="flex-1 py-2.5 bg-[#ff4444] border-none rounded-lg text-white font-mono text-xs font-bold cursor-pointer"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* I'm out confirmation removed — "can't make it" is now a soft action */}

      {/* Kick member confirmation */}
      {kickTarget && localSquad && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999]"
          onClick={() => setKickTarget(null)}
        >
          <div
            className="bg-deep border border-border rounded-2xl px-5 py-6 w-[90%] max-w-[300px] text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-serif text-lg text-primary mb-1.5" style={{ fontWeight: 400 }}>
              Kick {kickTarget.name}?
            </p>
            <p className="font-mono text-xs text-dim mb-5">
              they&apos;ll be removed from the squad. no take-backs (jk you can re-add them)
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setKickTarget(null)}
                className="flex-1 py-2.5 bg-transparent border border-border rounded-lg text-primary font-mono text-xs cursor-pointer"
              >
                Nah
              </button>
              <button
                onClick={async () => {
                  if (onKickMember) {
                    const target = kickTarget;
                    setKickTarget(null);
                    try {
                      await onKickMember(localSquad.id, target.userId);
                      const stripKicked = (s: Squad) => ({
                        ...s,
                        members: s.members.filter((x) => x.userId !== target.userId),
                        waitlistedMembers: (s.waitlistedMembers ?? []).filter((x) => x.userId !== target.userId),
                      });
                      setLocalSquad((prev) => stripKicked(prev));
                      onSquadUpdate((prev: Squad[]) => prev.map((s) => s.id === localSquad.id ? stripKicked(s) : s));
                    } catch (err) {
                      logError("kickMember", err, { squadId: localSquad.id });
                    }
                  } else {
                    setKickTarget(null);
                  }
                }}
                className="flex-1 py-2.5 bg-[#ff4444] border-none rounded-lg text-white font-mono text-xs font-bold cursor-pointer"
              >
                Yeet 🥾
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit event modal — matches CreateModal interest check form */}
      {showEditEvent && (() => {
        // For check-backed squads, only the check author can change the title.
        // Event-backed and standalone squads: any member can rename.
        const canEditTitle = !localSquad.checkId || localSquad.checkAuthorId === userId;
        const handleSaveEvent = async () => {
          if (!localSquad?.id) return;
          setSavingEvent(true);
          try {
            // Save title if changed (only allowed for check authors when linked to a check)
            const trimmedTitle = editEventTitle.trim();
            if (canEditTitle && trimmedTitle && trimmedTitle !== localSquad.name) {
              await db.updateSquadName(localSquad.id, trimmedTitle);
              setLocalSquad((prev) => ({ ...prev, name: trimmedTitle }));
              onSquadUpdate((prev) => prev.map((s) => s.id === localSquad.id ? { ...s, name: trimmedTitle } : s));
            }

            // Save location if changed
            const trimmedLocation = editWhereInput.trim() || null;
            if (trimmedLocation !== (localSquad.meetingSpot || null)) {
              await db.updateSquadLogistics(localSquad.id, { meeting_spot: trimmedLocation ?? undefined });
              setLocalSquad((prev) => ({ ...prev, meetingSpot: trimmedLocation ?? undefined }));
              onSquadUpdate((prev) => prev.map((s) => s.id === localSquad.id ? { ...s, meetingSpot: trimmedLocation ?? undefined } : s));
            }

            // Parse when input for date/time
            const whenVal = editWhenInput.trim();
            const parsedDate = whenVal ? parseNaturalDate(whenVal) : null;
            const dateISO = parsedDate?.iso ?? (whenVal ? parseDateToISO(whenVal) : null) ?? null;
            const parsedTime = whenVal ? parseNaturalTime(whenVal) : null;
            if (dateISO && onSetSquadDate) {
              await onSetSquadDate(localSquad.id, dateISO, parsedTime, false);
              setLocalSquad((prev) => ({
                ...prev,
                eventIsoDate: dateISO,
                eventTime: parsedTime ?? prev.eventTime,
                dateStatus: 'proposed',
                graceStartedAt: undefined,
              }));
            }

            setShowEditEvent(false);
          } catch {
            // Error handled by parent
          } finally {
            setSavingEvent(false);
          }
        };

        return (
          <div className="fixed inset-0 z-[9999] flex items-end justify-center">
            <div
              onClick={() => setShowEditEvent(false)}
              className="absolute inset-0 bg-black/70 backdrop-blur-[8px]"
              style={{ WebkitBackdropFilter: "blur(8px)" }}
            />
            <div
              className="relative bg-surface rounded-t-3xl w-full max-w-[420px] px-6 pt-5 pb-0 max-h-[80vh] flex flex-col animate-slide-up"
            >
              {/* Drag handle */}
              <div className="w-10 h-1 bg-faint rounded-sm mx-auto mb-5" />

              <div className="overflow-y-auto overflow-x-hidden flex-1 pb-6">
                {/* Title */}
                <h2 className="font-serif text-lg text-primary m-0 mb-5" style={{ fontWeight: 400 }}>
                  Edit event
                </h2>

                {/* Event title textarea — locked when a non-author edits a check-backed squad */}
                <div className="mb-4">
                  <textarea
                    value={editEventTitle}
                    onChange={(e) => canEditTitle && setEditEventTitle(e.target.value.slice(0, 280))}
                    placeholder="What's the plan?"
                    autoFocus={canEditTitle}
                    readOnly={!canEditTitle}
                    rows={3}
                    className={cn(
                      "w-full bg-deep border border-border-mid rounded-xl p-3.5 px-4 text-primary font-mono text-sm outline-none resize-none leading-relaxed box-border",
                      !canEditTitle && "opacity-60 cursor-not-allowed"
                    )}
                    style={{ fontSize: 13 }}
                  />
                  {!canEditTitle && (
                    <p className="font-mono text-tiny text-dim mt-1.5 pl-0.5">
                      Only the check author can edit the title
                    </p>
                  )}
                </div>

                {/* When / Where inputs */}
                <div className="flex gap-2 mb-1">
                  <input
                    type="text"
                    placeholder="tmr 7pm"
                    value={editWhenInput}
                    onChange={(e) => setEditWhenInput(e.target.value)}
                    className="flex-1 min-w-0 py-2.5 px-3 bg-deep border border-border-mid rounded-lg font-mono text-xs text-primary outline-none box-border"
                  />
                  <input
                    type="text"
                    placeholder="where?"
                    value={editWhereInput}
                    onChange={(e) => setEditWhereInput(e.target.value)}
                    className="min-w-0 py-2.5 px-3 bg-deep border border-border-mid rounded-lg font-mono text-xs text-primary outline-none box-border"
                    style={{ flex: 0.6 }}
                  />
                </div>
              </div>

              {/* Save button */}
              <div className="py-3 pb-6 shrink-0">
                <button
                  onClick={handleSaveEvent}
                  disabled={savingEvent}
                  className={cn(
                    "w-full border-none rounded-xl p-3.5 font-mono text-xs font-bold uppercase",
                    savingEvent
                      ? "bg-border-mid text-dim cursor-default"
                      : "bg-dt text-on-accent cursor-pointer"
                  )}
                  style={{ letterSpacing: "0.08em" }}
                >
                  {savingEvent ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Messages + Input blur wrapper */}
      <div
        className={cn(
          "flex-1 flex flex-col min-h-0 transition-[filter,opacity] duration-200",
          (showSquadPopup || showEditEvent) && "blur-[4px] opacity-30 pointer-events-none"
        )}
      >
      {/* Messages */}
      <div
        className="flex-1 overscroll-contain px-5 py-3 flex flex-col gap-0.5"
        style={{ overflowY: dragX > 0 ? "hidden" : "auto" }}
      >
        {(() => {
          const lastConfirmIdx = messages.reduce((acc, m, idx) => m.messageType === 'date_confirm' ? idx : acc, -1);
          return messages.map((msg, i) => {
            const prev = i > 0 ? messages[i - 1] : null;
            const next = i < messages.length - 1 ? messages[i + 1] : null;
            const sameSenderAsPrev = prev && prev.sender === msg.sender && prev.sender !== "system";
            const sameSenderAsNext = next && next.sender === msg.sender && next.sender !== "system";
            const msgPoll = msg.messageId ? pollsByMessageId.get(msg.messageId) : undefined;
            const msgPollVotes = msgPoll ? pollVotesByPollId.get(msgPoll.id) ?? [] : [];
            const msgPollAvail = msgPoll ? pollAvailabilityByPollId.get(msgPoll.id) ?? [] : [];
            return (
              <ChatMessage
                key={i}
                msg={msg}
                imageUrl={msg.imagePath ? imageUrls.get(msg.imagePath) : undefined}
                onOpenImage={(url) => setFullscreenImage(url)}
                isFirstInGroup={!sameSenderAsPrev}
                isLastInGroup={!sameSenderAsNext}
                isLastConfirm={i === lastConfirmIdx}
                confirmLoading={confirmLoading}
                dateConfirmStatus={dateConfirmStatus}
                poll={msgPoll}
                pollVotes={msgPollVotes}
                pollAvailability={msgPollAvail}
                userId={userId}
                isWaitlisted={localSquad.isWaitlisted ?? false}
                pollMessageRef={pollMessageRef}
                onPollClosed={(pollId) => setPollsByMessageId((prev) => {
                  const next = new Map(prev);
                  for (const [k, v] of next) {
                    if (v.id === pollId) next.set(k, { ...v, status: 'closed' });
                  }
                  return next;
                })}
              />
            );
          });
        })()}
        <div ref={messagesEndRef} />
      </div>

      {/* Input — hidden for waitlisted users */}
      {localSquad.isWaitlisted ? (
        <div className="px-5 py-3 border-t border-border text-center" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}>
          <span className="font-mono text-xs text-faint">
            You&apos;re on the waitlist — read only
          </span>
        </div>
      ) : (
      <div className="border-t border-border">
        {/* Sticky date confirm bar */}
        {dateConfirmStatus === 'no' && !confirmLoading && localSquad.dateStatus === 'proposed' && (
          <div className="border-t border-border px-5 py-3 flex items-center justify-center bg-card">
            <span className="font-mono text-xs text-faint">
              can&apos;t make it
            </span>
          </div>
        )}
        {(dateConfirmStatus === 'pending' || (dateConfirmStatus === 'loading' && localSquad.dateStatus === 'proposed')) && !confirmLoading && (
          <div className="border-t border-border px-5 py-3 flex flex-col items-center gap-2.5 bg-card">
            <span className="font-mono text-tiny text-dim">
              are you still down?
            </span>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (!localSquad?.id || confirmLoading) return;
                  setConfirmLoading(true);
                  try {
                    await onConfirmDate?.(localSquad.id, 'yes');
                    setDateConfirmStatus('yes');
                    if (userId) setDateConfirms((prev) => new Map(prev).set(userId, 'yes'));
                  } catch (err) {
                    logError('dateConfirm', err);
                  } finally {
                    setConfirmLoading(false);
                  }
                }}
                className="bg-dt text-on-accent border-none rounded-lg px-4 py-1.5 font-mono text-xs font-bold cursor-pointer"
              >
                STILL DOWN
              </button>
              <button
                onClick={async () => {
                  if (!localSquad?.id || confirmLoading) return;
                  setConfirmLoading(true);
                  try {
                    await onConfirmDate?.(localSquad.id, 'no');
                    setDateConfirmStatus('no');
                    if (userId) setDateConfirms((prev) => new Map(prev).set(userId, 'no'));
                  } catch (err) {
                    logError('dateConfirm', err);
                  } finally {
                    setConfirmLoading(false);
                  }
                }}
                className="bg-transparent text-primary border border-border-mid rounded-lg px-4 py-1.5 font-mono text-xs font-bold cursor-pointer"
              >
                CAN&apos;T MAKE IT
              </button>
            </div>
          </div>
        )}
        {/* Active poll chip — shows the most recent active poll; clicking scrolls to it.
            If multiple polls are active, the chip label reflects the count. */}
        {(() => {
          const activePolls = Array.from(pollsByMessageId.values()).filter((p) => p.status === 'active');
          if (activePolls.length === 0) return null;
          // Most recent by message order: find whichever active poll's message appears latest
          const msgIdxByPoll = new Map<string, number>();
          messages.forEach((m, idx) => { if (m.messageId) msgIdxByPoll.set(m.messageId, idx); });
          const latest = activePolls.reduce((acc, p) =>
            (msgIdxByPoll.get(p.messageId) ?? -1) > (msgIdxByPoll.get(acc.messageId) ?? -1) ? p : acc
          , activePolls[0]);
          const latestVotes = pollVotesByPollId.get(latest.id) ?? [];
          const label = activePolls.length > 1
            ? `${activePolls.length} active polls · latest: ${latest.question}`
            : latest.question;
          return (
            <div
              onClick={() => pollMessageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              className="flex items-center gap-1.5 px-5 py-1.5 cursor-pointer"
            >
              <div className="flex items-center gap-1.5 bg-card border border-dt rounded-2xl px-3 py-1.5 flex-1 min-w-0">
                <svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor" className="shrink-0"><path d="M224,200h-8V40a8,8,0,0,0-8-8H152a8,8,0,0,0-8,8V80H96a8,8,0,0,0-8,8v40H48a8,8,0,0,0-8,8v64H32a8,8,0,0,1,0-16H224a8,8,0,0,1,0,16ZM160,48h40V200H160ZM104,96h40V200H104ZM56,144H88v56H56Z"/></svg>
                <span className="font-mono text-xs text-primary overflow-hidden text-ellipsis whitespace-nowrap flex-1">
                  {label}
                </span>
                <span className="font-mono text-tiny font-bold text-dt shrink-0">
                  {new Set(latestVotes.map((v) => v.userId)).size}
                </span>
              </div>
            </div>
          );
        })()}
        {/* Join request banners */}
        {pendingJoinRequests && onRespondToJoinRequest && localSquad && pendingJoinRequests
          .filter((r) => r.squadId === localSquad.id)
          .map((r) => (
            <div
              key={r.userId}
              className="flex items-center gap-2.5 px-5 py-2.5 border-t border-border"
            >
              <div className="w-6 h-6 rounded-full bg-border-light text-dim flex items-center justify-center font-mono text-tiny font-bold shrink-0">
                {r.avatar}
              </div>
              <span className="font-mono text-xs text-dt flex-1 min-w-0">
                {r.name} wants to join
              </span>
              <button
                onClick={() => onRespondToJoinRequest(r.squadId, r.userId, true)}
                className="bg-dt text-on-accent border-none rounded-lg px-3 py-1.5 font-mono text-tiny font-bold uppercase cursor-pointer"
                style={{ letterSpacing: "0.08em" }}
              >
                Accept
              </button>
              <button
                onClick={() => onRespondToJoinRequest(r.squadId, r.userId, false)}
                className="bg-transparent text-dim border border-border-mid rounded-lg px-3 py-1.5 font-mono text-tiny font-bold uppercase cursor-pointer"
                style={{ letterSpacing: "0.08em" }}
              >
                Decline
              </button>
            </div>
          ))
        }
        <MessageComposer
          members={localSquad.members}
          onSend={handleSend}
          onOpenPollCreator={onCreatePoll ? () => {
            // Default to dates variant when the squad hasn't picked a date yet —
            // that's where this tool is most useful.
            setPollVariant(localSquad.eventIsoDate ? 'text' : 'dates');
            setShowPollCreator(true);
          } : undefined}
        />
      </div>
      )}
      </div>{/* end blur wrapper */}


      {/* Squad popup modal */}
      {showSquadPopup && (
        <SquadSettingsModal
          squad={localSquad}
          dateConfirms={dateConfirms}
          onClose={() => setShowSquadPopup(false)}
          onRequestLeave={() => setShowLeaveConfirm(true)}
          onRequestKick={(target) => setKickTarget(target)}
          onOpenDatePicker={() => {
            setShowSquadPopup(false);
            setEditEventTitle(localSquad.name || "");
            const dateLabel = localSquad.eventIsoDate
              ? new Date(localSquad.eventIsoDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
              : "";
            const timeLabel = localSquad.eventTime || "";
            setEditWhenInput([dateLabel, timeLabel].filter(Boolean).join(" "));
            setEditWhereInput(localSquad.meetingSpot || "");
            setShowEditEvent(true);
          }}
          onViewProfile={onViewProfile}
          onUpdateSquadSize={onUpdateSquadSize}
          onSetMemberRole={onSetMemberRole}
          onAddMember={onAddMember}
          onSquadUpdate={onSquadUpdate}
          onLocalSquadUpdate={setLocalSquad}
        />
      )}

      {/* Fullscreen image viewer */}
      {fullscreenImage && (
        <div
          onClick={() => setFullscreenImage(null)}
          className="fixed inset-0 bg-black/95 flex items-center justify-center z-[10000] cursor-zoom-out"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fullscreenImage}
            alt="attachment"
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}

      {/* Poll creation modal */}
      {showPollCreator && (() => {
        const closeCreator = () => {
          setShowPollCreator(false);
          setPollQuestion("");
          setPollOptions(["", ""]);
          setPollMultiSelect(true);
          setPollDateInput("");
          setPollDateOptions([]);
          setGridRangePreset('next-7');
          setGridCustomMode('range');
          setGridCustomStart('');
          setGridCustomEnd('');
          setGridSpecificInput('');
          setGridSpecificDates([]);
          setGridWindow('evenings');
          setGridSlotMinutes(60);
        };

        const addDateOption = () => {
          const input = pollDateInput.trim();
          if (!input) return;
          const parsedDate = parseNaturalDate(input);
          const iso = parsedDate?.iso ?? parseDateToISO(input);
          if (!iso) return;
          const time = parseNaturalTime(input);
          const key = `${iso}|${time ?? ''}`;
          if (pollDateOptions.some((o) => `${o.date}|${o.time ?? ''}` === key)) {
            setPollDateInput("");
            return;
          }
          const next = [...pollDateOptions, { date: iso, time }];
          next.sort((a, b) => {
            if (a.date !== b.date) return a.date < b.date ? -1 : 1;
            return (a.time ?? '').localeCompare(b.time ?? '');
          });
          setPollDateOptions(next);
          setPollDateInput("");
        };

        const formatDateChip = (o: { date: string; time: string | null }) => {
          const d = new Date(o.date + 'T00:00:00');
          const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
          return o.time ? `${dayLabel} · ${o.time}` : dayLabel;
        };

        const fmtDate = (d: Date) => `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
        const expandRange = (startIso: string, endIso: string): string[] => {
          const out: string[] = [];
          const cur = new Date(startIso + 'T00:00:00');
          const end = new Date(endIso + 'T00:00:00');
          while (cur.getTime() <= end.getTime()) {
            out.push(fmtDate(cur));
            cur.setDate(cur.getDate() + 1);
          }
          return out;
        };
        const computeGridDates = (): string[] | null => {
          const today = new Date();
          const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          if (gridRangePreset === 'next-7' || gridRangePreset === 'next-14') {
            const days = gridRangePreset === 'next-7' ? 7 : 14;
            const end = new Date(todayStart);
            end.setDate(end.getDate() + days - 1);
            return expandRange(fmtDate(todayStart), fmtDate(end));
          }
          if (gridRangePreset === 'weekend') {
            // If today is Fri/Sat/Sun, start = today; else start = upcoming Friday.
            const dow = todayStart.getDay(); // 0=Sun..6=Sat
            const start = new Date(todayStart);
            if (dow >= 1 && dow <= 4) start.setDate(start.getDate() + (5 - dow));
            // End = the Sunday of that weekend (day 0 of the following week).
            const end = new Date(start);
            const startDow = end.getDay();
            if (startDow !== 0) end.setDate(end.getDate() + (7 - startDow));
            return expandRange(fmtDate(start), fmtDate(end));
          }
          // custom
          if (gridCustomMode === 'specific') {
            if (gridSpecificDates.length < 1 || gridSpecificDates.length > 21) return null;
            return Array.from(new Set(gridSpecificDates)).sort();
          }
          if (!gridCustomStart || !gridCustomEnd) return null;
          if (gridCustomEnd < gridCustomStart) return null;
          const days = Math.round((new Date(gridCustomEnd + 'T00:00:00').getTime() - new Date(gridCustomStart + 'T00:00:00').getTime()) / 86400000) + 1;
          if (days < 1 || days > 21) return null;
          return expandRange(gridCustomStart, gridCustomEnd);
        };

        const addSpecificDate = () => {
          const input = gridSpecificInput.trim();
          if (!input) return;
          const parsed = parseNaturalDate(input);
          const iso = parsed?.iso ?? parseDateToISO(input);
          if (!iso) return;
          if (gridSpecificDates.includes(iso)) { setGridSpecificInput(""); return; }
          const next = [...gridSpecificDates, iso].sort();
          setGridSpecificDates(next);
          setGridSpecificInput("");
        };
        const formatSpecificDateChip = (iso: string) => {
          const d = new Date(iso + 'T00:00:00');
          return d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
        };

        // Server caps when-poll slots at 50; the grid emits one slot per cell.
        const MAX_WHEN_SLOTS = 50;
        const computeGridSlotCount = (): number => {
          const dates = computeGridDates();
          if (!dates) return 0;
          const window =
            gridWindow === 'evenings' ? { hourStart: 18, hourEnd: 23 }
            : gridWindow === 'afternoons' ? { hourStart: 12, hourEnd: 17 }
            : { hourStart: 10, hourEnd: 23 };
          const slotsPerDay = Math.ceil(((window.hourEnd - window.hourStart) * 60) / gridSlotMinutes);
          return dates.length * slotsPerDay;
        };
        const gridSlotCount = computeGridSlotCount();
        const gridRangeValid = computeGridDates() !== null;
        const gridSlotsOverMax = gridSlotCount > MAX_WHEN_SLOTS;
        const canCreateText = !!pollQuestion.trim() && pollOptions.filter((o) => o.trim()).length >= 2;
        const canCreateDates = pollDateOptions.length >= 2;
        const canCreateGrid = gridRangeValid && gridSlotCount > 0 && !gridSlotsOverMax;
        const canCreate = (
          pollVariant === 'text' ? canCreateText
          : pollVariant === 'dates' ? canCreateDates
          : canCreateGrid
        ) && !pollCreating;

        const computeGridParams = () => {
          const dates = computeGridDates();
          if (!dates) return null;
          const window =
            gridWindow === 'evenings' ? { hourStart: 18, hourEnd: 23 }
            : gridWindow === 'afternoons' ? { hourStart: 12, hourEnd: 17 }
            : { hourStart: 10, hourEnd: 23 };
          return {
            dates,
            hourStart: window.hourStart,
            hourEnd: window.hourEnd,
            slotMinutes: gridSlotMinutes,
          } as const;
        };

        const handleCreate = async () => {
          if (!localSquad?.id || !canCreate) return;
          setPollCreating(true);
          try {
            if (pollVariant === 'dates') {
              // Preference-style 'when' poll: each entered date becomes a slot
              // with the time string carried as a label (no structured range).
              const slots: WhenSlot[] = pollDateOptions.map((o) => ({
                date: o.date,
                startMin: null,
                endMin: null,
                label: o.time,
              }));
              await db.createWhenPoll(localSquad.id, slots, 'preference');
            } else if (pollVariant === 'grid') {
              // Availability-style 'when' poll: enumerate every (day, slot) cell
              // as a slot with concrete startMin/endMin. Server caps at 50 slots.
              const g = computeGridParams();
              if (!g) return;
              const slots: WhenSlot[] = [];
              const slotsPerDay = Math.ceil(((g.hourEnd - g.hourStart) * 60) / g.slotMinutes);
              for (const date of g.dates) {
                for (let s = 0; s < slotsPerDay; s++) {
                  const startMin = g.hourStart * 60 + s * g.slotMinutes;
                  const endMin = Math.min(startMin + g.slotMinutes, g.hourEnd * 60);
                  slots.push({ date, startMin, endMin, label: null });
                }
              }
              await db.createWhenPoll(localSquad.id, slots, 'availability');
            } else {
              const valid = pollOptions.filter((o) => o.trim());
              await onCreatePoll?.(localSquad.id, pollQuestion.trim(), valid, pollMultiSelect, 'text');
            }
            closeCreator();
          } catch (err) {
            logError('createPoll', err);
          } finally {
            setPollCreating(false);
          }
        };

        return (
          <div
            onClick={closeCreator}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999]"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-deep border border-border rounded-2xl px-5 py-6 w-[90%] max-w-[340px]"
            >
              <h3 className="font-serif text-lg text-primary mb-4 text-center">
                Create a poll
              </h3>

              <div className="flex bg-card border border-border-mid rounded-lg p-0.5 mb-4">
                {(['text', 'dates', 'grid'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setPollVariant(v)}
                    className={cn(
                      "flex-1 py-1.5 rounded-md font-mono text-[10px] font-bold uppercase transition-colors",
                      pollVariant === v ? "bg-dt text-on-accent" : "bg-transparent text-dim"
                    )}
                    style={{ letterSpacing: '0.08em' }}
                  >
                    {v === 'text' ? 'Question' : v === 'dates' ? 'Dates' : 'Grid'}
                  </button>
                ))}
              </div>

              {pollVariant === 'grid' ? (
                <>
                  <div className="mb-3">
                    <div className="font-mono text-tiny text-faint mb-1.5" style={{ letterSpacing: '0.08em' }}>RANGE</div>
                    <div className="flex bg-card border border-border-mid rounded-lg p-0.5">
                      {([
                        { k: 'weekend', label: 'weekend' },
                        { k: 'next-7', label: '7 days' },
                        { k: 'next-14', label: '14 days' },
                        { k: 'custom', label: 'custom' },
                      ] as const).map(({ k, label }) => (
                        <button
                          key={k}
                          onClick={() => {
                            setGridRangePreset(k);
                            if (k === 'custom' && !gridCustomStart) {
                              // Seed with today + 7 days as sensible defaults.
                              const t = new Date();
                              const s = new Date(t.getFullYear(), t.getMonth(), t.getDate());
                              const e = new Date(s); e.setDate(e.getDate() + 6);
                              setGridCustomStart(fmtDate(s));
                              setGridCustomEnd(fmtDate(e));
                            }
                          }}
                          className={cn(
                            "flex-1 py-1.5 rounded-md font-mono text-[10px] font-bold uppercase",
                            gridRangePreset === k ? "bg-dt text-on-accent" : "bg-transparent text-dim"
                          )}
                          style={{ letterSpacing: '0.08em' }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {gridRangePreset === 'custom' && (
                      <div className="mt-2">
                        <div className="flex bg-card border border-border-mid rounded-lg p-0.5 mb-2">
                          {([
                            { k: 'range', label: 'continuous' },
                            { k: 'specific', label: 'specific dates' },
                          ] as const).map(({ k, label }) => (
                            <button
                              key={k}
                              onClick={() => setGridCustomMode(k)}
                              className={cn(
                                "flex-1 py-1.5 rounded-md font-mono text-[10px] font-bold uppercase",
                                gridCustomMode === k ? "bg-dt text-on-accent" : "bg-transparent text-dim"
                              )}
                              style={{ letterSpacing: '0.08em' }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        {gridCustomMode === 'range' ? (
                          <>
                            <div className="flex gap-1.5">
                              <input
                                type="date"
                                value={gridCustomStart}
                                onChange={(e) => setGridCustomStart(e.target.value)}
                                className="min-w-0 flex-1 bg-card border border-border-mid rounded-lg py-2 px-2 text-primary font-mono text-xs outline-none"
                              />
                              <input
                                type="date"
                                value={gridCustomEnd}
                                onChange={(e) => setGridCustomEnd(e.target.value)}
                                min={gridCustomStart || undefined}
                                className="min-w-0 flex-1 bg-card border border-border-mid rounded-lg py-2 px-2 text-primary font-mono text-xs outline-none"
                              />
                            </div>
                            {!gridRangeValid && gridCustomStart && gridCustomEnd && (
                              <p className="font-mono text-tiny text-faint mt-1.5">
                                range must span 1–21 days
                              </p>
                            )}
                          </>
                        ) : (
                          <>
                            <div className="flex gap-1.5">
                              <input
                                value={gridSpecificInput}
                                onChange={(e) => setGridSpecificInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSpecificDate(); } }}
                                placeholder="sat"
                                className="flex-1 bg-card border border-border-mid rounded-lg py-2 px-3 text-primary font-mono text-xs outline-none"
                                disabled={gridSpecificDates.length >= 21}
                              />
                              <button
                                onClick={addSpecificDate}
                                disabled={!gridSpecificInput.trim() || gridSpecificDates.length >= 21}
                                className={cn(
                                  "border-none rounded-lg px-3 font-mono text-xs font-bold uppercase",
                                  (!gridSpecificInput.trim() || gridSpecificDates.length >= 21)
                                    ? "bg-card text-faint cursor-default"
                                    : "bg-dt text-on-accent cursor-pointer"
                                )}
                                style={{ letterSpacing: '0.08em' }}
                              >
                                Add
                              </button>
                            </div>
                            {gridSpecificDates.length === 0 ? (
                              <p className="font-mono text-tiny text-faint mt-1.5 text-center">
                                add at least 1 date — try &quot;sat&quot; or &quot;4/26&quot;
                              </p>
                            ) : (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {gridSpecificDates.map((iso, i) => (
                                  <div key={iso} className="flex items-center gap-1.5 bg-card border border-border-mid rounded-lg px-2.5 py-1">
                                    <span className="font-mono text-tiny text-primary">{formatSpecificDateChip(iso)}</span>
                                    <button
                                      onClick={() => setGridSpecificDates(gridSpecificDates.filter((_, j) => j !== i))}
                                      className="bg-transparent border-none text-faint font-mono text-base cursor-pointer leading-none"
                                      aria-label="Remove"
                                    >
                                      ×
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-[3fr_2fr] gap-2 mb-3">
                    <div>
                      <div className="font-mono text-tiny text-faint mb-1.5" style={{ letterSpacing: '0.08em' }}>WINDOW</div>
                      <div className="flex bg-card border border-border-mid rounded-lg p-0.5">
                        {([
                          { k: 'evenings', label: '6–11p' },
                          { k: 'afternoons', label: '12–5p' },
                          { k: 'all-day', label: 'all day' },
                        ] as const).map(({ k, label }) => (
                          <button
                            key={k}
                            onClick={() => setGridWindow(k)}
                            className={cn(
                              "flex-1 py-1.5 rounded-md font-mono text-tiny font-bold uppercase whitespace-nowrap",
                              gridWindow === k ? "bg-dt text-on-accent" : "bg-transparent text-dim"
                            )}
                            style={{ letterSpacing: '0.08em' }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="font-mono text-tiny text-faint mb-1.5" style={{ letterSpacing: '0.08em' }}>SLOT</div>
                      <div className="flex bg-card border border-border-mid rounded-lg p-0.5">
                        {([60, 30] as const).map((n) => (
                          <button
                            key={n}
                            onClick={() => setGridSlotMinutes(n)}
                            className={cn(
                              "flex-1 py-1.5 rounded-md font-mono text-tiny font-bold uppercase",
                              gridSlotMinutes === n ? "bg-dt text-on-accent" : "bg-transparent text-dim"
                            )}
                            style={{ letterSpacing: '0.08em' }}
                          >
                            {n === 60 ? '1h' : '30m'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  {gridSlotsOverMax ? (
                    <p className="font-mono text-tiny text-[#ff4444] mb-4 text-center">
                      {gridSlotCount} / {MAX_WHEN_SLOTS} slots — narrow the range, window, or granularity
                    </p>
                  ) : gridRangeValid ? (
                    <p className="font-mono text-tiny text-faint mb-4 text-center">
                      {gridSlotCount} / {MAX_WHEN_SLOTS} slots · tap to paint once created
                    </p>
                  ) : (
                    <p className="font-mono text-tiny text-faint mb-4 text-center">
                      pick a date range above
                    </p>
                  )}
                </>
              ) : pollVariant === 'text' ? (
                <>
                  <input
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    placeholder="What's the question?"
                    className="w-full bg-card border border-border-mid rounded-lg py-2.5 px-3 text-primary font-mono outline-none mb-3 box-border"
                    style={{ fontSize: 13 }}
                  />
                  <div className="flex flex-col gap-2 mb-3">
                    {pollOptions.map((opt, i) => (
                      <div key={i} className="flex gap-1.5 items-center">
                        <input
                          value={opt}
                          onChange={(e) => {
                            const next = [...pollOptions];
                            next[i] = e.target.value;
                            setPollOptions(next);
                          }}
                          placeholder={`Option ${i + 1}`}
                          className="flex-1 bg-card border border-border-mid rounded-lg py-2 px-3 text-primary font-mono text-xs outline-none"
                        />
                        {pollOptions.length > 2 && (
                          <button
                            onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}
                            className="bg-transparent border-none text-faint font-mono text-base cursor-pointer px-1"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {pollOptions.length < 10 && (
                    <button
                      onClick={() => setPollOptions([...pollOptions, ""])}
                      className="bg-transparent border border-border-mid rounded-lg px-3 py-1.5 text-dim font-mono text-xs cursor-pointer w-full mb-4"
                    >
                      + Add option
                    </button>
                  )}
                  <div
                    onClick={() => setPollMultiSelect(!pollMultiSelect)}
                    className="flex items-center justify-between py-2.5 mb-3 cursor-pointer"
                  >
                    <span className="font-mono text-xs text-dim">Allow multiple selections</span>
                    <div
                      className="w-9 h-5 rounded-lg relative transition-colors duration-200"
                      style={{ background: pollMultiSelect ? '#e8ff5a' : '#333' }}
                    >
                      <div
                        className="w-4 h-4 rounded-full bg-white absolute top-0.5 transition-[left] duration-200"
                        style={{ left: pollMultiSelect ? 18 : 2 }}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex gap-1.5 mb-3">
                    <input
                      value={pollDateInput}
                      onChange={(e) => setPollDateInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDateOption(); } }}
                      placeholder="fri 7pm"
                      className="min-w-0 flex-1 bg-card border border-border-mid rounded-lg py-2 px-3 text-primary font-mono text-xs outline-none"
                      disabled={pollDateOptions.length >= 10}
                    />
                    <button
                      onClick={addDateOption}
                      disabled={!pollDateInput.trim() || pollDateOptions.length >= 10}
                      className={cn(
                        "shrink-0 border-none rounded-lg px-3 font-mono text-xs font-bold uppercase",
                        (!pollDateInput.trim() || pollDateOptions.length >= 10)
                          ? "bg-card text-faint cursor-default"
                          : "bg-dt text-on-accent cursor-pointer"
                      )}
                      style={{ letterSpacing: '0.08em' }}
                    >
                      Add
                    </button>
                  </div>
                  {pollDateOptions.length === 0 ? (
                    <p className="font-mono text-tiny text-faint mb-4 text-center">
                      add at least 2 times — try &quot;sat 9pm&quot; or &quot;4/26 evening&quot;
                    </p>
                  ) : (
                    <div className="flex flex-col gap-1.5 mb-4">
                      {pollDateOptions.map((o, i) => (
                        <div key={`${o.date}-${o.time ?? ''}`} className="flex items-center justify-between bg-card border border-border-mid rounded-lg px-3 py-2">
                          <span className="font-mono text-xs text-primary">{formatDateChip(o)}</span>
                          <button
                            onClick={() => setPollDateOptions(pollDateOptions.filter((_, j) => j !== i))}
                            className="bg-transparent border-none text-faint font-mono text-base cursor-pointer px-1"
                            aria-label="Remove"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              <div className="flex gap-2.5">
                <button
                  onClick={closeCreator}
                  className="flex-1 bg-transparent text-primary border border-border-mid rounded-xl p-3 font-mono text-xs font-bold cursor-pointer uppercase"
                  style={{ letterSpacing: '0.08em' }}
                >
                  Cancel
                </button>
                <button
                  disabled={!canCreate}
                  onClick={handleCreate}
                  className={cn(
                    "flex-1 border-none rounded-xl p-3 font-mono text-xs font-bold uppercase",
                    !canCreate ? "bg-card text-faint cursor-default" : "bg-dt text-on-accent cursor-pointer"
                  )}
                  style={{ letterSpacing: '0.08em' }}
                >
                  {pollCreating ? '...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
    </>
  );
};

export default SquadChat;
