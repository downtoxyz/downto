"use client";

import React, { useState, useEffect } from "react";
import * as db from "@/lib/db";
import type { Profile } from "@/lib/types";
import type { Event, InterestCheck, Friend } from "@/lib/ui-types";
import EventCard from "@/features/events/components/EventCard";
import CheckCard from "@/features/checks/components/CheckCard";
import FeedEmptyState from "./FeedEmptyState";
import InstallBanner from "./InstallBanner";
import { useFeedContext } from "@/features/checks/context/FeedContext";

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
              className={`underline underline-offset-2 break-all ${dimmed ? "text-neutral-500" : "text-dt"}`}
            >{display}</a>
          );
        }
        if (/^@\S+/.test(part)) {
          const mention = part.slice(1).toLowerCase();
          const matched = coAuthors?.find(ca => ca.name.toLowerCase() === mention || ca.name.split(" ")[0]?.toLowerCase() === mention);
          return <span key={i} className="text-dt font-semibold">@{matched ? matched.name : part.slice(1)}</span>;
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}

export interface FeedViewProps {
  sharedCheckId?: string | null;
  friends: Friend[];
  userId: string | null;
  isDemoMode: boolean;
  profile: Profile | null;
  startSquadFromCheck: (check: InterestCheck) => Promise<void>;
  loadRealData: () => Promise<void>;
  showToast: (msg: string) => void;
  onOpenSocial: (event: Event) => void;
  onEditEvent: (event: Event) => void;
  onOpenAdd: () => void;
  onOpenFriends: (tab?: "friends" | "add") => void;
  onNavigateToGroups: (squadId?: string) => void;
  onViewProfile?: (userId: string) => void;
  showInstallBanner?: boolean;
  installBannerVariant?: "install" | "notifications";
  onDismissInstallBanner?: () => void;
  onEnableNotifications?: () => void;
}

export default function FeedView({
  sharedCheckId,
  friends,
  userId,
  isDemoMode,
  profile,
  startSquadFromCheck,
  loadRealData,
  showToast,
  onOpenSocial,
  onEditEvent,
  onOpenAdd,
  onOpenFriends,
  onNavigateToGroups,
  onViewProfile,
  showInstallBanner,
  installBannerVariant = "install",
  onDismissInstallBanner,
  onEnableNotifications,
}: FeedViewProps) {
  const {
    checks,
    hiddenCheckIds,
    events,
    newlyAddedEventId,
    unhideCheck,
    toggleSave,
    toggleDown,
  } = useFeedContext();

  const [showHidden, setShowHidden] = useState(false);
  const [sortBy, setSortBy] = useState<"recent" | "upcoming">("recent");
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  // Batch-fetch initial comment counts for badges
  useEffect(() => {
    if (!checks.length || isDemoMode) return;
    db.getCheckCommentCounts(checks.map(c => c.id))
      .then(setCommentCounts)
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checks.map(c => c.id).join(","), isDemoMode]);

  const visibleChecks = checks.filter(c => !hiddenCheckIds.has(c.id) && c.expiresIn !== "expired");
  const hiddenChecks = checks.filter(c => hiddenCheckIds.has(c.id));

  // Pinned tier: expiring checks sorted by urgency (highest expiryPercent first)
  const pinnedChecks = visibleChecks
    .filter(c => c.expiresIn !== "open")
    .sort((a, b) => b.expiryPercent - a.expiryPercent);

  // Chrono tier: open checks + all events, sorted by date descending
  type FeedItem =
    | { kind: "check"; data: InterestCheck }
    | { kind: "event"; data: Event };

  const chronoItems: FeedItem[] = [
    ...visibleChecks.filter(c => c.expiresIn === "open").map(c => ({ kind: "check" as const, data: c })),
    ...events.map(e => ({ kind: "event" as const, data: e })),
  ];

  if (sortBy === "recent") {
    chronoItems.sort((a, b) => (b.data.createdAt ?? "").localeCompare(a.data.createdAt ?? ""));
  } else {
    const getEventDate = (item: FeedItem): string => {
      if (item.kind === "check") return item.data.eventDate ?? "";
      return item.data.rawDate ?? "";
    };
    chronoItems.sort((a, b) => {
      const da = getEventDate(a), db = getEventDate(b);
      // Items with dates first, then dateless items
      if (da && !db) return -1;
      if (!da && db) return 1;
      if (!da && !db) return (b.data.createdAt ?? "").localeCompare(a.data.createdAt ?? "");
      return da.localeCompare(db);
    });
  }

  const hasContent = checks.length > 0 || events.length > 0;

  return (
    <>
      {showInstallBanner && onDismissInstallBanner && (
        <InstallBanner
          variant={installBannerVariant}
          onDismiss={onDismissInstallBanner}
          onEnableNotifications={onEnableNotifications}
        />
      )}
      <div className="pt-2 px-4">
        {hasContent ? (
          <>
            {/* Pinned: expiring checks */}
            {pinnedChecks.map(check => (
              <CheckCard
                key={check.id}
                check={check}
                userId={userId}
                isDemoMode={isDemoMode}
                profile={profile}
                friends={friends}
                sharedCheckId={sharedCheckId}
                initialCommentCount={commentCounts[check.id] ?? 0}
                startSquadFromCheck={startSquadFromCheck}
                onNavigateToGroups={onNavigateToGroups}
                onViewProfile={onViewProfile}
                showToast={showToast}
                loadRealData={loadRealData}
              />
            ))}

            {/* Sort toggle */}
            {chronoItems.length > 0 && (
              <div className="flex gap-2 mb-3 px-1">
                <button
                  onClick={() => setSortBy("recent")}
                  className={`font-mono text-tiny uppercase tracking-[0.08em] font-bold px-2.5 py-1 rounded-lg border cursor-pointer transition-colors ${
                    sortBy === "recent"
                      ? "bg-dt text-black border-dt"
                      : "bg-transparent text-neutral-500 border-neutral-800"
                  }`}
                >Recent</button>
                <button
                  onClick={() => setSortBy("upcoming")}
                  className={`font-mono text-tiny uppercase tracking-[0.08em] font-bold px-2.5 py-1 rounded-lg border cursor-pointer transition-colors ${
                    sortBy === "upcoming"
                      ? "bg-dt text-black border-dt"
                      : "bg-transparent text-neutral-500 border-neutral-800"
                  }`}
                >Upcoming</button>
              </div>
            )}

            {/* Chrono: open checks + events interleaved */}
            {chronoItems.map(item =>
              item.kind === "check" ? (
                <CheckCard
                  key={item.data.id}
                  check={item.data}
                  userId={userId}
                  isDemoMode={isDemoMode}
                  profile={profile}
                  friends={friends}
                  sharedCheckId={sharedCheckId}
                  initialCommentCount={commentCounts[item.data.id] ?? 0}
                  startSquadFromCheck={startSquadFromCheck}
                  onNavigateToGroups={onNavigateToGroups}
                  onViewProfile={onViewProfile}
                  showToast={showToast}
                  loadRealData={loadRealData}
                />
              ) : (
                <EventCard
                  key={item.data.id}
                  event={item.data}
                  userId={userId}
                  onToggleSave={() => toggleSave(item.data.id)}
                  onToggleDown={() => toggleDown(item.data.id)}
                  onOpenSocial={() => onOpenSocial(item.data)}
                  onLongPress={(item.data.createdBy === userId || !item.data.createdBy || isDemoMode) ? () => onEditEvent(item.data) : undefined}
                  isNew={item.data.id === newlyAddedEventId}
                />
              )
            )}

            {/* Hidden checks section */}
            {hiddenChecks.length > 0 && (
              <div>
                <button
                  onClick={() => setShowHidden(prev => !prev)}
                  className="bg-transparent border-none text-neutral-700 font-mono text-tiny cursor-pointer py-1.5 px-1 flex items-center gap-1"
                >
                  <span className="text-tiny">{showHidden ? "▼" : "▶"}</span>
                  Hidden ({hiddenChecks.length})
                </button>
                {showHidden && hiddenChecks.map(check => (
                  <div key={check.id} className="bg-neutral-925 rounded-xl overflow-hidden mb-2 border border-neutral-900 opacity-60">
                    <div className="p-3.5 flex justify-between items-center">
                      <div className="flex-1 min-w-0">
                        <div
                          className={`flex items-center gap-2 mb-1.5 ${check.authorId ? "cursor-pointer" : ""}`}
                          onClick={(e) => { if (check.authorId && onViewProfile) { e.stopPropagation(); onViewProfile(check.authorId); } }}
                        >
                          <div className="size-6 rounded-full bg-neutral-800 text-neutral-500 flex items-center justify-center font-mono text-tiny font-bold">
                            {check.author[0]}
                          </div>
                          <span className="font-mono text-xs text-neutral-500">
                            {check.author}
                            {check.viaFriendName && <span className="text-neutral-500 font-normal">{" "}via {check.viaFriendName}</span>}
                          </span>
                        </div>
                        <p className="font-serif text-base text-neutral-500 m-0 leading-snug">
                          <Linkify dimmed coAuthors={check.coAuthors}>{check.text}</Linkify>
                        </p>
                      </div>
                      <button
                        onClick={() => unhideCheck(check.id)}
                        className="bg-transparent border border-neutral-800 rounded-lg py-1.5 px-2.5 font-mono text-tiny text-neutral-500 cursor-pointer shrink-0 ml-3"
                      >Unhide</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <FeedEmptyState onOpenAdd={onOpenAdd} onOpenFriends={onOpenFriends} />
        )}
      </div>
    </>
  );
}
