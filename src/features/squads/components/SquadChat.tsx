"use client";

import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import * as db from "@/lib/db";
import { font, color } from "@/lib/styles";
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [entering, setEntering] = useState(true);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showImOutConfirm, setShowImOutConfirm] = useState(false);
  const [kickTarget, setKickTarget] = useState<{ name: string; userId: string } | null>(null);
  const [showSquadPopup, setShowSquadPopup] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerValue, setDatePickerValue] = useState("");
  const [settingDate, setSettingDate] = useState(false);
  const [dateLocked, setDateLocked] = useState(false);
  const [timeLocked, setTimeLocked] = useState(false);
  const [dateDismissed, setDateDismissed] = useState(false);
  const [timeDismissed, setTimeDismissed] = useState(false);
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

  // Notify parent when chat opens/closes + block scroll-through on iOS PWA
  useEffect(() => {
    onChatOpen?.(true);
    const blockTouch = (e: TouchEvent) => {
      const target = e.target as Node;
      // Find the nearest scrollable ancestor inside the chat
      let el = target instanceof Element ? target : target.parentElement;
      while (el && el !== chatContainerRef.current) {
        const style = window.getComputedStyle(el);
        const isScrollable = (style.overflowY === "auto" || style.overflowY === "scroll") && el.scrollHeight > el.clientHeight;
        if (isScrollable) return; // allow scroll inside scrollable areas (messages list)
        el = el.parentElement;
      }
      // No scrollable ancestor found — block to prevent underlying page scroll
      e.preventDefault();
    };
    document.addEventListener("touchmove", blockTouch, { passive: false });
    return () => {
      onChatOpen?.(false);
      document.removeEventListener("touchmove", blockTouch);
    };
  }, [onChatOpen]);

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
        window.scrollTo(0, 0);
        { const p = messagesEndRef.current?.parentElement; if (p) p.scrollTop = p.scrollHeight; }
      } else {
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
        sender: msg.is_system || !msg.sender_id ? "system" : (msg.sender_id === userId ? "You" : (msg.sender?.display_name ?? "Unknown")),
        text: msg.text,
        time: formatTimeAgo(new Date(msg.created_at)),
        isYou: msg.sender_id === userId,
        ...(msg.message_type === 'date_confirm' ? { messageType: 'date_confirm' as const, messageId: msg.id } : {}),
        ...(msg.message_type === 'poll' ? { messageType: 'poll' as const, messageId: msg.id } : {}),
      }));
      const last = msgs.length > 0 ? msgs[msgs.length - 1] : null;
      setMessages(msgs);
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
      setMessages((prev) => [...prev, msg]);
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
    <div style={{
      position: "fixed", inset: 0, background: color.bg, zIndex: 49,
      transform: (closing || entering) ? "translateX(100%)" : `translateX(${dragX}px)`,
      transition: closing ? "transform 0.25s ease-in" : (entering || dragX === 0) ? "transform 0.3s ease-out" : "none",
    }} />
    <div
      ref={chatContainerRef}
      style={{
        display: "flex",
        flexDirection: "column",
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "100dvh",
        zIndex: 50,
        background: color.bg,
        overflow: "hidden",
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
        hasOpenModal={showSquadPopup || showDatePicker}
        onBack={onClose}
        onOpenSettings={() => setShowSquadPopup(true)}
      />

      {/* Leave squad confirmation */}
      {showLeaveConfirm && (
        <div
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => setShowLeaveConfirm(false)}
        >
          <div
            style={{
              background: color.deep,
              border: `1px solid ${color.border}`,
              borderRadius: 16,
              padding: "24px 20px",
              maxWidth: 300,
              width: "90%",
              textAlign: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ fontFamily: font.serif, fontSize: 18, color: color.text, marginBottom: 6 }}>
              Leave {localSquad.name}?
            </p>
            <p style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, marginBottom: 20 }}>
              You won&apos;t see messages from this squad anymore.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setShowLeaveConfirm(false)}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  background: "none",
                  border: `1px solid ${color.border}`,
                  borderRadius: 10,
                  color: color.text,
                  fontFamily: font.mono,
                  fontSize: 12,
                  cursor: "pointer",
                }}
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
                style={{
                  flex: 1,
                  padding: "10px 0",
                  background: "#ff4444",
                  border: "none",
                  borderRadius: 10,
                  color: "#fff",
                  fontFamily: font.mono,
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: 700,
                }}
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
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => setShowImOutConfirm(false)}
        >
          <div
            style={{
              background: color.deep,
              border: `1px solid ${color.border}`,
              borderRadius: 16,
              padding: "24px 20px",
              maxWidth: 300,
              width: "90%",
              textAlign: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ fontFamily: font.serif, fontSize: 18, color: color.text, marginBottom: 6 }}>
              Can&apos;t make it?
            </p>
            <p style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, marginBottom: 20 }}>
              You&apos;ll be removed from this squad and lose access to the chat.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setShowImOutConfirm(false)}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  background: "none",
                  border: `1px solid ${color.border}`,
                  borderRadius: 10,
                  color: color.text,
                  fontFamily: font.mono,
                  fontSize: 12,
                  cursor: "pointer",
                }}
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
                style={{
                  flex: 1,
                  padding: "10px 0",
                  background: "#ff4444",
                  border: "none",
                  borderRadius: 10,
                  color: "#fff",
                  fontFamily: font.mono,
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: 700,
                }}
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
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => setKickTarget(null)}
        >
          <div
            style={{
              background: color.deep,
              border: `1px solid ${color.border}`,
              borderRadius: 16,
              padding: "24px 20px",
              maxWidth: 300,
              width: "90%",
              textAlign: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ fontFamily: font.serif, fontSize: 18, color: color.text, marginBottom: 6 }}>
              Kick {kickTarget.name}?
            </p>
            <p style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, marginBottom: 20 }}>
              they&apos;ll be removed from the squad. no take-backs (jk you can re-add them)
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setKickTarget(null)}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  background: "none",
                  border: `1px solid ${color.border}`,
                  borderRadius: 10,
                  color: color.text,
                  fontFamily: font.mono,
                  fontSize: 12,
                  cursor: "pointer",
                }}
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
                style={{
                  flex: 1,
                  padding: "10px 0",
                  background: "#ff4444",
                  border: "none",
                  borderRadius: 10,
                  color: "#fff",
                  fontFamily: font.mono,
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Yeet 🥾
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Date picker modal */}
      {showDatePicker && (() => {
        const natural = parseNaturalDate(datePickerValue);
        const parsedISO = natural?.iso ?? parseDateToISO(datePickerValue);
        const parsedLabel = natural?.label ?? (parsedISO
          ? new Date(parsedISO + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
          : null);
        const detectedTime = parseNaturalTime(datePickerValue);
        const isValid = !!parsedISO;
        const hasDate = !!parsedLabel && !dateDismissed;
        const hasTime = !!detectedTime && !timeDismissed;
        const bothLocked = hasDate && dateLocked && hasTime && timeLocked;
        const submitLabel = settingDate ? "..." : (bothLocked ? "Lock it in" : "Propose");
        return (
          <div
            style={{
              position: "fixed",
              top: 0, left: 0, right: 0, bottom: 0,
              background: "rgba(0,0,0,0.3)",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              paddingTop: "20vh",
              zIndex: 9999,
            }}
            onClick={() => setShowDatePicker(false)}
          >
            <div
              style={{
                background: color.deep,
                border: `1px solid ${color.border}`,
                borderRadius: 16,
                padding: "24px 20px",
                maxWidth: 300,
                width: "90%",
                textAlign: "center",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <p style={{ fontFamily: font.serif, fontSize: 18, color: color.text, marginBottom: 6 }}>
                Set date &amp; time
              </p>
              <p style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, marginBottom: 16 }}>
                Lock in when this is happening
              </p>
              <input
                type="text"
                value={datePickerValue}
                onChange={(e) => setDatePickerValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && isValid && !settingDate) {
                    e.preventDefault();
                    (e.target as HTMLInputElement).closest("div")?.querySelector<HTMLButtonElement>("button:last-child")?.click();
                  }
                }}
                placeholder="e.g. friday at 7pm, mar 7, tomorrow"
                autoFocus
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  background: color.card,
                  border: `1px solid ${isValid ? color.accent : color.border}`,
                  borderRadius: 10,
                  padding: "10px 12px",
                  color: color.text,
                  fontFamily: font.mono,
                  fontSize: 13,
                  outline: "none",
                  marginBottom: (hasDate || hasTime) ? 8 : 16,
                }}
              />
              {(hasDate || hasTime) && (
                <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", marginBottom: 12 }}>
                  {hasDate && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 10px",
                        background: dateLocked ? "rgba(232,255,90,0.08)" : "transparent",
                        borderRadius: 8,
                        border: dateLocked ? "1px solid rgba(232,255,90,0.2)" : "1px dashed rgba(232,255,90,0.35)",
                        userSelect: "none",
                      }}
                    >
                      <span style={{ fontFamily: font.mono, fontSize: 11, color: color.accent, fontWeight: 600 }}>
                        📅 {parsedLabel}
                      </span>
                      <button
                        onClick={() => setDateLocked((v) => !v)}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          fontFamily: font.mono,
                          fontSize: 9,
                          color: dateLocked ? color.accent : color.dim,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {dateLocked ? "locked" : "flexible"}
                      </button>
                    </div>
                  )}
                  {hasTime && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 10px",
                        background: timeLocked ? "rgba(232,255,90,0.08)" : "transparent",
                        borderRadius: 8,
                        border: timeLocked ? "1px solid rgba(232,255,90,0.2)" : "1px dashed rgba(232,255,90,0.35)",
                        userSelect: "none",
                      }}
                    >
                      <span style={{ fontFamily: font.mono, fontSize: 11, color: color.accent, fontWeight: 600 }}>
                        🕐 {detectedTime}
                      </span>
                      <button
                        onClick={() => setTimeLocked((v) => !v)}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          fontFamily: font.mono,
                          fontSize: 9,
                          color: timeLocked ? color.accent : color.dim,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {timeLocked ? "locked" : "flexible"}
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => setShowDatePicker(false)}
                  style={{
                    flex: 1,
                    padding: "10px 0",
                    background: "none",
                    border: `1px solid ${color.border}`,
                    borderRadius: 10,
                    color: color.text,
                    fontFamily: font.mono,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  disabled={!isValid || settingDate}
                  onClick={async () => {
                    if (!parsedISO || !localSquad?.id || !onSetSquadDate) return;
                    setSettingDate(true);
                    try {
                      await onSetSquadDate(localSquad.id, parsedISO, detectedTime, bothLocked);
                      setLocalSquad((prev) => ({
                        ...prev,
                        eventIsoDate: parsedISO,
                        eventTime: detectedTime ?? prev.eventTime,
                        dateFlexible: !dateLocked,
                        timeFlexible: !timeLocked,
                        dateStatus: bothLocked ? 'locked' : 'proposed',
                        graceStartedAt: undefined,
                      }));
                      setShowDatePicker(false);
                    } catch {
                      // Error handled by parent
                    } finally {
                      setSettingDate(false);
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: "10px 0",
                    background: isValid && !settingDate ? color.accent : color.borderMid,
                    border: "none",
                    borderRadius: 10,
                    color: isValid && !settingDate ? "#000" : color.dim,
                    fontFamily: font.mono,
                    fontSize: 12,
                    cursor: isValid && !settingDate ? "pointer" : "default",
                    fontWeight: 700,
                  }}
                >
                  {submitLabel}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Messages + Input blur wrapper */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        filter: (showSquadPopup || showDatePicker) ? 'blur(4px)' : 'none',
        opacity: (showSquadPopup || showDatePicker) ? 0.3 : 1,
        pointerEvents: (showSquadPopup || showDatePicker) ? 'none' : 'auto',
        transition: 'filter 0.2s, opacity 0.2s',
        minHeight: 0,
      }}>
      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: dragX > 0 ? "hidden" : "auto",
          padding: "12px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
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
        <div
          style={{
            padding: "12px 20px calc(12px + env(safe-area-inset-bottom, 0px))",
            borderTop: `1px solid ${color.border}`,
            textAlign: "center",
          }}
        >
          <span style={{ fontFamily: font.mono, fontSize: 11, color: color.faint }}>
            You&apos;re on the waitlist — read only
          </span>
        </div>
      ) : (
      <div style={{ borderTop: `1px solid ${color.border}` }}>
        {/* Sticky date confirm bar */}
        {(dateConfirmStatus === 'pending' || (dateConfirmStatus === 'loading' && localSquad.dateStatus === 'proposed')) && !confirmLoading && (
          <div style={{
            borderTop: `1px solid ${color.border}`,
            padding: '12px 20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
            background: color.card,
          }}>
            <span style={{ fontFamily: font.mono, fontSize: 10, color: color.dim }}>
              are you still down?
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
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
                style={{
                  background: color.accent,
                  color: '#000',
                  border: 'none',
                  borderRadius: 10,
                  padding: '6px 16px',
                  fontFamily: font.mono,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                STILL DOWN
              </button>
              <button
                onClick={() => setShowImOutConfirm(true)}
                style={{
                  background: 'transparent',
                  color: color.text,
                  border: `1px solid ${color.borderMid}`,
                  borderRadius: 10,
                  padding: '6px 16px',
                  fontFamily: font.mono,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
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
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 20px', cursor: 'pointer' }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: color.card,
              border: `1px solid ${color.accent}`,
              borderRadius: 20,
              padding: '6px 12px',
              flex: 1,
              minWidth: 0,
            }}>
              <span style={{ fontSize: 12, flexShrink: 0 }}>📊</span>
              <span style={{
                fontFamily: font.mono,
                fontSize: 11,
                color: color.text,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}>{activePoll.question}</span>
              <span style={{
                fontFamily: font.mono,
                fontSize: 10,
                fontWeight: 700,
                color: color.accent,
                flexShrink: 0,
              }}>{new Set(pollVotes.map((v) => v.userId)).size}</span>
            </div>
          </div>
        )}
        {/* Join request banners */}
        {pendingJoinRequests && onRespondToJoinRequest && localSquad && pendingJoinRequests
          .filter((r) => r.squadId === localSquad.id)
          .map((r) => (
            <div
              key={r.userId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 20px",
                borderTop: `1px solid ${color.border}`,
              }}
            >
              <div style={{
                width: 24, height: 24, borderRadius: "50%",
                background: color.borderLight, color: color.dim,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: font.mono, fontSize: 10, fontWeight: 700, flexShrink: 0,
              }}>
                {r.avatar}
              </div>
              <span style={{ fontFamily: font.mono, fontSize: 11, color: color.accent, flex: 1, minWidth: 0 }}>
                {r.name} wants to join
              </span>
              <button
                onClick={() => onRespondToJoinRequest(r.squadId, r.userId, true)}
                style={{
                  background: color.accent, color: "#000", border: "none",
                  borderRadius: 8, padding: "6px 12px",
                  fontFamily: font.mono, fontSize: 10, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer",
                }}
              >
                Accept
              </button>
              <button
                onClick={() => onRespondToJoinRequest(r.squadId, r.userId, false)}
                style={{
                  background: "transparent", color: color.dim,
                  border: `1px solid ${color.borderMid}`,
                  borderRadius: 8, padding: "6px 12px",
                  fontFamily: font.mono, fontSize: 10, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer",
                }}
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
          onOpenDatePicker={onSetSquadDate ? () => {
            setShowSquadPopup(false);
            const dateLabel = localSquad.eventIsoDate
              ? new Date(localSquad.eventIsoDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
              : "";
            setDatePickerValue(dateLabel);
            setDateLocked(false);
            setTimeLocked(false);
            setDateDismissed(false);
            setTimeDismissed(false);
            setShowDatePicker(true);
          } : undefined}
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
          style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: color.deep, border: `1px solid ${color.border}`,
              borderRadius: 16, padding: "24px 20px", maxWidth: 340, width: "90%",
            }}
          >
            <h3 style={{ fontFamily: font.serif, fontSize: 18, color: color.text, marginBottom: 16, textAlign: 'center' }}>
              Create a poll
            </h3>
            <input
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              placeholder="What's the question?"
              style={{
                width: '100%', background: color.card,
                border: `1px solid ${color.borderMid}`, borderRadius: 10,
                padding: '10px 12px', color: color.text,
                fontFamily: font.mono, fontSize: 13, outline: 'none',
                marginBottom: 12, boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {pollOptions.map((opt, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    value={opt}
                    onChange={(e) => {
                      const next = [...pollOptions];
                      next[i] = e.target.value;
                      setPollOptions(next);
                    }}
                    placeholder={`Option ${i + 1}`}
                    style={{
                      flex: 1, background: color.card,
                      border: `1px solid ${color.borderMid}`, borderRadius: 10,
                      padding: '8px 12px', color: color.text,
                      fontFamily: font.mono, fontSize: 12, outline: 'none',
                    }}
                  />
                  {pollOptions.length > 2 && (
                    <button
                      onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}
                      style={{
                        background: 'none', border: 'none', color: color.faint,
                        fontFamily: font.mono, fontSize: 16, cursor: 'pointer', padding: '0 4px',
                      }}
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
                style={{
                  background: 'none', border: `1px solid ${color.borderMid}`,
                  borderRadius: 10, padding: '6px 12px', color: color.dim,
                  fontFamily: font.mono, fontSize: 11, cursor: 'pointer',
                  width: '100%', marginBottom: 16,
                }}
              >
                + Add option
              </button>
            )}
            <div
              onClick={() => setPollMultiSelect(!pollMultiSelect)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 0', marginBottom: 12, cursor: 'pointer',
              }}
            >
              <span style={{ fontFamily: font.mono, fontSize: 11, color: color.dim }}>Allow multiple selections</span>
              <div style={{
                width: 36, height: 20, borderRadius: 10,
                background: pollMultiSelect ? color.accent : color.borderMid,
                position: 'relative', transition: 'background 0.2s',
              }}>
                <div style={{
                  width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: 2, left: pollMultiSelect ? 18 : 2, transition: 'left 0.2s',
                }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setShowPollCreator(false); setPollQuestion(""); setPollOptions(["", ""]); setPollMultiSelect(true); }}
                style={{
                  flex: 1, background: 'transparent', color: color.text,
                  border: `1px solid ${color.borderMid}`, borderRadius: 12, padding: '12px',
                  fontFamily: font.mono, fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em',
                }}
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
                style={{
                  flex: 1,
                  background: (!pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2) ? color.borderMid : color.accent,
                  color: (!pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2) ? color.dim : '#000',
                  border: 'none', borderRadius: 12, padding: '12px',
                  fontFamily: font.mono, fontSize: 12, fontWeight: 700,
                  cursor: (!pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2) ? 'default' : 'pointer',
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                }}
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
