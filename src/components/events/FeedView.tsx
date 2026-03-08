"use client";

import React, { useState } from "react";
import * as db from "@/lib/db";
import type { Profile } from "@/lib/types";
import { font, color } from "@/lib/styles";
import type { Event, InterestCheck, Friend } from "@/lib/ui-types";
import EventCard from "@/components/events/EventCard";
import EditCheckModal from "@/components/events/EditCheckModal";
import { logError } from "@/lib/logger";

/** Render @mentions highlighted + inline URLs as clickable links */
function Linkify({ children, dimmed, coAuthors }: { children: string; dimmed?: boolean; coAuthors?: { name: string }[] }) {
  // Split on URLs and @mentions
  const tokenRe = /(https?:\/\/[^\s),]+|@\S+)/g;
  const parts = children.split(tokenRe);
  if (parts.length === 1) return <>{children}</>;
  return (
    <>
      {parts.map((part, i) => {
        if (/^https?:\/\//.test(part)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                color: dimmed ? color.dim : color.accent,
                textDecoration: "underline",
                textUnderlineOffset: 3,
                wordBreak: "break-all",
              }}
            >
              {prettifyUrl(part)}
            </a>
          );
        }
        if (/^@\S+/.test(part)) {
          const mention = part.slice(1).toLowerCase();
          const matched = coAuthors?.find(ca =>
            ca.name.toLowerCase() === mention ||
            ca.name.split(' ')[0]?.toLowerCase() === mention
          );
          return (
            <span key={i} style={{ color: color.accent, fontWeight: 600 }}>
              @{matched ? matched.name : part.slice(1)}
            </span>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}

function prettifyUrl(url: string): string {
  try {
    const u = new URL(url);
    // Show host + path, drop trailing slash
    let display = u.host.replace(/^www\./, "") + u.pathname.replace(/\/$/, "");
    // Truncate long paths
    if (display.length > 40) display = display.slice(0, 37) + "…";
    return display;
  } catch {
    return url;
  }
}

export interface FeedViewProps {
  feedMode: "foryou" | "tonight";
  setFeedMode: (mode: "foryou" | "tonight") => void;
  checks: InterestCheck[];
  setChecks: React.Dispatch<React.SetStateAction<InterestCheck[]>>;
  myCheckResponses: Record<string, "down" | "maybe">;
  setMyCheckResponses: React.Dispatch<React.SetStateAction<Record<string, "down" | "maybe">>>;
  events: Event[];
  setEvents: React.Dispatch<React.SetStateAction<Event[]>>;
  tonightEvents: Event[];
  setTonightEvents: React.Dispatch<React.SetStateAction<Event[]>>;
  newlyAddedId: string | null;
  newlyAddedCheckId: string | null;
  friends: Friend[];
  suggestions: Friend[];
  setSuggestions: React.Dispatch<React.SetStateAction<Friend[]>>;
  userId: string | null;
  isDemoMode: boolean;
  profile: Profile | null;
  // Callbacks
  toggleSave: (id: string) => void;
  toggleDown: (id: string) => void;
  respondToCheck: (checkId: string, status: "down" | "maybe") => void;
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
}

export default function FeedView({
  feedMode,
  setFeedMode,
  checks,
  setChecks,
  myCheckResponses,
  setMyCheckResponses,
  events,
  setEvents,
  tonightEvents,
  setTonightEvents,
  newlyAddedId,
  newlyAddedCheckId,
  friends,
  suggestions,
  setSuggestions,
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
}: FeedViewProps) {
  const [showHidden, setShowHidden] = useState(false);
  const [expandedCheckId, setExpandedCheckId] = useState<string | null>(null);
  const [editModalCheck, setEditModalCheck] = useState<InterestCheck | null>(null);

  const visibleChecks = checks
    .filter((c) => !hiddenCheckIds.has(c.id))
    .sort((a, b) => {
      const tierOf = (c: InterestCheck) =>
        c.expiresIn !== "open" ? 0 : c.eventDate ? 1 : 2;
      const ta = tierOf(a), tb = tierOf(b);
      if (ta !== tb) return ta - tb;
      // Tier 0: most urgent first
      if (ta === 0) return b.expiryPercent - a.expiryPercent;
      // Tier 1: soonest date first
      if (ta === 1) return (a.eventDate ?? "").localeCompare(b.eventDate ?? "");
      // Tier 2: no further ordering needed
      return 0;
    });
  const hiddenChecks = checks.filter((c) => hiddenCheckIds.has(c.id));
  return (
    <>
          <div style={{ padding: "0 16px", animation: "fadeIn 0.3s ease" }}>
            {/* Feed mode toggle */}
            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 16,
                padding: "0 4px",
              }}
            >
              <button
                onClick={() => setFeedMode("foryou")}
                style={{
                  background: feedMode === "foryou" ? color.accent : "transparent",
                  color: feedMode === "foryou" ? "#000" : color.dim,
                  border: feedMode === "foryou" ? "none" : `1px solid ${color.borderMid}`,
                  borderRadius: 20,
                  padding: "8px 16px",
                  fontFamily: font.mono,
                  fontSize: 11,
                  fontWeight: feedMode === "foryou" ? 700 : 400,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                For You
              </button>
              <button
                onClick={() => setFeedMode("tonight")}
                style={{
                  background: feedMode === "tonight" ? color.accent : "transparent",
                  color: feedMode === "tonight" ? "#000" : color.dim,
                  border: feedMode === "tonight" ? "none" : `1px solid ${color.borderMid}`,
                  borderRadius: 20,
                  padding: "8px 16px",
                  fontFamily: font.mono,
                  fontSize: 11,
                  fontWeight: feedMode === "tonight" ? 700 : 400,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Tonight ✶
              </button>
            </div>

            {feedMode === "foryou" ? (
              <>
                {/* Interest checks section */}
                {checks.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <div
                      style={{
                        fontFamily: font.mono,
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.15em",
                        color: color.dim,
                        marginBottom: 12,
                        padding: "0 4px",
                      }}
                    >
                      Pulse
                    </div>
                    {visibleChecks.map((check) => (
                      <div
                        key={check.id}
                        ref={check.id === newlyAddedCheckId ? (el) => {
                          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                        } : undefined}
                        style={{
                          background: (check.isYours || check.isCoAuthor) ? "rgba(232,255,90,0.05)" : color.card,
                          borderRadius: 14,
                          overflow: "hidden",
                          marginBottom: 8,
                          border: `1px solid ${check.id === newlyAddedCheckId ? "rgba(90,200,255,0.5)" : (check.isYours || check.isCoAuthor) ? "rgba(232,255,90,0.2)" : color.border}`,
                          ...(check.id === newlyAddedCheckId ? { animation: "checkGlow 2s ease-in-out infinite" } : {}),
                        }}
                      >
                        {/* Expiry progress bar — hidden for open (no expiry) checks */}
                        {check.expiresIn !== "open" && (
                          <div
                            style={{
                              height: 3,
                              background: color.border,
                              position: "relative",
                            }}
                          >
                            <div
                              style={{
                                position: "absolute",
                                left: 0,
                                top: 0,
                                height: "100%",
                                width: `${100 - check.expiryPercent}%`,
                                background: check.expiryPercent > 75
                                  ? "#ff6b6b"
                                  : check.expiryPercent > 50
                                  ? "#ffaa5a"
                                  : "#4ade80",
                                transition: "width 1s ease",
                              }}
                            />
                          </div>
                        )}
                        <div style={{ padding: 14 }}>
                        {/* Movie enrichment card */}
                        {check.movieTitle && (
                          <div
                            onClick={(e) => {
                              if (check.letterboxdUrl) {
                                e.stopPropagation();
                                window.open(check.letterboxdUrl, "_blank", "noopener");
                              }
                            }}
                            style={{
                              display: "flex",
                              gap: 10,
                              marginBottom: 12,
                              padding: 10,
                              background: color.deep,
                              borderRadius: 10,
                              border: `1px solid ${color.borderLight}`,
                              cursor: check.letterboxdUrl ? "pointer" : undefined,
                            }}>
                            {check.thumbnail && (
                              <img
                                src={check.thumbnail}
                                alt={check.movieTitle}
                                style={{
                                  width: 48,
                                  height: 72,
                                  objectFit: "cover",
                                  borderRadius: 6,
                                  flexShrink: 0,
                                }}
                              />
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                fontFamily: font.serif,
                                fontSize: 15,
                                color: color.text,
                                lineHeight: 1.2,
                                marginBottom: 2,
                              }}>
                                {check.movieTitle}
                              </div>
                              <div style={{
                                fontFamily: font.mono,
                                fontSize: 10,
                                color: color.muted,
                                marginBottom: 4,
                              }}>
                                {check.year}{check.director && ` · ${check.director}`}
                              </div>
                              {check.vibes && check.vibes.length > 0 && (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                                  {check.vibes.slice(0, 3).map((v) => (
                                    <span
                                      key={v}
                                      style={{
                                        background: "#1f1f1f",
                                        color: color.accent,
                                        padding: "2px 6px",
                                        borderRadius: 12,
                                        fontFamily: font.mono,
                                        fontSize: 8,
                                        textTransform: "uppercase",
                                        letterSpacing: "0.08em",
                                      }}
                                    >
                                      {v}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            marginBottom: 10,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: "50%",
                                background: check.isYours ? color.accent : color.borderLight,
                                color: check.isYours ? "#000" : color.dim,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontFamily: font.mono,
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              {check.author[0]}
                            </div>
                            <span
                              style={{
                                fontFamily: font.mono,
                                fontSize: 11,
                                color: (check.isYours || check.isCoAuthor) ? color.accent : color.muted,
                              }}
                            >
                              {check.author}
                              {check.viaFriendName && (
                                <span style={{ color: color.dim, fontWeight: 400 }}>
                                  {" "}via {check.viaFriendName}
                                </span>
                              )}
                            </span>
                            {check.coAuthors && check.coAuthors.filter(ca => ca.status === 'accepted').length > 0 && (
                              <div style={{ display: "flex", alignItems: "center", marginLeft: 4 }}>
                                <span style={{ color: color.dim, fontFamily: font.mono, fontSize: 10, marginRight: 2 }}>+</span>
                                {check.coAuthors.filter(ca => ca.status === 'accepted').slice(0, 3).map((ca, i) => (
                                  <div key={ca.userId} style={{
                                    width: 18, height: 18, borderRadius: "50%",
                                    background: ca.userId === userId ? color.accent : color.borderLight,
                                    color: ca.userId === userId ? "#000" : color.dim,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontFamily: font.mono, fontSize: 7, fontWeight: 700,
                                    marginLeft: i > 0 ? -4 : 0,
                                    border: `1.5px solid ${color.card}`,
                                  }}>
                                    {ca.avatar}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span
                              style={{
                                fontFamily: font.mono,
                                fontSize: 10,
                                color: check.expiresIn === "open" ? color.dim : check.expiryPercent > 75 ? "#ff6b6b" : color.faint,
                              }}
                            >
                              {check.expiresIn === "open" ? "open" : check.expiresIn === "expired" ? "expired" : `${check.expiresIn} left`}
                            </span>
                            {!check.isYours && !check.isCoAuthor && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onHideCheck(check.id);
                                }}
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  color: color.faint,
                                  padding: "2px 4px",
                                  fontFamily: font.mono,
                                  fontSize: 12,
                                  cursor: "pointer",
                                  lineHeight: 1,
                                }}
                                title="Hide this check"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                        {check.pendingTagForYou && (
                          <div style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "8px 16px", marginBottom: 0,
                            background: "rgba(232,255,90,0.06)",
                            borderBottom: "1px solid rgba(232,255,90,0.15)",
                          }}>
                            <span style={{ fontFamily: font.mono, fontSize: 11, color: color.accent }}>
                              You were tagged as co-author
                            </span>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                onClick={(e) => { e.stopPropagation(); acceptCoAuthorTag(check.id); }}
                                style={{
                                  background: color.accent, color: "#000", border: "none",
                                  borderRadius: 8, padding: "4px 10px",
                                  fontFamily: font.mono, fontSize: 10, fontWeight: 700,
                                  cursor: "pointer", textTransform: "uppercase",
                                }}
                              >
                                Accept
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); declineCoAuthorTag(check.id); }}
                                style={{
                                  background: "transparent", color: color.dim,
                                  border: `1px solid ${color.borderMid}`, borderRadius: 8,
                                  padding: "4px 8px",
                                  fontFamily: font.mono, fontSize: 10, cursor: "pointer",
                                }}
                              >
                                Decline
                              </button>
                            </div>
                          </div>
                        )}
                        <div style={{ marginBottom: 12 }}>
                              <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                                <p
                                  style={{
                                    fontFamily: font.serif,
                                    fontSize: 18,
                                    color: color.text,
                                    margin: 0,
                                    fontWeight: 400,
                                    lineHeight: 1.4,
                                    flex: 1,
                                  }}
                                >
                                  <Linkify coAuthors={check.coAuthors}>{check.text}</Linkify>
                                </p>
                                {(check.isYours || check.isCoAuthor) && (
                                  <div style={{ display: "flex", gap: 4, flexShrink: 0, marginTop: 2 }}>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditModalCheck(check);
                                      }}
                                      style={{
                                        background: "transparent",
                                        border: `1px solid ${color.border}`,
                                        borderRadius: 8,
                                        color: color.dim,
                                        padding: "6px 10px",
                                        fontFamily: font.mono,
                                        fontSize: 13,
                                        cursor: "pointer",
                                        lineHeight: 1,
                                      }}
                                    >
                                      &#9998;
                                    </button>
                                    {!check.squadId && (
                                      <button
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          setChecks((prev) => prev.filter((c) => c.id !== check.id));
                                          if (!isDemoMode) {
                                            try {
                                              await db.deleteInterestCheck(check.id);
                                            } catch (err) {
                                              logError("deleteCheck", err, { checkId: check.id });
                                            }
                                          }
                                          showToast("Check removed");
                                        }}
                                        style={{
                                          background: "transparent",
                                          border: `1px solid ${color.border}`,
                                          borderRadius: 8,
                                          color: color.dim,
                                          padding: "6px 10px",
                                          fontFamily: font.mono,
                                          fontSize: 13,
                                          cursor: "pointer",
                                          lineHeight: 1,
                                        }}
                                      >
                                        &#10005;
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                              {(check.eventDateLabel || check.eventTime) && (
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                                  {check.eventDateLabel && (
                                    <span style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 4,
                                      padding: "3px 8px",
                                      background: "rgba(232,255,90,0.08)",
                                      border: "1px solid rgba(232,255,90,0.2)",
                                      borderRadius: 6,
                                      fontFamily: font.mono,
                                      fontSize: 10,
                                      color: color.accent,
                                      fontWeight: 600,
                                    }}>
                                      {check.eventDateLabel}
                                      {check.dateFlexible && (
                                        <span style={{
                                          padding: "0px 4px",
                                          background: "rgba(232,255,90,0.15)",
                                          borderRadius: 3,
                                          fontSize: 8,
                                        }}>flexible</span>
                                      )}
                                    </span>
                                  )}
                                  {check.eventTime && (
                                    <span style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 4,
                                      padding: "3px 8px",
                                      background: "rgba(232,255,90,0.08)",
                                      border: "1px solid rgba(232,255,90,0.2)",
                                      borderRadius: 6,
                                      fontFamily: font.mono,
                                      fontSize: 10,
                                      color: color.accent,
                                      fontWeight: 600,
                                    }}>
                                      {check.eventTime}
                                      {check.timeFlexible && (
                                        <span style={{
                                          padding: "0px 4px",
                                          background: "rgba(232,255,90,0.15)",
                                          borderRadius: 3,
                                          fontSize: 8,
                                        }}>flexible</span>
                                      )}
                                    </span>
                                  )}
                                </div>
                              )}
                            {(check.isYours || check.isCoAuthor) && !check.squadId && check.responses.some((r) => r.status === "down") && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startSquadFromCheck(check);
                                }}
                                style={{
                                  background: "transparent",
                                  color: color.accent,
                                  border: `1px solid ${color.accent}`,
                                  borderRadius: 6,
                                  padding: "4px 8px",
                                  fontFamily: font.mono,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  marginTop: 6,
                                }}
                              >
                                Squad →
                              </button>
                            )}
                          </div>
                        <div style={{ marginTop: 8 }}>
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              alignItems: "center",
                              gap: "8px 12px",
                            }}
                          >
                          {check.responses.length > 0 ? (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedCheckId(expandedCheckId === check.id ? null : check.id);
                              }}
                              style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", minWidth: 0 }}
                            >
                              <div style={{ display: "flex", flexShrink: 0 }}>
                                {check.responses.slice(0, 6).map((r, i) => (
                                  <div
                                    key={r.name}
                                    style={{
                                      width: 24,
                                      height: 24,
                                      borderRadius: "50%",
                                      background:
                                        r.status === "down"
                                          ? color.accent
                                          : r.status === "maybe"
                                          ? color.borderLight
                                          : color.faint,
                                      color: r.status === "down" ? "#000" : color.dim,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontFamily: font.mono,
                                      fontSize: 9,
                                      fontWeight: 700,
                                      marginLeft: i > 0 ? -6 : 0,
                                      border: `2px solid ${color.card}`,
                                    }}
                                  >
                                    {r.avatar}
                                  </div>
                                ))}
                                {check.responses.length > 6 && (
                                  <div
                                    style={{
                                      width: 24,
                                      height: 24,
                                      borderRadius: "50%",
                                      background: color.faint,
                                      color: color.dim,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontFamily: font.mono,
                                      fontSize: 8,
                                      fontWeight: 700,
                                      marginLeft: -6,
                                      border: `2px solid ${color.card}`,
                                    }}
                                  >
                                    +{check.responses.length - 6}
                                  </div>
                                )}
                              </div>
                              <span
                                style={{
                                  fontFamily: font.mono,
                                  fontSize: 10,
                                  color: color.accent,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {check.responses.filter((r) => r.status === "down").length} down
                                {check.responses.some((r) => r.status === "maybe") && (
                                  <span style={{ color: color.dim }}>
                                    {" "}{check.responses.filter((r) => r.status === "maybe").length} maybe
                                  </span>
                                )}
                                {" "}<span style={{ color: color.faint, fontSize: 8, paddingRight: 4 }}>{expandedCheckId === check.id ? "▴" : "▾"}</span>
                              </span>
                            </div>
                          ) : (
                            <span
                              style={{
                                fontFamily: font.mono,
                                fontSize: 10,
                                color: color.faint,
                              }}
                            >
                              no responses yet
                            </span>
                          )}
                          {!check.isYours && (
                            <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: "auto" }}>
                              <button
                                onClick={() => {
                                  if (myCheckResponses[check.id] === "down") {
                                    // Undo — optimistically clear response + squad membership
                                    setMyCheckResponses((prev) => {
                                      const next = { ...prev };
                                      delete next[check.id];
                                      return next;
                                    });
                                    setChecks((prev) =>
                                      prev.map((c) =>
                                        c.id === check.id
                                          ? { ...c, responses: c.responses.filter((r) => r.name !== "You"), inSquad: undefined }
                                          : c
                                      )
                                    );
                                    if (!isDemoMode && check.id) {
                                      db.removeCheckResponse(check.id)
                                        .then(() => loadRealData())
                                        .catch((err) => logError("removeCheckResponse", err, { checkId: check.id }));
                                    }
                                  } else {
                                    respondToCheck(check.id, "down");
                                  }
                                }}
                                style={{
                                  background: myCheckResponses[check.id] === "down" ? color.accent : "transparent",
                                  color: myCheckResponses[check.id] === "down" ? "#000" : color.text,
                                  border: myCheckResponses[check.id] === "down" ? "none" : `1px solid ${color.borderMid}`,
                                  borderRadius: 8,
                                  padding: "6px 10px",
                                  fontFamily: font.mono,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  whiteSpace: "nowrap" as const,
                                }}
                              >
                                {myCheckResponses[check.id] === "down" ? "✓ Down" : "Down"}
                              </button>
                              <button
                                onClick={() => {
                                  if (myCheckResponses[check.id] === "maybe") {
                                    // Undo — optimistically clear response + squad membership
                                    setMyCheckResponses((prev) => {
                                      const next = { ...prev };
                                      delete next[check.id];
                                      return next;
                                    });
                                    setChecks((prev) =>
                                      prev.map((c) =>
                                        c.id === check.id
                                          ? { ...c, responses: c.responses.filter((r) => r.name !== "You"), inSquad: undefined }
                                          : c
                                      )
                                    );
                                    if (!isDemoMode && check.id) {
                                      db.removeCheckResponse(check.id)
                                        .then(() => loadRealData())
                                        .catch((err) => logError("removeCheckResponse", err, { checkId: check.id }));
                                    }
                                  } else {
                                    respondToCheck(check.id, "maybe");
                                  }
                                }}
                                style={{
                                  background: myCheckResponses[check.id] === "maybe" ? color.dim : "transparent",
                                  color: myCheckResponses[check.id] === "maybe" ? "#000" : color.dim,
                                  border: `1px solid ${color.borderMid}`,
                                  borderRadius: 8,
                                  padding: "6px 8px",
                                  fontFamily: font.mono,
                                  fontSize: 10,
                                  cursor: "pointer",
                                  whiteSpace: "nowrap" as const,
                                }}
                              >
                                {myCheckResponses[check.id] === "maybe" ? "✓ Maybe" : "Maybe"}
                              </button>
                              {myCheckResponses[check.id] === "down" && (() => {
                                const memberCount = check.squadMemberCount ?? 0;
                                const maxSize = check.maxSquadSize ?? 5;
                                const isUnlimited = maxSize >= 999;
                                const isFull = !isUnlimited && memberCount >= maxSize;
                                const capacityLabel = isUnlimited ? `${memberCount}/∞` : `${memberCount}/${maxSize}`;
                                return (
                                check.inSquad ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onNavigateToGroups(check.squadId!);
                                    }}
                                    style={{
                                      background: "rgba(175, 82, 222, 0.1)",
                                      color: "#AF52DE",
                                      border: "none",
                                      borderRadius: 8,
                                      padding: "6px 8px",
                                      fontFamily: font.mono,
                                      fontSize: 10,
                                      fontWeight: 700,
                                      cursor: "pointer",
                                      whiteSpace: "nowrap" as const,
                                    }}
                                  >
                                    💬 Squad →{check.squadId && <span style={{ color: "rgba(175, 82, 222, 0.6)", marginLeft: 4, fontWeight: 400 }}>{capacityLabel}</span>}
                                  </button>
                                ) : check.isWaitlisted ? (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onNavigateToGroups(check.squadId!);
                                      }}
                                      style={{
                                        background: "transparent",
                                        color: color.faint,
                                        border: `1px solid ${color.border}`,
                                        borderRadius: 8,
                                        padding: "6px 8px",
                                        fontFamily: font.mono,
                                        fontSize: 10,
                                        fontWeight: 700,
                                        cursor: "pointer",
                                        whiteSpace: "nowrap" as const,
                                      }}
                                    >
                                      Waitlisted<span style={{ fontWeight: 400, marginLeft: 4 }}>{capacityLabel}</span>
                                    </button>
                                ) : check.squadId && !isFull ? (
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        try {
                                          const result = await db.joinSquadIfRoom(check.squadId!);
                                          if (result === 'waitlisted') {
                                            showToast("Squad is full — you're on the waitlist");
                                            await loadRealData();
                                            return;
                                          }
                                          showToast("Joined the squad! 🚀");
                                        } catch (err: unknown) {
                                          const code = err && typeof err === 'object' && 'code' in err ? err.code : '';
                                          if (code !== '23505') {
                                            logError("joinSquad", err, { squadId: check.squadId });
                                            showToast("Failed to join squad");
                                            return;
                                          }
                                          // Already a member — proceed normally
                                        }
                                        await loadRealData();
                                        onNavigateToGroups(check.squadId!);
                                      }}
                                      style={{
                                        background: "transparent",
                                        color: "#AF52DE",
                                        border: "1px solid #AF52DE",
                                        borderRadius: 8,
                                        padding: "6px 8px",
                                        fontFamily: font.mono,
                                        fontSize: 10,
                                        fontWeight: 700,
                                        cursor: "pointer",
                                        whiteSpace: "nowrap" as const,
                                      }}
                                    >
                                      Join Squad →<span style={{ color: color.dim, marginLeft: 4, fontWeight: 400 }}>{capacityLabel}</span>
                                    </button>
                                ) : check.squadId && isFull ? (
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        try {
                                          const result = await db.joinSquadIfRoom(check.squadId!);
                                          showToast(result === 'joined' ? "Joined the squad! 🚀" : "Squad is full — you're on the waitlist");
                                          await loadRealData();
                                          if (result === 'joined') onNavigateToGroups(check.squadId!);
                                        } catch (err: unknown) {
                                          logError("waitlistSquad", err, { squadId: check.squadId });
                                          showToast("Failed to join waitlist");
                                        }
                                      }}
                                      style={{
                                        background: "transparent",
                                        color: color.faint,
                                        border: `1px solid ${color.border}`,
                                        borderRadius: 8,
                                        padding: "6px 8px",
                                        fontFamily: font.mono,
                                        fontSize: 10,
                                        fontWeight: 700,
                                        cursor: "pointer",
                                        whiteSpace: "nowrap" as const,
                                      }}
                                    >
                                      Waitlist →<span style={{ fontWeight: 400, marginLeft: 4 }}>{capacityLabel}</span>
                                    </button>
                                ) : pendingDownCheckIds.has(check.id) ? (
                                  <span style={{
                                    fontFamily: font.mono,
                                    fontSize: 10,
                                    color: color.dim,
                                    padding: "6px 8px",
                                  }}>
                                    ...
                                  </span>
                                ) : (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startSquadFromCheck(check);
                                    }}
                                    style={{
                                      background: "transparent",
                                      color: color.accent,
                                      border: `1px solid ${color.accent}`,
                                      borderRadius: 8,
                                      padding: "6px 8px",
                                      fontFamily: font.mono,
                                      fontSize: 10,
                                      fontWeight: 700,
                                      cursor: "pointer",
                                      whiteSpace: "nowrap" as const,
                                    }}
                                  >
                                    Squad →
                                  </button>
                                )
                                ); })()}
                            </div>
                          )}
                          {(check.isYours || check.isCoAuthor) && check.squadId && (
                            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onNavigateToGroups(check.squadId!);
                                }}
                                style={{
                                  background: "rgba(175, 82, 222, 0.1)",
                                  color: "#AF52DE",
                                  border: "none",
                                  borderRadius: 8,
                                  padding: "6px 8px",
                                  fontFamily: font.mono,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  whiteSpace: "nowrap" as const,
                                }}
                              >
                                💬 Squad →<span style={{ color: "rgba(175, 82, 222, 0.6)", marginLeft: 4, fontWeight: 400 }}>{check.squadMemberCount ?? 0}{check.maxSquadSize && check.maxSquadSize < 999 ? `/${check.maxSquadSize}` : `/∞`}</span>
                              </button>
                            </div>
                          )}
                          </div>
                          {expandedCheckId === check.id && check.responses.length > 0 && (
                            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                              {check.responses.filter((r) => r.status === "down").length > 0 && (
                                <div>
                                  <span style={{ fontFamily: font.mono, fontSize: 9, color: color.accent, textTransform: "uppercase", letterSpacing: "0.1em" }}>Down</span>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                                    {check.responses.filter((r) => r.status === "down").map((r) => (
                                      <span key={r.name} style={{
                                        fontFamily: font.mono, fontSize: 11, color: "#000", background: color.accent,
                                        padding: "3px 8px", borderRadius: 6, fontWeight: 600,
                                      }}>{r.name}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {check.responses.filter((r) => r.status === "maybe").length > 0 && (
                                <div>
                                  <span style={{ fontFamily: font.mono, fontSize: 9, color: color.dim, textTransform: "uppercase", letterSpacing: "0.1em" }}>Maybe</span>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                                    {check.responses.filter((r) => r.status === "maybe").map((r) => (
                                      <span key={r.name} style={{
                                        fontFamily: font.mono, fontSize: 11, color: color.dim, background: color.borderLight,
                                        padding: "3px 8px", borderRadius: 6,
                                      }}>{r.name}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        </div>
                      </div>
                    ))}
                    {hiddenChecks.length > 0 && (
                      <div>
                        <button
                          onClick={() => setShowHidden((prev) => !prev)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: color.faint,
                            fontFamily: font.mono,
                            fontSize: 10,
                            cursor: "pointer",
                            padding: "6px 4px",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <span style={{ fontSize: 8 }}>{showHidden ? "▼" : "▶"}</span>
                          Hidden ({hiddenChecks.length})
                        </button>
                        {showHidden && hiddenChecks.map((check) => (
                          <div
                            key={check.id}
                            style={{
                              background: color.card,
                              borderRadius: 14,
                              overflow: "hidden",
                              marginBottom: 8,
                              border: `1px solid ${color.border}`,
                              opacity: 0.6,
                            }}
                          >
                            <div style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                  <div
                                    style={{
                                      width: 24,
                                      height: 24,
                                      borderRadius: "50%",
                                      background: color.borderLight,
                                      color: color.dim,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontFamily: font.mono,
                                      fontSize: 10,
                                      fontWeight: 700,
                                    }}
                                  >
                                    {check.author[0]}
                                  </div>
                                  <span style={{ fontFamily: font.mono, fontSize: 11, color: color.muted }}>
                                    {check.author}
                                    {check.viaFriendName && (
                                      <span style={{ color: color.dim, fontWeight: 400 }}>
                                        {" "}via {check.viaFriendName}
                                      </span>
                                    )}
                                  </span>
                                </div>
                                <p style={{ fontFamily: font.serif, fontSize: 16, color: color.dim, margin: 0, lineHeight: 1.4 }}>
                                  <Linkify dimmed coAuthors={check.coAuthors}>{check.text}</Linkify>
                                </p>
                              </div>
                              <button
                                onClick={() => onUnhideCheck(check.id)}
                                style={{
                                  background: "transparent",
                                  border: `1px solid ${color.borderMid}`,
                                  borderRadius: 8,
                                  padding: "6px 10px",
                                  fontFamily: font.mono,
                                  fontSize: 10,
                                  color: color.dim,
                                  cursor: "pointer",
                                  flexShrink: 0,
                                  marginLeft: 12,
                                }}
                              >
                                Unhide
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {events.length > 0 ? (
                  <>
                    <div
                      style={{
                        fontFamily: font.mono,
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.15em",
                        color: color.dim,
                        marginBottom: 12,
                        padding: "0 4px",
                      }}
                    >
                      Events
                    </div>
                    {events.map((e) => (
                      <EventCard
                        key={e.id}
                        event={e}
                        onToggleSave={() => toggleSave(e.id)}
                        onToggleDown={() => toggleDown(e.id)}
                        onOpenSocial={() => onOpenSocial(e)}
                        onLongPress={
                          (e.createdBy === userId || !e.createdBy || isDemoMode) ? () => onEditEvent(e) : undefined
                        }
                        isNew={e.id === newlyAddedId}
                      />
                    ))}
                  </>
                ) : checks.length === 0 ? (
                  <div
                    style={{
                      background: color.card,
                      border: `1px dashed ${color.borderMid}`,
                      borderRadius: 16,
                      padding: "40px 24px",
                      textAlign: "center",
                    }}
                  >
                    <p
                      style={{
                        fontFamily: font.serif,
                        fontSize: 22,
                        color: color.text,
                        marginBottom: 8,
                      }}
                    >
                      {friends.length === 0 ? "Find your people" : "Your feed is empty"}
                    </p>
                    <p
                      style={{
                        fontFamily: font.mono,
                        fontSize: 12,
                        color: color.dim,
                        marginBottom: 24,
                        lineHeight: 1.6,
                      }}
                    >
                      {friends.length === 0
                        ? "Add friends to see their events and rally squads"
                        : <>Save events, add friends, or check out<br />what&apos;s happening tonight</>}
                    </p>

                    {/* Inline suggested users when 0 friends */}
                    {friends.length === 0 && suggestions.filter(s => s.status === "none").length > 0 && (
                      <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 10 }}>
                        {suggestions.filter(s => s.status === "none").slice(0, 3).map((s) => (
                          <div
                            key={s.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              background: color.bg,
                              borderRadius: 12,
                              padding: "10px 14px",
                              textAlign: "left",
                            }}
                          >
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: "50%",
                                background: color.borderMid,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontFamily: font.mono,
                                fontSize: 14,
                                fontWeight: 700,
                                color: color.text,
                                flexShrink: 0,
                              }}
                            >
                              {s.avatar || s.name.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontFamily: font.mono, fontSize: 13, color: color.text, fontWeight: 600 }}>
                                {s.name}
                              </div>
                              <div style={{ fontFamily: font.mono, fontSize: 11, color: color.dim }}>
                                @{s.username}
                              </div>
                            </div>
                            <button
                              onClick={async () => {
                                if (isDemoMode) {
                                  setSuggestions((prev) =>
                                    prev.map((sg) => (sg.id === s.id ? { ...sg, status: "pending" as const } : sg))
                                  );
                                  showToast("Friend request sent!");
                                  return;
                                }
                                try {
                                  await db.sendFriendRequest(s.id);
                                  setSuggestions((prev) =>
                                    prev.map((sg) => (sg.id === s.id ? { ...sg, status: "pending" as const } : sg))
                                  );
                                  showToast("Friend request sent!");
                                } catch (err) {
                                  logError("sendFriendRequest", err, { friendId: s.id });
                                  showToast("Failed to send request");
                                }
                              }}
                              style={{
                                background: color.accent,
                                color: "#000",
                                border: "none",
                                borderRadius: 8,
                                padding: "6px 12px",
                                fontFamily: font.mono,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: "pointer",
                                flexShrink: 0,
                              }}
                            >
                              Add
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => { onOpenFriends("add"); }}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: color.accent,
                            fontFamily: font.mono,
                            fontSize: 11,
                            cursor: "pointer",
                            padding: "4px 0",
                          }}
                        >
                          See all suggestions →
                        </button>
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                      <button
                        onClick={() => onOpenAdd()}
                        style={{
                          background: color.accent,
                          color: "#000",
                          border: "none",
                          borderRadius: 20,
                          padding: "10px 16px",
                          fontFamily: font.mono,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        + Add Event
                      </button>
                      {friends.length > 0 && (
                        <button
                          onClick={() => onOpenFriends()}
                          style={{
                            background: "transparent",
                            color: color.text,
                            border: `1px solid ${color.borderMid}`,
                            borderRadius: 20,
                            padding: "10px 16px",
                            fontFamily: font.mono,
                            fontSize: 11,
                            cursor: "pointer",
                          }}
                        >
                          Find Friends
                        </button>
                      )}
                      <button
                        onClick={() => setFeedMode("tonight")}
                        style={{
                          background: "transparent",
                          color: color.text,
                          border: `1px solid ${color.borderMid}`,
                          borderRadius: 20,
                          padding: "10px 16px",
                          fontFamily: font.mono,
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        Tonight ✶
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div style={{ padding: "0 4px", marginBottom: 20 }}>
                  <p
                    style={{
                      fontFamily: font.mono,
                      fontSize: 11,
                      color: color.faint,
                      lineHeight: 1.6,
                    }}
                  >
                    public events happening tonight in Brooklyn
                  </p>
                </div>
                {tonightEvents.length === 0 ? (
                  <div
                    style={{
                      padding: "40px 20px",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: font.serif,
                        fontSize: 20,
                        color: color.muted,
                        marginBottom: 8,
                      }}
                    >
                      No events tonight yet
                    </div>
                    <p
                      style={{
                        fontFamily: font.mono,
                        fontSize: 11,
                        color: color.faint,
                        lineHeight: 1.6,
                      }}
                    >
                      Paste an IG link or add an event manually to get started
                    </p>
                  </div>
                ) : null}
                {tonightEvents.map((e) => (
                  <div
                    key={e.id}
                    style={{
                      background: color.card,
                      borderRadius: 16,
                      overflow: "hidden",
                      marginBottom: 12,
                      border: `1px solid ${color.border}`,
                    }}
                  >
                    <div style={{ display: "flex", gap: 14, padding: 14 }}>
                      {e.image ? <img
                        src={e.image}
                        alt=""
                        style={{
                          width: 72,
                          height: 72,
                          borderRadius: 12,
                          objectFit: "cover",
                          filter: "brightness(0.8)",
                        }}
                      /> : <div style={{
                        width: 72,
                        height: 72,
                        borderRadius: 12,
                        background: color.card,
                      }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontFamily: font.serif,
                            fontSize: 17,
                            color: color.text,
                            marginBottom: 4,
                            fontWeight: 400,
                            lineHeight: 1.2,
                          }}
                        >
                          {e.title}
                        </div>
                        <div
                          style={{
                            fontFamily: font.mono,
                            fontSize: 11,
                            color: color.accent,
                            marginBottom: 2,
                          }}
                        >
                          {e.time}
                        </div>
                        <div
                          style={{
                            fontFamily: font.mono,
                            fontSize: 11,
                            color: color.dim,
                          }}
                        >
                          {e.venue} · {e.neighborhood}
                        </div>
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 14px",
                        borderTop: `1px solid ${color.border}`,
                        background: color.deep,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ display: "flex" }}>
                          {e.peopleDown.slice(0, 3).map((p, i) => (
                            <div
                              key={p.name}
                              style={{
                                width: 22,
                                height: 22,
                                borderRadius: "50%",
                                background: color.borderLight,
                                color: color.dim,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontFamily: font.mono,
                                fontSize: 9,
                                fontWeight: 700,
                                marginLeft: i > 0 ? -6 : 0,
                                border: `2px solid ${color.deep}`,
                              }}
                            >
                              {p.avatar}
                            </div>
                          ))}
                        </div>
                        <span
                          style={{
                            fontFamily: font.mono,
                            fontSize: 10,
                            color: color.dim,
                          }}
                        >
                          {e.peopleDown.length} going
                        </span>
                      </div>
                      <button
                        onClick={async () => {
                          const newSaved = !e.saved;
                          // Update tonight UI immediately
                          setTonightEvents((prev) =>
                            prev.map((ev) =>
                              ev.id === e.id ? { ...ev, saved: newSaved } : ev
                            )
                          );
                          showToast(newSaved ? "Saved to your calendar ✓" : "Removed");

                          // Persist to DB
                          if (!isDemoMode) {
                            try {
                              if (newSaved) {
                                await db.saveEvent(e.id);
                                await db.toggleDown(e.id, true);
                                // Add to saved events list so it shows in the feed
                                const savedEvent: Event = { ...e, saved: true, isDown: true };
                                setEvents((prev) => {
                                  if (prev.some((ev) => ev.id === e.id)) return prev;
                                  return [savedEvent, ...prev];
                                });
                              } else {
                                await db.unsaveEvent(e.id);
                                // Remove from saved events list
                                setEvents((prev) => prev.filter((ev) => ev.id !== e.id));
                              }
                            } catch (err: unknown) {
                              // Ignore duplicate save (unique constraint)
                              const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
                              if (code !== '23505') {
                                logError("saveTonightEvent", err, { eventId: e.id });
                                showToast("Failed to save — try again");
                              }
                            }
                          }
                        }}
                        style={{
                          background: e.saved ? color.accent : "transparent",
                          color: e.saved ? "#000" : color.accent,
                          border: e.saved ? "none" : `1px solid ${color.accent}`,
                          borderRadius: 8,
                          padding: "6px 14px",
                          fontFamily: font.mono,
                          fontSize: 10,
                          fontWeight: 700,
                          cursor: "pointer",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                      >
                        {e.saved ? "✓ Saved" : "Save"}
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

      <EditCheckModal
        check={editModalCheck}
        open={!!editModalCheck}
        onClose={() => setEditModalCheck(null)}
        friends={friends.filter(f => f.status === 'friend').map(f => ({ id: f.id, name: f.name, avatar: f.avatar }))}
        onSave={async (updates) => {
          if (!editModalCheck) return;
          const checkId = editModalCheck.id;

          // Optimistically update local state
          setChecks((prev) =>
            prev.map((c) =>
              c.id === checkId
                ? {
                    ...c,
                    text: updates.text,
                    eventDate: updates.eventDate ?? undefined,
                    eventDateLabel: updates.eventDateLabel ?? undefined,
                    eventTime: updates.eventTime ?? undefined,
                    dateFlexible: updates.dateFlexible,
                    timeFlexible: updates.timeFlexible,
                  }
                : c
            )
          );
          setEditModalCheck(null);

          if (!isDemoMode) {
            try {
              await db.updateInterestCheck(checkId, {
                text: updates.text,
                event_date: updates.eventDate,
                event_time: updates.eventTime,
                date_flexible: updates.dateFlexible,
                time_flexible: updates.timeFlexible,
              });
              // Tag new @mentioned friends as co-authors
              if (updates.taggedFriendIds && updates.taggedFriendIds.length > 0) {
                await db.tagCoAuthors(checkId, updates.taggedFriendIds);
              }
              // Also update linked squad name if exists
              if (editModalCheck.squadId) {
                await db.updateSquadName(editModalCheck.squadId, updates.text);
              }
            } catch (err) {
              logError("updateCheck", err, { checkId });
              showToast("Failed to save changes");
              return;
            }
          }
          showToast("Check updated");
        }}
      />
    </>
  );
}
