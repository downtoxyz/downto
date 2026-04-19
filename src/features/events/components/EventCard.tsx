"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Event } from "@/lib/ui-types";
import cn from "@/lib/tailwindMerge";
import * as db from "@/lib/db";
import InlineCommentsBox from "@/shared/components/InlineCommentsBox";
import DetailSheet from "@/shared/components/DetailSheet";

const EventCard = ({
  event,
  userId,
  onToggleDown,
  onOpenSocial,
  onEdit,
  onViewProfile,
  isNew,
}: {
  event: Event;
  userId?: string | null;
  onToggleDown: () => void;
  onOpenSocial: () => void;
  onEdit?: () => void;
  onViewProfile?: (userId: string) => void;
  isNew?: boolean;
}) => {
  const [hovered, setHovered] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const touchMoved = useRef(false);
  const touchStartPos = useRef({ x: 0, y: 0 });
  // Event comments — state owned by card, sheet posts via callback
  const [evComments, setEvComments] = useState<{ id: string; userId: string; userName: string; userAvatar: string; text: string; isYours: boolean }[]>([]);
  useEffect(() => {
    if (!event.id) return;
    db.getEventComments(event.id).then((fetched) => {
      setEvComments(fetched.map((c) => ({
        id: c.id, userId: c.user_id,
        userName: c.user?.display_name ?? "Unknown",
        userAvatar: c.user?.avatar_letter ?? "?",
        text: c.text, isYours: c.user_id === userId,
      })));
    }).catch(() => {});
  }, [event.id, userId]);
  const postCmt = useCallback(async (text: string, _mentions?: string[]) => {
    const t = text.trim();
    if (!t || !event.id) return;
    const opt = { id: `opt-${Date.now()}`, userId: userId ?? "", userName: "You", userAvatar: "?", text: t, isYours: true };
    setEvComments((p) => [...p, opt]);
    try {
      const saved = await db.postEventComment(event.id, t);
      setEvComments((p) => p.map((c) => c.id === opt.id ? { id: saved.id, userId: saved.user_id, userName: saved.user?.display_name ?? "You", userAvatar: saved.user?.avatar_letter ?? "?", text: saved.text, isYours: true } : c));
    } catch { setEvComments((p) => p.filter((c) => c.id !== opt.id)); }
  }, [event.id, userId]);

  const poolPeople = event.peopleDown.filter((p) => p.inPool);
  const poolFriends = poolPeople.filter((p) => p.mutual);
  const poolStrangerCount = poolPeople.length - poolFriends.length;
  const nonPoolFriends = event.peopleDown.filter((p) => p.mutual && !p.inPool);
  const mutuals = event.peopleDown.filter((p) => p.mutual);
  const others = event.peopleDown.filter((p) => !p.mutual);
  const hasPool = (event.poolCount ?? 0) > 0;

  const sourceLink = event.igUrl
    ? { href: event.igUrl, label: event.igHandle || "instagram" }
    : event.diceUrl
      ? { href: event.diceUrl, label: "dice.fm" }
      : event.letterboxdUrl
        ? { href: event.letterboxdUrl, label: "letterboxd" }
        : event.igHandle
          ? { href: null, label: event.igHandle }
          : null;

  // ── Shared pieces ──────────────────────────────────────────────────────

  const bgImage = event.image && event.image !== "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&q=80" && (
    <>
      <div
        className="absolute inset-0 bg-cover bg-center rounded-[inherit]"
        style={{
          backgroundImage: `url(${event.image})`,
          opacity: 0.3,
          filter: "blur(2px)",
        }}
      />
      <div
        className="absolute inset-0 rounded-[inherit]"
        style={{
          background: event.isDown
            ? "linear-gradient(to bottom, var(--color-event-image-wash-down) 0%, var(--color-event-image-wash-down) 50%, var(--color-event-image-wash-down) 100%)"
            : "linear-gradient(to bottom, var(--color-event-image-wash) 0%, var(--color-event-image-wash) 50%, var(--color-event-image-wash) 100%)",
        }}
      />
    </>
  );

  const actionButtons = (
    <div className="flex justify-end">
      <button
        onClick={onToggleDown}
        className={cn(
          "rounded-full py-1.5 px-3 font-mono text-tiny font-bold whitespace-nowrap cursor-pointer",
          event.isDown
            ? "bg-dt text-bg border-none"
            : "bg-[var(--color-down-idle-bg)] text-dt border border-[var(--color-down-idle-border)]"
        )}
      >
        {event.isDown ? <><span>DOWN</span><svg width="12" height="12" viewBox="0 0 256 256" fill="currentColor" className="inline ml-1"><path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/></svg></> : "DOWN ?"}
      </button>
    </div>
  );

  const hasDetails = !!(event.posterName || event.note || event.movieTitle || event.vibe.length > 0 || sourceLink);

  const shareEvent = async () => {
    const url = event.igUrl || event.diceUrl || event.letterboxdUrl || `${window.location.origin}`;
    const text = `${event.title}${event.venue && event.venue !== "TBD" ? ` @ ${event.venue}` : ""}`;
    if (navigator.share) {
      try { await navigator.share({ title: event.title, text, url }); } catch { /* cancelled */ }
    } else {
      try { await navigator.clipboard.writeText(`${text}\n${url}`); } catch { /* fallback */ }
    }
  };

  return (
    <>
      {showDetail && (
        <EventDetailSheet
          event={event}
          userId={userId}
          sourceLink={sourceLink}
          hasDetails={hasDetails}
          poolPeople={poolPeople}
          poolFriends={poolFriends}
          poolStrangerCount={poolStrangerCount}
          nonPoolFriends={nonPoolFriends}
          mutuals={mutuals}
          others={others}
          hasPool={hasPool}
          actionButtons={actionButtons}
          onOpenSocial={onOpenSocial}
          onViewProfile={onViewProfile}
          comments={evComments}
          onPostComment={postCmt}
          onEdit={onEdit}
          onClose={() => setShowDetail(false)}
        />
      )}
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onTouchStart={(e) => {
          touchMoved.current = false;
          touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }}
        onTouchMove={(e) => {
          const dx = e.touches[0].clientX - touchStartPos.current.x;
          const dy = e.touches[0].clientY - touchStartPos.current.y;
          if (Math.abs(dx) > 8 || Math.abs(dy) > 8) touchMoved.current = true;
        }}
        onClick={(e) => {
          if (touchMoved.current) return;
          const target = e.target as HTMLElement;
          if (target.closest("button") || target.closest("a") || target.closest("input") || target.closest("textarea")) return;
          setShowDetail(true);
        }}
        className={cn(
          "rounded-2xl overflow-hidden mb-2 transition-all relative border cursor-pointer",
          isNew ? "border-dt/40" : "border-border"
        )}
        style={{
          background: "var(--color-card)",
          ...(bgImage ? {
            // Image wash is cream in both themes, so force a dark text ramp here
            // regardless of active theme to keep the title/metadata legible.
            "--color-primary": "#2A2A1A",
            "--color-muted": "#6B6B5A",
            "--color-dim": "#8A8A70",
            "--color-faint": "#B0B098",
            // Lift the cream-washed body off the page bg so it reads as a distinct card
            boxShadow: "0 6px 22px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06) inset",
          } as React.CSSProperties : {}),
          ...(isNew ? { animation: "accentGlow 2s ease-out forwards" } : {}),
        }}
      >
        {bgImage}
        <div className="p-4 relative">
          {/* Author header */}
          {event.posterName && (
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-5 h-5 rounded-full bg-border-light text-dim flex items-center justify-center font-mono text-[9px] font-bold shrink-0">
                {event.posterAvatar || event.posterName[0]?.toUpperCase()}
              </div>
              <span className="font-mono text-tiny text-muted min-w-0 truncate">
                <span className="text-dt font-semibold">
                  {event.createdBy === userId ? "You" : event.posterName}
                </span>
              </span>
            </div>
          )}

          {/* Title + date */}
          <div className="mb-3">
            <div className="flex justify-between items-start">
              <h3
                className="font-serif text-lg text-primary m-0 leading-snug font-normal tracking-[-0.01em] flex-1"
              >
                {event.title}
              </h3>
              {isNew && (
                <span className="bg-dt text-on-accent font-mono text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full leading-none ml-2">new</span>
              )}
            </div>
            <div className="flex flex-wrap justify-between items-baseline gap-x-3 gap-y-1 mt-2">
              <span className="font-mono text-xs text-muted">
                {event.date}
                {event.time && event.time !== "TBD" && ` · ${event.time}`}
              </span>
              {event.venue && event.venue !== "TBD" && (
                <span className="font-mono text-xs text-muted">{event.venue}</span>
              )}
            </div>
          </div>

          {/* Responders + down button on same line */}
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-tiny text-muted min-w-0 truncate">
              {event.socialLoaded && event.peopleDown.length > 0 ? (() => {
                const first = event.peopleDown[0];
                const othersCount = event.peopleDown.length - 1;
                return (
                  <>
                    <span className="text-dt font-semibold">{first.name}</span>
                    {othersCount > 0 ? (
                      <span>{" "}+ {othersCount} {othersCount === 1 ? "other" : "others"} down</span>
                    ) : (
                      <span>{" "}is down</span>
                    )}
                  </>
                );
              })() : null}
            </span>
            <button
              onClick={onToggleDown}
              className={cn(
                "rounded-full py-1.5 px-3 font-mono text-tiny font-bold whitespace-nowrap cursor-pointer shrink-0",
                event.isDown
                  ? "bg-dt text-on-accent border-none"
                  : "bg-[var(--color-down-idle-bg)] text-dt border border-[var(--color-down-idle-border)]"
              )}
            >
              {event.isDown ? <><span>DOWN</span><svg width="12" height="12" viewBox="0 0 256 256" fill="currentColor" className="inline ml-1"><path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/></svg></> : "DOWN ?"}
            </button>
          </div>

          {/* Inline comments — only render when at least one comment exists; empty state lives in the sheet */}
          {evComments.length > 0 && (
            <div className="mt-3" onClick={(e) => e.stopPropagation()}>
              <InlineCommentsBox
                comments={evComments}
                userId={userId ?? null}
                onPost={postCmt}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// ── Detail bottom sheet ─────────────────────────────────────────────────

interface Person { name: string; avatar: string; mutual?: boolean; inPool?: boolean; }

function EventDetailSheet({
  event, userId, sourceLink, hasDetails,
  poolPeople, poolFriends, poolStrangerCount, nonPoolFriends, mutuals, others, hasPool,
  actionButtons, onOpenSocial, onViewProfile, comments, onPostComment, onEdit, onClose,
}: {
  event: Event;
  userId?: string | null;
  sourceLink: { href: string | null; label: string } | null;
  hasDetails: boolean;
  poolPeople: Person[]; poolFriends: Person[]; poolStrangerCount: number;
  nonPoolFriends: Person[]; mutuals: Person[]; others: Person[]; hasPool: boolean;
  actionButtons: React.ReactNode;
  onOpenSocial: () => void;
  onViewProfile?: (userId: string) => void;
  comments: { id: string; userId: string; userName: string; userAvatar: string; text: string; isYours: boolean }[];
  onPostComment: (text: string, mentions?: string[]) => void;
  onEdit?: () => void;
  onClose: () => void;
}) {
  // Creators: hide the attendance block the moment they tap "Edit event" so the
  // list doesn't linger under the edit modal during the sheet's close animation.
  const [editInitiated, setEditInitiated] = useState(false);
  const handleEdit = onEdit ? () => { setEditInitiated(true); onEdit(); } : undefined;
  return (
    <DetailSheet onClose={onClose} editLabel={onEdit ? "Edit event" : undefined} onEdit={handleEdit}>
      <SheetHero
        event={event} userId={userId} sourceLink={sourceLink}
        poolPeople={poolPeople} poolFriends={poolFriends} poolStrangerCount={poolStrangerCount}
        nonPoolFriends={nonPoolFriends} mutuals={mutuals} others={others} hasPool={hasPool}
        actionButtons={actionButtons} onOpenSocial={onOpenSocial} onViewProfile={onViewProfile}
        hideSocial={editInitiated}
      />
      <div className="mt-4">
        <InlineCommentsBox
          comments={comments}
          userId={userId ?? null}
          onPost={onPostComment}
        />
      </div>
    </DetailSheet>
  );
}

// ── Shared sub-components for sheet layouts ─────────────────────────────

interface SheetProps {
  event: Event;
  userId?: string | null;
  sourceLink: { href: string | null; label: string } | null;
  hasDetails?: boolean;
  poolPeople: Person[]; poolFriends: Person[]; poolStrangerCount: number;
  nonPoolFriends: Person[]; mutuals: Person[]; others: Person[]; hasPool: boolean;
  actionButtons: React.ReactNode;
  onOpenSocial: () => void;
  onViewProfile?: (userId: string) => void;
  hideSocial?: boolean;
}

// Linkify URLs in text
function LinkifyText({ children }: { children: string }) {
  const urlRe = /(https?:\/\/[^\s),]+)/g;
  const parts = children.split(urlRe);
  if (parts.length === 1) return <>{children}</>;
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-dt underline underline-offset-2 break-all"
          >
            {(() => {
              try {
                const u = new URL(part);
                let d = u.host.replace(/^www\./, "") + u.pathname.replace(/\/$/, "");
                if (d.length > 40) d = d.slice(0, 37) + "\u2026";
                return d;
              } catch { return part; }
            })()}
          </a>
        ) : part
      )}
    </>
  );
}

// Poster inline element (with optional note flowing on same line)
function PosterInline({ event, userId, note, onViewProfile }: { event: Event; userId?: string | null; note?: boolean; onViewProfile?: (userId: string) => void }) {
  if (!event.posterName) return null;
  const name = event.createdBy === userId ? "You" : event.posterName;
  const canTap = event.createdBy && event.createdBy !== userId && onViewProfile;
  return (
    <div className="flex items-center gap-1.5">
      <div
        onClick={canTap ? (e) => { e.stopPropagation(); onViewProfile!(event.createdBy!); } : undefined}
        className={cn(
          "rounded-full flex items-center justify-center font-mono font-bold shrink-0",
          event.createdBy === userId ? "bg-dt text-on-accent" : "bg-border-light text-dim",
          canTap ? "cursor-pointer" : "cursor-default"
        )}
        style={{ width: 20, height: 20, fontSize: 8 }}
      >
        {event.posterAvatar || event.posterName[0]?.toUpperCase()}
      </div>
      <div className="font-mono text-xs min-w-0" style={{ lineHeight: 1.5 }}>
        <span
          onClick={canTap ? (e) => { e.stopPropagation(); onViewProfile!(event.createdBy!); } : undefined}
          className={cn("text-muted font-bold", canTap ? "cursor-pointer" : "cursor-default")}
        >
          {name}
        </span>
        {note && event.note && (
          <span className="text-dim">{" "}<LinkifyText>{event.note}</LinkifyText></span>
        )}
      </div>
    </div>
  );
}

// Source link element
function SourceLink({ sourceLink }: { sourceLink: SheetProps["sourceLink"] }) {
  if (!sourceLink) return null;
  return sourceLink.href ? (
    <a href={sourceLink.href} target="_blank" rel="noopener noreferrer"
      className="font-mono text-tiny text-faint no-underline">
      {sourceLink.label} ↗
    </a>
  ) : (
    <span className="font-mono text-tiny text-faint">
      {sourceLink.label}
    </span>
  );
}

// Vibe pills
function VibePills({ vibes }: { vibes: string[] }) {
  if (vibes.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {vibes.map((v) => (
        <span key={v} className="bg-deep text-dim px-2 py-1 rounded-lg font-mono uppercase tracking-[0.08em]"
          style={{ fontSize: 9 }}>
          {v}
        </span>
      ))}
    </div>
  );
}

// Movie pill
function MoviePill({ event }: { event: Event }) {
  if (!event.movieTitle) return null;
  return (
    <span className="inline-flex items-center gap-1 py-1 px-2.5 bg-deep rounded-lg font-mono text-tiny text-muted">
      🎬 {event.movieTitle}{event.movieYear && ` (${event.movieYear})`}{event.movieDirector && ` · ${event.movieDirector}`}
    </span>
  );
}

// Social preview block (shared across layouts)
function SocialBlock(props: SheetProps) {
  const { event, poolPeople, poolFriends, poolStrangerCount, nonPoolFriends, mutuals, others, hasPool, onOpenSocial } = props;
  if (!event.socialLoaded && !event.isDown) return null;
  return (
    <div
      onClick={event.socialLoaded ? onOpenSocial : undefined}
      className={cn(
        "bg-deep rounded-xl border border-border transition-[border-color] duration-200",
        event.socialLoaded ? "cursor-pointer" : "cursor-default"
      )}
      style={{ padding: "12px 14px" }}
      onMouseEnter={(e) => event.socialLoaded && (e.currentTarget.style.borderColor = "#2a2a2a")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#1a1a1a")}
    >
      {!event.socialLoaded ? (
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-border-light animate-pulse shrink-0" style={{ width: 26, height: 26 }} />
          <span className="font-mono text-xs text-faint">Loading...</span>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {event.peopleDown.length > 0 && (
              <div className="flex mr-1 shrink-0">
                {[...poolPeople, ...event.peopleDown.filter((p) => !p.inPool)].slice(0, 4).map((p, i) => (
                  <div key={p.name}
                    className={cn(
                      "rounded-full flex items-center justify-center font-mono text-tiny font-bold relative",
                      p.mutual ? "bg-dt text-on-accent" : "bg-border-light text-dim"
                    )}
                    style={{
                      width: 26, height: 26,
                      marginLeft: i > 0 ? -8 : 0,
                      border: `2px solid ${p.inPool ? "#00D4FF" : "#0d0d0d"}`,
                      zIndex: 4 - i,
                    }}>
                    {p.avatar}
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-0.5 min-w-0">
              {event.peopleDown.length === 0 && !event.userInPool ? (
                <span className="font-mono text-xs text-pool">
                  Looking for a squad?{" "}
                  <span className="font-bold uppercase tracking-[0.06em]"
                    style={{
                      fontSize: 9, padding: "1px 4px", borderRadius: 3,
                      background: event.isPublic ? "rgba(0,0,0,0.08)" : "#E8FF5A",
                      color: event.isPublic ? "#666" : "#000",
                    }}>
                    {event.isPublic ? "public" : "friends"}
                  </span>
                </span>
              ) : hasPool || event.userInPool ? (
                <>
                  <span className="font-mono text-xs">
                    <span className="text-pool">
                      {event.userInPool ? (
                        poolFriends.length > 0
                          ? `You, ${poolFriends.map((p) => p.name).join(", ")}${poolStrangerCount > 0 ? ` + ${poolStrangerCount}` : ""} looking for a squad`
                          : (event.poolCount ?? 0) > 1
                            ? `You + ${(event.poolCount ?? 0) - 1} looking for a squad`
                            : "You're looking for a squad"
                      ) : (
                        <>
                          {poolFriends.length > 0 ? poolFriends.map((p) => p.name).join(", ") : null}
                          {poolFriends.length > 0 && poolStrangerCount > 0 ? " + " : null}
                          {poolFriends.length === 0 && poolStrangerCount > 0
                            ? `${event.poolCount} looking for a squad`
                            : poolStrangerCount > 0 ? `${poolStrangerCount} looking for a squad` : " looking for a squad"}
                        </>
                      )}
                    </span>
                  </span>
                  {nonPoolFriends.length > 0 && (
                    <span className="font-mono text-tiny text-dim">
                      {nonPoolFriends.map((p) => p.name).join(", ")} {nonPoolFriends.length === 1 ? "is" : "are"} down
                    </span>
                  )}
                </>
              ) : (
                <span className="font-mono text-xs">
                  {mutuals.length > 0 ? (
                    <>
                      <span className="text-dt">{mutuals.map((m) => m.name).join(", ")}</span>
                      {others.length > 0 && <span className="text-dim"> + {others.length} others</span>}
                    </>
                  ) : (
                    <span className="text-dim">{others.length} {others.length === 1 ? "person" : "people"} down</span>
                  )}
                </span>
              )}
            </div>
          </div>
          <span className="text-faint text-base shrink-0">→</span>
        </div>
      )}
    </div>
  );
}

function SheetHero(props: SheetProps) {
  const { event, userId, sourceLink, actionButtons } = props;
  const hasImage = event.image && event.image !== "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&q=80";
  return (
    <>
      {/* Hero image — tappable to open source link */}
      {hasImage && (() => {
        const heroUrl = sourceLink?.href || event.igUrl || event.diceUrl || event.letterboxdUrl;
        const Wrapper = heroUrl ? "a" : "div";
        const linkProps = heroUrl ? { href: heroUrl, target: "_blank" as const, rel: "noopener noreferrer" } : {};
        return (
          <Wrapper
            {...linkProps}
            className={cn(
              "block rounded-xl overflow-hidden mb-3.5 relative no-underline",
              heroUrl ? "cursor-pointer" : "cursor-default"
            )}
            style={{ height: 140 }}
          >
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${event.image})` }}
            />
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)" }}
            />
            {/* Title over image */}
            <div className="absolute bottom-3 left-3.5 right-3.5 flex items-end justify-between">
              <h3 className="font-serif text-lg text-primary m-0 leading-snug font-normal flex-1 tracking-[-0.01em]">
                {event.title}
              </h3>
              {heroUrl && (
                <span className="font-mono text-tiny text-faint shrink-0 ml-2">↗</span>
              )}
            </div>
          </Wrapper>
        );
      })()}
      {!hasImage && (
        <h3 className="font-serif text-lg text-primary mb-2 mt-0 leading-snug font-normal tracking-[-0.01em]">
          {event.title}
        </h3>
      )}

      {/* Metadata row */}
      <div className="flex items-center gap-2.5 mb-2 flex-wrap">
        <span className="font-mono text-xs text-dt">
          {event.date}{event.time && event.time !== "TBD" && ` ${event.time}`}
        </span>
        {event.venue && event.venue !== "TBD" && (
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(event.venue)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-xs text-dim no-underline"
          >
            {event.venue}
          </a>
        )}
        <span className="font-mono font-bold uppercase tracking-[0.06em]"
          style={{
            fontSize: 9, padding: "1px 5px", borderRadius: 3,
            background: event.isPublic ? "rgba(0,0,0,0.08)" : "#E8FF5A",
            color: event.isPublic ? "#666" : "#000",
          }}>
          {event.isPublic ? "public" : "friends"}
        </span>
      </div>

      {/* Poster + note + source (when no tags) */}
      {(event.posterName || event.note || sourceLink) && (
        <div className="flex items-center justify-between mb-2">
          <div className="flex-1 min-w-0">
            <PosterInline event={event} userId={userId} note onViewProfile={props.onViewProfile} />
            {!event.posterName && event.note && (
              <div className="font-mono text-xs text-dim" style={{ lineHeight: 1.5 }}>
                <LinkifyText>{event.note}</LinkifyText>
              </div>
            )}
          </div>
          {!(event.movieTitle || event.vibe.length > 0) && sourceLink && (
            <div className="shrink-0 ml-2">
              <SourceLink sourceLink={sourceLink} />
            </div>
          )}
        </div>
      )}

      {/* Tags row: movie + vibes + source */}
      {(event.movieTitle || event.vibe.length > 0) && (
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          {event.movieTitle && <MoviePill event={event} />}
          <VibePills vibes={event.vibe} />
          {sourceLink && <span className="ml-auto"><SourceLink sourceLink={sourceLink} /></span>}
        </div>
      )}

      {/* Social — hidden once the creator taps "Edit event" */}
      {!props.hideSocial && <SocialBlock {...props} />}

      <div className="mt-3">{actionButtons}</div>
    </>
  );
}

export default EventCard;
