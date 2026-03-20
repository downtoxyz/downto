"use client";

import React, { useState, useEffect } from "react";
import * as db from "@/lib/db";
import type { Profile } from "@/lib/types";
import { font, color } from "@/lib/styles";
import type { Event, InterestCheck, Friend } from "@/lib/ui-types";
import EventCard from "@/features/events/components/EventCard";
import CheckCard from "@/features/checks/components/CheckCard";
import FeedEmptyState from "./FeedEmptyState";

function Linkify({ children, dimmed, coAuthors }: { children: string; dimmed?: boolean; coAuthors?: { name: string }[] }) {
  const tokenRe = /(https?:\/\/[^\s),]+|@\S+)/g;
  const parts = children.split(tokenRe);
  if (parts.length === 1) return <>{children}</>;
  return (
    <>
      {parts.map((part, i) => {
        if (/^https?:\/\//.test(part)) {
          const display = (() => {
            try {
              const u = new URL(part);
              let d = u.host.replace(/^www\./, "") + u.pathname.replace(/\/$/, "");
              if (d.length > 40) d = d.slice(0, 37) + "…";
              return d;
            } catch { return part; }
          })();
          return (
            <a key={i} href={part} target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ color: dimmed ? color.dim : color.accent, textDecoration: "underline", textUnderlineOffset: 3, wordBreak: "break-all" }}
            >{display}</a>
          );
        }
        if (/^@\S+/.test(part)) {
          const mention = part.slice(1).toLowerCase();
          const matched = coAuthors?.find(ca => ca.name.toLowerCase() === mention || ca.name.split(" ")[0]?.toLowerCase() === mention);
          return <span key={i} style={{ color: color.accent, fontWeight: 600 }}>@{matched ? matched.name : part.slice(1)}</span>;
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}

export interface FeedViewProps {
  checks: InterestCheck[];
  setChecks: React.Dispatch<React.SetStateAction<InterestCheck[]>>;
  myCheckResponses: Record<string, "down" | "waitlist">;
  setMyCheckResponses: React.Dispatch<React.SetStateAction<Record<string, "down" | "waitlist">>>;
  events: Event[];
  newlyAddedId: string | null;
  newlyAddedCheckId: string | null;
  sharedCheckId?: string | null;
  friends: Friend[];
  userId: string | null;
  isDemoMode: boolean;
  profile: Profile | null;
  toggleSave: (id: string) => void;
  toggleDown: (id: string) => void;
  respondToCheck: (checkId: string) => void;
  startSquadFromCheck: (check: InterestCheck) => Promise<void>;
  loadRealData: () => Promise<void>;
  showToast: (msg: string) => void;
  onOpenSocial: (event: Event) => void;
  onEditEvent: (event: Event) => void;
  onOpenAdd: () => void;
  onOpenFriends: (tab?: "friends" | "add") => void;
  onNavigateToGroups: (squadId?: string) => void;
  hiddenCheckIds: Set<string>;
  pendingDownCheckIds: Set<string>;
  onHideCheck: (checkId: string) => void;
  onUnhideCheck: (checkId: string) => void;
  acceptCoAuthorTag: (checkId: string) => Promise<void>;
  declineCoAuthorTag: (checkId: string) => Promise<void>;
  onViewProfile?: (userId: string) => void;
}

export default function FeedView({
  checks,
  setChecks,
  myCheckResponses,
  setMyCheckResponses,
  events,
  newlyAddedId,
  newlyAddedCheckId,
  sharedCheckId,
  friends,
  userId,
  isDemoMode,
  profile,
  toggleSave,
  toggleDown,
  respondToCheck,
  startSquadFromCheck,
  loadRealData,
  showToast,
  onOpenSocial,
  onEditEvent,
  onOpenAdd,
  onOpenFriends,
  onNavigateToGroups,
  hiddenCheckIds,
  pendingDownCheckIds,
  onHideCheck,
  onUnhideCheck,
  acceptCoAuthorTag,
  declineCoAuthorTag,
  onViewProfile,
}: FeedViewProps) {
  const [showHidden, setShowHidden] = useState(false);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  // Batch-fetch initial comment counts for badges
  useEffect(() => {
    if (!checks.length || isDemoMode) return;
    db.getCheckCommentCounts(checks.map(c => c.id))
      .then(setCommentCounts)
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checks.map(c => c.id).join(","), isDemoMode]);

  const visibleChecks = checks
    .filter(c => !hiddenCheckIds.has(c.id) && c.expiresIn !== "expired")
    .sort((a, b) => {
      const tierOf = (c: InterestCheck) => (c.expiresIn !== "open" ? 0 : c.eventDate ? 1 : 2);
      const ta = tierOf(a), tb = tierOf(b);
      if (ta !== tb) return ta - tb;
      if (ta === 0) return b.expiryPercent - a.expiryPercent;
      if (ta === 1) return (a.eventDate ?? "").localeCompare(b.eventDate ?? "");
      return 0;
    });
  const hiddenChecks = checks.filter(c => hiddenCheckIds.has(c.id));

  return (
    <>
      <div style={{ padding: "8px 16px 0" }}>
        {checks.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: font.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", color: color.dim, marginBottom: 12, padding: "0 4px" }}>
              Pulse
            </div>
            {visibleChecks.map(check => (
              <CheckCard
                key={check.id}
                check={check}
                userId={userId}
                isDemoMode={isDemoMode}
                profile={profile}
                friends={friends}
                myCheckResponses={myCheckResponses}
                setMyCheckResponses={setMyCheckResponses}
                setChecks={setChecks}
                pendingDownCheckIds={pendingDownCheckIds}
                newlyAddedCheckId={newlyAddedCheckId}
                sharedCheckId={sharedCheckId}
                initialCommentCount={commentCounts[check.id] ?? 0}
                respondToCheck={respondToCheck}
                startSquadFromCheck={startSquadFromCheck}
                acceptCoAuthorTag={acceptCoAuthorTag}
                declineCoAuthorTag={declineCoAuthorTag}
                onHideCheck={onHideCheck}
                onNavigateToGroups={onNavigateToGroups}
                onViewProfile={onViewProfile}
                showToast={showToast}
                loadRealData={loadRealData}
              />
            ))}

            {hiddenChecks.length > 0 && (
              <div>
                <button
                  onClick={() => setShowHidden(prev => !prev)}
                  style={{ background: "transparent", border: "none", color: color.faint, fontFamily: font.mono, fontSize: 10, cursor: "pointer", padding: "6px 4px", display: "flex", alignItems: "center", gap: 4 }}
                >
                  <span style={{ fontSize: 8 }}>{showHidden ? "▼" : "▶"}</span>
                  Hidden ({hiddenChecks.length})
                </button>
                {showHidden && hiddenChecks.map(check => (
                  <div key={check.id} style={{ background: color.card, borderRadius: 14, overflow: "hidden", marginBottom: 8, border: `1px solid ${color.border}`, opacity: 0.6 }}>
                    <div style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: check.authorId ? "pointer" : undefined }}
                          onClick={(e) => { if (check.authorId && onViewProfile) { e.stopPropagation(); onViewProfile(check.authorId); } }}
                        >
                          <div style={{ width: 24, height: 24, borderRadius: "50%", background: color.borderLight, color: color.dim, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font.mono, fontSize: 10, fontWeight: 700 }}>
                            {check.author[0]}
                          </div>
                          <span style={{ fontFamily: font.mono, fontSize: 11, color: color.muted }}>
                            {check.author}
                            {check.viaFriendName && <span style={{ color: color.dim, fontWeight: 400 }}>{" "}via {check.viaFriendName}</span>}
                          </span>
                        </div>
                        <p style={{ fontFamily: font.serif, fontSize: 16, color: color.dim, margin: 0, lineHeight: 1.4 }}>
                          <Linkify dimmed coAuthors={check.coAuthors}>{check.text}</Linkify>
                        </p>
                      </div>
                      <button
                        onClick={() => onUnhideCheck(check.id)}
                        style={{ background: "transparent", border: `1px solid ${color.borderMid}`, borderRadius: 8, padding: "6px 10px", fontFamily: font.mono, fontSize: 10, color: color.dim, cursor: "pointer", flexShrink: 0, marginLeft: 12 }}
                      >Unhide</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {events.length > 0 ? (
          <>
            <div style={{ fontFamily: font.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", color: color.dim, marginBottom: 12, padding: "0 4px" }}>
              Events
            </div>
            {events.map(e => (
              <EventCard
                key={e.id}
                event={e}
                onToggleSave={() => toggleSave(e.id)}
                onToggleDown={() => toggleDown(e.id)}
                onOpenSocial={() => onOpenSocial(e)}
                onLongPress={(e.createdBy === userId || !e.createdBy || isDemoMode) ? () => onEditEvent(e) : undefined}
                isNew={e.id === newlyAddedId}
              />
            ))}
          </>
        ) : checks.length === 0 ? (
          <FeedEmptyState onOpenAdd={onOpenAdd} onOpenFriends={onOpenFriends} />
        ) : null}
      </div>
    </>
  );
}
