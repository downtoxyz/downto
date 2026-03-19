"use client";

import React, { useState, useRef } from "react";
import * as db from "@/lib/db";
import type { Profile } from "@/lib/types";
import { font, color } from "@/lib/styles";
import type { Event, InterestCheck, Friend } from "@/lib/ui-types";
import EventCard from "@/features/events/components/EventCard";
import EditCheckModal from "@/features/checks/components/EditCheckModal";
import CheckActionsSheet from "@/features/checks/components/CheckActionsSheet";
import { logError } from "@/lib/logger";
import { formatTimeAgo } from "@/lib/utils";
import type { CommentUI } from "@/features/checks/hooks/useCheckComments";
import ForYouEmptyState from "./ForYouEmptyState";

function Linkify({ children, dimmed, coAuthors }: { children: string; dimmed?: boolean; coAuthors?: { name: string }[] }) {
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
          const matched = coAuthors?.find(
            (ca) => ca.name.toLowerCase() === mention || ca.name.split(" ")[0]?.toLowerCase() === mention
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
    let display = u.host.replace(/^www\./, "") + u.pathname.replace(/\/$/, "");
    if (display.length > 40) display = display.slice(0, 37) + "…";
    return display;
  } catch {
    return url;
  }
}

function CheckCommentsSection({
  checkId,
  comments,
  userId,
  onPostComment,
}: {
  checkId: string;
  comments: CommentUI[];
  userId: string | null;
  onPostComment: (checkId: string, text: string, mentions?: string[]) => void;
}) {
  const [text, setText] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIdx, setMentionIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const mentionCandidates = Array.from(
    new Map(
      comments
        .filter((c) => c.userId !== userId && !c.isYours)
        .map((c) => [c.userId, { id: c.userId, name: c.userName, avatar: c.userAvatar }])
    ).values()
  );

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const mentionedNames = [...trimmed.matchAll(/@(\S+)/g)].map((m) => m[1].toLowerCase());
    const mentionedIds = mentionCandidates
      .filter((c) => mentionedNames.some((n) =>
        c.name.toLowerCase() === n || c.name.split(' ')[0].toLowerCase() === n
      ))
      .map((c) => c.id);
    onPostComment(checkId, trimmed, mentionedIds.length > 0 ? mentionedIds : undefined);
    setText("");
    setMentionQuery(null);
    setMentionIdx(-1);
  };

  return (
    <div style={{ marginTop: 10, borderTop: `1px solid ${color.border}`, paddingTop: 10 }}>
      {comments.length === 0 ? (
        <span style={{ fontFamily: font.mono, fontSize: 10, color: color.faint }}>no comments yet</span>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
          {comments.map((c) => (
            <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: c.isYours ? color.accent : color.borderLight,
                  color: c.isYours ? "#000" : color.dim,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: font.mono,
                  fontSize: 9,
                  fontWeight: 700,
                }}
              >
                {c.userAvatar}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
                  <span style={{ fontFamily: font.mono, fontSize: 10, color: c.isYours ? color.accent : color.muted, fontWeight: 600 }}>
                    {c.userName}
                  </span>
                  <span style={{ fontFamily: font.mono, fontSize: 9, color: color.faint }}>
                    {formatTimeAgo(new Date(c.createdAt))}
                  </span>
                </div>
                <p style={{ fontFamily: font.mono, fontSize: 11, color: color.text, margin: 0, lineHeight: 1.4 }}>
                  {c.text.split(/(@\S+)/g).map((part, pi) =>
                    part.startsWith("@") ? (
                      <span key={pi} style={{ color: color.accent, fontWeight: 700 }}>{part}</span>
                    ) : part
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, minWidth: 0 }}>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => {
            const val = e.target.value.slice(0, 280);
            setText(val);
            const cursor = e.target.selectionStart ?? val.length;
            const before = val.slice(0, cursor);
            const atMatch = before.match(/@([^\s@]*)$/);
            if (atMatch) {
              setMentionQuery(atMatch[1].toLowerCase());
              setMentionIdx(before.length - atMatch[0].length);
            } else {
              setMentionQuery(null);
              setMentionIdx(-1);
            }
          }}
          onKeyDown={(e) => {
            if (mentionQuery !== null && e.key === "Escape") {
              setMentionQuery(null);
              setMentionIdx(-1);
              return;
            }
            if (e.key === "Enter") handleSubmit();
          }}
          placeholder="Add a comment…"
          style={{
            flex: 1,
            minWidth: 0,
            background: color.deep,
            border: `1px solid ${color.border}`,
            borderRadius: 8,
            padding: "6px 10px",
            fontFamily: font.mono,
            fontSize: 11,
            color: color.text,
            outline: "none",
          }}
        />
        <button
          onClick={handleSubmit}
          style={{
            flexShrink: 0,
            background: color.accent,
            color: "#000",
            border: "none",
            borderRadius: 8,
            padding: "6px 12px",
            fontFamily: font.mono,
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Post
        </button>
      </div>
      {/* @mention autocomplete */}
      {mentionQuery !== null && mentionCandidates.length > 0 && (() => {
        const filtered = mentionCandidates.filter(c => c.name.toLowerCase().includes(mentionQuery));
        if (filtered.length === 0) return null;
        return (
          <div style={{
            background: color.deep, border: `1px solid ${color.borderMid}`,
            borderRadius: 8, marginTop: 4, maxHeight: 100, overflowY: "auto",
          }}>
            {filtered.slice(0, 5).map(c => (
              <button
                key={c.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  const before = text.slice(0, mentionIdx);
                  const after = text.slice(mentionIdx + 1 + (mentionQuery?.length ?? 0));
                  setText(before + "@" + c.name + " " + after);
                  setMentionQuery(null);
                  setMentionIdx(-1);
                  inputRef.current?.focus();
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  width: "100%", padding: "6px 10px",
                  background: "transparent", border: "none", cursor: "pointer",
                  borderBottom: `1px solid ${color.border}`,
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: "50%",
                  background: color.borderLight, color: color.dim,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: font.mono, fontSize: 8, fontWeight: 700,
                }}>
                  {c.avatar}
                </div>
                <span style={{ fontFamily: font.mono, fontSize: 11, color: color.text }}>{c.name}</span>
              </button>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

export interface ForYouViewProps {
  checks: InterestCheck[];
  setChecks: React.Dispatch<React.SetStateAction<InterestCheck[]>>;
  myCheckResponses: Record<string, "down" | "waitlist">;
  setMyCheckResponses: React.Dispatch<React.SetStateAction<Record<string, "down" | "waitlist">>>;
  events: Event[];
  setEvents: React.Dispatch<React.SetStateAction<Event[]>>;
  newlyAddedId: string | null;
  newlyAddedCheckId: string | null;
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
  commentCounts: Record<string, number>;
  commentsByCheck: Record<string, CommentUI[]>;
  expandedCommentCheckId: string | null;
  onToggleComments: (checkId: string) => void;
  onPostComment: (checkId: string, text: string, mentions?: string[]) => void;
  setFeedMode: (mode: "foryou" | "tonight") => void;
}

export default function ForYouView({
  checks,
  setChecks,
  myCheckResponses,
  setMyCheckResponses,
  events,
  setEvents,
  newlyAddedId,
  newlyAddedCheckId,
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
  commentCounts,
  commentsByCheck,
  expandedCommentCheckId,
  onToggleComments,
  onPostComment,
  setFeedMode,
}: ForYouViewProps) {
  const [showHidden, setShowHidden] = useState(false);
  const [expandedCheckId, setExpandedCheckId] = useState<string | null>(null);
  const [editModalCheck, setEditModalCheck] = useState<InterestCheck | null>(null);
  const [actionsSheetCheck, setActionsSheetCheck] = useState<InterestCheck | null>(null);
  const shareCheck = async (check: InterestCheck) => {
    if (!isDemoMode) {
      try { await db.markCheckShared(check.id); } catch { /* best-effort */ }
    }
    const url = `${window.location.origin}/check/${check.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ url });
      } else {
        await navigator.clipboard.writeText(url);
        showToast("Link copied!");
      }
    } catch {
      // User cancelled share — ignore
    }
  };

  const visibleChecks = checks
    .filter((c) => !hiddenCheckIds.has(c.id) && c.expiresIn !== "expired")
    .sort((a, b) => {
      const tierOf = (c: InterestCheck) => (c.expiresIn !== "open" ? 0 : c.eventDate ? 1 : 2);
      const ta = tierOf(a), tb = tierOf(b);
      if (ta !== tb) return ta - tb;
      if (ta === 0) return b.expiryPercent - a.expiryPercent;
      if (ta === 1) return (a.eventDate ?? "").localeCompare(b.eventDate ?? "");
      return 0;
    });
  const hiddenChecks = checks.filter((c) => hiddenCheckIds.has(c.id));

  return (
    <>
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
                WebkitUserSelect: (check.isYours || check.isCoAuthor) ? "none" : undefined,
                userSelect: (check.isYours || check.isCoAuthor) ? "none" : undefined,
              }}
            >
              {check.expiresIn !== "open" && (
                <div style={{ height: 3, background: color.border, position: "relative" }}>
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      height: "100%",
                      width: `${100 - check.expiryPercent}%`,
                      background: check.expiryPercent > 75 ? "#ff6b6b" : check.expiryPercent > 50 ? "#ffaa5a" : "#4ade80",
                      transition: "width 1s ease",
                    }}
                  />
                </div>
              )}
              <div style={{ padding: 14 }}>
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
                    }}
                  >
                    {check.thumbnail && (
                      <img
                        src={check.thumbnail}
                        alt={check.movieTitle}
                        style={{ width: 48, height: 72, objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: font.serif, fontSize: 15, color: color.text, lineHeight: 1.2, marginBottom: 2 }}>
                        {check.movieTitle}
                      </div>
                      <div style={{ fontFamily: font.mono, fontSize: 10, color: color.muted, marginBottom: 4 }}>
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8, cursor: !check.isYours && check.authorId ? "pointer" : undefined }}
                    onClick={(e) => {
                      if (!check.isYours && check.authorId && onViewProfile) {
                        e.stopPropagation();
                        onViewProfile(check.authorId);
                      }
                    }}
                  >
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
                    <span style={{ fontFamily: font.mono, fontSize: 11, color: (check.isYours || check.isCoAuthor) ? color.accent : color.muted }}>
                      {check.author}
                      {check.viaFriendName && (
                        <span style={{ color: color.dim, fontWeight: 400 }}>{" "}via {check.viaFriendName}</span>
                      )}
                    </span>
                    {check.coAuthors && check.coAuthors.filter((ca) => ca.status === "accepted").length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", marginLeft: 4 }}>
                        <span style={{ color: color.dim, fontFamily: font.mono, fontSize: 10, marginRight: 2 }}>+</span>
                        {check.coAuthors.filter((ca) => ca.status === "accepted").slice(0, 3).map((ca, i) => (
                          <div
                            key={ca.userId}
                            style={{
                              width: 18, height: 18, borderRadius: "50%",
                              background: ca.userId === userId ? color.accent : color.borderLight,
                              color: ca.userId === userId ? "#000" : color.dim,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontFamily: font.mono, fontSize: 7, fontWeight: 700,
                              marginLeft: i > 0 ? -4 : 0,
                              border: `1.5px solid ${color.card}`,
                            }}
                          >
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
                        onClick={(e) => { e.stopPropagation(); onHideCheck(check.id); }}
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
                    <p style={{ fontFamily: font.serif, fontSize: 18, color: color.text, margin: 0, fontWeight: 400, lineHeight: 1.4, flex: 1 }}>
                      <Linkify coAuthors={check.coAuthors}>{check.text}</Linkify>
                    </p>
                    {(check.isYours || check.isCoAuthor) && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setActionsSheetCheck(check); }}
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
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      >
                        ⚙
                      </button>
                    )}
                  </div>
                  {(check.eventDateLabel || check.eventTime || check.location) && (() => {
                    const when = [check.eventDateLabel, check.eventTime].filter(Boolean).join(" ");
                    const parts = [when, check.location].filter(Boolean);
                    if (parts.length === 0) return null;
                    return (
                      <p style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, margin: 0, marginTop: 8 }}>
                        {parts.join(" · ")}
                      </p>
                    );
                  })()}
                  {(check.isYours || check.isCoAuthor) && !check.squadId && check.responses.some((r) => r.status === "down") && (
                    <button
                      onClick={(e) => { e.stopPropagation(); startSquadFromCheck(check); }}
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
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 12px" }}>
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
                                width: 24, height: 24, borderRadius: "50%",
                                background: r.status === "down" ? color.accent : color.faint,
                                color: r.status === "down" ? "#000" : color.dim,
                                opacity: r.status === "waitlist" ? 0.5 : 1,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontFamily: font.mono, fontSize: 9, fontWeight: 700,
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
                                width: 24, height: 24, borderRadius: "50%",
                                background: color.faint, color: color.dim,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontFamily: font.mono, fontSize: 8, fontWeight: 700,
                                marginLeft: -6, border: `2px solid ${color.card}`,
                              }}
                            >
                              +{check.responses.length - 6}
                            </div>
                          )}
                        </div>
                        <span style={{ fontFamily: font.mono, fontSize: 10, color: color.accent, whiteSpace: "nowrap" }}>
                          {check.responses.filter((r) => r.status === "down").length} down
                          {check.responses.some((r) => r.status === "waitlist") && (
                            <span style={{ color: color.dim }}>
                              {" "}{check.responses.filter((r) => r.status === "waitlist").length} waitlist
                            </span>
                          )}
                          {" "}<span style={{ color: color.faint, fontSize: 8, paddingRight: 4 }}>{expandedCheckId === check.id ? "▴" : "▾"}</span>
                        </span>
                      </div>
                    ) : (
                      <span style={{ fontFamily: font.mono, fontSize: 10, color: color.faint }}>no responses yet</span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleComments(check.id); }}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: expandedCommentCheckId === check.id ? color.accent : color.faint,
                        fontFamily: font.mono,
                        fontSize: 10,
                        cursor: "pointer",
                        padding: "4px 6px",
                        display: "flex",
                        alignItems: "center",
                        gap: 3,
                      }}
                    >
                      <span>{(commentCounts[check.id] ?? 0) > 0 ? `💬 ${commentCounts[check.id]}` : "💬"}</span>
                    </button>
                    {!check.isYours && (
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: "auto" }}>
                        <button
                          onClick={() => {
                            if (myCheckResponses[check.id] === "down" || myCheckResponses[check.id] === "waitlist") {
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
                              respondToCheck(check.id);
                            }
                          }}
                          style={{
                            background: myCheckResponses[check.id] === "down" ? color.accent : "transparent",
                            color: myCheckResponses[check.id] === "down" ? "#000" : myCheckResponses[check.id] === "waitlist" ? color.dim : color.text,
                            border: myCheckResponses[check.id] === "down" ? "none" : myCheckResponses[check.id] === "waitlist" ? `1px dashed ${color.borderMid}` : `1px solid ${color.borderMid}`,
                            borderRadius: 8,
                            padding: "6px 10px",
                            fontFamily: font.mono,
                            fontSize: 10,
                            fontWeight: 700,
                            cursor: "pointer",
                            whiteSpace: "nowrap" as const,
                          }}
                        >
                          {myCheckResponses[check.id] === "down" ? "✓ Down" : myCheckResponses[check.id] === "waitlist" ? "✓ Waitlisted" : "Down"}
                        </button>
                        {myCheckResponses[check.id] === "down" && (() => {
                          const memberCount = check.squadMemberCount ?? 0;
                          const maxSize = check.maxSquadSize;
                          const isUnlimited = maxSize == null;
                          const isFull = !isUnlimited && memberCount >= maxSize;
                          const capacityLabel = isUnlimited ? `${memberCount}/∞` : `${memberCount}/${maxSize}`;
                          return (
                            check.inSquad ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); onNavigateToGroups(check.squadId!); }}
                                style={{ background: "rgba(175, 82, 222, 0.1)", color: "#AF52DE", border: "none", borderRadius: 8, padding: "6px 8px", fontFamily: font.mono, fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const }}
                              >
                                💬 Squad →{check.squadId && <span style={{ color: "rgba(175, 82, 222, 0.6)", marginLeft: 4, fontWeight: 400 }}>{capacityLabel}</span>}
                              </button>
                            ) : check.isWaitlisted ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); onNavigateToGroups(check.squadId!); }}
                                style={{ background: "transparent", color: color.faint, border: `1px solid ${color.border}`, borderRadius: 8, padding: "6px 8px", fontFamily: font.mono, fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const }}
                              >
                                Waitlisted<span style={{ fontWeight: 400, marginLeft: 4 }}>{capacityLabel}</span>
                              </button>
                            ) : check.squadId && !isFull ? (
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    const result = await db.joinSquadIfRoom(check.squadId!);
                                    if (result === "waitlisted") { showToast("Squad is full — you're on the waitlist"); await loadRealData(); return; }
                                    showToast("Joined the squad! 🚀");
                                  } catch (err: unknown) {
                                    const code = err && typeof err === "object" && "code" in err ? err.code : "";
                                    if (code !== "23505") { logError("joinSquad", err, { squadId: check.squadId }); showToast("Failed to join squad"); return; }
                                  }
                                  await loadRealData();
                                  onNavigateToGroups(check.squadId!);
                                }}
                                style={{ background: "transparent", color: "#AF52DE", border: "1px solid #AF52DE", borderRadius: 8, padding: "6px 8px", fontFamily: font.mono, fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const }}
                              >
                                Join Squad →<span style={{ color: color.dim, marginLeft: 4, fontWeight: 400 }}>{capacityLabel}</span>
                              </button>
                            ) : check.squadId && isFull ? (
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    const result = await db.joinSquadIfRoom(check.squadId!);
                                    showToast(result === "joined" ? "Joined the squad! 🚀" : "Squad is full — you're on the waitlist");
                                    await loadRealData();
                                    if (result === "joined") onNavigateToGroups(check.squadId!);
                                  } catch (err: unknown) { logError("waitlistSquad", err, { squadId: check.squadId }); showToast("Failed to join waitlist"); }
                                }}
                                style={{ background: "transparent", color: color.faint, border: `1px solid ${color.border}`, borderRadius: 8, padding: "6px 8px", fontFamily: font.mono, fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const }}
                              >
                                Waitlist →<span style={{ fontWeight: 400, marginLeft: 4 }}>{capacityLabel}</span>
                              </button>
                            ) : pendingDownCheckIds.has(check.id) ? (
                              <span style={{ fontFamily: font.mono, fontSize: 10, color: color.dim, padding: "6px 8px" }}>...</span>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); startSquadFromCheck(check); }}
                                style={{ background: "transparent", color: color.accent, border: `1px solid ${color.accent}`, borderRadius: 8, padding: "6px 8px", fontFamily: font.mono, fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const }}
                              >
                                Squad →
                              </button>
                            )
                          );
                        })()}
                      </div>
                    )}
                    {(check.isYours || check.isCoAuthor) && check.squadId && (
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); onNavigateToGroups(check.squadId!); }}
                          style={{ background: "rgba(175, 82, 222, 0.1)", color: "#AF52DE", border: "none", borderRadius: 8, padding: "6px 8px", fontFamily: font.mono, fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const }}
                        >
                          💬 Squad →<span style={{ color: "rgba(175, 82, 222, 0.6)", marginLeft: 4, fontWeight: 400 }}>{check.squadMemberCount ?? 0}{check.maxSquadSize != null ? `/${check.maxSquadSize}` : `/∞`}</span>
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
                              <span key={r.name} style={{ fontFamily: font.mono, fontSize: 11, color: "#000", background: color.accent, padding: "3px 8px", borderRadius: 6, fontWeight: 600 }}>{r.name}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {check.responses.filter((r) => r.status === "waitlist").length > 0 && (
                        <div>
                          <span style={{ fontFamily: font.mono, fontSize: 9, color: color.dim, textTransform: "uppercase", letterSpacing: "0.1em" }}>Waitlist</span>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                            {check.responses.filter((r) => r.status === "waitlist").map((r) => (
                              <span key={r.name} style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, background: color.borderLight, padding: "3px 8px", borderRadius: 6, borderStyle: "dashed" }}>{r.name}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {expandedCommentCheckId === check.id && (
                    <CheckCommentsSection
                      checkId={check.id}
                      comments={commentsByCheck[check.id] ?? []}
                      userId={userId}
                      onPostComment={onPostComment}
                    />
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
                  style={{ background: color.card, borderRadius: 14, overflow: "hidden", marginBottom: 8, border: `1px solid ${color.border}`, opacity: 0.6 }}
                >
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
          <div style={{ fontFamily: font.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.15em", color: color.dim, marginBottom: 12, padding: "0 4px" }}>
            Events
          </div>
          {events.map((e) => (
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
        <ForYouEmptyState
          onOpenAdd={onOpenAdd}
          onOpenFriends={onOpenFriends}
          setFeedMode={setFeedMode}
        />
      ) : null}

      <CheckActionsSheet
        open={!!actionsSheetCheck}
        onClose={() => setActionsSheetCheck(null)}
        hasSquad={!!actionsSheetCheck?.squadId}
        onShare={actionsSheetCheck ? () => shareCheck(actionsSheetCheck) : undefined}
        onEdit={() => { if (actionsSheetCheck) setEditModalCheck(actionsSheetCheck); setActionsSheetCheck(null); }}
        onArchive={async () => {
          if (!actionsSheetCheck) return;
          const checkId = actionsSheetCheck.id;
          setActionsSheetCheck(null);
          setChecks((prev) => prev.filter((c) => c.id !== checkId));
          if (!isDemoMode) {
            try { await db.archiveInterestCheck(checkId); } catch (err) { logError("archiveCheck", err, { checkId }); }
          }
          showToast("Check archived");
        }}
        onDelete={async () => {
          if (!actionsSheetCheck) return;
          const checkId = actionsSheetCheck.id;
          setActionsSheetCheck(null);
          setChecks((prev) => prev.filter((c) => c.id !== checkId));
          if (!isDemoMode) {
            try { await db.deleteInterestCheck(checkId); } catch (err) { logError("deleteCheck", err, { checkId }); }
          }
          showToast("Check removed");
        }}
      />

      <EditCheckModal
        check={editModalCheck}
        open={!!editModalCheck}
        onClose={() => setEditModalCheck(null)}
        friends={friends.filter((f) => f.status === "friend").map((f) => ({ id: f.id, name: f.name, avatar: f.avatar }))}
        onSave={async (updates) => {
          if (!editModalCheck) return;
          const checkId = editModalCheck.id;
          setChecks((prev) =>
            prev.map((c) =>
              c.id === checkId
                ? { ...c, text: updates.text, eventDate: updates.eventDate ?? undefined, eventDateLabel: updates.eventDateLabel ?? undefined, eventTime: updates.eventTime ?? undefined, dateFlexible: updates.dateFlexible, timeFlexible: updates.timeFlexible }
                : c
            )
          );
          setEditModalCheck(null);
          if (!isDemoMode) {
            try {
              await db.updateInterestCheck(checkId, { text: updates.text, event_date: updates.eventDate, event_time: updates.eventTime, date_flexible: updates.dateFlexible, time_flexible: updates.timeFlexible });
              if (updates.taggedFriendIds && updates.taggedFriendIds.length > 0) await db.tagCoAuthors(checkId, updates.taggedFriendIds);
              if (editModalCheck.squadId) await db.updateSquadName(editModalCheck.squadId, updates.text);
            } catch (err) { logError("updateCheck", err, { checkId }); showToast("Failed to save changes"); return; }
          }
          showToast("Check updated");
        }}
      />
    </>
  );
}
