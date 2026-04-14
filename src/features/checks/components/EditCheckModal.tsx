"use client";

import { useState, useEffect, useRef } from "react";
import { color } from "@/lib/styles";
import { parseNaturalDate, parseNaturalTime, parseDateToISO } from "@/lib/utils";
import type { InterestCheck } from "@/lib/ui-types";
import { useModalTransition } from "@/shared/hooks/useModalTransition";
import cn from "@/lib/tailwindMerge";

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
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <div
        onClick={close}
        className="absolute inset-0"
        style={{
          background: "rgba(0,0,0,0.7)",
          backdropFilter: (entering || closing) ? "blur(0px)" : "blur(8px)",
          WebkitBackdropFilter: (entering || closing) ? "blur(0px)" : "blur(8px)",
          opacity: (entering || closing) ? 0 : 1,
          transition: "opacity 0.3s ease, backdrop-filter 0.3s ease, -webkit-backdrop-filter 0.3s ease",
        }}
      />
      <div
        className="relative bg-surface rounded-t-3xl w-full max-w-[420px] pt-5 px-6 max-h-[80vh] flex flex-col"
        style={{
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
          <div className="w-10 h-1 bg-faint rounded-sm mx-auto mb-5" />
        </div>

        <div
          ref={scrollRef}
          onTouchStart={handleScrollTouchStart}
          onTouchMove={handleScrollTouchMove}
          onTouchEnd={handleScrollTouchEnd}
          className="overflow-y-auto overflow-x-hidden flex-1 pb-6"
        >
          {/* Title */}
          <h2 className="font-serif text-lg text-primary font-normal mb-5 mt-0">
            Edit check
          </h2>

          {/* Text */}
          <div className="mb-4">
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
              className="w-full bg-deep border border-border-mid rounded-xl py-3.5 px-4 text-primary font-mono text-sm outline-none resize-none leading-relaxed box-border"
            />
            {/* @mention autocomplete dropdown */}
            {mentionQuery !== null && friends && friends.length > 0 && (() => {
              const filtered = friends.filter(f => f.name.toLowerCase().includes(mentionQuery));
              if (filtered.length === 0) return null;
              return (
                <div className="bg-deep border border-border-mid rounded-lg mt-1 max-h-[140px] overflow-y-auto">
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
                      className="flex items-center gap-2 w-full py-2 px-3 bg-transparent border-none cursor-pointer border-b border-b-border"
                    >
                      <div className="w-6 h-6 rounded-full bg-border-light text-dim flex items-center justify-center font-mono text-tiny font-bold">
                        {f.avatar}
                      </div>
                      <span className="font-mono text-xs text-primary">{f.name}</span>
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* When / Where inputs — matching creation flow */}
          <div className="flex gap-2 mb-1">
            <input
              type="text"
              placeholder="when? (e.g. tmr 7pm)"
              value={whenInput}
              onChange={(e) => setWhenInput(e.target.value)}
              className="flex-1 min-w-0 py-2.5 px-3 bg-deep border border-border-mid rounded-lg font-mono text-xs text-primary outline-none box-border"
            />
            <input
              type="text"
              placeholder="where?"
              value={whereInput}
              onChange={(e) => setWhereInput(e.target.value)}
              className="min-w-0 py-2.5 px-3 bg-deep border border-border-mid rounded-lg font-mono text-xs text-primary outline-none box-border"
              style={{ flex: 0.6 }}
            />
          </div>
          {whenPreview && (
            <div className="font-mono text-tiny text-dim mb-2" style={{ paddingLeft: 2 }}>
              {whenPreview}
            </div>
          )}
          {!whenPreview && <div className="mb-2" />}
        </div>

        {/* Save button */}
        <div className="py-3 pb-6 shrink-0">
          <button
            onClick={handleSave}
            disabled={!text.trim()}
            className={cn(
              "w-full border-none rounded-xl py-3.5 font-mono text-xs font-bold cursor-pointer uppercase",
              text.trim()
                ? "bg-dt text-on-accent"
                : "bg-border-mid text-dim cursor-default"
            )}
            style={{ letterSpacing: "0.08em" }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditCheckModal;
