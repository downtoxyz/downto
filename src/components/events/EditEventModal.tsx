"use client";

import { useState, useEffect, useRef, CSSProperties } from "react";
import { font, color } from "@/lib/styles";
import { useModalTransition } from "@/hooks/useModalTransition";
import type { Event } from "@/lib/ui-types";

const EditEventModal = ({
  event,
  open,
  onClose,
  onSave,
}: {
  event: Event | null;
  open: boolean;
  onClose: () => void;
  onSave: (updated: { title: string; venue: string; date: string; time: string; vibe: string[] }) => void;
}) => {
  const [title, setTitle] = useState("");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [vibeText, setVibeText] = useState("");
  const { visible, entering, closing, close } = useModalTransition(open, onClose);
  const touchStartY = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    if (event && open) {
      setTitle(event.title);
      setVenue(event.venue);
      setDate(event.date);
      setTime(event.time);
      setVibeText(event.vibe.join(", "));
    }
  }, [event, open]);

  // Lock body scroll when open
  useEffect(() => {
    if (!visible) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [visible]);

  const finishSwipe = () => {
    if (dragOffset > 60) {
      setDragOffset(0);
      close();
    } else {
      setDragOffset(0);
    }
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
  const handleScrollTouchEnd = () => { if (isDragging.current) finishSwipe(); };

  if (!visible || !event) return null;

  const inputStyle: CSSProperties = {
    background: color.deep,
    border: `1px solid ${color.borderMid}`,
    borderRadius: 10,
    padding: "12px 14px",
    color: color.text,
    fontFamily: font.mono,
    fontSize: 13,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  };

  const labelStyle: CSSProperties = {
    fontFamily: font.mono,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.15em",
    color: color.dim,
    marginBottom: 6,
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
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
      <div
        ref={scrollRef}
        onTouchStart={handleScrollTouchStart}
        onTouchMove={handleScrollTouchMove}
        onTouchEnd={handleScrollTouchEnd}
        style={{
          position: "relative",
          background: color.surface,
          borderRadius: "24px 24px 0 0",
          width: "100%",
          maxWidth: 420,
          padding: "32px 24px 40px",
          maxHeight: "80vh",
          overflowY: isDragging.current ? "hidden" : "auto",
          overscrollBehavior: "contain",
          animation: closing ? undefined : "slideUp 0.3s ease-out",
          transform: closing ? "translateY(100%)" : `translateY(${dragOffset}px)`,
          transition: isDragging.current ? "none" : "transform 0.25s ease-out",
        }}
      >
        <div
          style={{
            width: 40,
            height: 4,
            background: color.faint,
            borderRadius: 2,
            margin: "0 auto 24px",
          }}
        />
        <h3
          style={{
            fontFamily: font.serif,
            fontSize: 22,
            color: color.text,
            marginBottom: 20,
            fontWeight: 400,
          }}
        >
          Edit event
        </h3>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={labelStyle}>Title</div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event name"
              style={inputStyle}
            />
          </div>
          <div>
            <div style={labelStyle}>Venue</div>
            <input
              type="text"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="Venue"
              style={inputStyle}
            />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>Date</div>
              <input
                type="text"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="e.g. Fri, Feb 14"
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>Time</div>
              <input
                type="text"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                placeholder="e.g. 9PM–2AM"
                style={inputStyle}
              />
            </div>
          </div>
          <div>
            <div style={labelStyle}>Vibes (comma-separated)</div>
            <input
              type="text"
              value={vibeText}
              onChange={(e) => setVibeText(e.target.value)}
              placeholder="e.g. techno, late night"
              style={inputStyle}
            />
          </div>
        </div>

        <button
          onClick={() => {
            const vibes = vibeText.split(",").map((v) => v.trim()).filter(Boolean);
            onSave({ title, venue, date, time, vibe: vibes });
          }}
          disabled={!title.trim()}
          style={{
            width: "100%",
            marginTop: 20,
            background: !title.trim() ? color.faint : color.accent,
            color: "#000",
            border: "none",
            borderRadius: 12,
            padding: "14px",
            fontFamily: font.mono,
            fontSize: 13,
            fontWeight: 700,
            cursor: !title.trim() ? "not-allowed" : "pointer",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            opacity: !title.trim() ? 0.5 : 1,
          }}
        >
          Save Changes
        </button>
      </div>
    </div>
  );
};

export default EditEventModal;
