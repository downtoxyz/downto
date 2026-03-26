"use client";

import { useState, useEffect, useRef } from "react";
import { font, color } from "@/lib/styles";

export default function EventActionsSheet({
  open,
  onClose,
  onEdit,
  onShare,
}: {
  open: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onShare?: () => void;
}) {
  const touchStartY = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [closing, setClosing] = useState(false);
  const isDragging = useRef(false);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const dismiss = () => {
    setClosing(true);
    setTimeout(() => { setClosing(false); setDragOffset(0); onClose(); }, 250);
  };

  const finishSwipe = () => {
    if (dragOffset > 60) dismiss();
    else setDragOffset(0);
    isDragging.current = false;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    isDragging.current = false;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy > 0) { isDragging.current = true; e.preventDefault(); setDragOffset(dy); }
  };
  const handleTouchEnd = () => { if (isDragging.current) finishSwipe(); };

  if (!open) return null;

  const actionRow = (label: string, icon: string, onClick: () => void) => (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "14px 0",
        background: "transparent",
        border: "none",
        borderBottom: `1px solid ${color.border}`,
        fontFamily: font.mono,
        fontSize: 13,
        color: color.text,
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>{icon}</span>
      {label}
    </button>
  );

  return (
    <>
      <div
        onClick={dismiss}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          zIndex: 100,
        }}
      />
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: color.surface,
          borderRadius: "24px 24px 0 0",
          maxWidth: 420,
          margin: "0 auto",
          zIndex: 101,
          animation: closing ? undefined : "slideUp 0.3s ease-out",
          transform: closing ? "translateY(100%)" : dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
          transition: closing ? "transform 0.25s ease-in" : dragOffset > 0 ? undefined : "transform 0.25s ease-out",
          paddingBottom: "env(safe-area-inset-bottom, 20px)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 8px" }}>
          <div style={{ width: 40, height: 4, background: color.faint, borderRadius: 2 }} />
        </div>
        <div style={{ padding: "0 20px 20px" }}>
          <p style={{ fontFamily: font.serif, fontSize: 18, color: color.text, margin: "0 0 8px", fontWeight: 400 }}>
            Event actions
          </p>
          {onShare && actionRow("Share event", "🔗", () => { dismiss(); onShare(); })}
          {onEdit && actionRow("Edit event", "✎", () => { dismiss(); onEdit(); })}
        </div>
      </div>
    </>
  );
}
