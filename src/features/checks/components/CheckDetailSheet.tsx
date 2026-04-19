"use client";

import React from "react";
import type { InterestCheck } from "@/lib/ui-types";
import DetailSheet from "@/shared/components/DetailSheet";
import InlineCommentsBox from "@/shared/components/InlineCommentsBox";
import type { CommentUI } from "@/features/checks/hooks/useCheckComments";

function Linkify({ children, coAuthors, onViewProfile }: { children: string; coAuthors?: { name: string; userId?: string }[]; onViewProfile?: (userId: string) => void }) {
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
              className="underline underline-offset-2 break-all text-dt"
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

export default function CheckDetailSheet({
  check,
  userId,
  comments,
  friends,
  onPostComment,
  onEdit,
  onViewProfile,
  onClose,
}: {
  check: InterestCheck;
  userId: string | null;
  comments: CommentUI[];
  friends?: { id: string; name: string; avatar: string }[];
  onPostComment: (text: string, mentions?: string[]) => void;
  onEdit?: () => void;
  onViewProfile?: (userId: string) => void;
  onClose: () => void;
}) {
  const downResponders = check.responses.filter(r => r.status === "down");
  const waitlistResponders = check.responses.filter(r => r.status === "waitlist");

  return (
    <DetailSheet
      onClose={onClose}
      editLabel={onEdit ? "Edit check" : undefined}
      onEdit={onEdit}
    >
      {/* Movie card (if applicable) */}
      {check.movieTitle && (
        <a
          href={check.letterboxdUrl || undefined}
          target={check.letterboxdUrl ? "_blank" : undefined}
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`flex gap-2.5 mb-3 p-2.5 bg-deep rounded-lg border border-border no-underline ${check.letterboxdUrl ? "cursor-pointer" : "cursor-default"}`}
        >
          {check.thumbnail && (
            <img src={check.thumbnail} alt={check.movieTitle}
              className="w-14 h-20 object-cover rounded-md shrink-0" />
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
        </a>
      )}

      {/* Title */}
      <h3 className="font-serif text-lg text-primary mt-0 mb-2 leading-snug font-normal tracking-[var(--serif-title-tracking)]">
        <Linkify coAuthors={check.coAuthors} onViewProfile={onViewProfile}>{check.text}</Linkify>
      </h3>

      {/* Metadata row */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mb-2">
        {(check.eventDateLabel || check.eventTime) && (
          <span className="font-mono text-xs text-dt">
            {[check.eventDateLabel, check.eventTime].filter(Boolean).join(" · ")}
          </span>
        )}
        {check.location && (
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(check.location)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-xs text-dim no-underline"
          >
            {check.location}
          </a>
        )}
        {check.expiresIn !== "open" && (
          <span className={`font-mono text-tiny ml-auto ${check.expiryPercent > 75 ? "text-danger" : "text-dim"}`}>
            {check.expiresIn === "expired" ? "expired" : `${check.expiresIn} left`}
          </span>
        )}
      </div>

      {/* Author */}
      <div className="flex items-center gap-1.5 mb-3">
        <span className="font-mono text-xs text-muted">by </span>
        <span className="font-mono text-xs text-dt font-semibold">{check.author}</span>
        {check.coAuthors && check.coAuthors.filter(c => c.status === "accepted").length > 0 && (
          <>
            <span className="font-mono text-xs text-muted"> · with </span>
            <span className="font-mono text-xs text-dt font-semibold">
              {check.coAuthors.filter(c => c.status === "accepted").map(c => c.name).join(", ")}
            </span>
          </>
        )}
      </div>

      {/* Responders */}
      {check.responses.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">
          {downResponders.length > 0 && (
            <div>
              <span className="font-mono text-tiny text-dt uppercase tracking-widest">Down</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {downResponders.map(r => (
                  <span key={r.name} className="font-mono text-tiny text-on-accent bg-dt py-0.75 px-2 rounded-3xl font-semibold">{r.name}</span>
                ))}
              </div>
            </div>
          )}
          {waitlistResponders.length > 0 && (
            <div>
              <span className="font-mono text-tiny text-muted uppercase tracking-widest">Waitlist</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {waitlistResponders.map(r => (
                  <span key={r.name} className="font-mono text-tiny text-muted bg-border-light py-0.75 px-2 rounded-3xl border border-dashed">{r.name}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Inline comments (always visible in sheet, so user can post first comment from here) */}
      <InlineCommentsBox
        comments={comments}
        userId={userId}
        friends={friends}
        onPost={onPostComment}
      />
    </DetailSheet>
  );
}
