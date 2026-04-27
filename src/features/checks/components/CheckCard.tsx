"use client";

import React, { useState, useEffect, useMemo, memo } from "react";
import * as db from "@/lib/db";
import type { Profile } from "@/lib/types";
import type { InterestCheck, Friend } from "@/lib/ui-types";
import { logError } from "@/lib/logger";
import { useCheckComments } from "@/features/checks/hooks/useCheckComments";
import InlineCommentsBox from "@/shared/components/InlineCommentsBox";
import CheckDetailSheet from "./CheckDetailSheet";
import EditCheckModal from "./EditCheckModal";
import ReportSheet from "@/shared/components/ReportSheet";
import CheckActionsSheet from "@/shared/components/CheckActionsSheet";
import { Linkify } from "@/shared/components/Linkify";
import { useFeedContext } from "@/features/checks/context/FeedContext";

export interface CheckCardProps {
  check: InterestCheck;
  userId: string | null;
  profile: Profile | null;
  friends: Friend[];
  sharedCheckId?: string | null;
  initialCommentCount: number;
  onNavigateToGroups: (squadId?: string) => void;
  onViewProfile?: (userId: string) => void;
  showToast: (msg: string) => void;
  showToastWithAction?: (msg: string, action: () => void) => void;
  loadRealData: () => Promise<void>;
  isNew?: boolean;
}

function CheckCard({
  check,
  userId,
  profile,
  friends,
  sharedCheckId,
  initialCommentCount,
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
  const hasComments = initialCommentCount > 0;

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const { comments, commentCount, openComments, postComment } = useCheckComments({
    checkId: check.id,
    userId,
    profile,
    initialCommentCount,
  });

  // Eagerly fetch the comment list only when there's actually something to
  // fetch — initialCommentCount is hydrated in batch by FeedView, so this
  // skips one query per check that has zero comments. Realtime arrivals
  // still get appended to `comments` via the always-on subscription in
  // useCheckComments, so a previously-empty check that gets a new comment
  // post-render still renders InlineCommentsBox correctly.
  useEffect(() => {
    if (hasComments) openComments();
  }, [check.id, hasComments, openComments]);



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

  // Memoized so the array identity is stable across renders — InlineCommentsBox,
  // CheckDetailSheet, and EditCheckModal all receive this and would otherwise
  // see a fresh reference on every parent render.
  const friendsList = useMemo(
    () => friends.filter((f) => f.status === "friend").map((f) => ({ id: f.id, name: f.name, avatar: f.avatar })),
    [friends],
  );

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
          check.id === newlyAddedCheckId ? "bg-[var(--color-check-new-bg)] border border-[var(--color-check-new-border)] rounded-sm" :
          "bg-card border border-border rounded-2xl"
        }`}
        style={check.id === sharedCheckId ? { animation: "rainbowGlow 3s linear infinite" } : check.id === newlyAddedCheckId ? { animation: "checkGlow 2s ease-in-out infinite" } : undefined}
      >
        {check.expiresIn !== "open" && (
          <div className="h-1 bg-border relative overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 overflow-hidden transition-[width] duration-[2000ms] ease-out"
              style={{
                width: `${Math.max(0, 100 - check.expiryPercent)}%`,
                background: "linear-gradient(90deg, var(--color-dt) 0%, var(--color-dt) 80%, color-mix(in srgb, var(--color-dt) 40%, transparent) 100%)",
              }}
            >
              {/* Continuous shimmer so the bar feels alive */}
              <div
                className="absolute inset-y-0 w-1/3 pointer-events-none"
                style={{
                  background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)",
                  animation: "expiryShimmer 2.4s ease-in-out infinite",
                }}
              />
            </div>
          </div>
        )}
        <div
          className="p-4 cursor-pointer"
          onClick={(e) => {
            // Only open sheet if click wasn't on an interactive element
            const target = e.target as HTMLElement;
            if (target.closest("button") || target.closest("a") || target.closest("input") || target.closest("textarea")) return;
            setShowDetail(true);
          }}
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

          {/* Author header */}
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-5 h-5 rounded-full bg-border-light text-dim flex items-center justify-center font-mono text-[9px] font-bold shrink-0">
              {check.author[0]?.toUpperCase()}
            </div>
            <span className="font-mono text-tiny text-muted min-w-0 truncate flex-1">
              <span className="text-dt font-semibold">{check.author}</span>
              {check.viaFriendName && (
                <span className="font-normal text-dim">{" "}via {check.viaFriendName}</span>
              )}
            </span>
            {check.expiresIn !== "open" && (
              <span className={`font-mono text-tiny shrink-0 ${check.expiryPercent > 75 ? "text-danger" : "text-dim"}`}>
                {check.expiresIn === "expired" ? "expired" : `${check.expiresIn} left`}
              </span>
            )}
            {isNew && (
              <span
                className="font-mono text-[9px] font-bold uppercase shrink-0 py-1 pl-4 pr-5 leading-none"
                style={{
                  background: "#C2FF8A", // guava chartreuse
                  color: "#ff00d4",        // electric fuchsia
                  letterSpacing: "0.12em",
                  marginRight: -16,       // cancel the card's p-4 right padding so the bg reaches the card's right edge
                  borderTopLeftRadius: 3,
                  borderBottomLeftRadius: 3,
                }}
              >
                NEW
              </span>
            )}
          </div>

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
              <p className="font-serif text-lg text-primary m-0 font-normal leading-snug flex-1 tracking-[var(--serif-title-tracking)]">
                <Linkify coAuthors={check.coAuthors} onViewProfile={onViewProfile}>{check.text}</Linkify>
              </p>
              <div className="flex items-center gap-1 shrink-0 mt-1">
                {!check.isYours && !check.isCoAuthor && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowActions(true); }}
                    className="bg-transparent border-none text-dim py-0.5 px-1 font-mono text-base cursor-pointer leading-none"
                    title="More"
                    aria-label="More actions"
                  >⋯</button>
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
          </div>

          {/* Responses + comment toggle + down button */}
          <div className="mt-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {check.responses.filter(r => r.status === "down").length > 0 ? (() => {
                const downResponders = check.responses.filter(r => r.status === "down");
                const first = downResponders[0];
                const othersCount = downResponders.length - 1;
                return (
                  <span className="font-mono text-tiny text-muted whitespace-nowrap">
                    <span className="text-dt font-semibold">{first.name}</span>
                    {othersCount > 0 ? (
                      <span>{" "}+ {othersCount} {othersCount === 1 ? "other" : "others"} down</span>
                    ) : (
                      <span>{" "}is down</span>
                    )}
                  </span>
                );
              })() : (
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
                        ? "bg-transparent text-primary border border-dashed border-border-mid cursor-pointer"
                        : "bg-[var(--color-down-idle-bg)] text-dt border border-[var(--color-down-idle-border)] cursor-pointer"
                    }`}
                  >
                    {myCheckResponses[check.id] === "down" ? <><span>DOWN</span><svg width="12" height="12" viewBox="0 0 256 256" fill="currentColor" className="inline ml-1"><path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/></svg></> : myCheckResponses[check.id] === "waitlist" ? "✓ Waitlisted" : "DOWN ?"}
                  </button>
                </>
              )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Inline comments — only render when at least one comment exists; empty state lives in the sheet */}
      {comments.length > 0 && (
        <div className="-mt-3 px-1.5 pb-2 relative z-[2]">
          <InlineCommentsBox
            comments={comments}
            userId={userId}
            friends={friendsList}
            onPost={postComment}
          />
        </div>
      )}
      </div>

      {showDetail && (
        <CheckDetailSheet
          check={check}
          userId={userId}
          comments={comments}
          friends={friendsList}
          onPostComment={postComment}
          onEdit={(check.isYours || check.isCoAuthor) ? () => { setShowDetail(false); setEditModalOpen(true); } : undefined}
          onViewProfile={onViewProfile}
          onClose={() => setShowDetail(false)}
        />
      )}

      <EditCheckModal
        check={editModalOpen ? check : null}
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        friends={friendsList}
        onShare={(check.isYours || check.isCoAuthor) ? () => { setEditModalOpen(false); shareCheck(); } : undefined}
        onDelete={(check.isYours || check.isCoAuthor) ? async () => {
          setEditModalOpen(false);
          try { await db.archiveInterestCheck(check.id); } catch (err) { logError("archiveCheck", err, { checkId: check.id }); }
          await loadRealData();
          if (showToastWithAction) {
            showToastWithAction("Check removed — undo?", async () => {
              try { await db.reviveInterestCheck(check.id); } catch (err) { logError("reviveCheck", err, { checkId: check.id }); }
              await loadRealData();
            });
          } else {
            showToast("Check removed");
          }
        } : undefined}
        onSave={async (updates) => {
          setEditModalOpen(false);
          try {
            await db.updateInterestCheck(check.id, { text: updates.text, event_date: updates.eventDate, event_time: updates.eventTime, date_flexible: updates.dateFlexible, time_flexible: updates.timeFlexible, location: updates.location });
            if (updates.taggedFriendIds && updates.taggedFriendIds.length > 0) await db.tagCoAuthors(check.id, updates.taggedFriendIds);
            if (check.squadId) await db.updateSquadName(check.squadId, updates.text);
          } catch (err) {
            logError("updateCheck", err, { checkId: check.id });
            // Dump the raw error so we can see its actual shape in the toast
            let msg: string;
            try {
              if (err instanceof Error) {
                msg = err.message || err.name || JSON.stringify(err, Object.getOwnPropertyNames(err));
              } else {
                msg = JSON.stringify(err);
              }
            } catch { msg = String(err); }
            // eslint-disable-next-line no-console
            console.error("updateCheck raw error:", err);
            showToast(`Failed: ${msg.slice(0, 160)}`);
            return;
          }
          showToast("Check updated");
          await loadRealData();
        }}
      />

      {showActions && (
        <CheckActionsSheet
          onHide={() => hideCheck(check.id)}
          onReport={() => setShowReport(true)}
          onClose={() => setShowActions(false)}
        />
      )}

      {showReport && (
        <ReportSheet
          targetType="check"
          targetId={check.id}
          targetLabel="check"
          onClose={() => setShowReport(false)}
          onSubmitted={() => showToast("Report submitted — thanks")}
        />
      )}
    </>
  );
}

// Memoized so a re-render in Home that doesn't change this check's props
// (tab switches, modal toggles, viewing-user changes, etc.) skips the card
// entirely. Default shallow compare works now that the upstream callbacks
// are stable: showToast/showToastWithAction (#463), loadRealData (already
// useCallback), and the in-FeedContext handlers from useChecks (this PR).
export default memo(CheckCard);
