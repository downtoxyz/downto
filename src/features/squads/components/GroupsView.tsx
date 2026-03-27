"use client";

import React from "react";
import * as db from "@/lib/db";
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

const GroupsView = ({
  squads,
  onSelectSquad,
}: {
  squads: Squad[];
  onSelectSquad: (squad: Squad) => void;
}) => {
  return (
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
          Say you&apos;re down on a friend&apos;s check and a squad forms automatically.
        </div>
      ) : (
        squads.map((g) => (
          <div
            key={g.id}
            onClick={() => onSelectSquad({ ...g, hasUnread: false })}
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
                    <span data-testid={`squad-unread-dot-${g.id}`} style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#ff3b30", marginLeft: 6, verticalAlign: "middle" }} />
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
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {g.lastMsg}
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
