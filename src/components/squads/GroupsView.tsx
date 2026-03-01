"use client";

import { useState, useEffect, useRef } from "react";
import * as db from "@/lib/db";
import { font, color } from "@/lib/styles";
import type { Squad } from "@/lib/ui-types";
import { logError } from "@/lib/logger";
import { parseNaturalDate, parseNaturalTime, parseDateToISO } from "@/lib/utils";

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
  userId,
  onViewProfile,
  onChatOpen,
  onBack,
}: {
  squads: Squad[];
  onSquadUpdate: (squadsOrUpdater: Squad[] | ((prev: Squad[]) => Squad[])) => void;
  autoSelectSquadId?: string | null;
  clearAutoSelectSquadId?: () => void;
  onSendMessage?: (squadDbId: string, text: string) => Promise<void>;
  onLeaveSquad?: (squadDbId: string) => Promise<void>;
  onSetSquadDate?: (squadDbId: string, date: string, time?: string | null) => Promise<void>;
  onClearSquadDate?: (squadDbId: string) => Promise<void>;
  userId?: string | null;
  onViewProfile?: (userId: string) => void;
  onChatOpen?: (open: boolean) => void;
  onBack?: () => void;
}) => {
  const onSquadUpdateRef = useRef(onSquadUpdate);
  onSquadUpdateRef.current = onSquadUpdate;
  const [selectedSquad, setSelectedSquad] = useState<Squad | null>(null);
  const [newMsg, setNewMsg] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const msgInputRef = useRef<HTMLTextAreaElement>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerValue, setDatePickerValue] = useState("");
  const [settingDate, setSettingDate] = useState(false);

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
        setSelectedSquad(null);
        onBack?.();
        setClosing(false);
        setDragX(0);
      }, 250);
    } else {
      setDragX(0);
    }
    isDragging.current = false;
  };

  if (selectedSquad) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100dvh",
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          background: color.bg,
          zIndex: 60,
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
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <button
              onClick={() => {
                setSelectedSquad(null);
                onBack?.();
              }}
              style={{
                background: "none",
                border: "none",
                color: color.accent,
                fontFamily: font.mono,
                fontSize: 12,
                cursor: "pointer",
                padding: 0,
              }}
            >
              ← Back
            </button>
            {selectedSquad.id && (
              <button
                onClick={() => setShowLeaveConfirm(true)}
                style={{
                  background: "none",
                  border: "none",
                  color: color.dim,
                  fontFamily: font.mono,
                  fontSize: 11,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Leave
              </button>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2
                style={{
                  fontFamily: font.serif,
                  fontSize: 18,
                  color: color.text,
                  fontWeight: 400,
                  margin: 0,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
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
            <div style={{ display: "flex", gap: 4, marginLeft: 12, flexShrink: 0 }}>
              {selectedSquad.members.map((m) => (
                <div
                  key={m.name}
                  onClick={() => m.name !== "You" && m.userId && onViewProfile?.(m.userId)}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: m.name === "You" ? color.accent : color.borderLight,
                    color: m.name === "You" ? "#000" : color.dim,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: font.mono,
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: m.name !== "You" && m.userId ? "pointer" : "default",
                  }}
                >
                  {m.avatar}
                </div>
              ))}
            </div>
          </div>
          {(() => {
            const expiryLabel = formatExpiryLabel(selectedSquad.expiresAt, selectedSquad.graceStartedAt);
            if (!expiryLabel) return null;
            const isUrgent = !!selectedSquad.graceStartedAt ||
              (selectedSquad.expiresAt && new Date(selectedSquad.expiresAt).getTime() - Date.now() < 24 * 60 * 60 * 1000);
            return (
              <div
                style={{
                  fontFamily: font.mono,
                  fontSize: 10,
                  color: isUrgent ? color.accent : color.faint,
                  margin: "4px 0 0",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {expiryLabel}
                {onSetSquadDate && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDatePicker(true);
                      setDatePickerValue(
                        selectedSquad.eventIsoDate
                          ? new Date(selectedSquad.eventIsoDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                          : ""
                      );
                    }}
                    style={{
                      background: color.accent,
                      color: "#000",
                      border: "none",
                      borderRadius: 6,
                      padding: "2px 8px",
                      fontFamily: font.mono,
                      fontSize: 9,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {selectedSquad.eventIsoDate
                      ? new Date(selectedSquad.eventIsoDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                      : "Set a date"}
                  </button>
                )}
                {selectedSquad.eventIsoDate && onClearSquadDate && selectedSquad.checkAuthorId === userId && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        await onClearSquadDate(selectedSquad.id);
                        setSelectedSquad((prev) => prev ? { ...prev, eventIsoDate: undefined } : prev);
                      } catch {
                        // Error handled by parent
                      }
                    }}
                    style={{
                      background: "none",
                      color: color.faint,
                      border: `1px solid ${color.border}`,
                      borderRadius: 6,
                      padding: "2px 8px",
                      fontFamily: font.mono,
                      fontSize: 9,
                      cursor: "pointer",
                    }}
                  >
                    Clear date
                  </button>
                )}
                {(() => {
                  // Show extend for undated squads, or dated squads on/after the event day
                  const showExtend = !selectedSquad.eventIsoDate ||
                    new Date(selectedSquad.eventIsoDate + "T00:00:00") <= new Date(new Date().toDateString());
                  if (!showExtend) return null;
                  return (
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
                  );
                })()}
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

        {/* Date picker modal */}
        {showDatePicker && (() => {
          const natural = parseNaturalDate(datePickerValue);
          const parsedISO = natural?.iso ?? parseDateToISO(datePickerValue);
          const parsedLabel = natural?.label ?? (parsedISO
            ? new Date(parsedISO + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
            : null);
          const detectedTime = parseNaturalTime(datePickerValue);
          const isValid = !!parsedISO;
          return (
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
                  Set a date
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
                    marginBottom: (parsedLabel || detectedTime) ? 4 : 16,
                  }}
                />
                {(parsedLabel || detectedTime) && (
                  <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", marginBottom: 12 }}>
                    {parsedLabel && (
                      <span style={{
                        display: "inline-block",
                        padding: "3px 8px",
                        background: "rgba(232,255,90,0.08)",
                        borderRadius: 8,
                        border: "1px solid rgba(232,255,90,0.2)",
                        fontFamily: font.mono,
                        fontSize: 11,
                        color: color.accent,
                        fontWeight: 600,
                      }}>
                        📅 {parsedLabel}
                      </span>
                    )}
                    {detectedTime && (
                      <span style={{
                        display: "inline-block",
                        padding: "3px 8px",
                        background: "rgba(232,255,90,0.08)",
                        borderRadius: 8,
                        border: "1px solid rgba(232,255,90,0.2)",
                        fontFamily: font.mono,
                        fontSize: 11,
                        color: color.accent,
                        fontWeight: 600,
                      }}>
                        🕐 {detectedTime}
                      </span>
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
                        await onSetSquadDate(selectedSquad.id, parsedISO, detectedTime);
                        setSelectedSquad((prev) => prev ? {
                          ...prev,
                          eventIsoDate: parsedISO,
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
                    {settingDate ? "..." : "Lock it in"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "12px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {selectedSquad.messages.map((msg, i) => {
            const prev = i > 0 ? selectedSquad.messages[i - 1] : null;
            const next = i < selectedSquad.messages.length - 1 ? selectedSquad.messages[i + 1] : null;
            const sameSenderAsPrev = prev && prev.sender === msg.sender && prev.sender !== "system";
            const sameSenderAsNext = next && next.sender === msg.sender && next.sender !== "system";
            const isFirstInGroup = !sameSenderAsPrev;
            const isLastInGroup = !sameSenderAsNext;

            if (msg.sender === "system") {
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
                  {msg.text}
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
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
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
    );
  }

  return (
    <div style={{ padding: "0 20px", animation: "fadeIn 0.3s ease" }}>
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
              setSelectedSquad(g);
              if (g.hasUnread) {
                onSquadUpdate((prev) => prev.map((s) => s.id === g.id ? { ...s, hasUnread: false } : s));
                db.markSquadNotificationsRead(g.id).catch(() => {});
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
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: font.serif, fontSize: 17, color: color.text, fontWeight: 400 }}>
                  {g.name}
                </span>
                {g.hasUnread && (
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff3b30", flexShrink: 0 }} />
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
};

export default GroupsView;
