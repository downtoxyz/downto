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


interface SquadChatProps {
  squad: Squad;
  userId: string | null;
  onClose: () => void;
  onSquadUpdate: (updater: Squad[] | ((prev: Squad[]) => Squad[])) => void;
  onChatOpen?: (open: boolean) => void;
  onViewProfile?: (userId: string) => void;
  onSendMessage?: (squadDbId: string, text: string, mentions?: string[]) => Promise<void>;
  onLeaveSquad?: (squadDbId: string) => Promise<void>;
  onSetSquadDate?: (squadDbId: string, date: string, time?: string | null, locked?: boolean) => Promise<void>;
  onClearSquadDate?: (squadDbId: string) => Promise<void>;
  onConfirmDate?: (squadDbId: string, response: 'yes' | 'no') => Promise<void>;
  onUpdateSquadSize?: (checkId: string, newSize: number) => Promise<void>;
  onAddMember?: (squadId: string, userId: string) => Promise<void>;
  onSetMemberRole?: (squadId: string, userId: string, role: 'member' | 'waitlist') => Promise<void>;
  onKickMember?: (squadId: string, userId: string) => Promise<void>;
  onCreatePoll?: (squadId: string, question: string, options: string[], multiSelect: boolean) => Promise<void>;
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
  const [showImOutConfirm, setShowImOutConfirm] = useState(false);
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
  // Poll state
  const [activePoll, setActivePoll] = useState<{
    id: string; messageId: string; question: string;
    options: string[]; status: string; createdBy: string;
    multiSelect: boolean;
  } | null>(null);
  const [pollVotes, setPollVotes] = useState<Array<{ userId: string; optionIndex: number; displayName: string }>>([]);
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollMultiSelect, setPollMultiSelect] = useState(true);
  const [pollCreating, setPollCreating] = useState(false);
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
      setActivePoll(null);
      setPollVotes([]);
      return;
    }
    let stale = false;
    db.getSquadPolls(localSquad.id).then((polls) => {
      if (stale) return;
      const active = polls.find((p: { status: string }) => p.status === 'active');
      if (active) {
        setActivePoll({
          id: active.id,
          messageId: active.message_id,
          question: active.question,
          options: active.options as string[],
          status: active.status,
          createdBy: active.created_by,
          multiSelect: active.multi_select ?? true,
        });
        db.getPollVotes(active.id).then((votes) => {
          if (stale) return;
          setPollVotes(votes);
        }).catch(() => {});
      } else {
        setActivePoll(null);
        setPollVotes([]);
      }
    }).catch(() => {});
    return () => { stale = true; };
  }, [localSquad.id]);

  // Realtime subscription for poll votes
  useEffect(() => {
    if (!activePoll?.id || activePoll.status !== 'active') return;
    const channel = db.subscribeToPollVotes(activePoll.id, () => {
      // Refetch all votes to get display names
      db.getPollVotes(activePoll.id).then((votes) => {
        setPollVotes(votes);
      }).catch(() => {});
    });
    return () => { channel.unsubscribe(); };
  }, [activePoll?.id, activePoll?.status]);

  // Fetch fresh messages when chat opens (covers gap before realtime subscribes)
  useEffect(() => {
    if (!localSquad.id) return;
    let stale = false;
    db.getSquadMessages(localSquad.id).then((raw) => {
      if (stale) return;
      const msgs = raw.map((msg) => ({
        id: msg.id,
        sender: msg.is_system || !msg.sender_id ? "system" : (msg.sender_id === userId ? "You" : (msg.sender?.display_name ?? "Unknown")),
        text: msg.text,
        time: formatTimeAgo(new Date(msg.created_at)),
        isYou: msg.sender_id === userId,
        ...(msg.message_type === 'date_confirm' ? { messageType: 'date_confirm' as const, messageId: msg.id } : {}),
        ...(msg.message_type === 'poll' ? { messageType: 'poll' as const, messageId: msg.id } : {}),
      }));
      const last = msgs.length > 0 ? msgs[msgs.length - 1] : null;
      // Merge: keep any realtime messages that arrived before this fetch completed
      setMessages((prev) => {
        const fetchedIds = new Set(msgs.map((m) => m.id));
        const realtimeOnly = prev.filter((m) => m.id && !fetchedIds.has(m.id));
        const merged = [...msgs, ...realtimeOnly];
        return merged;
      });
      onSquadUpdateRef.current((prev) =>
        prev.map((s) =>
          s.id === localSquad.id
            ? { ...s, messages: msgs, lastMsg: last ? (last.sender === "system" ? last.text : `${last.sender}: ${last.text}`) : s.lastMsg }
            : s
        )
      );
    }).catch(() => {});
    return () => { stale = true; };
  }, [localSquad.id, userId]);

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
        text: newMessage.text,
        time: "now",
        isYou: false,
        ...(newMessage.message_type === 'date_confirm' ? { messageType: 'date_confirm' as const, messageId: newMessage.id } : {}),
        ...(newMessage.message_type === 'poll' ? { messageType: 'poll' as const, messageId: newMessage.id } : {}),
      };
      // Refresh poll data when a poll message arrives
      if (newMessage.message_type === 'poll' && localSquad.id) {
        db.getSquadPolls(localSquad.id).then((polls) => {
          const active = polls.find((p: { status: string }) => p.status === 'active');
          if (active) {
            setActivePoll({
              id: active.id, messageId: active.message_id, question: active.question,
              options: active.options as string[], status: active.status, createdBy: active.created_by,
              multiSelect: active.multi_select ?? true,
            });
            db.getPollVotes(active.id).then((votes) => {
              setPollVotes(votes);
            }).catch(() => {});
          }
        }).catch(() => {});
      }
      const lastMsgPreview = isSystem ? newMessage.text : `${senderName}: ${newMessage.text}`;
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

  const handleSend = async (text: string, mentionIds: string[]) => {
    const newMsgObj = { sender: "You", text, time: "now", isYou: true };
    const lastMsgPreview = `You: ${text}`;
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

    // Persist to DB
    if (localSquad.id && onSendMessage) {
      onSendMessage(localSquad.id, text, mentionIds.length > 0 ? mentionIds : undefined).catch((err) =>
        logError("sendMessage", err, { squadId: localSquad.id })
      );
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

  return (
    <>
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

      {/* I'm out confirmation */}
      {showImOutConfirm && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999]"
          onClick={() => setShowImOutConfirm(false)}
        >
          <div
            className="bg-deep border border-border rounded-2xl px-5 py-6 w-[90%] max-w-[300px] text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-serif text-lg text-primary mb-1.5" style={{ fontWeight: 400 }}>
              Can&apos;t make it?
            </p>
            <p className="font-mono text-xs text-dim mb-5">
              You&apos;ll be removed from this squad and lose access to the chat.
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setShowImOutConfirm(false)}
                className="flex-1 py-2.5 bg-transparent border border-border rounded-lg text-primary font-mono text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (localSquad?.id && onConfirmDate) {
                    setConfirmLoading(true);
                    try {
                      await onConfirmDate(localSquad.id, 'no');
                      setDateConfirmStatus('no');
                      if (userId) setDateConfirms((prev) => new Map(prev).set(userId, 'no'));
                      onSquadUpdate((prev) => prev.filter((s) => s.id !== localSquad.id));
                      onClose();
                    } catch (err) {
                      logError('dateConfirm', err);
                    } finally {
                      setConfirmLoading(false);
                    }
                  }
                  setShowImOutConfirm(false);
                }}
                className="flex-1 py-2.5 bg-[#ff4444] border-none rounded-lg text-white font-mono text-xs font-bold cursor-pointer"
              >
                I&apos;m out
              </button>
            </div>
          </div>
        </div>
      )}

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
        const handleSaveEvent = async () => {
          if (!localSquad?.id) return;
          setSavingEvent(true);
          try {
            // Save title if changed
            const trimmedTitle = editEventTitle.trim();
            if (trimmedTitle && trimmedTitle !== localSquad.name) {
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

                {/* Event title textarea */}
                <div className="mb-4">
                  <textarea
                    value={editEventTitle}
                    onChange={(e) => setEditEventTitle(e.target.value.slice(0, 280))}
                    placeholder="What's the plan?"
                    autoFocus
                    rows={3}
                    className="w-full bg-deep border border-border-mid rounded-xl p-3.5 px-4 text-primary font-mono text-sm outline-none resize-none leading-relaxed box-border"
                    style={{ fontSize: 13 }}
                  />
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
                      : "bg-dt text-black cursor-pointer"
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
            return (
              <ChatMessage
                key={i}
                msg={msg}
                isFirstInGroup={!sameSenderAsPrev}
                isLastInGroup={!sameSenderAsNext}
                isLastConfirm={i === lastConfirmIdx}
                confirmLoading={confirmLoading}
                dateConfirmStatus={dateConfirmStatus}
                activePoll={activePoll}
                pollVotes={pollVotes}
                userId={userId}
                isWaitlisted={localSquad.isWaitlisted ?? false}
                pollMessageRef={pollMessageRef}
                onPollClosed={() => setActivePoll((prev) => prev ? { ...prev, status: 'closed' } : prev)}
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
                className="bg-dt text-black border-none rounded-lg px-4 py-1.5 font-mono text-xs font-bold cursor-pointer"
              >
                STILL DOWN
              </button>
              <button
                onClick={() => setShowImOutConfirm(true)}
                className="bg-transparent text-primary border border-border-mid rounded-lg px-4 py-1.5 font-mono text-xs font-bold cursor-pointer"
              >
                I&apos;M OUT
              </button>
            </div>
          </div>
        )}
        {/* Active poll chip */}
        {activePoll?.status === 'active' && (
          <div
            onClick={() => pollMessageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            className="flex items-center gap-1.5 px-5 py-1.5 cursor-pointer"
          >
            <div className="flex items-center gap-1.5 bg-card border border-dt rounded-2xl px-3 py-1.5 flex-1 min-w-0">
              <span className="text-xs shrink-0">📊</span>
              <span className="font-mono text-xs text-primary overflow-hidden text-ellipsis whitespace-nowrap flex-1">
                {activePoll.question}
              </span>
              <span className="font-mono text-tiny font-bold text-dt shrink-0">
                {new Set(pollVotes.map((v) => v.userId)).size}
              </span>
            </div>
          </div>
        )}
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
                className="bg-dt text-black border-none rounded-lg px-3 py-1.5 font-mono text-tiny font-bold uppercase cursor-pointer"
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
          activePoll={activePoll}
          onSend={handleSend}
          onOpenPollCreator={onCreatePoll ? () => setShowPollCreator(true) : undefined}
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

      {/* Poll creation modal */}
      {showPollCreator && (
        <div
          onClick={() => { setShowPollCreator(false); setPollQuestion(""); setPollOptions(["", ""]); setPollMultiSelect(true); }}
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999]"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-deep border border-border rounded-2xl px-5 py-6 w-[90%] max-w-[340px]"
          >
            <h3 className="font-serif text-lg text-primary mb-4 text-center">
              Create a poll
            </h3>
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
            <div className="flex gap-2.5">
              <button
                onClick={() => { setShowPollCreator(false); setPollQuestion(""); setPollOptions(["", ""]); setPollMultiSelect(true); }}
                className="flex-1 bg-transparent text-primary border border-border-mid rounded-xl p-3 font-mono text-xs font-bold cursor-pointer uppercase"
                style={{ letterSpacing: '0.08em' }}
              >
                Cancel
              </button>
              <button
                disabled={!pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2 || pollCreating}
                onClick={async () => {
                  if (!localSquad?.id || !pollQuestion.trim() || pollCreating) return;
                  const validOptions = pollOptions.filter((o) => o.trim());
                  if (validOptions.length < 2) return;
                  setPollCreating(true);
                  try {
                    await onCreatePoll?.(localSquad.id, pollQuestion.trim(), validOptions, pollMultiSelect);
                    setShowPollCreator(false);
                    setPollQuestion("");
                    setPollOptions(["", ""]);
                    setPollMultiSelect(true);
                  } catch (err) {
                    logError('createPoll', err);
                  } finally {
                    setPollCreating(false);
                  }
                }}
                className={cn(
                  "flex-1 border-none rounded-xl p-3 font-mono text-xs font-bold uppercase",
                  (!pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2)
                    ? "bg-border-mid text-dim cursor-default"
                    : "bg-dt text-black cursor-pointer"
                )}
                style={{ letterSpacing: '0.08em' }}
              >
                {pollCreating ? '...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
};

export default SquadChat;
