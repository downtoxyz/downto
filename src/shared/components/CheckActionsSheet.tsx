"use client";

import { useEffect, useRef, useState } from "react";
import { useModalTransition } from "@/shared/hooks/useModalTransition";

/**
 * Small action sheet for a non-owned check in the feed. Opens from the
 * card's ⋯ kebab. Surfaces Hide + Report in a bottom sheet so the card
 * itself stays visually quiet.
 *
 * Mirrors the ReportSheet shell (backdrop, transitions, 60px swipe-to-dismiss).
 */
interface CheckActionsSheetProps {
  onHide: () => void;
  onReport: () => void;
  onClose: () => void;
}

const CheckActionsSheet = ({ onHide, onReport, onClose }: CheckActionsSheetProps) => {
  const { visible, entering, closing, close } = useModalTransition(true, onClose);

  const touchStartY = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const isDragging = useRef(false);

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

  useEffect(() => {
    if (!visible) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [visible]);

  if (!visible) return null;

  const actOn = (fn: () => void) => {
    fn();
    close();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center">
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
      <div
        className="relative bg-surface w-full max-w-[420px] flex flex-col"
        style={{
          borderRadius: "24px 24px 0 0",
          animation: closing ? undefined : "slideUp 0.3s ease-out",
          transform: closing ? "translateY(100%)" : `translateY(${dragOffset}px)`,
          transition: closing ? "transform 0.2s ease-in" : (dragOffset === 0 ? "transform 0.2s ease-out" : "none"),
        }}
      >
        <div
          onTouchStart={handleSwipeStart}
          onTouchMove={handleSwipeMove}
          onTouchEnd={handleSwipeEnd}
          className="touch-none pt-3 pb-1 flex justify-center"
        >
          <div className="w-10 h-1 rounded-sm" style={{ background: "#444" }} />
        </div>

        <div className="px-6 pb-6 pt-2 flex flex-col gap-2">
          <button
            onClick={() => actOn(onHide)}
            className="w-full bg-card border border-border-mid rounded-xl py-3.5 font-mono text-xs font-bold uppercase text-primary cursor-pointer"
            style={{ letterSpacing: "0.08em" }}
          >
            Hide this check
          </button>
          <button
            onClick={() => actOn(onReport)}
            className="w-full bg-card border border-border-mid rounded-xl py-3.5 font-mono text-xs font-bold uppercase text-primary cursor-pointer"
            style={{ letterSpacing: "0.08em" }}
          >
            Report
          </button>
          <button
            onClick={close}
            className="w-full bg-transparent border-none rounded-xl py-3 font-mono text-xs uppercase text-faint cursor-pointer mt-1"
            style={{ letterSpacing: "0.08em" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default CheckActionsSheet;
