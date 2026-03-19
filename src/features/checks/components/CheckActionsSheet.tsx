"use client";

import { useState, useEffect, useRef } from "react";
import { font, color } from "@/lib/styles";

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
        color: destructive ? "#ff4444" : color.text,
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
      {/* Backdrop */}
      <div
        onClick={dismiss}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          zIndex: 100,
        }}
      />

      {/* Panel */}
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
        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 8px" }}>
          <div style={{ width: 40, height: 4, background: color.faint, borderRadius: 2 }} />
        </div>

        <div style={{ padding: "0 20px 20px" }}>
          <p style={{
            fontFamily: font.serif,
            fontSize: 18,
            color: color.text,
            margin: "0 0 8px",
            fontWeight: 400,
          }}>
            Check actions
          </p>

          {actionRow("Edit", "✎", () => { onClose(); onEdit(); })}
          {onShare && actionRow("Share link", "🔗", () => { onClose(); onShare(); })}
          {onShare && (
            <p style={{
              fontFamily: font.mono,
              fontSize: 10,
              color: color.faint,
              margin: "0 0 4px",
              padding: "0 0 10px",
              borderBottom: `1px solid ${color.border}`,
              lineHeight: 1.5,
            }}>
              linked to you — new users will be prompted to add you
            </p>
          )}
          {actionRow("Archive", "📦", () => { onClose(); onArchive(); })}
          {!hasSquad && actionRow("Delete", "🗑", () => setConfirmDelete(true), true)}
        </div>
      </div>

      {/* Delete confirm dialog */}
      {confirmDelete && (
        <div
          onClick={() => setConfirmDelete(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: color.deep,
              border: `1px solid ${color.border}`,
              borderRadius: 16,
              maxWidth: 300,
              padding: "24px 20px",
            }}
          >
            <p style={{
              fontFamily: font.serif,
              fontSize: 18,
              color: color.text,
              margin: "0 0 8px",
              fontWeight: 400,
            }}>
              Delete check?
            </p>
            <p style={{
              fontFamily: font.mono,
              fontSize: 11,
              color: color.dim,
              margin: "0 0 16px",
              lineHeight: 1.5,
            }}>
              This will permanently remove the check and all responses. This can&apos;t be undone.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{
                  flex: 1,
                  padding: 12,
                  background: "transparent",
                  border: `1px solid ${color.borderMid}`,
                  borderRadius: 12,
                  color: color.text,
                  fontFamily: font.mono,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirmDelete(false);
                  onClose();
                  onDelete();
                }}
                style={{
                  flex: 1,
                  padding: 12,
                  background: "#ff4444",
                  border: "none",
                  borderRadius: 10,
                  color: "#fff",
                  fontFamily: font.mono,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
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
