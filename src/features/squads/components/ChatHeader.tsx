"use client";

import React from "react";
import { color } from "@/lib/styles";
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
}

export default function ChatHeader({
  squad,
  dateConfirms,
  userId,
  hasOpenModal,
  onBack,
  onOpenSettings,
}: ChatHeaderProps) {
  const dateLabel = squad.eventIsoDate
    ? new Date(squad.eventIsoDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : null;
  const timeLabel = squad.eventTime ?? null;
  const location = squad.meetingSpot ?? null;
  const detailParts = [dateLabel, timeLabel, location].filter(Boolean);
  const hasDetails = detailParts.length > 0 || !!squad.event;
  const expiryLabel = formatExpiryLabel(squad.expiresAt, squad.graceStartedAt);
  const expiryUrgent = !!squad.graceStartedAt ||
    (squad.expiresAt && new Date(squad.expiresAt).getTime() - Date.now() < 24 * 60 * 60 * 1000);

  return (
    <div className={`px-5 pb-3 border-b border-neutral-900 relative bg-neutral-950 shrink-0 ${hasOpenModal ? "z-10000" : "z-auto"}`}>
      <div className="flex items-center justify-between cursor-pointer">
        <button
          onClick={(e) => { e.stopPropagation(); onBack(); }}
          className={`bg-transparent border-none text-dt text-lg cursor-pointer p-0 mr-2 shrink-0 ${hasDetails ? "self-start" : "self-center"}`}
        >
          ‹
        </button>
        <div
          onClick={onOpenSettings}
          className="flex items-center justify-between flex-1 min-w-0"
        >
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-lg text-white font-normal m-0 line-clamp-2">
              {squad.name}
            </h2>
            {hasDetails && (
              <p className="font-mono text-tiny text-neutral-500 m-0 mt-0.5 truncate">
                {detailParts.length > 0 ? detailParts.join(" · ") : squad.event}
              </p>
            )}
          </div>
          <div
            onClick={onOpenSettings}
            className="flex flex-col items-end justify-center ml-3 shrink-0 cursor-pointer pt-1"
          >
            <div className="flex items-center">
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
                    className={`size-6 rounded-full flex items-center justify-center font-mono text-tiny font-bold border-2 border-neutral-925 ${idx === 0 ? "" : "-ml-1.5"}`}
                    style={{ background: avatarBg, color: avatarColor, zIndex: 4 - idx, position: "relative" }}
                  >
                    {m.avatar}
                  </div>
                );
              })}
              {squad.members.length > 4 && (
                <span className="font-mono text-tiny font-bold text-neutral-500 ml-1">
                  +{squad.members.length - 4}
                </span>
              )}
            </div>
            {expiryLabel && (
              <span className={`font-mono text-tiny mt-0.5 ${expiryUrgent ? "text-dt" : "text-neutral-700"}`}>
                {expiryLabel}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
