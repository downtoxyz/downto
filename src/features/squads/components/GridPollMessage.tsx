"use client";

import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import * as db from "@/lib/db";
import cn from "@/lib/tailwindMerge";

export interface GridPoll {
  id: string;
  messageId: string;
  question: string;
  status: string;
  createdBy: string;
  gridDates: string[];      // YYYY-MM-DD, sorted, may be non-contiguous
  gridHourStart: number;    // 0..23
  gridHourEnd: number;      // 1..24, exclusive
  gridSlotMinutes: 30 | 60;
}

export interface AvailabilityCell {
  userId: string;
  dayOffset: number;
  slotIndex: number;
  displayName: string;
}

interface GridPollMessageProps {
  poll: GridPoll;
  availability: AvailabilityCell[];
  userId: string | null;
  isWaitlisted: boolean;
  pollMessageRef: React.RefObject<HTMLDivElement | null>;
  onPollClosed?: (pollId: string) => void;
  // Caller decides how a cell toggle / clear-mine is persisted. For legacy
  // 'availability' polls this hits squad_poll_availability; for 'when' polls
  // with availability style it maps the cell to a slot's option index and votes.
  onToggleCell: (dayOffset: number, slotIndex: number) => Promise<void>;
  onClearMine: () => Promise<void>;
}

function formatSlotLabel(hourStart: number, slotIndex: number, slotMinutes: number): string {
  const totalMin = hourStart * 60 + slotIndex * slotMinutes;
  const h24 = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const ampm = h24 >= 12 ? 'pm' : 'am';
  const h12 = ((h24 + 11) % 12) + 1;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
}

function formatDayHeader(dateIso: string): { top: string; bottom: string } {
  const d = new Date(dateIso + 'T00:00:00');
  return {
    top: d.toLocaleDateString('en-US', { weekday: 'short' }),
    bottom: d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
  };
}

export default function GridPollMessage({
  poll,
  availability,
  userId,
  isWaitlisted,
  pollMessageRef,
  onPollClosed,
  onToggleCell,
  onClearMine,
}: GridPollMessageProps) {
  const [local, setLocal] = useState<AvailabilityCell[]>(availability);
  const [isClosed, setIsClosed] = useState(poll.status === 'closed');

  useEffect(() => { setLocal(availability); }, [availability]);

  const days = poll.gridDates.length;

  const slotsPerDay = useMemo(() => {
    return Math.ceil(((poll.gridHourEnd - poll.gridHourStart) * 60) / poll.gridSlotMinutes);
  }, [poll.gridHourStart, poll.gridHourEnd, poll.gridSlotMinutes]);

  // Index for fast lookup: "day|slot" -> Set<userId>
  const cellUsers = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const c of local) {
      const k = `${c.dayOffset}|${c.slotIndex}`;
      let s = map.get(k);
      if (!s) { s = new Set(); map.set(k, s); }
      s.add(c.userId);
    }
    return map;
  }, [local]);

  const userLabels = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of local) m.set(c.userId, c.displayName);
    return m;
  }, [local]);
  const totalUsers = userLabels.size;

  const isCreator = userId === poll.createdBy;
  const canTap = !isClosed && !isWaitlisted && !!userId;

  // Paint-drag state. A single tap is just a drag that touched one cell, so the
  // same path handles both. `dragMode` is captured from the *starting* cell's
  // current yourness: empty → fill, yours → erase. Touched cells are tracked so
  // re-entering a cell during the same drag doesn't re-toggle it.
  const dragModeRef = useRef<'fill' | 'erase' | null>(null);
  const touchedRef = useRef<Set<string>>(new Set());
  const gridBodyRef = useRef<HTMLDivElement>(null);
  const cellUsersRef = useRef(cellUsers);
  cellUsersRef.current = cellUsers;

  const applyCell = useCallback((dayOffset: number, slotIndex: number, mode: 'fill' | 'erase') => {
    if (!userId) return;
    const key = `${dayOffset}|${slotIndex}`;
    const currentUsers = cellUsersRef.current.get(key);
    const yours = currentUsers?.has(userId) ?? false;
    if (mode === 'fill' && yours) return;
    if (mode === 'erase' && !yours) return;

    // Optimistic: flip the cell immediately.
    setLocal((prev) => {
      if (mode === 'fill') {
        return [...prev, { userId, dayOffset, slotIndex, displayName: 'You' }];
      }
      return prev.filter((c) => !(c.userId === userId && c.dayOffset === dayOffset && c.slotIndex === slotIndex));
    });

    onToggleCell(dayOffset, slotIndex).catch(() => {
      // Revert optimistic change on failure by restoring from the server snapshot.
      setLocal(availability);
    });
  }, [userId, availability, onToggleCell]);

  const cellFromEvent = (clientX: number, clientY: number): { d: number; s: number } | null => {
    const el = document.elementFromPoint(clientX, clientY);
    if (!(el instanceof HTMLElement)) return null;
    const d = el.dataset.day;
    const s = el.dataset.slot;
    if (d === undefined || s === undefined) return null;
    return { d: Number(d), s: Number(s) };
  };

  const endDrag = useCallback(() => {
    dragModeRef.current = null;
    touchedRef.current.clear();
  }, []);

  // End drag on release anywhere in the window — the user may lift off outside the grid.
  useEffect(() => {
    if (!canTap) return;
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    return () => {
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    };
  }, [canTap, endDrag]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, d: number, s: number) => {
    if (!canTap) return;
    e.preventDefault();
    const key = `${d}|${s}`;
    const users = cellUsersRef.current.get(key);
    const yours = !!userId && !!users?.has(userId);
    const mode: 'fill' | 'erase' = yours ? 'erase' : 'fill';
    dragModeRef.current = mode;
    touchedRef.current = new Set([key]);
    applyCell(d, s, mode);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const mode = dragModeRef.current;
    if (!mode) return;
    // e.pressure==0 covers some edge cases where drag ends without pointerup
    if (e.buttons === 0 && e.pointerType === 'mouse') { endDrag(); return; }
    e.preventDefault();
    const cell = cellFromEvent(e.clientX, e.clientY);
    if (!cell) return;
    const key = `${cell.d}|${cell.s}`;
    if (touchedRef.current.has(key)) return;
    touchedRef.current.add(key);
    applyCell(cell.d, cell.s, mode);
  };

  const handleClose = () => {
    db.closePoll(poll.id).then(() => {
      setIsClosed(true);
      onPollClosed?.(poll.id);
    }).catch(() => {});
  };

  const densityBg = (count: number, yours: boolean): string => {
    if (yours) return 'bg-dt';
    if (count === 0 || totalUsers === 0) return 'bg-deep';
    const frac = count / totalUsers;
    if (frac >= 0.8) return 'bg-[rgba(232,255,90,0.65)]';
    if (frac >= 0.6) return 'bg-[rgba(232,255,90,0.45)]';
    if (frac >= 0.4) return 'bg-[rgba(232,255,90,0.3)]';
    if (frac >= 0.2) return 'bg-[rgba(232,255,90,0.18)]';
    return 'bg-[rgba(232,255,90,0.08)]';
  };

  return (
    <div ref={pollMessageRef} className="flex justify-center py-2">
      <div className="bg-card border border-border-mid rounded-xl p-3 max-w-full w-full">
        <div className="flex items-center gap-1.5 mb-1 px-1">
          <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32Zm0,176H48V80H208Z"/></svg>
          <span className="font-serif text-base text-primary">{poll.question}</span>
        </div>
        <div className="font-mono text-tiny text-faint mb-2 px-1">
          {canTap ? "tap or drag to paint the times you're free" : isClosed ? "poll closed" : "read only"}
        </div>

        {/* Grid fits without horizontal scroll — cells flex to share width.
            touch-action: none on cells prevents iOS from scrolling/zooming mid-drag. */}
        <div
          ref={gridBodyRef}
          onPointerMove={handlePointerMove}
          className="select-none"
        >
          {/* Header row: day labels */}
          <div className="flex">
            <div className="shrink-0 w-10" />
            {Array.from({ length: days }, (_, d) => {
              const h = formatDayHeader(poll.gridDates[d]);
              return (
                <div key={d} className="flex-1 min-w-0 text-center px-0.5">
                  <div className="font-mono text-tiny text-dim leading-none">{h.top}</div>
                  <div className="font-mono text-tiny text-faint leading-tight">{h.bottom}</div>
                </div>
              );
            })}
          </div>
          {/* Slot rows */}
          {Array.from({ length: slotsPerDay }, (_, s) => (
            <div key={s} className="flex items-stretch">
              <div className="shrink-0 w-10 flex items-center justify-end pr-1">
                <span className="font-mono text-tiny text-faint">
                  {formatSlotLabel(poll.gridHourStart, s, poll.gridSlotMinutes)}
                </span>
              </div>
              {Array.from({ length: days }, (_, d) => {
                const k = `${d}|${s}`;
                const users = cellUsers.get(k);
                const count = users?.size ?? 0;
                const yours = !!userId && !!users?.has(userId);
                const title = users && users.size > 0
                  ? Array.from(users).map((uid) => uid === userId ? 'You' : userLabels.get(uid) ?? 'Unknown').join(', ')
                  : '';
                return (
                  <div
                    key={d}
                    data-day={d}
                    data-slot={s}
                    onPointerDown={(e) => handlePointerDown(e, d, s)}
                    title={title}
                    style={{ touchAction: 'none' }}
                    className={cn(
                      "flex-1 min-w-0 h-7 border border-border",
                      densityBg(count, yours),
                      canTap ? "cursor-pointer" : "cursor-default",
                    )}
                  />
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center mt-2.5 px-1 gap-2">
          <span className="font-mono text-tiny text-faint">
            {totalUsers} {totalUsers === 1 ? 'person' : 'people'}{isClosed ? ' · closed' : ''}
          </span>
          <div className="flex items-center gap-1.5">
            {canTap && userId && local.some((c) => c.userId === userId) && (
              <button
                onClick={() => {
                  if (!userId) return;
                  setLocal((prev) => prev.filter((c) => c.userId !== userId));
                  onClearMine().catch(() => setLocal(availability));
                }}
                className="bg-transparent border border-border-mid rounded-lg font-mono text-tiny font-bold text-dim cursor-pointer"
                style={{ padding: '4px 10px' }}
              >
                CLEAR MINE
              </button>
            )}
            {isCreator && !isClosed && (
              <button
                onClick={handleClose}
                className="bg-transparent border border-border-mid rounded-lg font-mono text-tiny font-bold text-dim cursor-pointer"
                style={{ padding: '4px 10px' }}
              >
                CLOSE POLL
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
