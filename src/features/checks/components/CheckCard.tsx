"use client";

import React, { useState } from "react";
import * as db from "@/lib/db";
import type { Profile } from "@/lib/types";
import type { InterestCheck, Friend } from "@/lib/ui-types";
import { logError } from "@/lib/logger";
import { useCheckComments } from "@/features/checks/hooks/useCheckComments";
import CheckCommentsSection from "./CheckCommentsSection";
import EditCheckModal from "./EditCheckModal";
import CheckActionsSheet from "./CheckActionsSheet";
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
              className={`underline underline-offset-2 break-all ${dimmed ? "text-neutral-500" : "text-dt"}`}
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
  isDemoMode: boolean;
  profile: Profile | null;
  friends: Friend[];
  sharedCheckId?: string | null;
  initialCommentCount: number;
  startSquadFromCheck: (check: InterestCheck) => Promise<void>;
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
  sharedCheckId,
  initialCommentCount,
  startSquadFromCheck,
  onNavigateToGroups,
  onViewProfile,
  showToast,
  loadRealData,
}: CheckCardProps) {
  const {
    myCheckResponses,
    pendingDownCheckIds,
    newlyAddedCheckId,
    respondToCheck,
    acceptCoAuthorTag,
    declineCoAuthorTag,
    hideCheck,
  } = useFeedContext();
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
        className={`rounded-xl overflow-hidden mb-2 border ${(check.isYours || check.isCoAuthor) ? "bg-dt/5" : "bg-neutral-925"} ${
          check.id === newlyAddedCheckId ? "border-sky-400/50" :
          check.id === sharedCheckId ? "border-dt/40" :
          (check.isYours || check.isCoAuthor) ? "border-dt/20" :
          "border-neutral-900"
        }`}
        style={check.id === sharedCheckId ? { animation: "rainbowGlow 3s linear infinite" } : check.id === newlyAddedCheckId ? { animation: "checkGlow 2s ease-in-out infinite" } : undefined}
      >
        {check.expiresIn !== "open" && (
          <div className="h-0.75 bg-neutral-900 relative">
            <div
              className={`absolute inset-y-0 left-0 transition-all duration-1000 ease-in-out ${check.expiryPercent > 75 ? "bg-danger" : check.expiryPercent > 50 ? "bg-[#ffaa5a]" : "bg-green-400"}`}
              style={{ width: `${100 - check.expiryPercent}%` }}
            />
          </div>
        )}
        <div className="p-3.5">
          {check.movieTitle && (
            <div
              onClick={(e) => { if (check.letterboxdUrl) { e.stopPropagation(); window.open(check.letterboxdUrl, "_blank", "noopener"); } }}
              className={`flex gap-2.5 mb-3 p-2.5 bg-neutral-950 rounded-lg border border-neutral-800 ${check.letterboxdUrl ? "cursor-pointer" : ""}`}
            >
              {check.thumbnail && (
                <img src={check.thumbnail} alt={check.movieTitle}
                  className="w-12 h-18 object-cover rounded-md shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-serif text-base text-white leading-tight mb-0.5">{check.movieTitle}</div>
                <div className="font-mono text-tiny text-neutral-500 mb-1">
                  {check.year}{check.director && ` · ${check.director}`}
                </div>
                {check.vibes && check.vibes.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {check.vibes.slice(0, 3).map((v) => (
                      <span key={v} className="bg-neutral-800 text-dt py-0.5 px-1.5 rounded-xl font-mono text-tiny uppercase tracking-widest">{v}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Header: author + expiry */}
          <div className="flex justify-between items-start mb-2.5">
            <div
              className={`flex items-center gap-2 ${!check.isYours && check.authorId ? "cursor-pointer" : ""}`}
              onClick={(e) => { if (!check.isYours && check.authorId && onViewProfile) { e.stopPropagation(); onViewProfile(check.authorId); } }}
            >
              <div className={`size-7 rounded-full flex items-center justify-center font-mono text-xs font-bold ${check.isYours ? "bg-dt text-black" : "bg-neutral-800 text-neutral-500"}`}>
                {check.author[0]}
              </div>
              <span className={`font-mono text-xs ${(check.isYours || check.isCoAuthor) ? "text-dt" : "text-neutral-500"}`}>
                {check.author}
                {check.viaFriendName && <span className="text-neutral-500 font-normal">{" "}via {check.viaFriendName}</span>}
              </span>
              {check.coAuthors && check.coAuthors.filter(ca => ca.status === "accepted").length > 0 && (
                <div className="flex items-center ml-1">
                  <span className="text-neutral-500 font-mono text-tiny mr-0.5">+</span>
                  {check.coAuthors.filter(ca => ca.status === "accepted").slice(0, 3).map((ca, i) => (
                    <div key={ca.userId} className={`size-5 rounded-full flex items-center justify-center font-mono text-tiny font-bold border border-neutral-925 ${i > 0 ? "-ml-1" : ""} ${ca.userId === userId ? "bg-dt text-black" : "bg-neutral-800 text-neutral-500"}`}>{ca.avatar}</div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`font-mono text-tiny ${check.expiresIn === "open" ? "text-neutral-500" : check.expiryPercent > 75 ? "text-danger" : "text-neutral-700"}`}>
                {check.expiresIn === "open" ? "open" : check.expiresIn === "expired" ? "expired" : `${check.expiresIn} left`}
              </span>
              {!check.isYours && !check.isCoAuthor && (
                <button
                  onClick={(e) => { e.stopPropagation(); hideCheck(check.id); }}
                  className="bg-transparent border-none text-neutral-700 py-0.5 px-1 font-mono text-xs cursor-pointer leading-none"
                  title="Hide this check"
                >✕</button>
              )}
            </div>
          </div>

          {/* Co-author tag prompt */}
          {check.pendingTagForYou && (
            <div className="flex items-center justify-between py-2 px-4 bg-dt/6 border-b border-dt/15">
              <span className="font-mono text-xs text-dt">You were tagged as co-author</span>
              <div className="flex gap-1.5">
                <button
                  onClick={(e) => { e.stopPropagation(); acceptCoAuthorTag(check.id); }}
                  className="bg-dt text-black border-none rounded-lg py-1 px-2.5 font-mono text-tiny font-bold cursor-pointer uppercase"
                >Accept</button>
                <button
                  onClick={(e) => { e.stopPropagation(); declineCoAuthorTag(check.id); }}
                  className="bg-transparent text-neutral-500 border border-neutral-800 rounded-lg py-1 px-2 font-mono text-tiny cursor-pointer"
                >Decline</button>
              </div>
            </div>
          )}

          {/* Check text + actions button */}
          <div className="mb-3">
            <div className="flex items-start gap-1.5">
              <p className="font-serif text-lg text-white m-0 font-normal leading-snug flex-1">
                <Linkify coAuthors={check.coAuthors} onViewProfile={onViewProfile}>{check.text}</Linkify>
              </p>
              {(check.isYours || check.isCoAuthor) && (
                <button
                  onClick={(e) => { e.stopPropagation(); setActionsSheetOpen(true); }}
                  className="bg-transparent border border-neutral-900 rounded-lg text-neutral-500 py-1.5 px-2.5 font-mono text-sm cursor-pointer leading-none shrink-0 mt-0.5"
                >⚙</button>
              )}
            </div>
            {(check.eventDateLabel || check.eventTime || check.location) && (() => {
              const when = [check.eventDateLabel, check.eventTime].filter(Boolean).join(" ");
              if (!when && !check.location) return null;
              return (
                <p className="font-mono text-xs text-neutral-500 m-0 mt-2">
                  {when}
                  {when && check.location && " · "}
                  {check.location && (
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(check.location)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{ color: "inherit", textDecoration: "none" }}
                    >
                      {check.location}
                    </a>
                  )}
                </p>
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
                <div
                  onClick={(e) => { e.stopPropagation(); setIsExpanded(prev => !prev); }}
                  className="flex items-center gap-2 cursor-pointer min-w-0"
                >
                  <div className="flex shrink-0">
                    {check.responses.slice(0, 6).map((r, i) => (
                      <div key={r.name} className={`size-6 rounded-full flex items-center justify-center font-mono text-tiny font-bold border-2 border-neutral-925 ${i > 0 ? "-ml-1.5" : ""} ${r.status === "down" ? "bg-dt text-black" : "bg-neutral-700 text-neutral-500"} ${r.status === "waitlist" ? "opacity-50" : ""}`}>{r.avatar}</div>
                    ))}
                    {check.responses.length > 6 && (
                      <div className="-ml-1.5 size-6 rounded-full bg-neutral-700 text-neutral-500 flex items-center justify-center font-mono text-tiny font-bold border-2 border-neutral-925">+{check.responses.length - 6}</div>
                    )}
                  </div>
                  <span className="font-mono text-tiny text-dt whitespace-nowrap">
                    {check.responses.filter(r => r.status === "down").length} down
                    {check.responses.some(r => r.status === "waitlist") && (
                      <span className="text-neutral-500">{" "}{check.responses.filter(r => r.status === "waitlist").length} waitlist</span>
                    )}
                    {" "}<span className="text-neutral-700 text-tiny pr-1">{isExpanded ? "▴" : "▾"}</span>
                  </span>
                </div>
              ) : (
                <span className="font-mono text-tiny text-neutral-700">no responses yet</span>
              )}

              <button
                onClick={(e) => { e.stopPropagation(); handleToggleComments(); }}
                className={`bg-transparent border-none font-mono text-tiny cursor-pointer py-1 px-1.5 flex items-center gap-1 ${isCommentsOpen ? "text-dt" : "text-neutral-700"}`}
              >
                <span>{commentCount > 0 ? `💬 ${commentCount}` : "💬"}</span>
              </button>

              {!check.isYours && (
                <div className="flex gap-1.5 items-center ml-auto">
                  <button
                    onClick={() => {
                      if (myCheckResponses[check.id] === "down" || myCheckResponses[check.id] === "waitlist") {
                        if (!isDemoMode && check.id) {
                          db.removeCheckResponse(check.id)
                            .then(() => loadRealData())
                            .catch(err => logError("removeCheckResponse", err, { checkId: check.id }));
                        }
                      } else {
                        respondToCheck(check.id);
                      }
                    }}
                    className={`rounded-lg py-1.5 px-2.5 font-mono text-tiny font-bold cursor-pointer whitespace-nowrap ${
                      myCheckResponses[check.id] === "down"
                        ? "bg-dt text-black border-none"
                        : myCheckResponses[check.id] === "waitlist"
                        ? "bg-transparent text-neutral-500 border border-dashed border-neutral-800"
                        : "bg-transparent text-white border border-neutral-800"
                    }`}
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
                          className="bg-purple-500/10 text-purple-500 border-none rounded-lg py-1.5 px-2 font-mono text-tiny font-bold cursor-pointer whitespace-nowrap"
                        >💬 Squad →{check.squadId && <span className="text-purple-500/60 ml-1 font-normal">{capacityLabel}</span>}</button>
                      ) : check.isWaitlisted ? (
                        <button onClick={(e) => { e.stopPropagation(); onNavigateToGroups(check.squadId!); }}
                          className="bg-transparent text-neutral-700 border border-neutral-900 rounded-lg py-1.5 px-2 font-mono text-tiny font-bold cursor-pointer whitespace-nowrap"
                        >Waitlisted<span className="font-normal ml-1">{capacityLabel}</span></button>
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
                          className="bg-transparent text-purple-500 border border-purple-500 rounded-lg py-1.5 px-2 font-mono text-tiny font-bold cursor-pointer whitespace-nowrap"
                        >Join Squad →<span className="text-neutral-500 ml-1 font-normal">{capacityLabel}</span></button>
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
                          className="bg-transparent text-neutral-700 border border-neutral-900 rounded-lg py-1.5 px-2 font-mono text-tiny font-bold cursor-pointer whitespace-nowrap"
                        >Waitlist →<span className="font-normal ml-1">{capacityLabel}</span></button>
                      ) : pendingDownCheckIds.has(check.id) ? (
                        <span className="font-mono text-tiny text-neutral-500 py-1.5 px-2">...</span>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); startSquadFromCheck(check); }}
                          className="bg-transparent text-dt border border-dt rounded-lg py-1.5 px-2 font-mono text-tiny font-bold cursor-pointer whitespace-nowrap"
                        >Squad →</button>
                      )
                    );
                  })()}
                </div>
              )}
              {(check.isYours || check.isCoAuthor) && check.squadId && myCheckResponses[check.id] !== "down" && (
                <div className="flex justify-end mt-1">
                  <button onClick={(e) => { e.stopPropagation(); onNavigateToGroups(check.squadId!); }}
                    className="bg-purple-500/10 text-purple-500 border-none rounded-lg py-1.5 px-2 font-mono text-tiny font-bold cursor-pointer whitespace-nowrap"
                  >💬 Squad →<span className="text-purple-500/60 ml-1 font-normal">{check.squadMemberCount ?? 0}{check.maxSquadSize != null ? `/${check.maxSquadSize}` : `/∞`}</span></button>
                </div>
              )}
            </div>

            {/* Expanded responders */}
            {isExpanded && check.responses.length > 0 && (
              <div className="mt-2 flex flex-col gap-1.5">
                {check.responses.filter(r => r.status === "down").length > 0 && (
                  <div>
                    <span className="font-mono text-tiny text-dt uppercase tracking-widest">Down</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {check.responses.filter(r => r.status === "down").map(r => (
                        <span key={r.name} className="font-mono text-tiny text-black bg-dt py-0.75 px-2 rounded-md font-semibold">{r.name}</span>
                      ))}
                    </div>
                  </div>
                )}
                {check.responses.filter(r => r.status === "waitlist").length > 0 && (
                  <div>
                    <span className="font-mono text-tiny text-neutral-500 uppercase tracking-widest">Waitlist</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {check.responses.filter(r => r.status === "waitlist").map(r => (
                        <span key={r.name} className="font-mono text-tiny text-neutral-500 bg-neutral-800 py-0.75 px-2 rounded-md border border-dashed">{r.name}</span>
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
          if (!isDemoMode) {
            try { await db.archiveInterestCheck(check.id); } catch (err) { logError("archiveCheck", err, { checkId: check.id }); }
          }
          showToast("Check archived");
          await loadRealData();
        }}
        onDelete={async () => {
          setActionsSheetOpen(false);
          if (!isDemoMode) {
            try { await db.deleteInterestCheck(check.id); } catch (err) { logError("deleteCheck", err, { checkId: check.id }); }
          }
          showToast("Check removed");
          await loadRealData();
        }}
      />

      <EditCheckModal
        check={editModalOpen ? check : null}
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        friends={friendsList}
        onSave={async (updates) => {
          setEditModalOpen(false);
          if (!isDemoMode) {
            try {
              await db.updateInterestCheck(check.id, { text: updates.text, event_date: updates.eventDate, event_time: updates.eventTime, date_flexible: updates.dateFlexible, time_flexible: updates.timeFlexible });
              if (updates.taggedFriendIds && updates.taggedFriendIds.length > 0) await db.tagCoAuthors(check.id, updates.taggedFriendIds);
              if (check.squadId) await db.updateSquadName(check.squadId, updates.text);
            } catch (err) { logError("updateCheck", err, { checkId: check.id }); showToast("Failed to save changes"); return; }
          }
          showToast("Check updated");
          await loadRealData();
        }}
      />
    </>
  );
}
