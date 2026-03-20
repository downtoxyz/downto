"use client";

import React, { useState } from "react";
import * as db from "@/lib/db";
import type { Profile } from "@/lib/types";
import { font, color } from "@/lib/styles";
import type { InterestCheck, Friend } from "@/lib/ui-types";
import { logError } from "@/lib/logger";
import { useCheckComments } from "@/features/checks/hooks/useCheckComments";
import CheckCommentsSection from "./CheckCommentsSection";
import EditCheckModal from "./EditCheckModal";
import CheckActionsSheet from "./CheckActionsSheet";

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
            >
              {display}
            </a>
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

export interface CheckCardProps {
  check: InterestCheck;
  userId: string | null;
  isDemoMode: boolean;
  profile: Profile | null;
  friends: Friend[];
  myCheckResponses: Record<string, "down" | "waitlist">;
  setMyCheckResponses: React.Dispatch<React.SetStateAction<Record<string, "down" | "waitlist">>>;
  setChecks: React.Dispatch<React.SetStateAction<InterestCheck[]>>;
  pendingDownCheckIds: Set<string>;
  newlyAddedCheckId: string | null;
  sharedCheckId?: string | null;
  initialCommentCount: number;
  respondToCheck: (checkId: string) => void;
  startSquadFromCheck: (check: InterestCheck) => Promise<void>;
  acceptCoAuthorTag: (checkId: string) => Promise<void>;
  declineCoAuthorTag: (checkId: string) => Promise<void>;
  onHideCheck: (checkId: string) => void;
  onNavigateToGroups: (squadId?: string) => void;
  onViewProfile?: (userId: string) => void;
  showToast: (msg: string) => void;
  loadRealData: () => Promise<void>;
}

export default function CheckCard({
  check,
  userId,
  isDemoMode,
  profile,
  friends,
  myCheckResponses,
  setMyCheckResponses,
  setChecks,
  pendingDownCheckIds,
  newlyAddedCheckId,
  sharedCheckId,
  initialCommentCount,
  respondToCheck,
  startSquadFromCheck,
  acceptCoAuthorTag,
  declineCoAuthorTag,
  onHideCheck,
  onNavigateToGroups,
  onViewProfile,
  showToast,
  loadRealData,
}: CheckCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [actionsSheetOpen, setActionsSheetOpen] = useState(false);

  const { comments, commentCount, openComments, postComment } = useCheckComments({
    checkId: check.id,
    userId,
    profile,
    isDemoMode,
    initialCommentCount,
  });

  const handleToggleComments = () => {
    if (!isCommentsOpen) {
      openComments();
    }
    setIsCommentsOpen(prev => !prev);
  };

  const shareCheck = async () => {
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
    } catch { /* user cancelled */ }
  };

  const friendsList = friends.filter(f => f.status === 'friend').map(f => ({ id: f.id, name: f.name, avatar: f.avatar }));

  return (
    <>
      <div
        ref={check.id === newlyAddedCheckId ? (el) => {
          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        } : undefined}
        style={{
          background: (check.isYours || check.isCoAuthor) ? "rgba(232,255,90,0.05)" : color.card,
          borderRadius: 14,
          overflow: "hidden",
          marginBottom: 8,
          border: `1px solid ${check.id === newlyAddedCheckId ? "rgba(90,200,255,0.5)" : check.id === sharedCheckId ? "rgba(232,255,90,0.4)" : (check.isYours || check.isCoAuthor) ? "rgba(232,255,90,0.2)" : color.border}`,
          ...(check.id === newlyAddedCheckId ? { animation: "checkGlow 2s ease-in-out infinite" } : {}),
          WebkitUserSelect: (check.isYours || check.isCoAuthor) ? "none" : undefined,
          userSelect: (check.isYours || check.isCoAuthor) ? "none" : undefined,
        }}
      >
        {check.expiresIn !== "open" && (
          <div style={{ height: 3, background: color.border, position: "relative" }}>
            <div style={{
              position: "absolute", left: 0, top: 0, height: "100%",
              width: `${100 - check.expiryPercent}%`,
              background: check.expiryPercent > 75 ? "#ff6b6b" : check.expiryPercent > 50 ? "#ffaa5a" : "#4ade80",
              transition: "width 1s ease",
            }} />
          </div>
        )}
        <div style={{ padding: 14 }}>
          {check.movieTitle && (
            <div
              onClick={(e) => { if (check.letterboxdUrl) { e.stopPropagation(); window.open(check.letterboxdUrl, "_blank", "noopener"); } }}
              style={{
                display: "flex", gap: 10, marginBottom: 12, padding: 10,
                background: color.deep, borderRadius: 10, border: `1px solid ${color.borderLight}`,
                cursor: check.letterboxdUrl ? "pointer" : undefined,
              }}
            >
              {check.thumbnail && (
                <img src={check.thumbnail} alt={check.movieTitle}
                  style={{ width: 48, height: 72, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: font.serif, fontSize: 15, color: color.text, lineHeight: 1.2, marginBottom: 2 }}>{check.movieTitle}</div>
                <div style={{ fontFamily: font.mono, fontSize: 10, color: color.muted, marginBottom: 4 }}>
                  {check.year}{check.director && ` · ${check.director}`}
                </div>
                {check.vibes && check.vibes.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                    {check.vibes.slice(0, 3).map((v) => (
                      <span key={v} style={{
                        background: "#1f1f1f", color: color.accent, padding: "2px 6px", borderRadius: 12,
                        fontFamily: font.mono, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.08em",
                      }}>{v}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Header: author + expiry */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div
              style={{ display: "flex", alignItems: "center", gap: 8, cursor: !check.isYours && check.authorId ? "pointer" : undefined }}
              onClick={(e) => { if (!check.isYours && check.authorId && onViewProfile) { e.stopPropagation(); onViewProfile(check.authorId); } }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: check.isYours ? color.accent : color.borderLight,
                color: check.isYours ? "#000" : color.dim,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: font.mono, fontSize: 11, fontWeight: 700,
              }}>
                {check.author[0]}
              </div>
              <span style={{ fontFamily: font.mono, fontSize: 11, color: (check.isYours || check.isCoAuthor) ? color.accent : color.muted }}>
                {check.author}
                {check.viaFriendName && <span style={{ color: color.dim, fontWeight: 400 }}>{" "}via {check.viaFriendName}</span>}
              </span>
              {check.coAuthors && check.coAuthors.filter(ca => ca.status === "accepted").length > 0 && (
                <div style={{ display: "flex", alignItems: "center", marginLeft: 4 }}>
                  <span style={{ color: color.dim, fontFamily: font.mono, fontSize: 10, marginRight: 2 }}>+</span>
                  {check.coAuthors.filter(ca => ca.status === "accepted").slice(0, 3).map((ca, i) => (
                    <div key={ca.userId} style={{
                      width: 18, height: 18, borderRadius: "50%",
                      background: ca.userId === userId ? color.accent : color.borderLight,
                      color: ca.userId === userId ? "#000" : color.dim,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: font.mono, fontSize: 7, fontWeight: 700,
                      marginLeft: i > 0 ? -4 : 0, border: `1.5px solid ${color.card}`,
                    }}>{ca.avatar}</div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                fontFamily: font.mono, fontSize: 10,
                color: check.expiresIn === "open" ? color.dim : check.expiryPercent > 75 ? "#ff6b6b" : color.faint,
              }}>
                {check.expiresIn === "open" ? "open" : check.expiresIn === "expired" ? "expired" : `${check.expiresIn} left`}
              </span>
              {!check.isYours && !check.isCoAuthor && (
                <button
                  onClick={(e) => { e.stopPropagation(); onHideCheck(check.id); }}
                  style={{ background: "transparent", border: "none", color: color.faint, padding: "2px 4px", fontFamily: font.mono, fontSize: 12, cursor: "pointer", lineHeight: 1 }}
                  title="Hide this check"
                >✕</button>
              )}
            </div>
          </div>

          {/* Co-author tag prompt */}
          {check.pendingTagForYou && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 16px", marginBottom: 0,
              background: "rgba(232,255,90,0.06)", borderBottom: "1px solid rgba(232,255,90,0.15)",
            }}>
              <span style={{ fontFamily: font.mono, fontSize: 11, color: color.accent }}>You were tagged as co-author</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); acceptCoAuthorTag(check.id); }}
                  style={{ background: color.accent, color: "#000", border: "none", borderRadius: 8, padding: "4px 10px", fontFamily: font.mono, fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}
                >Accept</button>
                <button
                  onClick={(e) => { e.stopPropagation(); declineCoAuthorTag(check.id); }}
                  style={{ background: "transparent", color: color.dim, border: `1px solid ${color.borderMid}`, borderRadius: 8, padding: "4px 8px", fontFamily: font.mono, fontSize: 10, cursor: "pointer" }}
                >Decline</button>
              </div>
            </div>
          )}

          {/* Check text + actions button */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
              <p style={{ fontFamily: font.serif, fontSize: 18, color: color.text, margin: 0, fontWeight: 400, lineHeight: 1.4, flex: 1 }}>
                <Linkify coAuthors={check.coAuthors}>{check.text}</Linkify>
              </p>
              {(check.isYours || check.isCoAuthor) && (
                <button
                  onClick={(e) => { e.stopPropagation(); setActionsSheetOpen(true); }}
                  style={{ background: "transparent", border: `1px solid ${color.border}`, borderRadius: 8, color: color.dim, padding: "6px 10px", fontFamily: font.mono, fontSize: 13, cursor: "pointer", lineHeight: 1, flexShrink: 0, marginTop: 2 }}
                >⚙</button>
              )}
            </div>
            {(check.eventDateLabel || check.eventTime || check.location) && (() => {
              const when = [check.eventDateLabel, check.eventTime].filter(Boolean).join(" ");
              const parts = [when, check.location].filter(Boolean);
              if (parts.length === 0) return null;
              return <p style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, margin: 0, marginTop: 8 }}>{parts.join(" · ")}</p>;
            })()}
            {(check.isYours || check.isCoAuthor) && !check.squadId && check.responses.some(r => r.status === "down") && (
              <button
                onClick={(e) => { e.stopPropagation(); startSquadFromCheck(check); }}
                style={{ background: "transparent", color: color.accent, border: `1px solid ${color.accent}`, borderRadius: 6, padding: "4px 8px", fontFamily: font.mono, fontSize: 10, fontWeight: 700, cursor: "pointer", marginTop: 6 }}
              >Squad →</button>
            )}
          </div>

          {/* Responses + comment toggle + down button */}
          <div style={{ marginTop: 8 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 12px" }}>
              {check.responses.length > 0 ? (
                <div
                  onClick={(e) => { e.stopPropagation(); setIsExpanded(prev => !prev); }}
                  style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", minWidth: 0 }}
                >
                  <div style={{ display: "flex", flexShrink: 0 }}>
                    {check.responses.slice(0, 6).map((r, i) => (
                      <div key={r.name} style={{
                        width: 24, height: 24, borderRadius: "50%",
                        background: r.status === "down" ? color.accent : color.faint,
                        color: r.status === "down" ? "#000" : color.dim,
                        opacity: r.status === "waitlist" ? 0.5 : 1,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontFamily: font.mono, fontSize: 9, fontWeight: 700,
                        marginLeft: i > 0 ? -6 : 0, border: `2px solid ${color.card}`,
                      }}>{r.avatar}</div>
                    ))}
                    {check.responses.length > 6 && (
                      <div style={{
                        width: 24, height: 24, borderRadius: "50%",
                        background: color.faint, color: color.dim,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontFamily: font.mono, fontSize: 8, fontWeight: 700,
                        marginLeft: -6, border: `2px solid ${color.card}`,
                      }}>+{check.responses.length - 6}</div>
                    )}
                  </div>
                  <span style={{ fontFamily: font.mono, fontSize: 10, color: color.accent, whiteSpace: "nowrap" }}>
                    {check.responses.filter(r => r.status === "down").length} down
                    {check.responses.some(r => r.status === "waitlist") && (
                      <span style={{ color: color.dim }}>{" "}{check.responses.filter(r => r.status === "waitlist").length} waitlist</span>
                    )}
                    {" "}<span style={{ color: color.faint, fontSize: 8, paddingRight: 4 }}>{isExpanded ? "▴" : "▾"}</span>
                  </span>
                </div>
              ) : (
                <span style={{ fontFamily: font.mono, fontSize: 10, color: color.faint }}>no responses yet</span>
              )}

              <button
                onClick={(e) => { e.stopPropagation(); handleToggleComments(); }}
                style={{
                  background: "transparent", border: "none",
                  color: isCommentsOpen ? color.accent : color.faint,
                  fontFamily: font.mono, fontSize: 10, cursor: "pointer",
                  padding: "4px 6px", display: "flex", alignItems: "center", gap: 3,
                }}
              >
                <span>{commentCount > 0 ? `💬 ${commentCount}` : "💬"}</span>
              </button>

              {!check.isYours && (
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: "auto" }}>
                  <button
                    onClick={() => {
                      if (myCheckResponses[check.id] === "down" || myCheckResponses[check.id] === "waitlist") {
                        setMyCheckResponses(prev => { const next = { ...prev }; delete next[check.id]; return next; });
                        setChecks(prev => prev.map(c => c.id === check.id ? { ...c, responses: c.responses.filter(r => r.name !== "You"), inSquad: undefined } : c));
                        if (!isDemoMode && check.id) {
                          db.removeCheckResponse(check.id)
                            .then(() => loadRealData())
                            .catch(err => logError("removeCheckResponse", err, { checkId: check.id }));
                        }
                      } else {
                        respondToCheck(check.id);
                      }
                    }}
                    style={{
                      background: myCheckResponses[check.id] === "down" ? color.accent : "transparent",
                      color: myCheckResponses[check.id] === "down" ? "#000" : myCheckResponses[check.id] === "waitlist" ? color.dim : color.text,
                      border: myCheckResponses[check.id] === "down" ? "none" : myCheckResponses[check.id] === "waitlist" ? `1px dashed ${color.borderMid}` : `1px solid ${color.borderMid}`,
                      borderRadius: 8, padding: "6px 10px", fontFamily: font.mono, fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const,
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
                        <button onClick={(e) => { e.stopPropagation(); onNavigateToGroups(check.squadId!); }}
                          style={{ background: "rgba(175, 82, 222, 0.1)", color: "#AF52DE", border: "none", borderRadius: 8, padding: "6px 8px", fontFamily: font.mono, fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const }}
                        >💬 Squad →{check.squadId && <span style={{ color: "rgba(175, 82, 222, 0.6)", marginLeft: 4, fontWeight: 400 }}>{capacityLabel}</span>}</button>
                      ) : check.isWaitlisted ? (
                        <button onClick={(e) => { e.stopPropagation(); onNavigateToGroups(check.squadId!); }}
                          style={{ background: "transparent", color: color.faint, border: `1px solid ${color.border}`, borderRadius: 8, padding: "6px 8px", fontFamily: font.mono, fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const }}
                        >Waitlisted<span style={{ fontWeight: 400, marginLeft: 4 }}>{capacityLabel}</span></button>
                      ) : check.squadId && !isFull ? (
                        <button onClick={async (e) => {
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
                        >Join Squad →<span style={{ color: color.dim, marginLeft: 4, fontWeight: 400 }}>{capacityLabel}</span></button>
                      ) : check.squadId && isFull ? (
                        <button onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            const result = await db.joinSquadIfRoom(check.squadId!);
                            showToast(result === "joined" ? "Joined the squad! 🚀" : "Squad is full — you're on the waitlist");
                            await loadRealData();
                            if (result === "joined") onNavigateToGroups(check.squadId!);
                          } catch (err: unknown) { logError("waitlistSquad", err, { squadId: check.squadId }); showToast("Failed to join waitlist"); }
                        }}
                          style={{ background: "transparent", color: color.faint, border: `1px solid ${color.border}`, borderRadius: 8, padding: "6px 8px", fontFamily: font.mono, fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const }}
                        >Waitlist →<span style={{ fontWeight: 400, marginLeft: 4 }}>{capacityLabel}</span></button>
                      ) : pendingDownCheckIds.has(check.id) ? (
                        <span style={{ fontFamily: font.mono, fontSize: 10, color: color.dim, padding: "6px 8px" }}>...</span>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); startSquadFromCheck(check); }}
                          style={{ background: "transparent", color: color.accent, border: `1px solid ${color.accent}`, borderRadius: 8, padding: "6px 8px", fontFamily: font.mono, fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const }}
                        >Squad →</button>
                      )
                    );
                  })()}
                </div>
              )}
              {(check.isYours || check.isCoAuthor) && check.squadId && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                  <button onClick={(e) => { e.stopPropagation(); onNavigateToGroups(check.squadId!); }}
                    style={{ background: "rgba(175, 82, 222, 0.1)", color: "#AF52DE", border: "none", borderRadius: 8, padding: "6px 8px", fontFamily: font.mono, fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" as const }}
                  >💬 Squad →<span style={{ color: "rgba(175, 82, 222, 0.6)", marginLeft: 4, fontWeight: 400 }}>{check.squadMemberCount ?? 0}{check.maxSquadSize != null ? `/${check.maxSquadSize}` : `/∞`}</span></button>
                </div>
              )}
            </div>

            {/* Expanded responders */}
            {isExpanded && check.responses.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                {check.responses.filter(r => r.status === "down").length > 0 && (
                  <div>
                    <span style={{ fontFamily: font.mono, fontSize: 9, color: color.accent, textTransform: "uppercase", letterSpacing: "0.1em" }}>Down</span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                      {check.responses.filter(r => r.status === "down").map(r => (
                        <span key={r.name} style={{ fontFamily: font.mono, fontSize: 11, color: "#000", background: color.accent, padding: "3px 8px", borderRadius: 6, fontWeight: 600 }}>{r.name}</span>
                      ))}
                    </div>
                  </div>
                )}
                {check.responses.filter(r => r.status === "waitlist").length > 0 && (
                  <div>
                    <span style={{ fontFamily: font.mono, fontSize: 9, color: color.dim, textTransform: "uppercase", letterSpacing: "0.1em" }}>Waitlist</span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                      {check.responses.filter(r => r.status === "waitlist").map(r => (
                        <span key={r.name} style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, background: color.borderLight, padding: "3px 8px", borderRadius: 6, borderStyle: "dashed" }}>{r.name}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Comments section */}
            {isCommentsOpen && (
              <CheckCommentsSection
                comments={comments}
                userId={userId}
                friends={friendsList}
                onPost={postComment}
              />
            )}
          </div>
        </div>
      </div>

      <CheckActionsSheet
        open={actionsSheetOpen}
        onClose={() => setActionsSheetOpen(false)}
        hasSquad={!!check.squadId}
        onShare={shareCheck}
        onEdit={() => { setActionsSheetOpen(false); setEditModalOpen(true); }}
        onArchive={async () => {
          setActionsSheetOpen(false);
          setChecks(prev => prev.filter(c => c.id !== check.id));
          if (!isDemoMode) {
            try { await db.archiveInterestCheck(check.id); } catch (err) { logError("archiveCheck", err, { checkId: check.id }); }
          }
          showToast("Check archived");
        }}
        onDelete={async () => {
          setActionsSheetOpen(false);
          setChecks(prev => prev.filter(c => c.id !== check.id));
          if (!isDemoMode) {
            try { await db.deleteInterestCheck(check.id); } catch (err) { logError("deleteCheck", err, { checkId: check.id }); }
          }
          showToast("Check removed");
        }}
      />

      <EditCheckModal
        check={editModalOpen ? check : null}
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        friends={friendsList}
        onSave={async (updates) => {
          setChecks(prev => prev.map(c => c.id === check.id
            ? { ...c, text: updates.text, eventDate: updates.eventDate ?? undefined, eventDateLabel: updates.eventDateLabel ?? undefined, eventTime: updates.eventTime ?? undefined, dateFlexible: updates.dateFlexible, timeFlexible: updates.timeFlexible }
            : c
          ));
          setEditModalOpen(false);
          if (!isDemoMode) {
            try {
              await db.updateInterestCheck(check.id, { text: updates.text, event_date: updates.eventDate, event_time: updates.eventTime, date_flexible: updates.dateFlexible, time_flexible: updates.timeFlexible });
              if (updates.taggedFriendIds && updates.taggedFriendIds.length > 0) await db.tagCoAuthors(check.id, updates.taggedFriendIds);
              if (check.squadId) await db.updateSquadName(check.squadId, updates.text);
            } catch (err) { logError("updateCheck", err, { checkId: check.id }); showToast("Failed to save changes"); return; }
          }
          showToast("Check updated");
        }}
      />
    </>
  );
}
