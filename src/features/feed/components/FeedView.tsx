"use client";

import React from "react";
import { font, color } from "@/lib/styles";
import { toLocalISODate } from "@/lib/utils";
import type { Event, InterestCheck, Friend } from "@/lib/ui-types";
import type { Profile } from "@/lib/types";
import type { CommentUI } from "@/features/checks/hooks/useCheckComments";
import ForYouView from "./ForYouView";
import TonightView from "./TonightView";

export interface FeedViewProps {
  feedMode: "foryou" | "tonight";
  setFeedMode: (mode: "foryou" | "tonight") => void;
  checks: InterestCheck[];
  setChecks: React.Dispatch<React.SetStateAction<InterestCheck[]>>;
  myCheckResponses: Record<string, "down" | "waitlist">;
  setMyCheckResponses: React.Dispatch<React.SetStateAction<Record<string, "down" | "waitlist">>>;
  events: Event[];
  setEvents: React.Dispatch<React.SetStateAction<Event[]>>;
  tonightEvents: Event[];
  setTonightEvents: React.Dispatch<React.SetStateAction<Event[]>>;
  newlyAddedId: string | null;
  newlyAddedCheckId: string | null;
  friends: Friend[];
  userId: string | null;
  isDemoMode: boolean;
  profile: Profile | null;
  // Callbacks
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
  onPostComment: (checkId: string, text: string) => void;
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
}: FeedViewProps) {
  const today = toLocalISODate(new Date());
  const tonightChecks = checks.filter(
    (c) => c.eventDate === today && (myCheckResponses[c.id] || c.isYours)
  );

  return (
    <div style={{ padding: "0 16px", animation: "fadeIn 0.3s ease" }}>
      {/* Feed mode toggle */}
      <div style={{ display: "flex", gap: 8, margin: "8px 0 16px", padding: "0 4px" }}>
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
        <ForYouView
          checks={checks}
          setChecks={setChecks}
          myCheckResponses={myCheckResponses}
          setMyCheckResponses={setMyCheckResponses}
          events={events}
          setEvents={setEvents}
          newlyAddedId={newlyAddedId}
          newlyAddedCheckId={newlyAddedCheckId}
          friends={friends}
          userId={userId}
          isDemoMode={isDemoMode}
          profile={profile}
          toggleSave={toggleSave}
          toggleDown={toggleDown}
          respondToCheck={respondToCheck}
          startSquadFromCheck={startSquadFromCheck}
          loadRealData={loadRealData}
          showToast={showToast}
          onOpenSocial={onOpenSocial}
          onEditEvent={onEditEvent}
          onOpenAdd={onOpenAdd}
          onOpenFriends={onOpenFriends}
          onNavigateToGroups={onNavigateToGroups}
          hiddenCheckIds={hiddenCheckIds}
          pendingDownCheckIds={pendingDownCheckIds}
          onHideCheck={onHideCheck}
          onUnhideCheck={onUnhideCheck}
          acceptCoAuthorTag={acceptCoAuthorTag}
          declineCoAuthorTag={declineCoAuthorTag}
          onViewProfile={onViewProfile}
          commentCounts={commentCounts}
          commentsByCheck={commentsByCheck}
          expandedCommentCheckId={expandedCommentCheckId}
          onToggleComments={onToggleComments}
          onPostComment={onPostComment}
          setFeedMode={setFeedMode}
        />
      ) : (
        <TonightView
          tonightChecks={tonightChecks}
          tonightEvents={tonightEvents}
          setTonightEvents={setTonightEvents}
          setEvents={setEvents}
          myCheckResponses={myCheckResponses}
          isDemoMode={isDemoMode}
          onNavigateToGroups={onNavigateToGroups}
          showToast={showToast}
        />
      )}
    </div>
  );
}
