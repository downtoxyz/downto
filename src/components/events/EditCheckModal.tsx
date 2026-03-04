"use client";

import { useState, useEffect, useRef } from "react";
import { font, color } from "@/lib/styles";
import { parseNaturalDate, parseNaturalTime } from "@/lib/utils";
import type { InterestCheck } from "@/lib/ui-types";

const EditCheckModal = ({
  check,
  open,
  onClose,
  onSave,
}: {
  check: InterestCheck | null;
  open: boolean;
  onClose: () => void;
  onSave: (updates: {
    text: string;
    eventDate: string | null;
    eventDateLabel: string | null;
    eventTime: string | null;
    dateFlexible: boolean;
    timeFlexible: boolean;
  }) => void;
}) => {
  const [text, setText] = useState("");
  const [dateDismissed, setDateDismissed] = useState(false);
  const [timeDismissed, setTimeDismissed] = useState(false);
  const [dateLocked, setDateLocked] = useState(false);
  const [timeLocked, setTimeLocked] = useState(false);
  const [hasToggledLock, setHasToggledLock] = useState(false);
  const touchStartY = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [closing, setClosing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    if (check && open) {
      setText(check.text);
      setDateDismissed(false);
      setTimeDismissed(false);
      setDateLocked(!check.dateFlexible);
      setTimeLocked(!check.timeFlexible);
      setHasToggledLock(false);
    }
  }, [check, open]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const finishSwipe = () => {
    if (dragOffset > 60) {
      setClosing(true);
      setTimeout(() => { setClosing(false); setDragOffset(0); onClose(); }, 250);
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

  if (!open || !check) return null;

  const detectedDate = text ? parseNaturalDate(text) : null;
  const detectedTime = text ? parseNaturalTime(text) : null;

  // Fall back to the check's existing date/time when parsing doesn't detect anything
  const existingDate = check.eventDate ? { label: check.eventDateLabel || check.eventDate, iso: check.eventDate } : null;
  const existingTime = check.eventTime || null;
  const effectiveDate = detectedDate || existingDate;
  const effectiveTime = detectedTime || existingTime;

  const handleSave = () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    onSave({
      text: trimmed,
      eventDate: !dateDismissed && effectiveDate ? effectiveDate.iso : null,
      eventDateLabel: !dateDismissed && effectiveDate ? effectiveDate.label : null,
      eventTime: !timeDismissed && effectiveTime ? effectiveTime : null,
      dateFlexible: !dateLocked,
      timeFlexible: !timeLocked,
    });
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
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      />
      <div
        style={{
          position: "relative",
          background: color.surface,
          borderRadius: "24px 24px 0 0",
          width: "100%",
          maxWidth: 420,
          padding: "20px 24px 0",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          animation: closing ? undefined : "slideUp 0.3s ease-out",
          transform: closing ? "translateY(100%)" : `translateY(${dragOffset}px)`,
          transition: closing ? "transform 0.25s ease-in" : (dragOffset === 0 ? "transform 0.2s ease-out" : "none"),
        }}
      >
        {/* Drag handle */}
        <div
          onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY; isDragging.current = false; }}
          onTouchMove={(e) => { const dy = e.touches[0].clientY - touchStartY.current; if (dy > 0) { isDragging.current = true; setDragOffset(dy); } }}
          onTouchEnd={finishSwipe}
          style={{ touchAction: "none" }}
        >
          <div style={{ width: 40, height: 4, background: color.faint, borderRadius: 2, margin: "0 auto 20px" }} />
        </div>

        <div
          ref={scrollRef}
          onTouchStart={handleScrollTouchStart}
          onTouchMove={handleScrollTouchMove}
          onTouchEnd={handleScrollTouchEnd}
          style={{ overflowY: "auto", overflowX: "hidden", flex: 1, paddingBottom: 24 }}
        >
          {/* Title */}
          <h2 style={{ fontFamily: font.serif, fontSize: 18, color: color.text, margin: "0 0 20px", fontWeight: 400 }}>
            Edit check
          </h2>

          {/* Text */}
          <div style={{ marginBottom: 16 }}>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value.slice(0, 280));
                setDateDismissed(false);
                setTimeDismissed(false);
              }}
              maxLength={280}
              rows={3}
              style={{
                width: "100%",
                background: color.deep,
                border: `1px solid ${color.borderMid}`,
                borderRadius: 12,
                padding: "14px 16px",
                color: color.text,
                fontFamily: font.mono,
                fontSize: 13,
                outline: "none",
                resize: "none",
                lineHeight: 1.5,
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Auto-detected date/time chips */}
          {((effectiveDate && !dateDismissed) || (effectiveTime && !timeDismissed)) && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
              {effectiveDate && !dateDismissed && (
                <div
                  onClick={() => { setDateLocked((v) => !v); setHasToggledLock(true); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 10px",
                    background: dateLocked ? "rgba(232,255,90,0.08)" : "transparent",
                    borderRadius: 8,
                    border: dateLocked ? "1px solid rgba(232,255,90,0.2)" : "1px dashed rgba(232,255,90,0.35)",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontFamily: font.mono, fontSize: 11, color: color.accent, fontWeight: 600 }}>
                    📅 {effectiveDate.label}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDateDismissed(true); }}
                    style={{
                      background: "none",
                      border: "none",
                      color: color.dim,
                      fontFamily: font.mono,
                      fontSize: 13,
                      cursor: "pointer",
                      padding: "0 2px",
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </div>
              )}
              {effectiveTime && !timeDismissed && (
                <div
                  onClick={() => { setTimeLocked((v) => !v); setHasToggledLock(true); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 10px",
                    background: timeLocked ? "rgba(232,255,90,0.08)" : "transparent",
                    borderRadius: 8,
                    border: timeLocked ? "1px solid rgba(232,255,90,0.2)" : "1px dashed rgba(232,255,90,0.35)",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontFamily: font.mono, fontSize: 11, color: color.accent, fontWeight: 600 }}>
                    🕐 {effectiveTime}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setTimeDismissed(true); }}
                    style={{
                      background: "none",
                      border: "none",
                      color: color.dim,
                      fontFamily: font.mono,
                      fontSize: 13,
                      cursor: "pointer",
                      padding: "0 2px",
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </div>
              )}
              {!hasToggledLock && (
                <div style={{ width: "100%", fontFamily: font.mono, fontSize: 9, color: color.faint, marginTop: 2 }}>
                  tap to lock in · dashed = flexible
                </div>
              )}
            </div>
          )}
        </div>

        {/* Save button */}
        <div style={{ padding: "12px 0 24px", flexShrink: 0 }}>
          <button
            onClick={handleSave}
            disabled={!text.trim()}
            style={{
              width: "100%",
              background: text.trim() ? color.accent : color.borderMid,
              color: text.trim() ? "#000" : color.dim,
              border: "none",
              borderRadius: 12,
              padding: "14px",
              fontFamily: font.mono,
              fontSize: 12,
              fontWeight: 700,
              cursor: text.trim() ? "pointer" : "default",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditCheckModal;
