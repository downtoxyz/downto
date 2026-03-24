"use client";

import { useState, useRef } from "react";
import { font, color } from "@/lib/styles";
import type { Event } from "@/lib/ui-types";

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
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
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

  return (
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
      {/* Background image from scraped IG post */}
      {event.image && event.image !== "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&q=80" && (
        <>
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `url(${event.image})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              opacity: 0.08,
              borderRadius: "inherit",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.6) 100%)",
              borderRadius: "inherit",
            }}
          />
        </>
      )}
      <div className="p-3.5" style={{ position: "relative" }}>
        {/* Header: title + edit */}
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

        {/* Metadata line: date · time · venue · visibility */}
        <div className="flex items-center gap-1 mb-2 flex-wrap">
          <span style={{ fontFamily: font.mono, fontSize: 12, color: color.accent }}>
            {event.date}
            {event.time && event.time !== "TBD" && ` · ${event.time}`}
          </span>
          {event.venue && event.venue !== "TBD" && (
            <span style={{ fontFamily: font.mono, fontSize: 12, color: color.dim }}>
              {" "}· {event.venue}
            </span>
          )}
          <span style={{
            fontFamily: font.mono,
            fontSize: 9,
            fontWeight: 700,
            padding: "1px 5px",
            borderRadius: 3,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginLeft: 4,
            background: event.isPublic ? "rgba(255,255,255,0.06)" : "rgba(232,255,90,0.12)",
            color: event.isPublic ? color.faint : color.accent,
          }}>
            {event.isPublic ? "public" : "friends"}
          </span>
        </div>

        {/* Poster attribution */}
        {event.posterName && (
          <div className="flex items-center gap-1.5 mb-2">
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: event.createdBy === userId ? color.accent : color.borderLight,
                color: event.createdBy === userId ? "#000" : color.dim,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: font.mono,
                fontSize: 8,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {event.posterAvatar || event.posterName[0]?.toUpperCase()}
            </div>
            <span style={{ fontFamily: font.mono, fontSize: 11, color: color.muted }}>
              {event.createdBy === userId ? "You" : event.posterName}
            </span>
          </div>
        )}

        {/* Note */}
        {event.note && (
          <div style={{ fontFamily: font.mono, fontSize: 11, color: color.muted, marginBottom: 8 }}>
            {event.note}
          </div>
        )}

        {/* Movie metadata */}
        {event.movieTitle && (
          <div className="flex items-center gap-1 mb-2">
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 8px",
              background: color.deep,
              borderRadius: 8,
              fontFamily: font.mono,
              fontSize: 10,
              color: color.muted,
            }}>
              <span>🎬</span>
              {event.movieTitle}
              {event.movieYear && ` (${event.movieYear})`}
              {event.movieDirector && ` · ${event.movieDirector}`}
            </span>
          </div>
        )}

        {/* Vibes + source */}
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          {event.vibe.map((v) => (
            <span
              key={v}
              style={{
                background: color.surface,
                color: color.dim,
                padding: "3px 7px",
                borderRadius: 10,
                fontFamily: font.mono,
                fontSize: 9,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {v}
            </span>
          ))}
          {sourceLink && (
            sourceLink.href ? (
              <a
                href={sourceLink.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                  fontFamily: font.mono,
                  fontSize: 9,
                  color: color.faint,
                  textDecoration: "none",
                  marginLeft: "auto",
                }}
              >
                {sourceLink.label} ↗
              </a>
            ) : (
              <span style={{
                fontFamily: font.mono,
                fontSize: 9,
                color: color.faint,
                marginLeft: "auto",
              }}>
                {sourceLink.label}
              </span>
            )
          )}
        </div>

        {/* Social preview */}
        {(event.socialLoaded || event.isDown) && (
          <div
            onClick={event.socialLoaded ? onOpenSocial : undefined}
            style={{
              background: color.deep,
              borderRadius: 14,
              padding: "12px 14px",
              marginBottom: 12,
              cursor: event.socialLoaded ? "pointer" : "default",
              border: `1px solid ${color.border}`,
              transition: "border-color 0.2s",
            }}
            onMouseEnter={(e) => event.socialLoaded && (e.currentTarget.style.borderColor = color.borderLight)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = color.border)}
          >
            {!event.socialLoaded ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: "50%",
                  background: color.borderLight,
                  animation: "pulse 1.5s ease-in-out infinite",
                  flexShrink: 0,
                }} />
                <span style={{ fontFamily: font.mono, fontSize: 11, color: color.faint }}>
                  Loading...
                </span>
              </div>
            ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                {event.peopleDown.length > 0 && (
                  <div style={{ display: "flex", marginRight: 4, flexShrink: 0 }}>
                    {[...poolPeople, ...event.peopleDown.filter((p) => !p.inPool)].slice(0, 4).map((p, i) => (
                      <div
                        key={p.name}
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: "50%",
                          background: p.mutual ? color.accent : color.borderLight,
                          color: p.mutual ? "#000" : color.dim,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontFamily: font.mono,
                          fontSize: 10,
                          fontWeight: 700,
                          marginLeft: i > 0 ? -8 : 0,
                          border: `2px solid ${p.inPool ? color.pool : color.deep}`,
                          position: "relative",
                          zIndex: 4 - i,
                        }}
                      >
                        {p.avatar}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  {event.peopleDown.length === 0 && !event.userInPool ? (
                    <span style={{ fontFamily: font.mono, fontSize: 11, color: color.pool }}>
                      Looking for a squad?{" "}
                      <span style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: "1px 4px",
                        borderRadius: 3,
                        background: event.isPublic ? "rgba(255,255,255,0.06)" : "rgba(232,255,90,0.12)",
                        color: event.isPublic ? color.faint : color.accent,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}>
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
                              {poolFriends.length > 0
                                ? poolFriends.map((p) => p.name).join(", ")
                                : null}
                              {poolFriends.length > 0 && poolStrangerCount > 0 ? " + " : null}
                              {poolFriends.length === 0 && poolStrangerCount > 0
                                ? `${event.poolCount} looking for a squad`
                                : poolStrangerCount > 0
                                  ? `${poolStrangerCount} looking for a squad`
                                  : " looking for a squad"}
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
                          <span style={{ color: color.accent }}>
                            {mutuals.map((m) => m.name).join(", ")}
                          </span>
                          {others.length > 0 && (
                            <span style={{ color: color.dim }}>
                              {" "}+ {others.length} others
                            </span>
                          )}
                        </>
                      ) : (
                        <span style={{ color: color.dim }}>
                          {others.length} {others.length === 1 ? "person" : "people"} down
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>
              <span style={{ color: color.faint, fontSize: 16, flexShrink: 0 }}>→</span>
            </div>
            )}
          </div>
        )}

        {/* Action buttons */}
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
      </div>
    </div>
  );
};

export default EventCard;
