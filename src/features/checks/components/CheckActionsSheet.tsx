"use client";

import { useState, useEffect, useRef } from "react";
import { color } from "@/lib/styles";

export default function CheckActionsSheet({
  open,
  onClose,
  onEdit,
  onArchive,
  onDelete,
  onShare,
  hasSquad,
}: {
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onShare?: () => void;
  hasSquad: boolean;
}) {
  const touchStartY = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [closing, setClosing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isDragging = useRef(false);

  useEffect(() => {
    if (!open) {
      setConfirmDelete(false);
    }
  }, [open]);

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
    if (dragOffset > 60) {
      dismiss();
    } else {
      setDragOffset(0);
    }
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

  const actionRow = (label: string, icon: string, onClick: () => void, destructive?: boolean) => (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full bg-transparent border-none border-b border-border font-mono text-sm cursor-pointer text-left"
      style={{
        padding: "14px 0",
        color: destructive ? "#ff4444" : color.text,
        borderBottom: `1px solid ${color.border}`,
      }}
    >
      <span className="text-base w-6 text-center">{icon}</span>
      {label}
    </button>
  );

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={dismiss}
        className="fixed inset-0 z-[100]"
        style={{
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      />

      {/* Panel */}
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
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-faint rounded-sm" />
        </div>

        <div className="px-5 pb-5">
          <p className="font-serif text-lg text-primary font-normal mb-2 mt-0">
            Check actions
          </p>

          {actionRow("Edit", "✎", () => { onClose(); onEdit(); })}
          {onShare && actionRow("Share link", "🔗", () => { onClose(); onShare(); })}
          {actionRow("Archive", "📦", () => { onClose(); onArchive(); })}
          {!hasSquad && actionRow("Delete", "🗑", () => setConfirmDelete(true), true)}
        </div>
      </div>

      {/* Delete confirm dialog */}
      {confirmDelete && (
        <div
          onClick={() => setConfirmDelete(false)}
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.7)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-deep border border-border rounded-2xl max-w-[300px]"
            style={{ padding: "24px 20px" }}
          >
            <p className="font-serif text-lg text-primary font-normal mb-2 mt-0">
              Delete check?
            </p>
            <p className="font-mono text-xs text-dim mb-4 mt-0 leading-normal">
              This will permanently remove the check and all responses. This can&apos;t be undone.
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 p-3 bg-transparent border border-border-mid rounded-xl text-primary font-mono text-xs font-bold cursor-pointer uppercase"
                style={{ letterSpacing: "0.08em" }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirmDelete(false);
                  onClose();
                  onDelete();
                }}
                className="flex-1 p-3 bg-[#ff4444] border-none rounded-lg text-white font-mono text-xs font-bold cursor-pointer uppercase"
                style={{ letterSpacing: "0.08em" }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
