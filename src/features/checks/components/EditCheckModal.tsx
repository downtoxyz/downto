"use client";

import { useState, useEffect, useRef } from "react";
import { font, color } from "@/lib/styles";
import { parseNaturalDate, parseNaturalTime, parseDateToISO } from "@/lib/utils";
import type { InterestCheck } from "@/lib/ui-types";
import { useModalTransition } from "@/shared/hooks/useModalTransition";

const EditCheckModal = ({
  check,
  open,
  onClose,
  onSave,
  friends,
  onTagFriend,
  onRemoveTag,
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
    location?: string | null;
    taggedFriendIds?: string[];
  }) => void;
  friends?: { id: string; name: string; avatar: string }[];
  onTagFriend?: (checkId: string, friendId: string) => Promise<void>;
  onRemoveTag?: (checkId: string, userId: string) => Promise<void>;
}) => {
  const [text, setText] = useState("");
  const [whenInput, setWhenInput] = useState("");
  const [whereInput, setWhereInput] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIdx, setMentionIdx] = useState(-1);
  const { visible, entering, closing, close } = useModalTransition(open, onClose);
  const touchStartY = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    if (check && open) {
      setText(check.text);
      // Combine existing date + time into the when input
      const parts: string[] = [];
      if (check.eventDateLabel || check.eventDate) parts.push(check.eventDateLabel || check.eventDate!);
      if (check.eventTime) parts.push(check.eventTime);
      setWhenInput(parts.join(" "));
      setWhereInput(check.location || "");
      setMentionQuery(null);
      setMentionIdx(-1);
    }
  }, [check, open]);

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

  if (!visible || !check) return null;

  const parsedDate = whenInput ? parseNaturalDate(whenInput) : null;
  const parsedTime = whenInput ? parseNaturalTime(whenInput) : null;
  const whenPreview = (() => {
    if (!parsedDate && !parsedTime) return null;
    const parts: string[] = [];
    if (parsedDate) parts.push(parsedDate.label);
    if (parsedTime) parts.push(parsedTime);
    return parts.join(" ");
  })();

  const handleSave = () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Extract @mentions → friend IDs for new tags
    const mentionNames = [...trimmed.matchAll(/@(\S+)/g)].map(m => m[1].toLowerCase());
    const taggedIds = (friends ?? [])
      .filter(f => mentionNames.some(m =>
        m === (f as { username?: string }).username?.toLowerCase() ||
        m === f.name.toLowerCase() ||
        m === f.name.split(' ')[0]?.toLowerCase()
      ))
      .map(f => f.id);
    const activeIds = new Set(
      (check.coAuthors ?? [])
        .filter(ca => ca.status === 'pending' || ca.status === 'accepted')
        .map(ca => ca.userId)
    );
    const newTagIds = taggedIds.filter(id => !activeIds.has(id));

    // Resolve date: parsed > existing
    const resolvedDateISO = parsedDate?.iso
      ?? (parseDateToISO(whenInput) || null)
      ?? check.eventDate
      ?? null;
    const resolvedDateLabel = parsedDate?.label
      ?? (resolvedDateISO ? whenInput.trim() : null)
      ?? check.eventDateLabel
      ?? null;
    const resolvedTime = parsedTime ?? check.eventTime ?? null;

    onSave({
      text: trimmed,
      eventDate: resolvedDateISO,
      eventDateLabel: resolvedDateLabel,
      eventTime: resolvedTime,
      dateFlexible: true,
      timeFlexible: true,
      location: whereInput.trim() || null,
      taggedFriendIds: newTagIds.length > 0 ? newTagIds : undefined,
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
          transition: closing ? "transform 0.2s ease-in" : (dragOffset === 0 ? "transform 0.2s ease-out" : "none"),
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
              ref={textareaRef}
              value={text}
              onChange={(e) => {
                const val = e.target.value.slice(0, 280);
                setText(val);
                const cursor = e.target.selectionStart ?? val.length;
                const before = val.slice(0, cursor);
                const atMatch = before.match(/@([^\s@]*)$/);
                if (atMatch) {
                  setMentionQuery(atMatch[1].toLowerCase());
                  setMentionIdx(before.length - atMatch[0].length);
                } else {
                  setMentionQuery(null);
                  setMentionIdx(-1);
                }
              }}
              onKeyDown={(e) => {
                if (mentionQuery !== null && e.key === "Escape") {
                  setMentionQuery(null);
                  setMentionIdx(-1);
                }
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
            {/* @mention autocomplete dropdown */}
            {mentionQuery !== null && friends && friends.length > 0 && (() => {
              const filtered = friends.filter(f => f.name.toLowerCase().includes(mentionQuery));
              if (filtered.length === 0) return null;
              return (
                <div style={{
                  background: color.deep, border: `1px solid ${color.borderMid}`,
                  borderRadius: 10, marginTop: 4, maxHeight: 140, overflowY: "auto",
                }}>
                  {filtered.slice(0, 6).map(f => (
                    <button
                      key={f.id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        const before = text.slice(0, mentionIdx);
                        const after = text.slice(mentionIdx + 1 + (mentionQuery?.length ?? 0));
                        setText(before + "@" + f.name + " " + after);
                        setMentionQuery(null);
                        setMentionIdx(-1);
                        textareaRef.current?.focus();
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        width: "100%", padding: "8px 12px",
                        background: "transparent", border: "none", cursor: "pointer",
                        borderBottom: `1px solid ${color.border}`,
                      }}
                    >
                      <div style={{
                        width: 24, height: 24, borderRadius: "50%",
                        background: color.borderLight, color: color.dim,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontFamily: font.mono, fontSize: 10, fontWeight: 700,
                      }}>
                        {f.avatar}
                      </div>
                      <span style={{ fontFamily: font.mono, fontSize: 12, color: color.text }}>{f.name}</span>
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* When / Where inputs — matching creation flow */}
          <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
            <input
              type="text"
              placeholder="when? (e.g. tmr 7pm)"
              value={whenInput}
              onChange={(e) => setWhenInput(e.target.value)}
              style={{
                flex: 1,
                minWidth: 0,
                padding: "10px 12px",
                background: color.deep,
                border: `1px solid ${color.borderMid}`,
                borderRadius: 10,
                fontFamily: font.mono,
                fontSize: 11,
                color: color.text,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <input
              type="text"
              placeholder="where?"
              value={whereInput}
              onChange={(e) => setWhereInput(e.target.value)}
              style={{
                flex: 0.6,
                minWidth: 0,
                padding: "10px 12px",
                background: color.deep,
                border: `1px solid ${color.borderMid}`,
                borderRadius: 10,
                fontFamily: font.mono,
                fontSize: 11,
                color: color.text,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
          {whenPreview && (
            <div style={{
              fontFamily: font.mono,
              fontSize: 10,
              color: color.dim,
              marginBottom: 8,
              paddingLeft: 2,
            }}>
              {whenPreview}
            </div>
          )}
          {!whenPreview && <div style={{ marginBottom: 8 }} />}
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
