"use client";

import { useState, useEffect, useRef } from "react";
import { color } from "@/lib/styles";

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
      className="flex items-center gap-3 w-full py-3.5 bg-transparent border-none border-b border-border font-mono text-sm text-primary cursor-pointer text-left"
    >
      <span className="text-base w-6 text-center">{icon}</span>
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
        className="fixed inset-0 z-[100]"
        style={{
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      />
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="fixed bottom-0 left-0 right-0 bg-surface max-w-[420px] mx-auto z-[101]"
        style={{
          borderRadius: "24px 24px 0 0",
          animation: closing ? undefined : "slideUp 0.3s ease-out",
          transform: closing ? "translateY(100%)" : dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
          transition: closing ? "transform 0.25s ease-in" : dragOffset > 0 ? undefined : "transform 0.25s ease-out",
          paddingBottom: "env(safe-area-inset-bottom, 20px)",
        }}
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-faint rounded-sm" />
        </div>
        <div className="px-5 pb-5">
          <p className="font-serif text-lg text-primary mb-2 font-normal">
            Event actions
          </p>
          {onShare && actionRow("Share event", "🔗", () => { dismiss(); onShare(); })}
          {onEdit && actionRow("Edit event", "✎", () => { dismiss(); onEdit(); })}
        </div>
      </div>
    </>
  );
}
