"use client";

import React, { useState, useEffect } from "react";
import * as db from "@/lib/db";
import type { Profile } from "@/lib/types";
import type { InterestCheck, Friend } from "@/lib/ui-types";
import { logError } from "@/lib/logger";
import { useCheckComments } from "@/features/checks/hooks/useCheckComments";
import InlineCommentsBox from "@/shared/components/InlineCommentsBox";
import EditCheckModal from "./EditCheckModal";
import { useFeedContext } from "@/features/checks/context/FeedContext";

function Linkify({ children, dimmed, coAuthors, onViewProfile }: { children: string; dimmed?: boolean; coAuthors?: { name: string; userId?: string }[]; onViewProfile?: (userId: string) => void }) {
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
              className={`underline underline-offset-2 break-all ${dimmed ? "text-muted" : "text-dt"}`}
            >
              {display}
            </a>
          );
        }
        if (/^@\S+/.test(part)) {
          const mention = part.slice(1).toLowerCase();
          const matched = coAuthors?.find(ca => ca.name.toLowerCase() === mention || ca.name.split(" ")[0]?.toLowerCase() === mention);
          const canTap = matched?.userId && onViewProfile;
          return (
            <span
              key={i}
              className="text-dt font-semibold"
              style={canTap ? { cursor: "pointer" } : undefined}
              onClick={canTap ? (e) => { e.stopPropagation(); onViewProfile!(matched!.userId!); } : undefined}
            >
              @{matched ? matched.name : part.slice(1)}
            </span>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}

export interface CheckCardProps {
  check: InterestCheck;
  userId: string | null;
  profile: Profile | null;
  friends: Friend[];
  sharedCheckId?: string | null;
  initialCommentCount: number;
  startSquadFromCheck: (check: InterestCheck) => Promise<void>;
  onNavigateToGroups: (squadId?: string) => void;
  onViewProfile?: (userId: string) => void;
  showToast: (msg: string) => void;
  showToastWithAction?: (msg: string, action: () => void) => void;
  loadRealData: () => Promise<void>;
  isNew?: boolean;
}

export default function CheckCard({
  check,
  userId,
  profile,
  friends,
  sharedCheckId,
  initialCommentCount,
  startSquadFromCheck,
  onNavigateToGroups,
  onViewProfile,
  showToast,
  showToastWithAction,
  loadRealData,
  isNew,
}: CheckCardProps) {
  const {
    myCheckResponses,
    pendingDownCheckIds,
    newlyAddedCheckId,
    respondToCheck,
    clearResponse,
    acceptCoAuthorTag,
    declineCoAuthorTag,
    hideCheck,
  } = useFeedContext();
  const [isExpanded, setIsExpanded] = useState(false);
  const hasComments = initialCommentCount > 0;

  const expandedRef = React.useRef<HTMLDivElement>(null);




  useEffect(() => { openComments(); }, [check.id]);
  const [editModalOpen, setEditModalOpen] = useState(false);

  const { comments, commentCount, openComments, postComment } = useCheckComments({
    checkId: check.id,
    userId,
    profile,
    initialCommentCount,
  });



  const shareCheck = async () => {
    try { await db.markCheckShared(check.id); } catch { /* best-effort */ }
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
      <div className="mb-2">
      <div
        ref={check.id === newlyAddedCheckId ? (el) => {
          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        } : undefined}
        className={`overflow-hidden relative ${
          myCheckResponses[check.id] === "down" ? "check-down rounded-2xl" :
          (check.isYours || check.isCoAuthor) ? "check-mine rounded-2xl" :
          check.id === newlyAddedCheckId ? "bg-[#FFF5CC] border border-[#E8E0B0] rounded-sm" :
          "bg-card border border-[#CDC999] rounded-2xl"
        }`}
        style={check.id === sharedCheckId ? { animation: "rainbowGlow 3s linear infinite" } : check.id === newlyAddedCheckId ? { animation: "checkGlow 2s ease-in-out infinite" } : undefined}
      >
        {check.expiresIn !== "open" && (
          <div className="h-0.75 bg-border relative">
            <div
              className={`absolute inset-y-0 left-0 transition-all duration-1000 ease-in-out ${check.expiryPercent > 75 ? "bg-danger" : check.expiryPercent > 50 ? "bg-[#ffaa5a]" : "bg-green-400"}`}
              style={{ width: `${100 - check.expiryPercent}%` }}
            />
          </div>
        )}
        <div
          className={`p-4 ${(check.isYours || check.isCoAuthor) ? "cursor-pointer" : ""}`}
          onClick={(check.isYours || check.isCoAuthor) ? (e) => {
            // Only open modal if click wasn't on an interactive element
            const target = e.target as HTMLElement;
            if (target.closest("button") || target.closest("a") || target.closest("input") || target.closest("textarea")) return;
            setEditModalOpen(true);
          } : undefined}
        >
          {check.movieTitle && (
            <div
              onClick={(e) => { if (check.letterboxdUrl) { e.stopPropagation(); window.open(check.letterboxdUrl, "_blank", "noopener"); } }}
              className={`flex gap-2.5 mb-3 p-2.5 bg-surface rounded-lg border border-border-mid ${check.letterboxdUrl ? "cursor-pointer" : ""}`}
            >
              {check.thumbnail && (
                <img src={check.thumbnail} alt={check.movieTitle}
                  className="w-12 h-18 object-cover rounded-md shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-serif text-base text-primary leading-tight mb-0.5">{check.movieTitle}</div>
                <div className="font-mono text-tiny text-muted mb-1">
                  {check.year}{check.director && ` · ${check.director}`}
                </div>
                {check.vibes && check.vibes.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {check.vibes.slice(0, 3).map((v) => (
                      <span key={v} className="bg-border-light text-dt py-0.5 px-1.5 rounded-xl font-mono text-tiny uppercase tracking-widest">{v}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Co-author tag prompt */}
          {check.pendingTagForYou && (
            <div className="flex items-center justify-between py-2 px-4 bg-dt/6 border-b border-dt/15">
              <span className="font-mono text-xs text-dt">You were tagged as co-author</span>
              <div className="flex gap-1.5">
                <button
                  onClick={(e) => { e.stopPropagation(); acceptCoAuthorTag(check.id); }}
                  className="bg-dt text-on-accent border-none rounded-full py-1 px-3 font-mono text-tiny font-bold cursor-pointer uppercase"
                >Accept</button>
                <button
                  onClick={(e) => { e.stopPropagation(); declineCoAuthorTag(check.id); }}
                  className="bg-transparent text-muted border border-border-mid rounded-full py-1 px-2.5 font-mono text-tiny cursor-pointer"
                >Decline</button>
              </div>
            </div>
          )}

          {/* Check text + expiry + actions */}
          <div className="mb-3">
            <div className="flex items-start gap-1.5">
              <p className="font-serif text-lg text-primary m-0 font-normal leading-snug flex-1 tracking-[-0.01em]">
                <Linkify coAuthors={check.coAuthors} onViewProfile={onViewProfile}>{check.text}</Linkify>
              </p>
              <div className="flex items-center gap-1 shrink-0 mt-1">
                {isNew && (
                  <span className="bg-dt text-on-accent font-mono text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full leading-none">new</span>
                )}
                {check.expiresIn !== "open" && (
                  <span className={`font-mono text-tiny ${check.expiryPercent > 75 ? "text-danger" : "text-dim"}`}>
                    {check.expiresIn === "expired" ? "expired" : `${check.expiresIn} left`}
                  </span>
                )}
                {!check.isYours && !check.isCoAuthor && (
                  <button
                    onClick={(e) => { e.stopPropagation(); hideCheck(check.id); }}
                    className="bg-transparent border-none text-dim py-0.5 px-1 font-mono text-xs cursor-pointer leading-none"
                    title="Hide this check"
                  >✕</button>
                )}
              </div>
            </div>
            {(check.eventDateLabel || check.eventTime || check.location) && (() => {
              const when = [check.eventDateLabel, check.eventTime].filter(Boolean).join(" · ");
              if (!when && !check.location) return null;
              return (
                <div className="flex flex-wrap justify-between items-baseline gap-x-3 gap-y-1 mt-2">
                  {when && <span className="font-mono text-xs text-muted">{when}</span>}
                  {check.location && (
                    <span className="font-mono text-xs text-muted">{check.location}</span>
                  )}
                </div>
              );
            })()}
            {(check.isYours || check.isCoAuthor) && !check.squadId && myCheckResponses[check.id] !== "down" && check.responses.some(r => r.status === "down") && (
              <button
                onClick={(e) => { e.stopPropagation(); startSquadFromCheck(check); }}
                className="bg-transparent text-dt border border-dt rounded-md py-1 px-2 font-mono text-tiny font-bold cursor-pointer mt-1.5"
              >Squad →</button>
            )}
          </div>

          {/* Responses + comment toggle + down button */}
          <div className="mt-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {check.responses.length > 0 ? (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(prev => {
                      if (!prev) {
                        setTimeout(() => {
                          const el = expandedRef.current;
                          if (!el) return;
                          const scrollParent = el.closest('[class*="overflow-y"]') || el.closest('[style*="overflow"]');
                          if (scrollParent) {
                            const elRect = el.getBoundingClientRect();
                            const parentRect = scrollParent.getBoundingClientRect();
                            const overflow = elRect.bottom - parentRect.bottom;
                            if (overflow > 0) {
                              scrollParent.scrollBy({ top: overflow + 16, behavior: "smooth" });
                            }
                          }
                        }, 100);
                      }
                      return !prev;
                    });
                  }}
                  className="font-mono text-tiny text-muted cursor-pointer whitespace-nowrap"
                >
                  {(() => {
                    const downCount = check.responses.filter(r => r.status === "down").length;
                    return (
                      <>
                        <span className="text-dt font-semibold">{check.author}</span>
                        {downCount > 0 && <span>{" "}+ {downCount} down</span>}
                      </>
                    );
                  })()}
                  {" "}<span className="text-dim">{isExpanded ? "▴" : "▾"}</span>
                </span>
              ) : (
                <span className="font-mono text-tiny text-dim">no responses yet</span>
              )}

              <div className="flex gap-1.5 items-center ml-auto flex-wrap justify-end">

              {!check.isYours && (
                <>
                  <button
                    disabled={check.expiresIn === "expired" && !myCheckResponses[check.id]}
                    onClick={() => {
                      if (myCheckResponses[check.id] === "down" || myCheckResponses[check.id] === "waitlist") {
                        clearResponse(check.id);
                        if (check.id) {
                          db.removeCheckResponse(check.id)
                            .then(() => loadRealData())
                            .catch(err => logError("removeCheckResponse", err, { checkId: check.id }));
                        }
                      } else {
                        respondToCheck(check.id);
                      }
                    }}
                    className={`rounded-full py-1.5 px-3 font-mono text-tiny font-bold whitespace-nowrap ${
                      check.expiresIn === "expired" && !myCheckResponses[check.id]
                        ? "bg-transparent text-dim border border-border cursor-default opacity-50"
                        : myCheckResponses[check.id] === "down"
                        ? "bg-dt text-bg border-none cursor-pointer"
                        : myCheckResponses[check.id] === "waitlist"
                        ? "bg-transparent text-muted border border-dashed border-neutral-800 cursor-pointer"
                        : "bg-[#F5F7EA] text-dt border border-[#CDC999] cursor-pointer"
                    }`}
                  >
                    {myCheckResponses[check.id] === "down" ? <><span>DOWN</span><svg width="12" height="12" viewBox="0 0 256 256" fill="currentColor" className="inline ml-1"><path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/></svg></> : myCheckResponses[check.id] === "waitlist" ? "✓ Waitlisted" : "DOWN ?"}
                  </button>
                </>
              )}
              </div>
            </div>

            {/* Expanded responders */}
            {isExpanded && check.responses.length > 0 && (
              <div ref={expandedRef} className="mt-2 flex flex-col gap-1.5">
                {check.responses.filter(r => r.status === "down").length > 0 && (
                  <div>
                    <span className="font-mono text-tiny text-dt uppercase tracking-widest">Down</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {check.responses.filter(r => r.status === "down").map(r => (
                        <span key={r.name} className="font-mono text-tiny text-on-accent bg-dt py-0.75 px-2 rounded-3xl font-semibold">{r.name}</span>
                      ))}
                    </div>
                  </div>
                )}
                {check.responses.filter(r => r.status === "waitlist").length > 0 && (
                  <div>
                    <span className="font-mono text-tiny text-muted uppercase tracking-widest">Waitlist</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {check.responses.filter(r => r.status === "waitlist").map(r => (
                        <span key={r.name} className="font-mono text-tiny text-muted bg-border-light py-0.75 px-2 rounded-3xl border border-dashed">{r.name}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Inline comments — overlaps bottom of card */}
      <div className="-mt-3 px-1.5 pb-2 relative z-[2]">
        <InlineCommentsBox
          comments={comments}
          userId={userId}
          friends={friendsList}
          onPost={postComment}
        />
      </div>
      </div>

      <EditCheckModal
        check={editModalOpen ? check : null}
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        friends={friendsList}
        hasSquad={!!check.squadId}
        onShare={(check.isYours || check.isCoAuthor) ? () => { setEditModalOpen(false); shareCheck(); } : undefined}
        onArchive={(check.isYours || check.isCoAuthor) ? async () => {
          setEditModalOpen(false);
          try { await db.archiveInterestCheck(check.id); } catch (err) { logError("archiveCheck", err, { checkId: check.id }); }
          await loadRealData();
          if (showToastWithAction) {
            showToastWithAction("Check archived — undo?", async () => {
              try { await db.unarchiveInterestCheck(check.id); } catch (err) { logError("unarchiveCheck", err, { checkId: check.id }); }
              await loadRealData();
            });
          } else {
            showToast("Check archived");
          }
        } : undefined}
        onDelete={(check.isYours || check.isCoAuthor) ? async () => {
          setEditModalOpen(false);
          try { await db.archiveInterestCheck(check.id); } catch (err) { logError("archiveCheck", err, { checkId: check.id }); }
          await loadRealData();
          if (showToastWithAction) {
            const timer = setTimeout(async () => {
              try { await db.deleteInterestCheck(check.id); } catch (err) { logError("deleteCheck", err, { checkId: check.id }); }
            }, 4500);
            showToastWithAction("Check removed — undo?", async () => {
              clearTimeout(timer);
              try { await db.unarchiveInterestCheck(check.id); } catch (err) { logError("unarchiveCheck", err, { checkId: check.id }); }
              await loadRealData();
            });
          } else {
            try { await db.deleteInterestCheck(check.id); } catch (err) { logError("deleteCheck", err, { checkId: check.id }); }
            showToast("Check removed");
          }
        } : undefined}
        onSave={async (updates) => {
          setEditModalOpen(false);
          try {
            await db.updateInterestCheck(check.id, { text: updates.text, event_date: updates.eventDate, event_time: updates.eventTime, date_flexible: updates.dateFlexible, time_flexible: updates.timeFlexible, location: updates.location });
            if (updates.taggedFriendIds && updates.taggedFriendIds.length > 0) await db.tagCoAuthors(check.id, updates.taggedFriendIds);
            if (check.squadId) await db.updateSquadName(check.squadId, updates.text);
          } catch (err) { logError("updateCheck", err, { checkId: check.id }); showToast("Failed to save changes"); return; }
          showToast("Check updated");
          await loadRealData();
        }}
      />
    </>
  );
}
