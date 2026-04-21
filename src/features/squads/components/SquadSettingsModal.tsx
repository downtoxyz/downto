"use client";

import React, { useState } from "react";
import * as db from "@/lib/db";
import cn from "@/lib/tailwindMerge";
import DetailSheet from "@/shared/components/DetailSheet";
import type { Squad } from "@/lib/ui-types";
import SquadMembersView from "./SquadMembersView";

interface SquadSettingsModalProps {
  squad: Squad;
  dateConfirms: Map<string, "yes" | "no" | null>;
  onClose: () => void;
  onRequestLeave: () => void;
  onRequestKick: (target: { name: string; userId: string }) => void;
  onOpenDatePicker?: () => void;
  onViewProfile?: (userId: string) => void;
  onUpdateSquadSize?: (checkId: string, newSize: number) => Promise<void>;
  onSetMemberRole?: (squadId: string, userId: string, role: "member" | "waitlist") => Promise<void>;
  onAddMember?: (squadId: string, userId: string) => Promise<void>;
  onSquadUpdate: (updater: Squad[] | ((prev: Squad[]) => Squad[])) => void;
  onLocalSquadUpdate: React.Dispatch<React.SetStateAction<Squad>>;
}

export default function SquadSettingsModal({
  squad,
  dateConfirms,
  onClose,
  onRequestLeave,
  onRequestKick,
  onOpenDatePicker,
  onViewProfile,
  onUpdateSquadSize,
  onSetMemberRole,
  onAddMember,
  onSquadUpdate,
  onLocalSquadUpdate,
}: SquadSettingsModalProps) {
  const [view, setView] = useState<"menu" | "members">("menu");

  const dateLabel = squad.eventIsoDate
    ? new Date(squad.eventIsoDate + "T00:00:00").toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : null;
  const timeLabel = squad.eventTime ?? null;
  const location = squad.meetingSpot ?? squad.eventLocation ?? null;
  const metaParts = [dateLabel, timeLabel, location].filter(Boolean);

  const currentSize = squad.maxSquadSize ?? 5;
  const canShrink = currentSize > squad.members.length;
  const canGrow = currentSize < 20;

  return (
    <DetailSheet onClose={onClose}>
      {view === "menu" ? (
        <>
          {/* Event/check header */}
          <h3 className="font-serif text-xl text-primary m-0 leading-snug font-normal tracking-[var(--serif-title-tracking)] mb-1.5">
            {squad.name}
          </h3>
          {metaParts.length > 0 && (
            <p className="font-mono text-xs text-dim mb-4 m-0">
              {metaParts.join(" · ")}
            </p>
          )}

          {/* Members preview */}
          <div className="flex items-center gap-2 mb-5 pb-4 border-b border-border">
            <div className="flex items-center">
              {squad.members.slice(0, 5).map((m, idx) => {
                const isLocked = squad.dateStatus === "locked";
                const isProposed = squad.dateStatus === "proposed";
                const confirmResponse = m.userId ? dateConfirms.get(m.userId) : undefined;
                const isConfirmed =
                  isLocked || (isProposed && dateConfirms.size > 0 && confirmResponse === "yes");
                const isYou = m.name === "You";
                const bg = isConfirmed || isYou ? "var(--color-dt)" : "var(--color-border-light)";
                const fg = isConfirmed || isYou ? "var(--color-on-accent)" : "var(--color-dt)";
                return (
                  <div
                    key={m.name + idx}
                    className="size-7 rounded-full flex items-center justify-center font-mono text-tiny font-bold"
                    style={{
                      background: bg,
                      color: fg,
                      border: "2px solid var(--color-surface)",
                      marginLeft: idx === 0 ? 0 : -8,
                      zIndex: 5 - idx,
                      position: "relative",
                    }}
                  >
                    {m.avatar}
                  </div>
                );
              })}
              {squad.members.length > 5 && (
                <span className="font-mono text-tiny font-bold text-muted ml-2">
                  +{squad.members.length - 5}
                </span>
              )}
            </div>
            <span className="font-mono text-tiny text-muted ml-auto">
              {squad.members.length}
              {squad.maxSquadSize != null ? `/${squad.maxSquadSize}` : ""} member
              {squad.members.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Settings label */}
          <div
            className="font-mono text-tiny uppercase text-faint mb-2"
            style={{ letterSpacing: "0.15em" }}
          >
            Squad settings
          </div>

          {/* Actions */}
          <div className="flex flex-col">
            <button
              onClick={() => setView("members")}
              className="flex items-center justify-between bg-transparent border-none border-b border-border text-primary font-mono text-xs py-3 cursor-pointer w-full"
            >
              <span>See members</span>
              <span className="text-faint">→</span>
            </button>

            {squad.checkId && onUpdateSquadSize && (
              <div className="flex items-center justify-between py-3 border-b border-border">
                <span className="font-mono text-xs text-primary">Squad size</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const newSize = currentSize - 1;
                      if (newSize >= squad.members.length) {
                        onUpdateSquadSize(squad.checkId!, newSize);
                        onLocalSquadUpdate((prev) => ({ ...prev, maxSquadSize: newSize }));
                        onSquadUpdate((prev: Squad[]) =>
                          prev.map((s) => (s.id === squad.id ? { ...s, maxSquadSize: newSize } : s))
                        );
                      }
                    }}
                    disabled={!canShrink}
                    className={cn(
                      "size-6 rounded-md border border-border-mid bg-transparent font-mono text-sm flex items-center justify-center p-0",
                      canShrink ? "text-primary cursor-pointer" : "text-faint cursor-default"
                    )}
                  >
                    −
                  </button>
                  <span className="font-mono text-sm text-dt font-bold min-w-5 text-center">
                    {currentSize}
                  </span>
                  <button
                    onClick={() => {
                      const newSize = currentSize + 1;
                      if (newSize <= 20) {
                        onUpdateSquadSize(squad.checkId!, newSize);
                        onLocalSquadUpdate((prev) => ({ ...prev, maxSquadSize: newSize }));
                        onSquadUpdate((prev: Squad[]) =>
                          prev.map((s) => (s.id === squad.id ? { ...s, maxSquadSize: newSize } : s))
                        );
                      }
                    }}
                    disabled={!canGrow}
                    className={cn(
                      "size-6 rounded-md border border-border-mid bg-transparent font-mono text-sm flex items-center justify-center p-0",
                      canGrow ? "text-primary cursor-pointer" : "text-faint cursor-default"
                    )}
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            {onOpenDatePicker && (
              <button
                onClick={onOpenDatePicker}
                className="flex items-center justify-between bg-transparent border-none border-b border-border text-primary font-mono text-xs py-3 cursor-pointer w-full"
              >
                <span>Edit event</span>
                <span className="text-faint">→</span>
              </button>
            )}

            <button
              onClick={async () => {
                try {
                  const newExpiry = await db.extendSquad(squad.id);
                  onSquadUpdate((prev) =>
                    prev.map((s) => (s.id === squad.id ? { ...s, expiresAt: newExpiry } : s))
                  );
                  onLocalSquadUpdate((prev) => ({ ...prev, expiresAt: newExpiry }));
                } catch {}
                onClose();
              }}
              className="flex items-center justify-between bg-transparent border-none border-b border-border text-primary font-mono text-xs py-3 cursor-pointer w-full"
            >
              <span>Extend chat +7 days</span>
              <span className="text-faint">→</span>
            </button>

            <button
              onClick={() => {
                onClose();
                onRequestLeave();
              }}
              className="text-left bg-transparent border-none text-danger font-mono text-xs py-3 cursor-pointer w-full"
            >
              Leave squad
            </button>
          </div>
        </>
      ) : (
        <SquadMembersView
          squad={squad}
          dateConfirms={dateConfirms}
          onBack={() => setView("menu")}
          onClose={onClose}
          onViewProfile={onViewProfile}
          onRequestKick={onRequestKick}
          onSetMemberRole={onSetMemberRole}
          onAddMember={onAddMember}
          onSquadUpdate={onSquadUpdate}
          onLocalSquadUpdate={onLocalSquadUpdate}
        />
      )}
    </DetailSheet>
  );
}
