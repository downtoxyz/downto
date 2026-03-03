"use client";

import { useState, useRef } from "react";
import { font, color } from "@/lib/styles";
import type { Event } from "@/lib/ui-types";

const EventCard = ({
  event,
  onToggleSave,
  onToggleDown,
  onOpenSocial,
  onLongPress,
  isNew,
}: {
  event: Event;
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
      style={{
        background: color.card,
        borderRadius: 20,
        overflow: "hidden",
        marginBottom: 16,
        border: `1px solid ${isNew ? color.accent : hovered ? color.borderMid : color.border}`,
        transition: "all 0.3s ease",
        transform: hovered ? "translateY(-2px)" : "none",
        ...(isNew ? { animation: "accentGlow 2s ease-out forwards" } : {}),
      }}
    >
      <div style={{ position: "relative", height: 180, overflow: "hidden" }}>
        {(event.movieThumbnail || event.image) ? (
          <img
            src={event.movieThumbnail || event.image}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              filter: "brightness(0.6) contrast(1.1)",
            }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", background: "#1a1a1a" }} />
        )}
        {onLongPress && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLongPress();
            }}
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              color: "#aaa",
              border: "none",
              padding: "6px 8px",
              borderRadius: 20,
              fontFamily: font.mono,
              fontSize: 11,
              cursor: "pointer",
              zIndex: 2,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span style={{ fontSize: 12 }}>&#9998;</span>
          </button>
        )}
        {(event.igHandle || event.diceUrl || event.letterboxdUrl) && (
          <div style={{ position: "absolute", top: 12, right: 12 }}>
            {event.igUrl ? (
              <a
                href={event.igUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: "rgba(0,0,0,0.6)",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                  color: "#aaa",
                  padding: "6px 10px",
                  borderRadius: 20,
                  fontFamily: font.mono,
                  fontSize: 10,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {event.igHandle} ↗
              </a>
            ) : event.diceUrl ? (
              <a
                href={event.diceUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: "rgba(0,0,0,0.6)",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                  color: "#aaa",
                  padding: "6px 10px",
                  borderRadius: 20,
                  fontFamily: font.mono,
                  fontSize: 10,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                dice.fm ↗
              </a>
            ) : event.letterboxdUrl ? (
              <a
                href={event.letterboxdUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: "rgba(0,0,0,0.6)",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                  color: "#aaa",
                  padding: "6px 10px",
                  borderRadius: 20,
                  fontFamily: font.mono,
                  fontSize: 10,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                letterboxd ↗
              </a>
            ) : event.igHandle ? (
              <span
                style={{
                  background: "rgba(0,0,0,0.6)",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                  color: "#aaa",
                  padding: "6px 10px",
                  borderRadius: 20,
                  fontFamily: font.mono,
                  fontSize: 10,
                }}
              >
                {event.igHandle}
              </span>
            ) : null}
          </div>
        )}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "40px 20px 16px",
            background: "linear-gradient(transparent, rgba(0,0,0,0.9))",
          }}
        >
          <h3
            style={{
              fontFamily: font.serif,
              fontSize: 24,
              color: color.text,
              margin: 0,
              lineHeight: 1.2,
              fontWeight: 400,
            }}
          >
            {event.title}
          </h3>
        </div>
      </div>

      <div style={{ padding: "16px 20px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 12,
                color: color.accent,
                marginBottom: 2,
              }}
            >
              {event.date} · {event.time}
            </div>
            <div style={{ fontFamily: font.mono, fontSize: 12, color: color.dim }}>
              {event.venue}
            </div>
            {event.movieTitle && (
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                marginTop: 4,
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
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {event.vibe.map((v) => (
              <span
                key={v}
                style={{
                  background: color.surface,
                  color: color.dim,
                  padding: "4px 8px",
                  borderRadius: 12,
                  fontFamily: font.mono,
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                {v}
              </span>
            ))}
          </div>
        </div>

        {/* Social preview — show when others are down, or prompt when you're the only one */}
        {(event.peopleDown.length > 0 || event.isDown) && <div
          onClick={onOpenSocial}
          style={{
            background: color.deep,
            borderRadius: 14,
            padding: "12px 14px",
            marginBottom: 12,
            cursor: "pointer",
            border: `1px solid ${color.border}`,
            transition: "border-color 0.2s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.borderColor = color.borderLight)
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.borderColor = color.border)
          }
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              {event.peopleDown.length > 0 && (
                <div style={{ display: "flex", marginRight: 4, flexShrink: 0 }}>
                  {/* Pool members first, then others */}
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
                    Looking for a squad?
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
        </div>}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onToggleSave}
            style={{
              flex: 1,
              background: event.saved ? color.accent : "transparent",
              color: event.saved ? "#000" : color.accent,
              border: event.saved ? "none" : `1px solid ${color.accent}`,
              borderRadius: 12,
              padding: "12px",
              fontFamily: font.mono,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {event.saved ? "✓ Saved" : "Save to Cal"}
          </button>
          <button
            onClick={onToggleDown}
            style={{
              flex: 1,
              background: event.isDown ? "rgba(232,255,90,0.15)" : "transparent",
              color: event.isDown ? color.accent : color.text,
              border: `1px solid ${event.isDown ? color.accent : color.borderMid}`,
              borderRadius: 12,
              padding: "12px",
              fontFamily: font.mono,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
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
