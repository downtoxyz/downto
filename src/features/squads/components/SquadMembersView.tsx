"use client";

import React, { useState } from "react";
import cn from "@/lib/tailwindMerge";
import { color } from "@/lib/styles";
import type { Squad } from "@/lib/ui-types";

interface SquadMembersViewProps {
  squad: Squad;
  dateConfirms: Map<string, "yes" | "no" | null>;
  onBack: () => void;
  onClose: () => void;
  onViewProfile?: (userId: string) => void;
  onRequestKick: (target: { name: string; userId: string }) => void;
  onSetMemberRole?: (squadId: string, userId: string, role: "member" | "waitlist") => Promise<void>;
  onAddMember?: (squadId: string, userId: string) => Promise<void>;
  onSquadUpdate: (updater: Squad[] | ((prev: Squad[]) => Squad[])) => void;
  onLocalSquadUpdate: React.Dispatch<React.SetStateAction<Squad>>;
}

export default function SquadMembersView({
  squad,
  dateConfirms,
  onBack,
  onClose,
  onViewProfile,
  onRequestKick,
  onSetMemberRole,
  onAddMember,
  onSquadUpdate,
  onLocalSquadUpdate,
}: SquadMembersViewProps) {
  const [memberMenu, setMemberMenu] = useState<{ name: string; userId: string } | null>(null);

  return (
    <>
      <button
        onClick={onBack}
        className="bg-transparent border-none text-dt font-mono text-xs cursor-pointer p-0 mb-4"
      >
        ← Back
      </button>

      <div className="flex flex-col gap-3">
        {squad.members.map((m) => {
          const isLocked = squad.dateStatus === "locked";
          const isProposed = squad.dateStatus === "proposed";
          const confirmResponse = m.userId ? dateConfirms.get(m.userId) : undefined;
          const isConfirmed = isLocked || (isProposed && dateConfirms.size > 0 && confirmResponse === "yes");
          const isGrayed = isProposed && dateConfirms.size > 0 && !isConfirmed;
          const showDateStatus = isLocked || (isProposed && dateConfirms.size > 0);
          return (
            <React.Fragment key={m.name}>
              <div
                onClick={() => {
                  if (m.name !== "You" && m.userId) {
                    onClose();
                    onViewProfile?.(m.userId);
                  }
                }}
                className={cn("flex items-center gap-2.5", {
                  "cursor-pointer": m.name !== "You" && !!m.userId,
                  "cursor-default": m.name === "You" || !m.userId,
                  "opacity-35": isGrayed,
                })}
              >
                <div
                  className="size-7 rounded-full flex items-center justify-center font-mono text-xs font-bold shrink-0"
                  style={{
                    background: isConfirmed ? color.accent : (m.name === "You" && !isGrayed) ? color.accent : color.borderLight,
                    color: isConfirmed || (m.name === "You" && !isGrayed) ? "#000" : color.dim,
                  }}
                >
                  {m.avatar}
                </div>
                <span className={cn("font-mono text-xs", { "text-neutral-700": isGrayed, "text-white": !isGrayed })}>
                  {m.name}
                </span>
                {m.name === "You" && (
                  <span className="font-mono text-tiny text-neutral-500">you</span>
                )}
                {m.name === "You" && showDateStatus && (
                  <span className={cn("font-mono text-tiny ml-auto", { "text-dt": isConfirmed, "text-neutral-700": !isConfirmed })}>
                    {isConfirmed ? "down" : confirmResponse === "no" ? "out" : "pending"}
                  </span>
                )}
                {m.name !== "You" && m.userId && (
                  <div className="flex gap-2 ml-auto items-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMemberMenu(memberMenu?.userId === m.userId ? null : { name: m.name, userId: m.userId! });
                      }}
                      className="bg-transparent border-none text-neutral-700 font-mono text-sm cursor-pointer px-1 py-0.5 tracking-widest"
                    >
                      •••
                    </button>
                    {showDateStatus && (
                      <span className={cn("font-mono text-tiny", { "text-dt": isConfirmed, "text-neutral-700": !isConfirmed })}>
                        {isConfirmed ? "down" : confirmResponse === "no" ? "out" : "pending"}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {memberMenu?.userId === m.userId && (
                <div className="bg-neutral-950 border border-neutral-900 rounded-lg py-1 mt-1 ml-10">
                  {onSetMemberRole && (
                    <button
                      onClick={async () => {
                        setMemberMenu(null);
                        onClose();
                        await onSetMemberRole(squad.id, m.userId!, "waitlist");
                        const updated = {
                          ...squad,
                          members: squad.members.filter((x) => x.userId !== m.userId),
                          waitlistedMembers: [...(squad.waitlistedMembers ?? []), { name: m.name, avatar: m.avatar, userId: m.userId! }],
                        };
                        onLocalSquadUpdate(updated);
                        onSquadUpdate((prev: Squad[]) => prev.map((s) => s.id === squad.id ? updated : s));
                      }}
                      className="block w-full bg-transparent border-none text-neutral-500 font-mono text-xs px-3.5 py-2 cursor-pointer text-left"
                    >
                      Move to waitlist
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setMemberMenu(null);
                      onClose();
                      onRequestKick({ name: m.name, userId: m.userId! });
                    }}
                    className="block w-full bg-transparent border-none text-red-500 font-mono text-xs px-3.5 py-2 cursor-pointer text-left"
                  >
                    Kick from squad
                  </button>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {squad.waitlistedMembers && squad.waitlistedMembers.length > 0 && (
        <div className="mt-4">
          <span className="font-mono text-tiny uppercase tracking-widest text-neutral-500">
            Waitlist
          </span>
          <div className="flex flex-col gap-3 mt-2.5">
            {squad.waitlistedMembers.map((m) => (
              <div
                key={m.userId}
                onClick={() => {
                  if (m.userId) {
                    onClose();
                    onViewProfile?.(m.userId);
                  }
                }}
                className={cn("flex items-center gap-2.5", m.userId ? "cursor-pointer" : "cursor-default")}
              >
                <div className="size-7 rounded-full flex items-center justify-center font-mono text-xs font-bold shrink-0 bg-neutral-800 text-neutral-500">
                  {m.avatar}
                </div>
                <span className="font-mono text-xs text-neutral-500 flex-1">{m.name}</span>
                {onSetMemberRole && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      const isFull = squad.members.length >= (squad.maxSquadSize ?? Infinity);
                      if (isFull) return;
                      await onSetMemberRole(squad.id, m.userId, "member");
                      const updated = {
                        ...squad,
                        members: [...squad.members, { name: m.name, avatar: m.avatar, userId: m.userId }],
                        waitlistedMembers: (squad.waitlistedMembers ?? []).filter((x) => x.userId !== m.userId),
                      };
                      onLocalSquadUpdate(updated);
                      onSquadUpdate((prev: Squad[]) => prev.map((s) => s.id === squad.id ? updated : s));
                    }}
                    disabled={squad.members.length >= (squad.maxSquadSize ?? Infinity)}
                    className={cn("bg-transparent border border-neutral-800 rounded-lg font-mono text-xs font-bold px-2.5 py-1", {
                      "text-neutral-700 cursor-default": squad.members.length >= (squad.maxSquadSize ?? Infinity),
                      "text-dt cursor-pointer": squad.members.length < (squad.maxSquadSize ?? Infinity),
                    })}
                  >
                    Promote
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {squad.downResponders && squad.downResponders.length > 0 &&
        squad.members.length < (squad.maxSquadSize ?? Infinity) && (
        <div className="mt-4">
          <span className="font-mono text-tiny uppercase tracking-widest text-neutral-500">
            Down on check
          </span>
          <div className="flex flex-col gap-3 mt-2.5">
            {squad.downResponders.map((p) => (
              <div key={p.userId} className="flex items-center gap-2.5">
                <div className="size-7 rounded-full flex items-center justify-center font-mono text-xs font-bold shrink-0 bg-neutral-800 text-neutral-500">
                  {p.avatar}
                </div>
                <span className="font-mono text-xs text-white flex-1">{p.name}</span>
                {onAddMember && (
                  <button
                    onClick={async () => {
                      await onAddMember(squad.id, p.userId);
                      const newMember = { name: p.name, avatar: p.avatar, userId: p.userId };
                      const updated = {
                        ...squad,
                        members: [...squad.members, newMember],
                        downResponders: squad.downResponders?.filter((d) => d.userId !== p.userId),
                      };
                      onLocalSquadUpdate(updated);
                      onSquadUpdate((prev: Squad[]) => prev.map((s) => s.id === squad.id ? updated : s));
                    }}
                    className="bg-transparent border border-neutral-800 rounded-lg text-dt font-mono text-xs font-bold px-2.5 py-1 cursor-pointer"
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
  );
}
