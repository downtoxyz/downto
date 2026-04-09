"use client";

import { useState, useRef, useEffect } from "react";
import { font } from "@/lib/styles";
import type { Event } from "@/lib/ui-types";
import { useModalTransition } from "@/shared/hooks/useModalTransition";
import cn from "@/lib/tailwindMerge";
import EventActionsSheet from "./EventActionsSheet";

const EventCard = ({
  event,
  userId,
  onToggleSave,
  onToggleDown,
  onOpenSocial,
  onLongPress,
  onViewProfile,
  isNew,
}: {
  event: Event;
  userId?: string | null;
  onToggleSave: () => void;
  onToggleDown: () => void;
  onOpenSocial: () => void;
  onLongPress?: () => void;
  onViewProfile?: (userId: string) => void;
  isNew?: boolean;
}) => {
  const [hovered, setHovered] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const touchMoved = useRef(false);
  const touchStartPos = useRef({ x: 0, y: 0 });
  const poolPeople = event.peopleDown.filter((p) => p.inPool);
  const poolFriends = poolPeople.filter((p) => p.mutual);
  const poolStrangerCount = poolPeople.length - poolFriends.length;
  const nonPoolFriends = event.peopleDown.filter((p) => p.mutual && !p.inPool);
  const mutuals = event.peopleDown.filter((p) => p.mutual);
  const others = event.peopleDown.filter((p) => !p.mutual);
  const hasPool = (event.poolCount ?? 0) > 0;

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

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
          opacity: 0.18,
        }}
      />
      <div
        className="absolute inset-0 rounded-[inherit]"
        style={{
          background: "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.5) 100%)",
        }}
      />
    </>
  );

  const actionButtons = (
    <div className="flex gap-2">
      <button
        onClick={onToggleSave}
        className={cn(
          "flex-1 rounded-lg py-1.5 font-mono text-tiny font-bold cursor-pointer uppercase tracking-[0.08em]",
          event.saved
            ? "bg-dt text-black border-none"
            : "bg-transparent text-dt border border-dt"
        )}
      >
        {event.saved ? "✓ Saved" : "Save to Cal"}
      </button>
      <button
        onClick={onToggleDown}
        className={cn(
          "flex-1 rounded-lg py-1.5 font-mono text-tiny font-bold cursor-pointer uppercase tracking-[0.08em] border",
          event.isDown
            ? "bg-dt/15 text-dt border-dt"
            : "bg-transparent text-primary border-border-mid"
        )}
      >
        {event.isDown ? "You're Down ✋" : "I'm Down ✋"}
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
      <EventActionsSheet
        open={actionsOpen}
        onClose={() => setActionsOpen(false)}
        onShare={shareEvent}
        onEdit={onLongPress}
      />
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
          onClose={() => setShowDetail(false)}
        />
      )}
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); clearLongPress(); }}
        onPointerDown={() => {
          if (!onLongPress) return;
          longPressFired.current = false;
          longPressTimer.current = setTimeout(() => {
            longPressFired.current = true;
            onLongPress();
          }, 500);
        }}
        onPointerUp={clearLongPress}
        onPointerLeave={clearLongPress}
        onTouchMove={clearLongPress}
        className={cn(
          "rounded-xl overflow-hidden mb-2 transition-all relative border",
          isNew ? "border-dt/40" : hovered ? "border-neutral-700" : "border-neutral-900"
        )}
        style={{
          background: "rgba(232, 255, 90, 0.03)",
          ...(isNew ? { animation: "accentGlow 2s ease-out forwards" } : {}),
        }}
      >
        {bgImage}
        <div className="p-3.5 relative">
          {/* Tappable area opens detail sheet — ignores taps that dragged (e.g. pull-to-refresh) */}
          <div
            onTouchStart={(e) => {
              touchMoved.current = false;
              touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }}
            onTouchMove={(e) => {
              const dx = e.touches[0].clientX - touchStartPos.current.x;
              const dy = e.touches[0].clientY - touchStartPos.current.y;
              if (Math.abs(dx) > 8 || Math.abs(dy) > 8) touchMoved.current = true;
            }}
            onClick={() => { if (!touchMoved.current) setShowDetail(true); }}
            className="cursor-pointer"
          >
            {/* Title + edit */}
            <div className="flex justify-between items-start mb-2.5">
              <h3
                className="font-serif text-xl text-primary m-0 leading-tight font-normal"
                style={{ fontFamily: font.serif }}
              >
                {event.title}
              </h3>
              {onLongPress && (
                <button
                  onClick={(e) => { e.stopPropagation(); setActionsOpen(true); }}
                  className="bg-transparent border-none text-dim font-mono text-tiny cursor-pointer p-1 shrink-0 ml-2"
                >
                  ⚙
                </button>
              )}
            </div>

            {/* Date, time, venue */}
            <div className="mb-2">
              <span className="font-mono text-xs text-dt">
                {event.date}
                {event.time && event.time !== "TBD" && ` ${event.time}`}
              </span>
              {event.venue && event.venue !== "TBD" && (
                <span className="font-mono text-xs text-dim mt-0.5 block">
                  {event.venue}
                </span>
              )}
            </div>

            {/* Inline social hint — placeholder while loading, avatar stack when loaded */}
            {event.isDown && (
              <div className="mb-3" style={{ height: 22 }}>
                {!event.socialLoaded ? (
                  <div className="flex items-center gap-2">
                    <div
                      className="rounded-full bg-border-light animate-pulse shrink-0"
                      style={{ width: 22, height: 22 }}
                    />
                    <div
                      className="rounded bg-border-light animate-pulse"
                      style={{ width: 60, height: 10 }}
                    />
                  </div>
                ) : event.peopleDown.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <div className="flex shrink-0">
                      {event.peopleDown.slice(0, 3).map((p, i) => (
                        <div
                          key={p.name}
                          className={cn(
                            "rounded-full flex items-center justify-center font-mono font-bold border-2 border-deep relative",
                            p.mutual ? "bg-dt text-black" : "bg-border-light text-dim"
                          )}
                          style={{
                            width: 22,
                            height: 22,
                            fontSize: 9,
                            marginLeft: i > 0 ? -6 : 0,
                            zIndex: 3 - i,
                          }}
                        >
                          {p.avatar}
                        </div>
                      ))}
                    </div>
                    <span className="font-mono text-xs text-dim">
                      {event.peopleDown.length} down →
                    </span>
                  </div>
                ) : null}
              </div>
            )}
            {!event.isDown && event.socialLoaded && event.peopleDown.length > 0 && (
              <div className="flex items-center gap-2 mb-3">
                <div className="flex shrink-0">
                  {event.peopleDown.slice(0, 3).map((p, i) => (
                    <div
                      key={p.name}
                      className={cn(
                        "rounded-full flex items-center justify-center font-mono font-bold border-2 border-deep relative",
                        p.mutual ? "bg-dt text-black" : "bg-border-light text-dim"
                      )}
                      style={{
                        width: 22,
                        height: 22,
                        fontSize: 9,
                        marginLeft: i > 0 ? -6 : 0,
                        zIndex: 3 - i,
                      }}
                    >
                      {p.avatar}
                    </div>
                  ))}
                </div>
                <span className="font-mono text-xs text-dim">
                  {event.peopleDown.length} down →
                </span>
              </div>
            )}
          </div>

          {actionButtons}
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
  actionButtons, onOpenSocial, onViewProfile, onClose,
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
  onClose: () => void;
}) {
  const { visible, entering, closing, close } = useModalTransition(true, onClose);
  const touchStartY = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    if (!visible) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [visible]);

  const handleSwipeStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    isDragging.current = false;
  };
  const handleSwipeMove = (e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy > 0) { isDragging.current = true; setDragOffset(dy); }
  };
  const handleSwipeEnd = () => {
    if (dragOffset > 60) { setDragOffset(0); close(); }
    else { setDragOffset(0); }
    isDragging.current = false;
  };
  const handleScrollTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    isDragging.current = false;
  };
  const handleScrollTouchMove = (e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - touchStartY.current;
    const atTop = scrollRef.current ? scrollRef.current.scrollTop <= 0 : true;
    if (atTop && dy > 0) { isDragging.current = true; e.preventDefault(); setDragOffset(dy); }
  };
  const handleScrollTouchEnd = () => {
    if (isDragging.current) handleSwipeEnd();
  };

  if (!visible) return null;

  const divider = <div className="h-px bg-border my-3.5" />;

  return (
    <div
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      className="fixed inset-0 z-[100] flex items-end justify-center"
    >
      {/* Backdrop */}
      <div
        onClick={close}
        className="absolute inset-0 transition-[opacity,backdrop-filter] duration-300 ease-in-out"
        style={{
          background: "rgba(0,0,0,0.7)",
          backdropFilter: (entering || closing) ? "blur(0px)" : "blur(8px)",
          WebkitBackdropFilter: (entering || closing) ? "blur(0px)" : "blur(8px)",
          opacity: (entering || closing) ? 0 : 1,
        }}
      />
      {/* Panel */}
      <div
        className="relative bg-surface rounded-t-3xl w-full flex flex-col pt-3"
        style={{
          maxWidth: 420,
          maxHeight: "80vh",
          animation: closing ? undefined : "slideUp 0.3s ease-out",
          transform: closing ? "translateY(100%)" : `translateY(${dragOffset}px)`,
          transition: closing ? "transform 0.2s ease-in" : (dragOffset === 0 ? "transform 0.2s ease-out" : "none"),
        }}
      >
        {/* Drag handle area */}
        <div
          onTouchStart={handleSwipeStart}
          onTouchMove={handleSwipeMove}
          onTouchEnd={handleSwipeEnd}
          className="touch-none"
        >
          <div className="flex justify-center px-5 pb-2">
            <div className="w-10 h-1 bg-faint rounded-sm" />
          </div>
        </div>

        {/* Scrollable content */}
        <div
          ref={scrollRef}
          onTouchStart={handleScrollTouchStart}
          onTouchMove={handleScrollTouchMove}
          onTouchEnd={handleScrollTouchEnd}
          className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5"
        >
          <SheetHero
            event={event} userId={userId} sourceLink={sourceLink}
            poolPeople={poolPeople} poolFriends={poolFriends} poolStrangerCount={poolStrangerCount}
            nonPoolFriends={nonPoolFriends} mutuals={mutuals} others={others} hasPool={hasPool}
            actionButtons={actionButtons} onOpenSocial={onOpenSocial} onViewProfile={onViewProfile}
          />
        </div>
      </div>
    </div>
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
          event.createdBy === userId ? "bg-dt text-black" : "bg-border-light text-dim",
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
          <span className="text-dim">{" "}{event.note}</span>
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
                      p.mutual ? "bg-dt text-black" : "bg-border-light text-dim"
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
                      background: event.isPublic ? "rgba(255,255,255,0.06)" : "rgba(232,255,90,0.12)",
                      color: event.isPublic ? "#444" : "#E8FF5A",
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
              <h3 className="font-serif text-2xl text-primary m-0 leading-tight font-normal flex-1"
                style={{ fontFamily: font.serif }}>
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
        <h3 className="font-serif text-2xl text-primary mb-2 mt-0 leading-tight font-normal"
          style={{ fontFamily: font.serif }}>
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
            background: event.isPublic ? "rgba(255,255,255,0.06)" : "rgba(232,255,90,0.12)",
            color: event.isPublic ? "#444" : "#E8FF5A",
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
                {event.note}
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

      {/* Social */}
      <SocialBlock {...props} />

      <div className="mt-3">{actionButtons}</div>
    </>
  );
}

export default EventCard;
