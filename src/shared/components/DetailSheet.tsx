"use client";

import React, { useState, useRef, useEffect } from "react";
import { useModalTransition } from "@/shared/hooks/useModalTransition";

/**
 * Shared bottom-sheet shell: backdrop + blur + slide-up panel + drag-to-dismiss
 * + scrollable content + optional "edit" row at the bottom. Consumer renders
 * its own content (hero, metadata, etc.) via children.
 *
 * Parent owns visibility: mount when open, unmount to close. `onClose` is
 * called after the close animation completes so state can be cleared.
 */
export default function DetailSheet({
  onClose,
  editLabel,
  onEdit,
  children,
}: {
  onClose: () => void;
  editLabel?: string;
  onEdit?: () => void;
  children: React.ReactNode;
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
        {/* Drag handle */}
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
          {children}
          {editLabel && onEdit && (
            <div className="mt-5 pt-4 border-t border-border">
              <button
                onClick={() => { onEdit(); close(); }}
                className="w-full flex items-center justify-between py-2 font-mono text-xs text-dt font-bold uppercase tracking-[0.06em] cursor-pointer"
              >
                <span>{editLabel}</span>
                <span className="text-faint">→</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
