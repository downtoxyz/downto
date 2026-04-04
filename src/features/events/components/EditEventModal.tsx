"use client";

import { useState, useEffect, useRef } from "react";
import { color } from "@/lib/styles";
import { parseNaturalDate, parseNaturalTime, parseDateToISO } from "@/lib/utils";
import { useModalTransition } from "@/shared/hooks/useModalTransition";
import cn from "@/lib/tailwindMerge";
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
  onSave: (updated: { title: string; venue: string; date: string; time: string; vibe: string[]; note: string }) => void;
}) => {
  const [title, setTitle] = useState("");
  const [venue, setVenue] = useState("");
  const [whenInput, setWhenInput] = useState("");
  const [vibeText, setVibeText] = useState("");
  const [note, setNote] = useState("");
  const { visible, entering, closing, close } = useModalTransition(open, onClose);
  const touchStartY = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    if (event && open) {
      setTitle(event.title);
      setVenue(event.venue && event.venue !== "TBD" ? event.venue : "");
      // Combine date + time into the when input
      const parts: string[] = [];
      if (event.date) parts.push(event.date);
      if (event.time && event.time !== "TBD") parts.push(event.time);
      setWhenInput(parts.join(" "));
      setVibeText(event.vibe.join(", "));
      setNote(event.note || "");
    }
  }, [event, open]);

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

  const parsedDate = whenInput ? parseNaturalDate(whenInput) : null;
  const parsedTime = whenInput ? parseNaturalTime(whenInput) : null;
  const whenPreview = (() => {
    if (!parsedDate && !parsedTime) return null;
    const parts: string[] = [];
    if (parsedDate) parts.push(parsedDate.label);
    if (parsedTime) parts.push(parsedTime);
    return parts.join(" ");
  })();

  // Resolve date/time for save: try parsing, fall back to raw input
  const resolvedDate = (parsedDate?.label
    ?? (parseDateToISO(whenInput) ? whenInput : null)
    ?? whenInput.trim())
    || event.date;
  const resolvedTime = parsedTime ?? event.time;

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
        className="relative bg-surface rounded-t-3xl w-full max-w-[420px] px-6 pt-5 pb-0 max-h-[80vh] flex flex-col"
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
          <h3 className="font-serif text-2xl text-primary mb-5 font-normal">
            Edit event
          </h3>

          <div className="flex flex-col gap-3.5">
            <div>
              <div className="font-mono text-tiny uppercase text-dim mb-1.5" style={{ letterSpacing: "0.15em" }}>Title</div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Event name"
                className="bg-deep border border-border-mid rounded-lg py-3 px-3.5 text-primary font-mono text-sm outline-none w-full box-border"
              />
            </div>

            {/* When / Where — matching creation flow */}
            <div className="flex gap-2">
              <div className="flex-1">
                <div className="font-mono text-tiny uppercase text-dim mb-1.5" style={{ letterSpacing: "0.15em" }}>When</div>
                <input
                  type="text"
                  placeholder="e.g. fri 9pm"
                  value={whenInput}
                  onChange={(e) => setWhenInput(e.target.value)}
                  className="bg-deep border border-border-mid rounded-lg py-3 px-3.5 text-primary font-mono text-sm outline-none w-full box-border"
                />
              </div>
              <div style={{ flex: 0.6 }}>
                <div className="font-mono text-tiny uppercase text-dim mb-1.5" style={{ letterSpacing: "0.15em" }}>Where</div>
                <input
                  type="text"
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  placeholder="Venue"
                  className="bg-deep border border-border-mid rounded-lg py-3 px-3.5 text-primary font-mono text-sm outline-none w-full box-border"
                />
              </div>
            </div>
            {whenPreview && (
              <div className="font-mono text-tiny text-dim -mt-2 pl-0.5">
                {whenPreview}
              </div>
            )}

            <div>
              <div className="font-mono text-tiny uppercase text-dim mb-1.5" style={{ letterSpacing: "0.15em" }}>Vibes (comma-separated)</div>
              <input
                type="text"
                value={vibeText}
                onChange={(e) => setVibeText(e.target.value)}
                placeholder="e.g. techno, late night"
                className="bg-deep border border-border-mid rounded-lg py-3 px-3.5 text-primary font-mono text-sm outline-none w-full box-border"
              />
            </div>
            {event?.isPublic && (
              <div>
                <div className="font-mono text-tiny uppercase text-dim mb-1.5" style={{ letterSpacing: "0.15em" }}>Note</div>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. DJ set starts at midnight"
                  maxLength={200}
                  className="bg-deep border border-border-mid rounded-lg py-3 px-3.5 text-primary font-mono text-sm outline-none w-full box-border"
                />
              </div>
            )}
          </div>

          {/* Save button */}
          <div className="pt-5 shrink-0">
            <button
              onClick={() => {
                const vibes = vibeText.split(",").map((v) => v.trim()).filter(Boolean);
                onSave({ title, venue, date: resolvedDate, time: resolvedTime, vibe: vibes, note: note.trim() });
              }}
              disabled={!title.trim()}
              className={cn(
                "w-full border-none rounded-xl py-3.5 font-mono text-xs font-bold uppercase",
                title.trim()
                  ? "bg-dt text-black cursor-pointer opacity-100"
                  : "bg-border-mid text-dim cursor-not-allowed opacity-50"
              )}
              style={{ letterSpacing: "0.08em" }}
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditEventModal;
