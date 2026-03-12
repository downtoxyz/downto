"use client";

import React, { useState, useEffect, useRef } from "react";
import * as db from "@/lib/db";
import { font, color } from "@/lib/styles";
import type { Squad } from "@/lib/ui-types";
import { logError } from "@/lib/logger";
import { parseNaturalDate, parseNaturalTime, parseDateToISO, formatTimeAgo } from "@/lib/utils";

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

const formatExpiryShort = (expiresAt?: string): string | null => {
  if (!expiresAt) return null;
  const msRemaining = new Date(expiresAt).getTime() - Date.now();
  if (msRemaining <= 0) return "!";
  const hours = Math.floor(msRemaining / (1000 * 60 * 60));
  if (hours > 24) return `${Math.floor(hours / 24)}d`;
  if (hours > 0) return `${hours}h`;
  return `${Math.floor(msRemaining / (1000 * 60))}m`;
};

const formatExpiryLabel = (expiresAt?: string, graceStartedAt?: string): string | null => {
  if (!expiresAt) return null;
  const now = Date.now();
  const expires = new Date(expiresAt).getTime();
  const msRemaining = expires - now;
  if (msRemaining <= 0) return "expiring soon";
  if (graceStartedAt) return "set a date to keep this going";
  const hours = Math.floor(msRemaining / (1000 * 60 * 60));
  const mins = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `chat expires in ${days}d`;
  }
  if (hours > 0) return `chat expires in ${hours}h`;
  return `chat expires in ${mins}m`;
};

const GroupsView = ({
  squads,
  onSquadUpdate,
  autoSelectSquadId,
  clearAutoSelectSquadId,
  onSendMessage,
  onLeaveSquad,
  onSetSquadDate,
  onClearSquadDate,
  onConfirmDate,
  userId,
  onViewProfile,
  onChatOpen,
  onBack,
  onUpdateSquadSize,
  onAddMember,
  onSetMemberRole,
  onKickMember,
  onSquadRead,
}: {
  squads: Squad[];
  onSquadUpdate: (squadsOrUpdater: Squad[] | ((prev: Squad[]) => Squad[])) => void;
  autoSelectSquadId?: string | null;
  clearAutoSelectSquadId?: () => void;
  onSendMessage?: (squadDbId: string, text: string) => Promise<void>;
  onLeaveSquad?: (squadDbId: string) => Promise<void>;
  onSetSquadDate?: (squadDbId: string, date: string, time?: string | null, locked?: boolean) => Promise<void>;
  onClearSquadDate?: (squadDbId: string) => Promise<void>;
  onConfirmDate?: (squadDbId: string, response: 'yes' | 'no') => Promise<void>;
  userId?: string | null;
  onViewProfile?: (userId: string) => void;
  onChatOpen?: (open: boolean) => void;
  onBack?: () => void;
  onUpdateSquadSize?: (checkId: string, newSize: number) => Promise<void>;
  onAddMember?: (squadId: string, userId: string) => Promise<void>;
  onSetMemberRole?: (squadId: string, userId: string, role: 'member' | 'waitlist') => Promise<void>;
  onKickMember?: (squadId: string, userId: string) => Promise<void>;
  onSquadRead?: () => void;
}) => {
  const onSquadUpdateRef = useRef(onSquadUpdate);
  onSquadUpdateRef.current = onSquadUpdate;
  const [selectedSquad, setSelectedSquad] = useState<Squad | null>(null);
  const [newMsg, setNewMsg] = useState("");
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
  const [chatHeight, setChatHeight] = useState<string>("100dvh");

  // Track visual viewport so the chat stays visible when the iOS keyboard opens
  useEffect(() => {
    if (!selectedSquad) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setChatHeight(`${vv.height}px`);
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
  }, [selectedSquad?.id]);

  useEffect(() => {
    if (autoSelectSquadId != null) {
      const squad = squads.find((s) => s.id === autoSelectSquadId);
      if (squad) setSelectedSquad(squad);
      clearAutoSelectSquadId?.();
    }
  }, [autoSelectSquadId]);

  // Scroll to bottom when chat opens or messages change
  useEffect(() => {
    if (selectedSquad) {
      messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [selectedSquad?.id, selectedSquad?.messages.length]);

  // Notify parent when chat is open/closed (or component unmounts)
  const chatVisible = !!selectedSquad;
  useEffect(() => {
    onChatOpen?.(chatVisible);
    return () => { onChatOpen?.(false); };
  }, [chatVisible, onChatOpen]);

  // Lock body scroll when chat overlay is visible
  useEffect(() => {
    if (chatVisible) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [chatVisible]);

  // Load date confirm status when entering a squad with a proposed date
  useEffect(() => {
    if (!selectedSquad?.id || selectedSquad.dateStatus !== 'proposed' || !userId) {
      setDateConfirmStatus('none');
      setDateConfirms(new Map());
      return;
    }
    db.getDateConfirms(selectedSquad.id).then((confirms) => {
      const map = new Map<string, 'yes' | 'no' | null>();
      for (const c of confirms) map.set(c.userId, c.response);
      setDateConfirms(map);
      const mine = confirms.find((c) => c.userId === userId);
      if (!mine) { setDateConfirmStatus('none'); return; }
      setDateConfirmStatus(mine.response ?? 'pending');
    }).catch(() => {});
  }, [selectedSquad?.id, selectedSquad?.dateStatus, userId]);

  // Fetch fresh messages when chat opens (covers gap before realtime subscribes)
  useEffect(() => {
    if (!selectedSquad?.id) return;
    let stale = false;
    db.getSquadMessages(selectedSquad.id).then((raw) => {
      if (stale) return;
      const msgs = raw.map((msg) => ({
        sender: msg.is_system || !msg.sender_id ? "system" : (msg.sender_id === userId ? "You" : (msg.sender?.display_name ?? "Unknown")),
        text: msg.text,
        time: formatTimeAgo(new Date(msg.created_at)),
        isYou: msg.sender_id === userId,
        ...(msg.message_type === 'date_confirm' ? { messageType: 'date_confirm' as const, messageId: msg.id } : {}),
      }));
      const last = msgs.length > 0 ? msgs[msgs.length - 1] : null;
      setSelectedSquad((prev) => {
        if (!prev || prev.id !== selectedSquad.id) return prev;
        return { ...prev, messages: msgs, lastMsg: last ? (last.sender === "system" ? last.text : `${last.sender}: ${last.text}`) : prev.lastMsg };
      });
    }).catch(() => {});
    return () => { stale = true; };
  }, [selectedSquad?.id, userId]);

  // Subscribe to realtime messages for the selected squad
  useEffect(() => {
    if (!selectedSquad?.id) return;
    const channel = db.subscribeToMessages(selectedSquad.id, (newMessage) => {
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
      };
      const lastMsgPreview = isSystem ? newMessage.text : `${senderName}: ${newMessage.text}`;
      setSelectedSquad((prev) => {
        if (!prev || prev.id !== newMessage.squad_id) return prev;
        return {
          ...prev,
          messages: [...prev.messages, msg],
          lastMsg: lastMsgPreview,
          time: "now",
        };
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
  }, [selectedSquad?.id, userId]);

  const handleSend = () => {
    if (!newMsg.trim() || !selectedSquad) return;
    const text = newMsg.trim();
    const updatedSquad = {
      ...selectedSquad,
      messages: [
        ...selectedSquad.messages,
        { sender: "You", text, time: "now", isYou: true },
      ],
      lastMsg: `You: ${text}`,
      time: "now",
    };
    const withActivity = { ...updatedSquad, lastActivityAt: new Date().toISOString() };
    setSelectedSquad(withActivity);
    onSquadUpdate((prev) => {
      const updated = prev.map((s) => (s.id === withActivity.id ? withActivity : s));
      updated.sort((a, b) =>
        new Date(b.lastActivityAt!).getTime() - new Date(a.lastActivityAt!).getTime()
      );
      return updated;
    });
    setNewMsg("");
    if (msgInputRef.current) msgInputRef.current.style.height = "auto";

    // Persist to DB
    if (selectedSquad.id && onSendMessage) {
      onSendMessage(selectedSquad.id, text).catch((err) =>
        logError("sendMessage", err, { squadId: selectedSquad.id })
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
        onBack?.();
        setSelectedSquad(null);
        setClosing(false);
        setDragX(0);
      }, 250);
    } else {
      setDragX(0);
    }
    isDragging.current = false;
  };

  const chatOverlay = selectedSquad ? (
    <>
      {/* Static backdrop to hide squads list during swipe */}
      {(dragX > 0 || closing) && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: color.bg, zIndex: 59 }} />
      )}
      <div
        ref={chatContainerRef}
        style={{
          display: "flex",
          flexDirection: "column",
          height: chatHeight,
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          background: color.bg,
          zIndex: 60,
          overflow: "hidden",
          transform: closing ? "translateX(100%)" : `translateX(${dragX}px)`,
          transition: closing ? "transform 0.25s ease-in" : (dragX === 0 ? "transform 0.3s ease-out" : "none"),
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Chat header — compact */}
        <div
          style={{
            padding: "0 20px 12px",
            borderBottom: `1px solid ${color.border}`,
            position: "relative",
            zIndex: (showSquadPopup || showDatePicker) ? 10000 : "auto",
            background: color.bg,
          }}
        >
          <div
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedSquad(null);
                onBack?.();
              }}
              style={{
                background: "none",
                border: "none",
                color: color.accent,
                fontSize: 18,
                cursor: "pointer",
                padding: 0,
                marginRight: 8,
                flexShrink: 0,
              }}
            >
              ‹
            </button>
            <div
              onClick={() => setShowSquadPopup(true)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flex: 1, minWidth: 0 }}
            >
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2
                style={{
                  fontFamily: font.serif,
                  fontSize: 18,
                  color: color.text,
                  fontWeight: 400,
                  margin: 0,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical" as const,
                  overflow: "hidden",
                }}
              >
                {selectedSquad.name}
              </h2>
              {selectedSquad.event && (
                <p
                  style={{
                    fontFamily: font.mono,
                    fontSize: 10,
                    color: color.dim,
                    margin: "2px 0 0",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {selectedSquad.event}
                </p>
              )}
            </div>
            <div
              onClick={() => setShowSquadPopup(true)}
              style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginLeft: 12, flexShrink: 0, cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center" }}>
                {selectedSquad.members.slice(0, 4).map((m, idx) => {
                  const isLocked = selectedSquad.dateStatus === 'locked';
                  const isProposed = selectedSquad.dateStatus === 'proposed';
                  const confirmResponse = m.userId ? dateConfirms.get(m.userId) : undefined;
                  const isConfirmed = isLocked || (isProposed && dateConfirms.size > 0 && confirmResponse === 'yes');
                  const isPending = isProposed && dateConfirms.size > 0 && confirmResponse !== 'yes';
                  const avatarBg = isConfirmed
                    ? color.accent
                    : isPending
                      ? color.borderLight
                      : m.name === "You" ? color.accent : color.borderLight;
                  const avatarColor = isConfirmed
                    ? "#000"
                    : isPending
                      ? color.dim
                      : m.name === "You" ? "#000" : color.dim;
                  return (
                    <div
                      key={m.name}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        background: avatarBg,
                        color: avatarColor,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: font.mono,
                        fontSize: 10,
                        fontWeight: 700,
                        marginLeft: idx === 0 ? 0 : -6,
                        border: `2px solid ${color.card}`,
                        position: "relative",
                        zIndex: 4 - idx,
                      }}
                    >
                      {m.avatar}
                    </div>
                  );
                })}
                {selectedSquad.members.length > 4 && (
                  <span style={{
                    fontFamily: font.mono,
                    fontSize: 8,
                    fontWeight: 700,
                    color: color.dim,
                    marginLeft: 4,
                  }}>
                    +{selectedSquad.members.length - 4}
                  </span>
                )}
              </div>
            </div>
            </div>
          </div>
          {(() => {
            const dateLabel = selectedSquad.eventIsoDate
              ? new Date(selectedSquad.eventIsoDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
              : null;
            const timeLabel = selectedSquad.eventTime ?? null;
            const isDateFlexible = selectedSquad.dateFlexible !== false;
            const isTimeFlexible = selectedSquad.timeFlexible !== false;
            const showExtend = !selectedSquad.eventIsoDate ||
              new Date(selectedSquad.eventIsoDate + "T00:00:00") <= new Date(new Date().toDateString());
            const expiryLabel = formatExpiryLabel(selectedSquad.expiresAt, selectedSquad.graceStartedAt);
            const expiryUrgent = !!selectedSquad.graceStartedAt ||
              (selectedSquad.expiresAt && new Date(selectedSquad.expiresAt).getTime() - Date.now() < 24 * 60 * 60 * 1000);
            const hasContent = dateLabel || timeLabel || onSetSquadDate || showExtend || expiryLabel;
            if (!hasContent) return null;
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "6px 0 0", flexWrap: "wrap" }}>
                {dateLabel && (
                  <span style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "2px 8px",
                    background: !isDateFlexible ? "rgba(232,255,90,0.08)" : "transparent",
                    borderRadius: 6,
                    border: !isDateFlexible ? "1px solid rgba(232,255,90,0.2)" : "1px solid rgba(232,255,90,0.35)",
                    fontFamily: font.mono,
                    fontSize: 9,
                    fontWeight: 600,
                    color: color.accent,
                  }}>
                    📅 {dateLabel}
                    <span style={{ fontSize: 8, color: !isDateFlexible ? color.accent : color.dim }}>
                      {!isDateFlexible ? "locked" : "flexible"}
                    </span>
                  </span>
                )}
                {timeLabel && (
                  <span style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "2px 8px",
                    background: !isTimeFlexible ? "rgba(232,255,90,0.08)" : "transparent",
                    borderRadius: 6,
                    border: !isTimeFlexible ? "1px solid rgba(232,255,90,0.2)" : "1px solid rgba(232,255,90,0.35)",
                    fontFamily: font.mono,
                    fontSize: 9,
                    fontWeight: 600,
                    color: color.accent,
                  }}>
                    🕐 {timeLabel}
                    <span style={{ fontSize: 8, color: !isTimeFlexible ? color.accent : color.dim }}>
                      {!isTimeFlexible ? "locked" : "flexible"}
                    </span>
                  </span>
                )}
                {!dateLabel && !timeLabel && onSetSquadDate && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDatePicker(true);
                      setDatePickerValue("");
                      setDateLocked(false);
                      setTimeLocked(false);
                      setDateDismissed(false);
                      setTimeDismissed(false);
                    }}
                    style={{
                      background: "transparent",
                      color: color.accent,
                      border: `1px solid ${color.accent}`,
                      borderRadius: 6,
                      padding: "2px 8px",
                      fontFamily: font.mono,
                      fontSize: 9,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Set date &amp; time
                  </button>
                )}
                {showExtend && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        const newExpiry = await db.extendSquad(selectedSquad.id);
                        onSquadUpdate((prev) => prev.map((s) =>
                          s.id === selectedSquad.id ? { ...s, expiresAt: newExpiry } : s
                        ));
                        setSelectedSquad((prev) => prev ? { ...prev, expiresAt: newExpiry } : prev);
                      } catch {}
                    }}
                    style={{
                      background: "transparent",
                      color: color.dim,
                      border: `1px solid ${color.borderMid}`,
                      borderRadius: 6,
                      padding: "2px 8px",
                      fontFamily: font.mono,
                      fontSize: 9,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    +7 days
                  </button>
                )}
                {expiryLabel && (
                  <span style={{
                    fontFamily: font.mono,
                    fontSize: 9,
                    color: expiryUrgent ? color.accent : color.faint,
                    marginLeft: "auto",
                  }}>
                    {expiryLabel}
                  </span>
                )}
              </div>
            );
          })()}
        </div>

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
                Leave {selectedSquad.name}?
              </p>
              <p style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, marginBottom: 20 }}>
                You won't see messages from this squad anymore.
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
                    if (selectedSquad.id && onLeaveSquad) {
                      try {
                        await onLeaveSquad(selectedSquad.id);
                        onSquadUpdate((prev) => prev.filter((s) => s.id !== selectedSquad.id));
                        setSelectedSquad(null);
                      } catch (err) {
                        logError("leaveSquad", err, { squadId: selectedSquad.id });
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
                    if (selectedSquad?.id && onConfirmDate) {
                      setConfirmLoading(true);
                      try {
                        await onConfirmDate(selectedSquad.id, 'no');
                        setDateConfirmStatus('no');
                        if (userId) setDateConfirms((prev) => new Map(prev).set(userId, 'no'));
                        onSquadUpdate((prev) => prev.filter((s) => s.id !== selectedSquad.id));
                        setSelectedSquad(null);
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
        {kickTarget && selectedSquad && (
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
                      // Capture target and dismiss dialog immediately to prevent double-tap
                      const target = kickTarget;
                      setKickTarget(null);
                      try {
                        await onKickMember(selectedSquad.id, target.userId);
                        // Use functional updates to avoid overwriting realtime system messages
                        const stripKicked = (s: Squad) => ({
                          ...s,
                          members: s.members.filter((x) => x.userId !== target.userId),
                          waitlistedMembers: (s.waitlistedMembers ?? []).filter((x) => x.userId !== target.userId),
                        });
                        setSelectedSquad((prev) => prev ? stripKicked(prev) : prev);
                        onSquadUpdate((prev: Squad[]) => prev.map((s) => s.id === selectedSquad.id ? stripKicked(s) : s));
                      } catch (err) {
                        logError("kickMember", err, { squadId: selectedSquad.id });
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
          const allLocked = hasDate && dateLocked && (!hasTime || timeLocked) && (!detectedTime || !timeDismissed || timeLocked);
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
                  Set date & time
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
                {/* Auto-detected date/time chips */}
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
                      if (!parsedISO || !selectedSquad?.id || !onSetSquadDate) return;
                      setSettingDate(true);
                      try {
                        await onSetSquadDate(selectedSquad.id, parsedISO, detectedTime, bothLocked);
                        setSelectedSquad((prev) => prev ? {
                          ...prev,
                          eventIsoDate: parsedISO,
                          eventTime: detectedTime ?? prev.eventTime,
                          dateFlexible: !dateLocked,
                          timeFlexible: !timeLocked,
                          dateStatus: bothLocked ? 'locked' : 'proposed',
                          graceStartedAt: undefined,
                        } : prev);
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
            const lastConfirmIdx = selectedSquad.messages.reduce((acc, m, idx) => m.messageType === 'date_confirm' ? idx : acc, -1);
            return selectedSquad.messages.map((msg, i) => {
            const prev = i > 0 ? selectedSquad.messages[i - 1] : null;
            const next = i < selectedSquad.messages.length - 1 ? selectedSquad.messages[i + 1] : null;
            const sameSenderAsPrev = prev && prev.sender === msg.sender && prev.sender !== "system";
            const sameSenderAsNext = next && next.sender === msg.sender && next.sender !== "system";
            const isFirstInGroup = !sameSenderAsPrev;
            const isLastInGroup = !sameSenderAsNext;

            if (msg.sender === "system") {
              // Interactive date confirm message (only show buttons on the latest one)
              if (msg.messageType === 'date_confirm' && i === lastConfirmIdx) {
                return (
                  <div
                    key={i}
                    style={{
                      textAlign: "center",
                      padding: "8px 0",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: font.mono,
                        fontSize: 10,
                        color: color.dim,
                      }}
                    >
                      {msg.text}
                    </span>
                    {dateConfirmStatus === 'pending' && !confirmLoading && (
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 8 }}>
                        <button
                          onClick={async () => {
                            if (!selectedSquad?.id || confirmLoading) return;
                            setConfirmLoading(true);
                            try {
                              await onConfirmDate?.(selectedSquad.id, 'yes');
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
                          I'M OUT
                        </button>
                      </div>
                    )}
                    {confirmLoading && (
                      <div style={{ fontFamily: font.mono, fontSize: 10, color: color.faint, marginTop: 6 }}>...</div>
                    )}
                    {dateConfirmStatus === 'yes' && !confirmLoading && (
                      <div style={{ fontFamily: font.mono, fontSize: 10, color: color.accent, marginTop: 6 }}>
                        you're in
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

              // Regular system message
              return (
                <div
                  key={i}
                  style={{
                    textAlign: "center",
                    padding: "4px 0",
                  }}
                >
                  <span
                    style={{
                      fontFamily: font.mono,
                      fontSize: 10,
                      color: color.dim,
                    }}
                  >
                    {msg.text}
                  </span>
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
                  <span
                    style={{
                      fontFamily: font.mono,
                      fontSize: 10,
                      color: color.dim,
                      marginBottom: 3,
                    }}
                  >
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
                  <span
                    style={{
                      fontFamily: font.mono,
                      fontSize: 9,
                      color: color.faint,
                      marginTop: 2,
                    }}
                  >
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
        {selectedSquad.isWaitlisted ? (
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
        <div
          style={{
            padding: "12px 20px calc(12px + env(safe-area-inset-bottom, 0px))",
            borderTop: `1px solid ${color.border}`,
            display: "flex",
            gap: 8,
          }}
        >
          <textarea
            ref={msgInputRef}
            value={newMsg}
            onChange={(e) => {
              setNewMsg(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
            onKeyDown={(e) => {
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
                  {/* Facepile + member count */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
                      {selectedSquad.members.slice(0, 4).map((m, idx) => {
                        const isLocked = selectedSquad.dateStatus === 'locked';
                        const isProposed = selectedSquad.dateStatus === 'proposed';
                        const confirmResponse = m.userId ? dateConfirms.get(m.userId) : undefined;
                        const isConfirmed = isLocked || (isProposed && dateConfirms.size > 0 && confirmResponse === 'yes');
                        const isPending = isProposed && dateConfirms.size > 0 && confirmResponse !== 'yes';
                        const avatarBg = isConfirmed
                          ? color.accent
                          : isPending
                            ? color.borderLight
                            : m.name === "You" ? color.accent : color.borderLight;
                        const avatarColor = isConfirmed
                          ? "#000"
                          : isPending
                            ? color.dim
                            : m.name === "You" ? "#000" : color.dim;
                        return (
                          <div
                            key={m.name}
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: "50%",
                              background: avatarBg,
                              color: avatarColor,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontFamily: font.mono,
                              fontSize: 10,
                              fontWeight: 700,
                              marginLeft: idx === 0 ? 0 : -6,
                              border: `2px solid ${color.deep}`,
                              position: "relative",
                              zIndex: 4 - idx,
                            }}
                          >
                            {m.avatar}
                          </div>
                        );
                      })}
                      {selectedSquad.members.length > 4 && (
                        <span style={{ fontFamily: font.mono, fontSize: 8, fontWeight: 700, color: color.dim, marginLeft: 4 }}>
                          +{selectedSquad.members.length - 4}
                        </span>
                      )}
                    </div>
                    <span style={{ fontFamily: font.mono, fontSize: 10, color: color.dim }}>
                      {selectedSquad.members.length}{selectedSquad.maxSquadSize && selectedSquad.maxSquadSize < 999 ? `/${selectedSquad.maxSquadSize}` : ''} member{selectedSquad.members.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Menu items */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    <button
                      onClick={() => setSquadPopupView('members')}
                      style={{
                        background: "none",
                        border: "none",
                        borderBottom: `1px solid ${color.border}`,
                        color: color.text,
                        fontFamily: font.mono,
                        fontSize: 12,
                        padding: "12px 0",
                        cursor: "pointer",
                        textAlign: "center",
                      }}
                    >
                      See members
                    </button>
                    {selectedSquad.checkId && onUpdateSquadSize && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 12,
                          padding: "12px 0",
                          borderBottom: `1px solid ${color.border}`,
                        }}
                      >
                        <span style={{ fontFamily: font.mono, fontSize: 12, color: color.text }}>
                          Squad size
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <button
                            onClick={() => {
                              const newSize = (selectedSquad.maxSquadSize ?? 5) - 1;
                              if (newSize >= selectedSquad.members.length) {
                                onUpdateSquadSize(selectedSquad.checkId!, newSize);
                                setSelectedSquad({ ...selectedSquad, maxSquadSize: newSize });
                                onSquadUpdate((prev: Squad[]) => prev.map((s) => s.id === selectedSquad.id ? { ...s, maxSquadSize: newSize } : s));
                              }
                            }}
                            disabled={(selectedSquad.maxSquadSize ?? 5) <= selectedSquad.members.length}
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 6,
                              border: `1px solid ${color.borderMid}`,
                              background: "none",
                              color: (selectedSquad.maxSquadSize ?? 5) <= selectedSquad.members.length ? color.faint : color.text,
                              fontFamily: font.mono,
                              fontSize: 14,
                              cursor: (selectedSquad.maxSquadSize ?? 5) <= selectedSquad.members.length ? "default" : "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: 0,
                            }}
                          >
                            −
                          </button>
                          <span style={{ fontFamily: font.mono, fontSize: 13, color: color.accent, fontWeight: 700, minWidth: 20, textAlign: "center" }}>
                            {selectedSquad.maxSquadSize ?? 5}
                          </span>
                          <button
                            onClick={() => {
                              const newSize = (selectedSquad.maxSquadSize ?? 5) + 1;
                              if (newSize <= 20) {
                                onUpdateSquadSize(selectedSquad.checkId!, newSize);
                                setSelectedSquad({ ...selectedSquad, maxSquadSize: newSize });
                                onSquadUpdate((prev: Squad[]) => prev.map((s) => s.id === selectedSquad.id ? { ...s, maxSquadSize: newSize } : s));
                              }
                            }}
                            disabled={(selectedSquad.maxSquadSize ?? 5) >= 20}
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 6,
                              border: `1px solid ${color.borderMid}`,
                              background: "none",
                              color: (selectedSquad.maxSquadSize ?? 5) >= 20 ? color.faint : color.text,
                              fontFamily: font.mono,
                              fontSize: 14,
                              cursor: (selectedSquad.maxSquadSize ?? 5) >= 20 ? "default" : "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: 0,
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
                          const dateLabel = selectedSquad.eventIsoDate
                            ? new Date(selectedSquad.eventIsoDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                            : "";
                          setDatePickerValue(dateLabel);
                          setDateLocked(false);
                          setTimeLocked(false);
                          setDateDismissed(false);
                          setTimeDismissed(false);

                        }}
                        style={{
                          background: "none",
                          border: "none",
                          borderBottom: `1px solid ${color.border}`,
                          color: color.text,
                          fontFamily: font.mono,
                          fontSize: 12,
                          padding: "12px 0",
                          cursor: "pointer",
                          textAlign: "center",
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
                        background: "none",
                        border: "none",
                        color: "#ff4444",
                        fontFamily: font.mono,
                        fontSize: 12,
                        padding: "12px 0",
                        cursor: "pointer",
                        textAlign: "center",
                      }}
                    >
                      Leave
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* Members view - back arrow */}
                  <button
                    onClick={() => setSquadPopupView('menu')}
                    style={{
                      background: "none",
                      border: "none",
                      color: color.accent,
                      fontFamily: font.mono,
                      fontSize: 12,
                      cursor: "pointer",
                      padding: 0,
                      marginBottom: 16,
                    }}
                  >
                    ← Back
                  </button>

                  {/* Member list */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {selectedSquad.members.map((m) => {
                      const isLocked = selectedSquad.dateStatus === 'locked';
                      const isProposed = selectedSquad.dateStatus === 'proposed';
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
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          cursor: m.name !== "You" && m.userId ? "pointer" : "default",
                          opacity: isGrayed ? 0.35 : 1,
                        }}
                      >
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            background: isConfirmed ? color.accent : (m.name === "You" && !isGrayed) ? color.accent : color.borderLight,
                            color: isConfirmed || (m.name === "You" && !isGrayed) ? "#000" : color.dim,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontFamily: font.mono,
                            fontSize: 11,
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
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
                                background: "none",
                                border: "none",
                                color: color.faint,
                                fontFamily: font.mono,
                                fontSize: 14,
                                cursor: "pointer",
                                padding: "2px 4px",
                                letterSpacing: "0.1em",
                              }}
                            >
                              •••
                            </button>
                          </div>
                        )}
                      </div>
                      {memberMenu?.userId === m.userId && (
                        <div style={{
                          background: color.deep,
                          border: `1px solid ${color.border}`,
                          borderRadius: 10,
                          padding: "4px 0",
                          marginTop: 4,
                          marginLeft: 38,
                        }}>
                          {onSetMemberRole && (
                            <button
                              onClick={async () => {
                                setMemberMenu(null);
                                setShowSquadPopup(false);
                                setSquadPopupView('menu');
                                await onSetMemberRole(selectedSquad.id, m.userId!, 'waitlist');
                                const updated = {
                                  ...selectedSquad,
                                  members: selectedSquad.members.filter((x) => x.userId !== m.userId),
                                  waitlistedMembers: [...(selectedSquad.waitlistedMembers ?? []), { name: m.name, avatar: m.avatar, userId: m.userId! }],
                                };
                                setSelectedSquad(updated);
                                onSquadUpdate((prev: Squad[]) => prev.map((s) => s.id === selectedSquad.id ? updated : s));
                              }}
                              style={{
                                display: "block",
                                width: "100%",
                                background: "none",
                                border: "none",
                                color: color.muted,
                                fontFamily: font.mono,
                                fontSize: 11,
                                padding: "8px 14px",
                                cursor: "pointer",
                                textAlign: "left",
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
                                display: "block",
                                width: "100%",
                                background: "none",
                                border: "none",
                                color: "#ff4444",
                                fontFamily: font.mono,
                                fontSize: 11,
                                padding: "8px 14px",
                                cursor: "pointer",
                                textAlign: "left",
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

                  {/* Waitlisted members */}
                  {selectedSquad.waitlistedMembers && selectedSquad.waitlistedMembers.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <span style={{
                        fontFamily: font.mono,
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.15em",
                        color: color.dim,
                      }}>
                        Waitlist
                      </span>
                      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
                        {selectedSquad.waitlistedMembers.map((m) => (
                          <div
                            key={m.userId}
                            onClick={() => {
                              if (m.userId) {
                                setShowSquadPopup(false);
                                setSquadPopupView('menu');
                                onViewProfile?.(m.userId);
                              }
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              cursor: m.userId ? "pointer" : "default",
                            }}
                          >
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: "50%",
                                background: color.borderLight,
                                color: color.dim,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontFamily: font.mono,
                                fontSize: 11,
                                fontWeight: 700,
                                flexShrink: 0,
                              }}
                            >
                              {m.avatar}
                            </div>
                            <span style={{ fontFamily: font.mono, fontSize: 12, color: color.muted, flex: 1 }}>
                              {m.name}
                            </span>
                            {onSetMemberRole && (
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const isFull = selectedSquad.members.length >= (selectedSquad.maxSquadSize ?? 999);
                                  if (isFull) return;
                                  await onSetMemberRole(selectedSquad.id, m.userId, 'member');
                                  const updated = {
                                    ...selectedSquad,
                                    members: [...selectedSquad.members, { name: m.name, avatar: m.avatar, userId: m.userId }],
                                    waitlistedMembers: (selectedSquad.waitlistedMembers ?? []).filter((x) => x.userId !== m.userId),
                                  };
                                  setSelectedSquad(updated);
                                  onSquadUpdate((prev: Squad[]) => prev.map((s) => s.id === selectedSquad.id ? updated : s));
                                }}
                                disabled={selectedSquad.members.length >= (selectedSquad.maxSquadSize ?? 999)}
                                style={{
                                  background: "none",
                                  border: `1px solid ${color.borderMid}`,
                                  borderRadius: 8,
                                  color: selectedSquad.members.length >= (selectedSquad.maxSquadSize ?? 999) ? color.faint : color.accent,
                                  fontFamily: font.mono,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: "4px 10px",
                                  cursor: selectedSquad.members.length >= (selectedSquad.maxSquadSize ?? 999) ? "default" : "pointer",
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

                  {/* Down on check — people who can be added */}
                  {selectedSquad.downResponders && selectedSquad.downResponders.length > 0 &&
                    selectedSquad.members.length < (selectedSquad.maxSquadSize ?? 999) && (
                    <div style={{ marginTop: 16 }}>
                      <span style={{
                        fontFamily: font.mono,
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.15em",
                        color: color.dim,
                      }}>
                        Down on check
                      </span>
                      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
                        {selectedSquad.downResponders.map((p) => (
                          <div
                            key={p.userId}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: "50%",
                                background: color.borderLight,
                                color: color.dim,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontFamily: font.mono,
                                fontSize: 11,
                                fontWeight: 700,
                                flexShrink: 0,
                              }}
                            >
                              {p.avatar}
                            </div>
                            <span style={{ fontFamily: font.mono, fontSize: 12, color: color.text, flex: 1 }}>
                              {p.name}
                            </span>
                            {onAddMember && (
                              <button
                                onClick={async () => {
                                  await onAddMember(selectedSquad.id, p.userId);
                                  // Optimistic update: move from downResponders to members
                                  const newMember = { name: p.name, avatar: p.avatar, userId: p.userId };
                                  const updated = {
                                    ...selectedSquad,
                                    members: [...selectedSquad.members, newMember],
                                    downResponders: selectedSquad.downResponders?.filter((d) => d.userId !== p.userId),
                                  };
                                  setSelectedSquad(updated);
                                  onSquadUpdate((prev: Squad[]) => prev.map((s) => s.id === selectedSquad.id ? updated : s));
                                }}
                                style={{
                                  background: "none",
                                  border: `1px solid ${color.borderMid}`,
                                  borderRadius: 8,
                                  color: color.accent,
                                  fontFamily: font.mono,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: "4px 10px",
                                  cursor: "pointer",
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
      </div>
    </>
  ) : null;

  const squadList = (
    <div style={{ padding: "0 20px" }}>
      <h2
        style={{
          fontFamily: font.serif,
          fontSize: 28,
          color: color.text,
          marginBottom: 4,
          fontWeight: 400,
        }}
      >
        Your Squads
      </h2>
      <p style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, marginBottom: 24 }}>
        Groups formed around events
      </p>

      {squads.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "60px 20px",
            color: color.faint,
            fontFamily: font.mono,
            fontSize: 12,
          }}
        >
          No squads yet.<br />
          Say you're down on a friend's check and a squad forms automatically.
        </div>
      ) : (
        squads.map((g) => (
          <div
            key={g.id}
            onClick={() => {
              setSelectedSquad({ ...g, hasUnread: false });
              if (g.hasUnread) {
                onSquadUpdate((prev) => prev.map((s) => s.id === g.id ? { ...s, hasUnread: false } : s));
                db.markSquadNotificationsRead(g.id).catch(() => {});
                onSquadRead?.();
              }
              // Dismiss push notifications for this squad
              if ("serviceWorker" in navigator) {
                navigator.serviceWorker.getRegistration().then((reg) => {
                  reg?.getNotifications({ tag: `squad_message-${g.id}` }).then((notifs) => {
                    notifs.forEach((n) => n.close());
                  });
                });
              }
            }}
            style={{
              background: color.card,
              borderRadius: 16,
              padding: 16,
              marginBottom: 8,
              border: `1px solid ${color.border}`,
              cursor: "pointer",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <span style={{ fontFamily: font.serif, fontSize: 17, color: color.text, fontWeight: 400 }}>
                  {g.name}
                  {g.hasUnread && (
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#ff3b30", marginLeft: 6, verticalAlign: "middle" }} />
                  )}
                </span>
                {g.isWaitlisted && (
                  <span style={{ fontFamily: font.mono, fontSize: 9, color: color.faint, border: `1px solid ${color.border}`, borderRadius: 4, padding: "1px 5px", flexShrink: 0, marginTop: 5 }}>waitlist</span>
                )}
              </div>
              <span style={{ fontFamily: font.mono, fontSize: 10, color: color.faint, flexShrink: 0 }}>
                {g.time}
                {(() => {
                  const exp = formatExpiryShort(g.expiresAt);
                  if (!exp) return null;
                  const msLeft = g.expiresAt ? new Date(g.expiresAt).getTime() - Date.now() : Infinity;
                  const isUrgent = msLeft < 24 * 60 * 60 * 1000;
                  return (
                    <span style={{ color: isUrgent ? "#ff3b30" : color.faint }}>
                      {" · "}expires {exp}
                    </span>
                  );
                })()}
              </span>
            </div>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 12,
                color: color.muted,
                marginBottom: 8,
              }}
            >
              {g.lastMsg}
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {g.members.map((m) => (
                <span
                  key={m.name}
                  style={{
                    background: m.name === "You" ? color.accent : "#222",
                    color: m.name === "You" ? "#000" : color.dim,
                    padding: "3px 8px",
                    borderRadius: 8,
                    fontFamily: font.mono,
                    fontSize: 10,
                  }}
                >
                  {m.name}
                </span>
              ))}
            </div>
          </div>
        ))
      )}

      <div
        style={{
          textAlign: "center",
          padding: "32px 20px",
          color: color.borderMid,
          fontFamily: font.mono,
          fontSize: 11,
          lineHeight: 1.8,
        }}
      >
        squads dissolve after the event ✶
      </div>
    </div>
  );

  if (selectedSquad) {
    return (
      <>
        {squadList}
        {chatOverlay}
      </>
    );
  }

  return squadList;
};

export default GroupsView;
