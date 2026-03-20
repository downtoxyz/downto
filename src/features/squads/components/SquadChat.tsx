"use client";

import React, { useState, useEffect, useRef } from "react";
import * as db from "@/lib/db";
import { font, color } from "@/lib/styles";
import type { Squad } from "@/lib/ui-types";
import { logError } from "@/lib/logger";
import { parseNaturalDate, parseNaturalTime, parseDateToISO, formatTimeAgo } from "@/lib/utils";
import ChatHeader from "./ChatHeader";

const URL_RE = /(https?:\/\/[^\s<]+)/;

/** Split text into plain strings and clickable link elements */
const linkify = (text: string, isDark: boolean): React.ReactNode => {
  const parts = text.split(URL_RE);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    URL_RE.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: isDark ? "#000" : color.accent,
          textDecoration: "underline",
          textUnderlineOffset: 2,
          wordBreak: "break-all",
        }}
      >
        {part.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
      </a>
    ) : (
      part
    )
  );
};


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
  onVotePoll?: (pollId: string, optionIndex: number) => Promise<void>;
  onClosePoll?: (pollId: string) => Promise<void>;
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
  onVotePoll,
  onClosePoll,
  pendingJoinRequests,
  onRespondToJoinRequest,
}: SquadChatProps) => {
  const onSquadUpdateRef = useRef(onSquadUpdate);
  onSquadUpdateRef.current = onSquadUpdate;

  // Local messages state (decoupled from squad prop for realtime updates)
  const [messages, setMessages] = useState(squad.messages);

  // Local squad state for non-message fields (members, sizes, dates, etc.)
  const [localSquad, setLocalSquad] = useState(squad);

  const [newMsg, setNewMsg] = useState("");
  const [chatMentionQuery, setChatMentionQuery] = useState<string | null>(null);
  const [chatMentionIdx, setChatMentionIdx] = useState(-1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const msgInputRef = useRef<HTMLTextAreaElement>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showImOutConfirm, setShowImOutConfirm] = useState(false);
  const [kickTarget, setKickTarget] = useState<{ name: string; userId: string } | null>(null);
  const [memberMenu, setMemberMenu] = useState<{ name: string; userId: string } | null>(null);
  const [showSquadPopup, setShowSquadPopup] = useState(false);
  const [squadPopupView, setSquadPopupView] = useState<'menu' | 'members'>('menu');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerValue, setDatePickerValue] = useState("");
  const [settingDate, setSettingDate] = useState(false);
  const [dateLocked, setDateLocked] = useState(false);
  const [timeLocked, setTimeLocked] = useState(false);
  const [dateDismissed, setDateDismissed] = useState(false);
  const [timeDismissed, setTimeDismissed] = useState(false);
  const [dateConfirmStatus, setDateConfirmStatus] = useState<'yes' | 'no' | 'pending' | 'none'>('none');
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

  // Notify parent when chat opens/closes
  useEffect(() => {
    onChatOpen?.(true);
    return () => { onChatOpen?.(false); };
  }, [onChatOpen]);

  // Track visual viewport so the chat stays visible when the iOS keyboard opens
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      if (chatContainerRef.current) chatContainerRef.current.style.height = `${vv.height}px`;
      // Prevent iOS from scrolling the page when focusing input — keeps fixed positioning correct
      window.scrollTo(0, 0);
      // Scroll messages into view after keyboard resize
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "instant" }), 50);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  // Scroll to bottom when chat opens or messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
  }, [squad.id, messages.length]);

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
    }).catch(() => {});
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

  const chatOtherMembers = localSquad.members.filter((m) => m.name !== "You") ?? [];

  const handleSend = () => {
    if (!newMsg.trim()) return;
    const text = newMsg.trim();

    // Extract @mentioned user IDs
    const mentionedNames = [...text.matchAll(/@(\S+)/g)].map((m) => m[1].toLowerCase());
    const mentionedIds = chatOtherMembers
      .filter((m) => mentionedNames.some((n) =>
        m.name.toLowerCase() === n || m.name.split(' ')[0].toLowerCase() === n
      ))
      .map((m) => m.userId)
      .filter((id): id is string => !!id);

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
    setNewMsg("");
    setChatMentionQuery(null);
    setChatMentionIdx(-1);
    if (msgInputRef.current) msgInputRef.current.style.height = "auto";

    // Persist to DB
    if (localSquad.id && onSendMessage) {
      onSendMessage(localSquad.id, text, mentionedIds.length > 0 ? mentionedIds : undefined).catch((err) =>
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
    <div
      ref={chatContainerRef}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        background: color.bg,
        overflow: "hidden",
        transform: closing ? "translateX(100%)" : `translateX(${dragX}px)`,
        transition: closing ? "transform 0.25s ease-in" : (dragX === 0 ? "transform 0.3s ease-out" : "none"),
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
        onOpenDatePicker={() => {
          setShowDatePicker(true);
          setDatePickerValue("");
          setDateLocked(false);
          setTimeLocked(false);
          setDateDismissed(false);
          setTimeDismissed(false);
        }}
        onExtendSquad={async () => {
          try {
            const newExpiry = await db.extendSquad(localSquad.id);
            onSquadUpdate((prev) => prev.map((s) =>
              s.id === localSquad.id ? { ...s, expiresAt: newExpiry } : s
            ));
            setLocalSquad((prev) => ({ ...prev, expiresAt: newExpiry }));
          } catch {}
        }}
        canSetDate={!!onSetSquadDate}
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
          const isFirstInGroup = !sameSenderAsPrev;
          const isLastInGroup = !sameSenderAsNext;

          if (msg.sender === "system") {
            if (msg.messageType === 'date_confirm' && i === lastConfirmIdx) {
              return (
                <div key={i} style={{ textAlign: "center", padding: "8px 0" }}>
                  <span style={{ fontFamily: font.mono, fontSize: 10, color: color.dim }}>{msg.text}</span>
                  {confirmLoading && (
                    <div style={{ fontFamily: font.mono, fontSize: 10, color: color.faint, marginTop: 6 }}>...</div>
                  )}
                  {dateConfirmStatus === 'yes' && !confirmLoading && (
                    <div style={{ fontFamily: font.mono, fontSize: 10, color: color.accent, marginTop: 6 }}>
                      you&apos;re in
                    </div>
                  )}
                  {dateConfirmStatus === 'none' && !confirmLoading && (
                    <div style={{ fontFamily: font.mono, fontSize: 10, color: color.faint, marginTop: 6 }}>
                      waiting for responses
                    </div>
                  )}
                </div>
              );
            }

            if (msg.messageType === 'poll' && activePoll && msg.messageId === activePoll.messageId) {
              const uniqueVoters = new Set(pollVotes.map((v) => v.userId));
              const totalVoters = uniqueVoters.size;
              const myVotes = userId ? new Set(pollVotes.filter((v) => v.userId === userId).map((v) => v.optionIndex)) : new Set<number>();
              const isClosed = activePoll.status === 'closed';
              const isCreator = userId === activePoll.createdBy;
              return (
                <div key={i} ref={pollMessageRef} style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
                  <div style={{
                    background: color.card,
                    border: `1px solid ${color.borderMid}`,
                    borderRadius: 14,
                    padding: 16,
                    maxWidth: 300,
                    width: '100%',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 16 }}>📊</span>
                      <span style={{ fontFamily: font.serif, fontSize: 16, color: color.text }}>{activePoll.question}</span>
                    </div>
                    <div style={{ fontFamily: font.mono, fontSize: 10, color: color.faint, marginBottom: 10 }}>
                      {activePoll.multiSelect ? 'Select all that apply' : 'Pick one'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {activePoll.options.map((opt, oi) => {
                        const isMyVote = myVotes.has(oi);
                        const votersForOption = pollVotes.filter((v) => v.optionIndex === oi);
                        const count = votersForOption.length;
                        const pct = totalVoters > 0 ? Math.round((count / totalVoters) * 100) : 0;
                        const canVote = !isClosed && !localSquad.isWaitlisted;
                        return (
                          <div
                            key={oi}
                            onClick={canVote ? async () => {
                              if (!activePoll?.id || !userId) return;
                              setPollVotes((prev) => {
                                if (isMyVote) {
                                  return prev.filter((v) => !(v.userId === userId && v.optionIndex === oi));
                                }
                                if (activePoll.multiSelect) {
                                  return [...prev, { userId, optionIndex: oi, displayName: 'You' }];
                                }
                                return [...prev.filter((v) => v.userId !== userId), { userId, optionIndex: oi, displayName: 'You' }];
                              });
                              try { await onVotePoll?.(activePoll.id, oi); } catch {}
                            } : undefined}
                            style={{
                              position: 'relative',
                              border: isMyVote ? 'none' : `1px solid ${color.borderMid}`,
                              background: isMyVote ? color.accent : 'transparent',
                              borderRadius: 10,
                              padding: '8px 12px',
                              cursor: canVote ? 'pointer' : 'default',
                              overflow: 'hidden',
                            }}
                          >
                            {totalVoters > 0 && (
                              <div style={{
                                position: 'absolute',
                                left: 0, top: 0, bottom: 0,
                                width: `${pct}%`,
                                background: isMyVote ? 'rgba(0,0,0,0.1)' : `${color.accent}15`,
                                borderRadius: 10,
                                transition: 'width 0.3s ease',
                              }} />
                            )}
                            <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{
                                fontFamily: font.mono,
                                fontSize: 12,
                                color: isMyVote ? '#000' : color.text,
                                fontWeight: isMyVote ? 700 : 400,
                              }}>{opt}</span>
                              {totalVoters > 0 && (
                                <span style={{
                                  fontFamily: font.mono,
                                  fontSize: 10,
                                  color: isMyVote ? '#000' : color.dim,
                                  fontWeight: 700,
                                }}>{pct}%</span>
                              )}
                            </div>
                            {count > 0 && (
                              <div style={{
                                position: 'relative',
                                fontFamily: font.mono,
                                fontSize: 10,
                                color: isMyVote ? 'rgba(0,0,0,0.6)' : color.faint,
                                marginTop: 2,
                              }}>
                                {votersForOption.map((v) => v.userId === userId ? 'You' : v.displayName).join(', ')}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                      <span style={{ fontFamily: font.mono, fontSize: 10, color: color.faint }}>
                        {totalVoters} vote{totalVoters !== 1 ? 's' : ''}{isClosed ? ' · closed' : ''}
                      </span>
                      {isCreator && !isClosed && (
                        <button
                          onClick={async () => {
                            try {
                              await onClosePoll?.(activePoll.id);
                              setActivePoll((prev) => prev ? { ...prev, status: 'closed' } : prev);
                            } catch {}
                          }}
                          style={{
                            background: 'transparent',
                            border: `1px solid ${color.borderMid}`,
                            borderRadius: 8,
                            padding: '4px 10px',
                            fontFamily: font.mono,
                            fontSize: 10,
                            fontWeight: 700,
                            color: color.dim,
                            cursor: 'pointer',
                          }}
                        >
                          CLOSE POLL
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div key={i} style={{ textAlign: "center", padding: "4px 0" }}>
                <span style={{ fontFamily: font.mono, fontSize: 10, color: color.dim }}>{msg.text}</span>
              </div>
            );
          }

          return (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: msg.isYou ? "flex-end" : "flex-start",
                marginTop: isFirstInGroup ? 8 : 0,
              }}
            >
              {isFirstInGroup && !msg.isYou && (
                <span style={{ fontFamily: font.mono, fontSize: 10, color: color.dim, marginBottom: 3 }}>
                  {msg.sender}
                </span>
              )}
              <div
                className="select-text"
                style={{
                  background: msg.isYou ? color.accent : color.card,
                  color: msg.isYou ? "#000" : color.text,
                  padding: "8px 12px",
                  borderRadius: msg.isYou
                    ? `${isFirstInGroup ? 16 : 8}px 16px ${isLastInGroup ? 4 : 8}px 16px`
                    : `16px ${isFirstInGroup ? 16 : 8}px ${isLastInGroup ? 8 : 8}px ${isLastInGroup ? 4 : 8}px`,
                  fontFamily: font.mono,
                  fontSize: 13,
                  maxWidth: "80%",
                  lineHeight: 1.4,
                }}
              >
                {linkify(msg.text, !!msg.isYou)}
              </div>
              {isLastInGroup && (
                <span style={{ fontFamily: font.mono, fontSize: 9, color: color.faint, marginTop: 2 }}>
                  {msg.time}
                </span>
              )}
            </div>
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
        {dateConfirmStatus === 'pending' && !confirmLoading && (
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
        {/* @mention autocomplete */}
        {chatMentionQuery !== null && chatOtherMembers.length > 0 && (() => {
          const filtered = chatOtherMembers.filter((m) =>
            m.name.toLowerCase().includes(chatMentionQuery)
          );
          if (filtered.length === 0) return null;
          return (
            <div style={{ padding: "4px 20px", background: color.surface }}>
              <div style={{
                background: color.deep, border: `1px solid ${color.borderMid}`,
                borderRadius: 10, maxHeight: 120, overflowY: "auto",
              }}>
                {filtered.slice(0, 6).map((m) => (
                  <button
                    key={m.userId}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      const before = newMsg.slice(0, chatMentionIdx);
                      const after = newMsg.slice(chatMentionIdx + 1 + (chatMentionQuery?.length ?? 0));
                      setNewMsg(before + "@" + m.name + " " + after);
                      setChatMentionQuery(null);
                      setChatMentionIdx(-1);
                      msgInputRef.current?.focus();
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      width: "100%", padding: "8px 12px",
                      background: "transparent", border: "none", cursor: "pointer",
                      borderBottom: `1px solid ${color.border}`,
                    }}
                  >
                    <div style={{
                      width: 24, height: 24, borderRadius: "50%",
                      background: color.borderLight, color: color.dim,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: font.mono, fontSize: 10, fontWeight: 700,
                    }}>
                      {m.avatar}
                    </div>
                    <span style={{ fontFamily: font.mono, fontSize: 12, color: color.text }}>{m.name}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}
        {/* Input row */}
        <div
          style={{
            padding: "12px 20px calc(12px + env(safe-area-inset-bottom, 0px))",
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
          }}
        >
          {(!activePoll || activePoll.status === 'closed') && onCreatePoll && (
            <button
              onClick={() => setShowPollCreator(true)}
              style={{
                background: 'none', border: 'none', padding: 0,
                fontSize: 20, opacity: 0.6, cursor: 'pointer', lineHeight: 1, marginBottom: 8,
              }}
            >
              📊
            </button>
          )}
          <textarea
            ref={msgInputRef}
            value={newMsg}
            onChange={(e) => {
              const val = e.target.value;
              setNewMsg(val);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
              const cursor = e.target.selectionStart ?? val.length;
              const before = val.slice(0, cursor);
              const atMatch = before.match(/@([^\s@]*)$/);
              if (atMatch) {
                setChatMentionQuery(atMatch[1].toLowerCase());
                setChatMentionIdx(before.length - atMatch[0].length);
              } else {
                setChatMentionQuery(null);
                setChatMentionIdx(-1);
              }
            }}
            onKeyDown={(e) => {
              if (chatMentionQuery !== null && e.key === "Escape") {
                setChatMentionQuery(null);
                setChatMentionIdx(-1);
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            enterKeyHint="send"
            placeholder="Message..."
            rows={1}
            style={{
              flex: 1,
              background: color.card,
              border: `1px solid ${color.borderMid}`,
              borderRadius: 20,
              padding: "10px 16px",
              color: color.text,
              fontFamily: font.mono,
              fontSize: 16,
              outline: "none",
              resize: "none",
              maxHeight: 120,
              lineHeight: 1.4,
              overflowY: "auto",
            }}
          />
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleSend}
            disabled={!newMsg.trim()}
            style={{
              background: newMsg.trim() ? color.accent : color.borderMid,
              color: newMsg.trim() ? "#000" : color.dim,
              border: "none",
              borderRadius: "50%",
              width: 40,
              height: 40,
              cursor: newMsg.trim() ? "pointer" : "default",
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            ↑
          </button>
        </div>
      </div>
      )}
      </div>{/* end blur wrapper */}

      {/* Squad popup modal */}
      {showSquadPopup && (
        <div
          onClick={() => { setShowSquadPopup(false); setSquadPopupView('menu'); }}
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: color.deep,
              border: `1px solid ${color.border}`,
              borderRadius: 16,
              padding: "24px 20px",
              maxWidth: 300,
              width: "90%",
              maxHeight: "70vh",
              overflowY: "auto",
            }}
          >
            {squadPopupView === 'menu' ? (
              <>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
                    {localSquad.members.slice(0, 4).map((m, idx) => {
                      const isLocked = localSquad.dateStatus === 'locked';
                      const isProposed = localSquad.dateStatus === 'proposed';
                      const confirmResponse = m.userId ? dateConfirms.get(m.userId) : undefined;
                      const isConfirmed = isLocked || (isProposed && dateConfirms.size > 0 && confirmResponse === 'yes');
                      const isPending = isProposed && dateConfirms.size > 0 && confirmResponse !== 'yes';
                      const avatarBg = isConfirmed ? color.accent : isPending ? color.borderLight : m.name === "You" ? color.accent : color.borderLight;
                      const avatarColor = isConfirmed ? "#000" : isPending ? color.dim : m.name === "You" ? "#000" : color.dim;
                      return (
                        <div key={m.name} style={{
                          width: 24, height: 24, borderRadius: "50%",
                          background: avatarBg, color: avatarColor,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontFamily: font.mono, fontSize: 10, fontWeight: 700,
                          marginLeft: idx === 0 ? 0 : -6,
                          border: `2px solid ${color.deep}`,
                          position: "relative", zIndex: 4 - idx,
                        }}>
                          {m.avatar}
                        </div>
                      );
                    })}
                    {localSquad.members.length > 4 && (
                      <span style={{ fontFamily: font.mono, fontSize: 8, fontWeight: 700, color: color.dim, marginLeft: 4 }}>
                        +{localSquad.members.length - 4}
                      </span>
                    )}
                  </div>
                  <span style={{ fontFamily: font.mono, fontSize: 10, color: color.dim }}>
                    {localSquad.members.length}{localSquad.maxSquadSize != null ? `/${localSquad.maxSquadSize}` : ''} member{localSquad.members.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  <button
                    onClick={() => setSquadPopupView('members')}
                    style={{
                      background: "none", border: "none",
                      borderBottom: `1px solid ${color.border}`,
                      color: color.text, fontFamily: font.mono, fontSize: 12,
                      padding: "12px 0", cursor: "pointer", textAlign: "center",
                    }}
                  >
                    See members
                  </button>
                  {localSquad.checkId && onUpdateSquadSize && (
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      gap: 12, padding: "12px 0",
                      borderBottom: `1px solid ${color.border}`,
                    }}>
                      <span style={{ fontFamily: font.mono, fontSize: 12, color: color.text }}>Squad size</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button
                          onClick={() => {
                            const newSize = (localSquad.maxSquadSize ?? 5) - 1;
                            if (newSize >= localSquad.members.length) {
                              onUpdateSquadSize(localSquad.checkId!, newSize);
                              setLocalSquad((prev) => ({ ...prev, maxSquadSize: newSize }));
                              onSquadUpdate((prev: Squad[]) => prev.map((s) => s.id === localSquad.id ? { ...s, maxSquadSize: newSize } : s));
                            }
                          }}
                          disabled={(localSquad.maxSquadSize ?? 5) <= localSquad.members.length}
                          style={{
                            width: 24, height: 24, borderRadius: 6,
                            border: `1px solid ${color.borderMid}`, background: "none",
                            color: (localSquad.maxSquadSize ?? 5) <= localSquad.members.length ? color.faint : color.text,
                            fontFamily: font.mono, fontSize: 14,
                            cursor: (localSquad.maxSquadSize ?? 5) <= localSquad.members.length ? "default" : "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                          }}
                        >
                          −
                        </button>
                        <span style={{ fontFamily: font.mono, fontSize: 13, color: color.accent, fontWeight: 700, minWidth: 20, textAlign: "center" }}>
                          {localSquad.maxSquadSize ?? 5}
                        </span>
                        <button
                          onClick={() => {
                            const newSize = (localSquad.maxSquadSize ?? 5) + 1;
                            if (newSize <= 20) {
                              onUpdateSquadSize(localSquad.checkId!, newSize);
                              setLocalSquad((prev) => ({ ...prev, maxSquadSize: newSize }));
                              onSquadUpdate((prev: Squad[]) => prev.map((s) => s.id === localSquad.id ? { ...s, maxSquadSize: newSize } : s));
                            }
                          }}
                          disabled={(localSquad.maxSquadSize ?? 5) >= 20}
                          style={{
                            width: 24, height: 24, borderRadius: 6,
                            border: `1px solid ${color.borderMid}`, background: "none",
                            color: (localSquad.maxSquadSize ?? 5) >= 20 ? color.faint : color.text,
                            fontFamily: font.mono, fontSize: 14,
                            cursor: (localSquad.maxSquadSize ?? 5) >= 20 ? "default" : "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )}
                  {onSetSquadDate && (
                    <button
                      onClick={() => {
                        setShowSquadPopup(false);
                        setSquadPopupView('menu');
                        setShowDatePicker(true);
                        const dateLabel = localSquad.eventIsoDate
                          ? new Date(localSquad.eventIsoDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                          : "";
                        setDatePickerValue(dateLabel);
                        setDateLocked(false);
                        setTimeLocked(false);
                        setDateDismissed(false);
                        setTimeDismissed(false);
                      }}
                      style={{
                        background: "none", border: "none",
                        borderBottom: `1px solid ${color.border}`,
                        color: color.text, fontFamily: font.mono, fontSize: 12,
                        padding: "12px 0", cursor: "pointer", textAlign: "center",
                      }}
                    >
                      Set plans
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowSquadPopup(false);
                      setSquadPopupView('menu');
                      setShowLeaveConfirm(true);
                    }}
                    style={{
                      background: "none", border: "none", color: "#ff4444",
                      fontFamily: font.mono, fontSize: 12,
                      padding: "12px 0", cursor: "pointer", textAlign: "center",
                    }}
                  >
                    Leave
                  </button>
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={() => setSquadPopupView('menu')}
                  style={{
                    background: "none", border: "none", color: color.accent,
                    fontFamily: font.mono, fontSize: 12, cursor: "pointer",
                    padding: 0, marginBottom: 16,
                  }}
                >
                  ← Back
                </button>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {localSquad.members.map((m) => {
                    const isLocked = localSquad.dateStatus === 'locked';
                    const isProposed = localSquad.dateStatus === 'proposed';
                    const confirmResponse = m.userId ? dateConfirms.get(m.userId) : undefined;
                    const isConfirmed = isLocked || (isProposed && dateConfirms.size > 0 && confirmResponse === 'yes');
                    const isGrayed = isProposed && dateConfirms.size > 0 && !isConfirmed;
                    return (
                    <React.Fragment key={m.name}>
                    <div
                      onClick={() => {
                        if (m.name !== "You" && m.userId) {
                          setShowSquadPopup(false);
                          setSquadPopupView('menu');
                          onViewProfile?.(m.userId);
                        }
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        cursor: m.name !== "You" && m.userId ? "pointer" : "default",
                        opacity: isGrayed ? 0.35 : 1,
                      }}
                    >
                      <div style={{
                        width: 28, height: 28, borderRadius: "50%",
                        background: isConfirmed ? color.accent : (m.name === "You" && !isGrayed) ? color.accent : color.borderLight,
                        color: isConfirmed || (m.name === "You" && !isGrayed) ? "#000" : color.dim,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontFamily: font.mono, fontSize: 11, fontWeight: 700, flexShrink: 0,
                      }}>
                        {m.avatar}
                      </div>
                      <span style={{ fontFamily: font.mono, fontSize: 12, color: isGrayed ? color.faint : color.text }}>
                        {m.name}
                      </span>
                      {m.name === "You" && (
                        <span style={{ fontFamily: font.mono, fontSize: 10, color: color.dim }}>you</span>
                      )}
                      {(m.name === "You" || !(onSetMemberRole || onKickMember)) && (isLocked || (isProposed && dateConfirms.size > 0)) && (
                        <span style={{ fontFamily: font.mono, fontSize: 10, color: isConfirmed ? color.accent : color.faint, marginLeft: "auto" }}>
                          {isConfirmed ? "down" : confirmResponse === 'no' ? "out" : "pending"}
                        </span>
                      )}
                      {m.name !== "You" && m.userId && (onSetMemberRole || onKickMember) && (
                        <div style={{ display: "flex", gap: 8, marginLeft: "auto", alignItems: "center" }}>
                          {(isLocked || (isProposed && dateConfirms.size > 0)) && (
                            <span style={{ fontFamily: font.mono, fontSize: 10, color: isConfirmed ? color.accent : color.faint }}>
                              {isConfirmed ? "down" : confirmResponse === 'no' ? "out" : "pending"}
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMemberMenu(memberMenu?.userId === m.userId ? null : { name: m.name, userId: m.userId! });
                            }}
                            style={{
                              background: "none", border: "none", color: color.faint,
                              fontFamily: font.mono, fontSize: 14, cursor: "pointer",
                              padding: "2px 4px", letterSpacing: "0.1em",
                            }}
                          >
                            •••
                          </button>
                        </div>
                      )}
                    </div>
                    {memberMenu?.userId === m.userId && (
                      <div style={{
                        background: color.deep, border: `1px solid ${color.border}`,
                        borderRadius: 10, padding: "4px 0", marginTop: 4, marginLeft: 38,
                      }}>
                        {onSetMemberRole && (
                          <button
                            onClick={async () => {
                              setMemberMenu(null);
                              setShowSquadPopup(false);
                              setSquadPopupView('menu');
                              await onSetMemberRole(localSquad.id, m.userId!, 'waitlist');
                              const updated = {
                                ...localSquad,
                                members: localSquad.members.filter((x) => x.userId !== m.userId),
                                waitlistedMembers: [...(localSquad.waitlistedMembers ?? []), { name: m.name, avatar: m.avatar, userId: m.userId! }],
                              };
                              setLocalSquad(updated);
                              onSquadUpdate((prev: Squad[]) => prev.map((s) => s.id === localSquad.id ? updated : s));
                            }}
                            style={{
                              display: "block", width: "100%", background: "none", border: "none",
                              color: color.muted, fontFamily: font.mono, fontSize: 11,
                              padding: "8px 14px", cursor: "pointer", textAlign: "left",
                            }}
                          >
                            Move to waitlist
                          </button>
                        )}
                        {onKickMember && (
                          <button
                            onClick={() => {
                              setMemberMenu(null);
                              setShowSquadPopup(false);
                              setSquadPopupView('menu');
                              setKickTarget({ name: m.name, userId: m.userId! });
                            }}
                            style={{
                              display: "block", width: "100%", background: "none", border: "none",
                              color: "#ff4444", fontFamily: font.mono, fontSize: 11,
                              padding: "8px 14px", cursor: "pointer", textAlign: "left",
                            }}
                          >
                            Kick from squad
                          </button>
                        )}
                      </div>
                    )}
                    </React.Fragment>
                    );
                  })}
                </div>

                {localSquad.waitlistedMembers && localSquad.waitlistedMembers.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <span style={{ fontFamily: font.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", color: color.dim }}>
                      Waitlist
                    </span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
                      {localSquad.waitlistedMembers.map((m) => (
                        <div
                          key={m.userId}
                          onClick={() => {
                            if (m.userId) {
                              setShowSquadPopup(false);
                              setSquadPopupView('menu');
                              onViewProfile?.(m.userId);
                            }
                          }}
                          style={{ display: "flex", alignItems: "center", gap: 10, cursor: m.userId ? "pointer" : "default" }}
                        >
                          <div style={{
                            width: 28, height: 28, borderRadius: "50%",
                            background: color.borderLight, color: color.dim,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontFamily: font.mono, fontSize: 11, fontWeight: 700, flexShrink: 0,
                          }}>
                            {m.avatar}
                          </div>
                          <span style={{ fontFamily: font.mono, fontSize: 12, color: color.muted, flex: 1 }}>{m.name}</span>
                          {onSetMemberRole && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                const isFull = localSquad.members.length >= (localSquad.maxSquadSize ?? Infinity);
                                if (isFull) return;
                                await onSetMemberRole(localSquad.id, m.userId, 'member');
                                const updated = {
                                  ...localSquad,
                                  members: [...localSquad.members, { name: m.name, avatar: m.avatar, userId: m.userId }],
                                  waitlistedMembers: (localSquad.waitlistedMembers ?? []).filter((x) => x.userId !== m.userId),
                                };
                                setLocalSquad(updated);
                                onSquadUpdate((prev: Squad[]) => prev.map((s) => s.id === localSquad.id ? updated : s));
                              }}
                              disabled={localSquad.members.length >= (localSquad.maxSquadSize ?? Infinity)}
                              style={{
                                background: "none", border: `1px solid ${color.borderMid}`,
                                borderRadius: 8,
                                color: localSquad.members.length >= (localSquad.maxSquadSize ?? Infinity) ? color.faint : color.accent,
                                fontFamily: font.mono, fontSize: 11, fontWeight: 700,
                                padding: "4px 10px",
                                cursor: localSquad.members.length >= (localSquad.maxSquadSize ?? Infinity) ? "default" : "pointer",
                              }}
                            >
                              Promote
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {localSquad.downResponders && localSquad.downResponders.length > 0 &&
                  localSquad.members.length < (localSquad.maxSquadSize ?? Infinity) && (
                  <div style={{ marginTop: 16 }}>
                    <span style={{ fontFamily: font.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", color: color.dim }}>
                      Down on check
                    </span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
                      {localSquad.downResponders.map((p) => (
                        <div key={p.userId} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: "50%",
                            background: color.borderLight, color: color.dim,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontFamily: font.mono, fontSize: 11, fontWeight: 700, flexShrink: 0,
                          }}>
                            {p.avatar}
                          </div>
                          <span style={{ fontFamily: font.mono, fontSize: 12, color: color.text, flex: 1 }}>{p.name}</span>
                          {onAddMember && (
                            <button
                              onClick={async () => {
                                await onAddMember(localSquad.id, p.userId);
                                const newMember = { name: p.name, avatar: p.avatar, userId: p.userId };
                                const updated = {
                                  ...localSquad,
                                  members: [...localSquad.members, newMember],
                                  downResponders: localSquad.downResponders?.filter((d) => d.userId !== p.userId),
                                };
                                setLocalSquad(updated);
                                onSquadUpdate((prev: Squad[]) => prev.map((s) => s.id === localSquad.id ? updated : s));
                              }}
                              style={{
                                background: "none", border: `1px solid ${color.borderMid}`,
                                borderRadius: 8, color: color.accent,
                                fontFamily: font.mono, fontSize: 11, fontWeight: 700,
                                padding: "4px 10px", cursor: "pointer",
                              }}
                            >
                              Add
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
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
  );
};

export default SquadChat;
