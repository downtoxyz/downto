"use client";

import { useState, useRef, useEffect } from "react";
import { font, color } from "@/lib/styles";
import type { Event } from "@/lib/ui-types";
import { useModalTransition } from "@/shared/hooks/useModalTransition";

const EventCard = ({
  event,
  userId,
  onToggleSave,
  onToggleDown,
  onOpenSocial,
  onLongPress,
  isNew,
}: {
  event: Event;
  userId?: string | null;
  onToggleSave: () => void;
  onToggleDown: () => void;
  onOpenSocial: () => void;
  onLongPress?: () => void;
  isNew?: boolean;
}) => {
  const [hovered, setHovered] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
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
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${event.image})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          opacity: 0.18,
          borderRadius: "inherit",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.5) 100%)",
          borderRadius: "inherit",
        }}
      />
    </>
  );

  const actionButtons = (
    <div style={{ display: "flex", gap: 8 }}>
      <button
        onClick={onToggleSave}
        className="flex-1 rounded-lg py-1.5 font-mono text-tiny font-bold cursor-pointer uppercase tracking-[0.08em]"
        style={{
          background: event.saved ? color.accent : "transparent",
          color: event.saved ? "#000" : color.accent,
          border: event.saved ? "none" : `1px solid ${color.accent}`,
        }}
      >
        {event.saved ? "✓ Saved" : "Save to Cal"}
      </button>
      <button
        onClick={onToggleDown}
        className="flex-1 rounded-lg py-1.5 font-mono text-tiny font-bold cursor-pointer uppercase tracking-[0.08em]"
        style={{
          background: event.isDown ? "rgba(232,255,90,0.15)" : "transparent",
          color: event.isDown ? color.accent : color.text,
          border: `1px solid ${event.isDown ? color.accent : color.borderMid}`,
        }}
      >
        {event.isDown ? "You're Down ✋" : "I'm Down ✋"}
      </button>
    </div>
  );

  const hasDetails = !!(event.posterName || event.note || event.movieTitle || event.vibe.length > 0 || sourceLink);

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
        className={`rounded-xl overflow-hidden mb-2 transition-all ${
          isNew ? "border border-dt/40" : hovered ? "border border-neutral-700" : "border border-neutral-900"
        }`}
        style={{
          background: "rgba(232, 255, 90, 0.03)",
          position: "relative",
          ...(isNew ? { animation: "accentGlow 2s ease-out forwards" } : {}),
        }}
      >
        {bgImage}
        <div className="p-3.5" style={{ position: "relative" }}>
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
            style={{ cursor: "pointer" }}
          >
            {/* Title + edit */}
            <div className="flex justify-between items-start mb-2.5">
              <h3
                style={{
                  fontFamily: font.serif,
                  fontSize: 20,
                  color: color.text,
                  margin: 0,
                  lineHeight: 1.25,
                  fontWeight: 400,
                }}
              >
                {event.title}
              </h3>
              {onLongPress && (
                <button
                  onClick={(e) => { e.stopPropagation(); onLongPress(); }}
                  className="bg-transparent border-none text-neutral-600 font-mono text-tiny cursor-pointer p-1 shrink-0 ml-2"
                >
                  ✎
                </button>
              )}
            </div>

            {/* Date, time, venue */}
            <div className="mb-2">
              <span style={{ fontFamily: font.mono, fontSize: 12, color: color.accent }}>
                {event.date}
                {event.time && event.time !== "TBD" && ` ${event.time}`}
              </span>
              {event.venue && event.venue !== "TBD" && (
                <div style={{ fontFamily: font.mono, fontSize: 12, color: color.dim, marginTop: 2 }}>
                  {event.venue}
                </div>
              )}
            </div>

            {/* Inline social hint — avatar stack + count */}
            {event.socialLoaded && event.peopleDown.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div style={{ display: "flex", flexShrink: 0 }}>
                  {event.peopleDown.slice(0, 3).map((p, i) => (
                    <div
                      key={p.name}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        background: p.mutual ? color.accent : color.borderLight,
                        color: p.mutual ? "#000" : color.dim,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: font.mono,
                        fontSize: 9,
                        fontWeight: 700,
                        marginLeft: i > 0 ? -6 : 0,
                        border: `2px solid ${color.deep}`,
                        position: "relative",
                        zIndex: 3 - i,
                      }}
                    >
                      {p.avatar}
                    </div>
                  ))}
                </div>
                <span style={{ fontFamily: font.mono, fontSize: 11, color: color.dim }}>
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
  actionButtons, onOpenSocial, onClose,
}: {
  event: Event;
  userId?: string | null;
  sourceLink: { href: string | null; label: string } | null;
  hasDetails: boolean;
  poolPeople: Person[]; poolFriends: Person[]; poolStrangerCount: number;
  nonPoolFriends: Person[]; mutuals: Person[]; others: Person[]; hasPool: boolean;
  actionButtons: React.ReactNode;
  onOpenSocial: () => void;
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

  const divider = <div style={{ height: 1, background: color.border, margin: "14px 0" }} />;

  return (
    <div
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      {/* Backdrop */}
      <div
        onClick={close}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: (entering || closing) ? "blur(0px)" : "blur(8px)",
          WebkitBackdropFilter: (entering || closing) ? "blur(0px)" : "blur(8px)",
          opacity: (entering || closing) ? 0 : 1,
          transition: "opacity 0.3s ease, backdrop-filter 0.3s ease, -webkit-backdrop-filter 0.3s ease",
        }}
      />
      {/* Panel */}
      <div
        style={{
          position: "relative",
          background: color.surface,
          borderRadius: "24px 24px 0 0",
          width: "100%",
          maxWidth: 420,
          maxHeight: "80vh",
          padding: "12px 0 0",
          animation: closing ? undefined : "slideUp 0.3s ease-out",
          transform: closing ? "translateY(100%)" : `translateY(${dragOffset}px)`,
          transition: closing ? "transform 0.2s ease-in" : (dragOffset === 0 ? "transform 0.2s ease-out" : "none"),
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Drag handle area */}
        <div
          onTouchStart={handleSwipeStart}
          onTouchMove={handleSwipeMove}
          onTouchEnd={handleSwipeEnd}
          style={{ touchAction: "none" }}
        >
          <div style={{ display: "flex", justifyContent: "center", padding: "0 20px 8px" }}>
            <div style={{ width: 40, height: 4, background: color.faint, borderRadius: 2 }} />
          </div>
        </div>

        {/* Scrollable content */}
        <div
          ref={scrollRef}
          onTouchStart={handleScrollTouchStart}
          onTouchMove={handleScrollTouchMove}
          onTouchEnd={handleScrollTouchEnd}
          style={{
            flex: 1,
            overflowY: "auto",
            overscrollBehavior: "contain",
            padding: "0 20px 20px",
          }}
        >
          <SheetHero
            event={event} userId={userId} sourceLink={sourceLink}
            poolPeople={poolPeople} poolFriends={poolFriends} poolStrangerCount={poolStrangerCount}
            nonPoolFriends={nonPoolFriends} mutuals={mutuals} others={others} hasPool={hasPool}
            actionButtons={actionButtons} onOpenSocial={onOpenSocial}
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
}

// Poster inline element (with optional note flowing on same line)
function PosterInline({ event, userId, note }: { event: Event; userId?: string | null; note?: boolean }) {
  if (!event.posterName) return null;
  const name = event.createdBy === userId ? "You" : event.posterName;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{
        width: 20, height: 20, borderRadius: "50%",
        background: event.createdBy === userId ? color.accent : color.borderLight,
        color: event.createdBy === userId ? "#000" : color.dim,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: font.mono, fontSize: 8, fontWeight: 700, flexShrink: 0,
      }}>
        {event.posterAvatar || event.posterName[0]?.toUpperCase()}
      </div>
      <div style={{ fontFamily: font.mono, fontSize: 11, lineHeight: 1.5, minWidth: 0 }}>
        <span style={{ color: color.muted, fontWeight: 700 }}>{name}</span>
        {note && event.note && (
          <span style={{ color: color.dim }}>{" "}{event.note}</span>
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
      style={{ fontFamily: font.mono, fontSize: 10, color: color.faint, textDecoration: "none" }}>
      {sourceLink.label} ↗
    </a>
  ) : (
    <span style={{ fontFamily: font.mono, fontSize: 10, color: color.faint }}>
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
        <span key={v} style={{
          background: color.deep, color: color.dim, padding: "4px 8px",
          borderRadius: 10, fontFamily: font.mono, fontSize: 9,
          textTransform: "uppercase", letterSpacing: "0.08em",
        }}>{v}</span>
      ))}
    </div>
  );
}

// Movie pill
function MoviePill({ event }: { event: Event }) {
  if (!event.movieTitle) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "4px 10px", background: color.deep, borderRadius: 8,
      fontFamily: font.mono, fontSize: 10, color: color.muted,
    }}>
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
      style={{
        background: color.deep, borderRadius: 14, padding: "12px 14px",
        cursor: event.socialLoaded ? "pointer" : "default",
        border: `1px solid ${color.border}`, transition: "border-color 0.2s",
      }}
      onMouseEnter={(e) => event.socialLoaded && (e.currentTarget.style.borderColor = color.borderLight)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = color.border)}
    >
      {!event.socialLoaded ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 26, height: 26, borderRadius: "50%", background: color.borderLight, animation: "pulse 1.5s ease-in-out infinite", flexShrink: 0 }} />
          <span style={{ fontFamily: font.mono, fontSize: 11, color: color.faint }}>Loading...</span>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            {event.peopleDown.length > 0 && (
              <div style={{ display: "flex", marginRight: 4, flexShrink: 0 }}>
                {[...poolPeople, ...event.peopleDown.filter((p) => !p.inPool)].slice(0, 4).map((p, i) => (
                  <div key={p.name} style={{
                    width: 26, height: 26, borderRadius: "50%",
                    background: p.mutual ? color.accent : color.borderLight,
                    color: p.mutual ? "#000" : color.dim,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: font.mono, fontSize: 10, fontWeight: 700,
                    marginLeft: i > 0 ? -8 : 0,
                    border: `2px solid ${p.inPool ? color.pool : color.deep}`,
                    position: "relative", zIndex: 4 - i,
                  }}>{p.avatar}</div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              {event.peopleDown.length === 0 && !event.userInPool ? (
                <span style={{ fontFamily: font.mono, fontSize: 11, color: color.pool }}>
                  Looking for a squad?{" "}
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 4px", borderRadius: 3, background: event.isPublic ? "rgba(255,255,255,0.06)" : "rgba(232,255,90,0.12)", color: event.isPublic ? color.faint : color.accent, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {event.isPublic ? "public" : "friends"}
                  </span>
                </span>
              ) : hasPool || event.userInPool ? (
                <>
                  <span style={{ fontFamily: font.mono, fontSize: 11 }}>
                    <span style={{ color: color.pool }}>
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
                    <span style={{ fontFamily: font.mono, fontSize: 10, color: color.dim }}>
                      {nonPoolFriends.map((p) => p.name).join(", ")} {nonPoolFriends.length === 1 ? "is" : "are"} down
                    </span>
                  )}
                </>
              ) : (
                <span style={{ fontFamily: font.mono, fontSize: 11 }}>
                  {mutuals.length > 0 ? (
                    <>
                      <span style={{ color: color.accent }}>{mutuals.map((m) => m.name).join(", ")}</span>
                      {others.length > 0 && <span style={{ color: color.dim }}> + {others.length} others</span>}
                    </>
                  ) : (
                    <span style={{ color: color.dim }}>{others.length} {others.length === 1 ? "person" : "people"} down</span>
                  )}
                </span>
              )}
            </div>
          </div>
          <span style={{ color: color.faint, fontSize: 16, flexShrink: 0 }}>→</span>
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
      {/* Hero image */}
      {hasImage && (
        <div style={{
          height: 140,
          borderRadius: 14,
          overflow: "hidden",
          marginBottom: 14,
          position: "relative",
        }}>
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: `url(${event.image})`,
            backgroundSize: "cover", backgroundPosition: "center",
          }} />
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)",
          }} />
          {/* Title over image */}
          <div style={{ position: "absolute", bottom: 12, left: 14, right: 14 }}>
            <h3 style={{ fontFamily: font.serif, fontSize: 22, color: color.text, margin: 0, lineHeight: 1.25, fontWeight: 400 }}>
              {event.title}
            </h3>
          </div>
        </div>
      )}
      {!hasImage && (
        <h3 style={{ fontFamily: font.serif, fontSize: 22, color: color.text, margin: "0 0 8px", lineHeight: 1.25, fontWeight: 400 }}>
          {event.title}
        </h3>
      )}

      {/* Metadata row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: font.mono, fontSize: 12, color: color.accent }}>
          {event.date}{event.time && event.time !== "TBD" && ` ${event.time}`}
        </span>
        {event.venue && event.venue !== "TBD" && (
          <span style={{ fontFamily: font.mono, fontSize: 12, color: color.dim }}>{event.venue}</span>
        )}
        <span style={{ fontFamily: font.mono, fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, textTransform: "uppercase", letterSpacing: "0.06em", background: event.isPublic ? "rgba(255,255,255,0.06)" : "rgba(232,255,90,0.12)", color: event.isPublic ? color.faint : color.accent }}>
          {event.isPublic ? "public" : "friends"}
        </span>
      </div>

      {/* Poster + note + source (when no tags) */}
      {(event.posterName || event.note || sourceLink) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <PosterInline event={event} userId={userId} note />
            {!event.posterName && event.note && (
              <div style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, lineHeight: 1.5 }}>
                {event.note}
              </div>
            )}
          </div>
          {!(event.movieTitle || event.vibe.length > 0) && sourceLink && (
            <div style={{ flexShrink: 0, marginLeft: 8 }}>
              <SourceLink sourceLink={sourceLink} />
            </div>
          )}
        </div>
      )}

      {/* Tags row: movie + vibes + source */}
      {(event.movieTitle || event.vibe.length > 0) && (
        <div className="flex items-center gap-1.5 flex-wrap" style={{ marginBottom: 8 }}>
          {event.movieTitle && <MoviePill event={event} />}
          <VibePills vibes={event.vibe} />
          {sourceLink && <span style={{ marginLeft: "auto" }}><SourceLink sourceLink={sourceLink} /></span>}
        </div>
      )}

      {/* Social */}
      <SocialBlock {...props} />

      <div style={{ marginTop: 12 }}>{actionButtons}</div>
    </>
  );
}

export default EventCard;
