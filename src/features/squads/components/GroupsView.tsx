"use client";

import React from "react";
import * as db from "@/lib/db";
import cn from "@/lib/tailwindMerge";
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

const GroupsView = ({
  squads,
  onSelectSquad,
}: {
  squads: Squad[];
  onSelectSquad: (squad: Squad) => void;
}) => {
  return (
    <div className="px-5">
      <h2 className="font-serif text-[28px] text-primary mb-1 font-normal">
        Your Squads
      </h2>
      <p className="font-mono text-xs text-dim mb-6">
        Groups formed around events
      </p>

      {squads.length === 0 ? (
        <div className="text-center py-[60px] px-5 text-faint font-mono text-xs">
          No squads yet.<br />
          Say you&apos;re down on a friend&apos;s check and a squad forms automatically.
        </div>
      ) : (
        squads.map((g) => (
          <div
            key={g.id}
            onClick={() => onSelectSquad({ ...g, hasUnread: false })}
            className="bg-card rounded-2xl p-4 mb-2 border border-border cursor-pointer"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-start gap-2">
                <span className="font-serif text-[17px] text-primary font-normal">
                  {g.name}
                  {g.hasUnread && (
                    <span data-testid={`squad-unread-dot-${g.id}`} className="inline-block w-2 h-2 rounded-full bg-[#ff3b30] ml-1.5 align-middle" />
                  )}
                </span>
                {g.isWaitlisted && (
                  <span className="font-mono text-[9px] text-faint border border-border rounded px-[5px] py-px shrink-0 mt-[5px]">waitlist</span>
                )}
              </div>
              <span className="font-mono text-tiny text-faint shrink-0">
                {g.time}
                {(() => {
                  const exp = formatExpiryShort(g.expiresAt);
                  if (!exp) return null;
                  const msLeft = g.expiresAt ? new Date(g.expiresAt).getTime() - Date.now() : Infinity;
                  const isUrgent = msLeft < 24 * 60 * 60 * 1000;
                  return (
                    <span className={isUrgent ? "text-[#ff3b30]" : "text-faint"}>
                      {" · "}expires {exp}
                    </span>
                  );
                })()}
              </span>
            </div>
            <div className="font-mono text-xs text-muted mb-2 overflow-hidden text-ellipsis whitespace-nowrap">
              {g.lastMsg}
            </div>
          </div>
        ))
      )}

      <div className="text-center py-8 px-5 text-border-mid font-mono text-xs" style={{ lineHeight: 1.8 }}>
        squads dissolve after the event ✶
      </div>
    </div>
  );
};

export default GroupsView;
