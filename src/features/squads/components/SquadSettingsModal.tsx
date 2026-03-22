"use client";

import React, { useState } from "react";
import * as db from "@/lib/db";
import cn from "@/lib/tailwindMerge";
import { color } from "@/lib/styles";
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

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-9999"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-950 border border-neutral-900 rounded-2xl px-5 py-6 max-w-75 w-11/12 max-h-[70vh] overflow-y-auto"
      >
        {view === "menu" ? (
          <>
            <div className="flex flex-col items-center mb-5">
              <div className="flex items-center mb-1.5">
                {squad.members.slice(0, 4).map((m, idx) => {
                  const isLocked = squad.dateStatus === "locked";
                  const isProposed = squad.dateStatus === "proposed";
                  const confirmResponse = m.userId ? dateConfirms.get(m.userId) : undefined;
                  const isConfirmed = isLocked || (isProposed && dateConfirms.size > 0 && confirmResponse === "yes");
                  const isPending = isProposed && dateConfirms.size > 0 && confirmResponse !== "yes";
                  const avatarBg = isConfirmed ? color.accent : isPending ? color.borderLight : m.name === "You" ? color.accent : color.borderLight;
                  const avatarColor = isConfirmed ? "#000" : isPending ? color.dim : m.name === "You" ? "#000" : color.dim;
                  return (
                    <div
                      key={m.name}
                      className="size-6 rounded-full flex items-center justify-center font-mono text-tiny font-bold border-2 border-neutral-950 relative"
                      style={{ background: avatarBg, color: avatarColor, marginLeft: idx === 0 ? 0 : -6, zIndex: 4 - idx }}
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
              <span className="font-mono text-tiny text-neutral-500">
                {squad.members.length}{squad.maxSquadSize != null ? `/${squad.maxSquadSize}` : ""} member{squad.members.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="flex flex-col">
              <button
                onClick={() => setView("members")}
                className="bg-transparent border-none border-b border-neutral-900 text-white font-mono text-xs py-3 cursor-pointer text-center w-full"
              >
                See members
              </button>
              {squad.checkId && onUpdateSquadSize && (
                <div className="flex items-center justify-center gap-3 py-3 border-b border-neutral-900">
                  <span className="font-mono text-xs text-white">Squad size</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const newSize = (squad.maxSquadSize ?? 5) - 1;
                        if (newSize >= squad.members.length) {
                          onUpdateSquadSize(squad.checkId!, newSize);
                          onLocalSquadUpdate((prev) => ({ ...prev, maxSquadSize: newSize }));
                          onSquadUpdate((prev: Squad[]) => prev.map((s) => s.id === squad.id ? { ...s, maxSquadSize: newSize } : s));
                        }
                      }}
                      disabled={(squad.maxSquadSize ?? 5) <= squad.members.length}
                      className={cn("size-6 rounded-md border border-neutral-800 bg-transparent font-mono text-sm flex items-center justify-center p-0", {
                        "text-neutral-700 cursor-default": (squad.maxSquadSize ?? 5) <= squad.members.length,
                        "text-white cursor-pointer": (squad.maxSquadSize ?? 5) > squad.members.length,
                      })}
                    >
                      −
                    </button>
                    <span className="font-mono text-sm text-dt font-bold min-w-5 text-center">
                      {squad.maxSquadSize ?? 5}
                    </span>
                    <button
                      onClick={() => {
                        const newSize = (squad.maxSquadSize ?? 5) + 1;
                        if (newSize <= 20) {
                          onUpdateSquadSize(squad.checkId!, newSize);
                          onLocalSquadUpdate((prev) => ({ ...prev, maxSquadSize: newSize }));
                          onSquadUpdate((prev: Squad[]) => prev.map((s) => s.id === squad.id ? { ...s, maxSquadSize: newSize } : s));
                        }
                      }}
                      disabled={(squad.maxSquadSize ?? 5) >= 20}
                      className={cn("size-6 rounded-md border border-neutral-800 bg-transparent font-mono text-sm flex items-center justify-center p-0", {
                        "text-neutral-700 cursor-default": (squad.maxSquadSize ?? 5) >= 20,
                        "text-white cursor-pointer": (squad.maxSquadSize ?? 5) < 20,
                      })}
                    >
                      +
                    </button>
                  </div>
                </div>
              )}
              {onOpenDatePicker && (
                <button
                  onClick={onOpenDatePicker}
                  className="bg-transparent border-none border-b border-neutral-900 text-white font-mono text-xs py-3 cursor-pointer text-center w-full"
                >
                  Set plans
                </button>
              )}
              <button
                onClick={async () => {
                  try {
                    const newExpiry = await db.extendSquad(squad.id);
                    onSquadUpdate((prev) => prev.map((s) =>
                      s.id === squad.id ? { ...s, expiresAt: newExpiry } : s
                    ));
                    onLocalSquadUpdate((prev) => ({ ...prev, expiresAt: newExpiry }));
                  } catch {}
                  onClose();
                }}
                className="bg-transparent border-none border-b border-neutral-900 text-white font-mono text-xs py-3 cursor-pointer text-center w-full"
              >
                Extend +7 days
              </button>
              <button
                onClick={() => { onClose(); onRequestLeave(); }}
                className="bg-transparent border-none text-red-500 font-mono text-xs py-3 cursor-pointer text-center w-full"
              >
                Leave
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
      </div>
    </div>
  );
}
