"use client";

import React from "react";
import { font, color } from "@/lib/styles";
import type { Squad } from "@/lib/ui-types";

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

// Re-export so SquadChat can remove its copies
export { formatExpiryShort, formatExpiryLabel };

interface ChatHeaderProps {
  squad: Squad;
  dateConfirms: Map<string, "yes" | "no" | null>;
  userId: string | null;
  hasOpenModal: boolean;
  onBack: () => void;
  onOpenSettings: () => void;
  onOpenDatePicker: () => void;
  onExtendSquad: () => Promise<void>;
  canSetDate: boolean; // whether date setting is supported (onSetSquadDate is defined)
}

export default function ChatHeader({
  squad,
  dateConfirms,
  userId,
  hasOpenModal,
  onBack,
  onOpenSettings,
  onOpenDatePicker,
  onExtendSquad,
  canSetDate,
}: ChatHeaderProps) {
  const dateLabel = squad.eventIsoDate
    ? new Date(squad.eventIsoDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : null;
  const timeLabel = squad.eventTime ?? null;
  const isDateFlexible = squad.dateFlexible !== false;
  const isTimeFlexible = squad.timeFlexible !== false;
  const showExtend = !squad.eventIsoDate ||
    new Date(squad.eventIsoDate + "T00:00:00") <= new Date(new Date().toDateString());
  const expiryLabel = formatExpiryLabel(squad.expiresAt, squad.graceStartedAt);
  const expiryUrgent = !!squad.graceStartedAt ||
    (squad.expiresAt && new Date(squad.expiresAt).getTime() - Date.now() < 24 * 60 * 60 * 1000);

  return (
    <div
      style={{
        padding: "0 20px 12px",
        borderBottom: `1px solid ${color.border}`,
        position: "relative",
        zIndex: hasOpenModal ? 10000 : "auto",
        background: color.bg,
        flexShrink: 0,
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onBack(); }}
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
          onClick={onOpenSettings}
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
              {squad.name}
            </h2>
            {squad.event && (
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
                {squad.event}
              </p>
            )}
          </div>
          <div
            onClick={onOpenSettings}
            style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginLeft: 12, flexShrink: 0, cursor: "pointer" }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              {squad.members.slice(0, 4).map((m, idx) => {
                const isLocked = squad.dateStatus === "locked";
                const isProposed = squad.dateStatus === "proposed";
                const confirmResponse = m.userId ? dateConfirms.get(m.userId) : undefined;
                const isConfirmed = isLocked || (isProposed && dateConfirms.size > 0 && confirmResponse === "yes");
                const isPending = isProposed && dateConfirms.size > 0 && confirmResponse !== "yes";
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
              {squad.members.length > 4 && (
                <span style={{ fontFamily: font.mono, fontSize: 8, fontWeight: 700, color: color.dim, marginLeft: 4 }}>
                  +{squad.members.length - 4}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {(dateLabel || timeLabel || (canSetDate && !dateLabel && !timeLabel) || showExtend || expiryLabel) && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "6px 0 0", flexWrap: "wrap" }}>
          {dateLabel && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "2px 8px",
              background: !isDateFlexible ? "rgba(232,255,90,0.08)" : "transparent",
              borderRadius: 6,
              border: !isDateFlexible ? "1px solid rgba(232,255,90,0.2)" : "1px solid rgba(232,255,90,0.35)",
              fontFamily: font.mono, fontSize: 9, fontWeight: 600, color: color.accent,
            }}>
              📅 {dateLabel}
              <span style={{ fontSize: 8, color: !isDateFlexible ? color.accent : color.dim }}>
                {!isDateFlexible ? "locked" : "flexible"}
              </span>
            </span>
          )}
          {timeLabel && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "2px 8px",
              background: !isTimeFlexible ? "rgba(232,255,90,0.08)" : "transparent",
              borderRadius: 6,
              border: !isTimeFlexible ? "1px solid rgba(232,255,90,0.2)" : "1px solid rgba(232,255,90,0.35)",
              fontFamily: font.mono, fontSize: 9, fontWeight: 600, color: color.accent,
            }}>
              🕐 {timeLabel}
              <span style={{ fontSize: 8, color: !isTimeFlexible ? color.accent : color.dim }}>
                {!isTimeFlexible ? "locked" : "flexible"}
              </span>
            </span>
          )}
          {!dateLabel && !timeLabel && canSetDate && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenDatePicker(); }}
              style={{
                background: "transparent", color: color.accent, border: `1px solid ${color.accent}`,
                borderRadius: 6, padding: "2px 8px",
                fontFamily: font.mono, fontSize: 9, fontWeight: 700, cursor: "pointer",
              }}
            >
              Set date &amp; time
            </button>
          )}
          {showExtend && (
            <button
              onClick={async (e) => { e.stopPropagation(); await onExtendSquad(); }}
              style={{
                background: "transparent", color: color.dim, border: `1px solid ${color.borderMid}`,
                borderRadius: 6, padding: "2px 8px",
                fontFamily: font.mono, fontSize: 9, fontWeight: 700, cursor: "pointer",
              }}
            >
              +7 days
            </button>
          )}
          {expiryLabel && (
            <span style={{
              fontFamily: font.mono, fontSize: 9,
              color: expiryUrgent ? color.accent : color.faint,
              marginLeft: "auto",
            }}>
              {expiryLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
