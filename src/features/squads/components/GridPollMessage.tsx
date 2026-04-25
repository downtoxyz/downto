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
  // Squad members (excluding waitlist). Used by the closed-results view to
  // compute who responded vs who hasn't. Optional so legacy callers don't
  // break — without it, we just show responder count without the "didn't
  // respond" annotation.
  squadMembers?: { userId: string; displayName: string }[];
  // Caller decides how a cell toggle / clear-mine is persisted. For legacy
  // 'availability' polls this hits squad_poll_availability; for 'when' polls
  // with availability style it maps the cell to a slot's option index and votes.
  onToggleCell: (dayOffset: number, slotIndex: number) => Promise<void>;
  onClearMine: () => Promise<void>;
  // Optional: when present, the closed-results view shows a "propose this"
  // button on each best-time row that hands the date+start-time to the
  // existing squad date proposal flow. Caller wires up the actual API call.
  onProposeDate?: (date: string, time: string) => Promise<void>;
}

function formatSlotLabel(hourStart: number, slotIndex: number, slotMinutes: number): string {
  const totalMin = hourStart * 60 + slotIndex * slotMinutes;
  const h24 = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const ampm = h24 >= 12 ? 'pm' : 'am';
  const h12 = ((h24 + 11) % 12) + 1;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
}

function formatDayHeader(dateIso: string, compact: boolean): { top: string; bottom: string; title: string } {
  const d = new Date(dateIso + 'T00:00:00');
  const title = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (compact) {
    return {
      top: d.toLocaleDateString('en-US', { weekday: 'narrow' }),
      bottom: String(d.getDate()),
      title,
    };
  }
  return {
    top: d.toLocaleDateString('en-US', { weekday: 'short' }),
    bottom: d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
    title,
  };
}

function formatFullDayLabel(dateIso: string): string {
  const d = new Date(dateIso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

interface SlotGroup {
  dayOffset: number;
  startSlot: number;
  endSlot: number; // inclusive
  userIds: string[]; // sorted
}

// Group runs of consecutive slots within the same day where the available user
// set is identical. Turns a 12-tile "5pm-10:30pm 2/2" stripe into one row.
function groupConsecutiveSlots(
  cellUsers: Map<string, Set<string>>,
  days: number,
  slotsPerDay: number,
): SlotGroup[] {
  const out: SlotGroup[] = [];
  for (let d = 0; d < days; d++) {
    let i = 0;
    while (i < slotsPerDay) {
      const users = cellUsers.get(`${d}|${i}`);
      if (!users || users.size === 0) { i++; continue; }
      const sorted = [...users].sort();
      const sig = sorted.join(',');
      let j = i;
      while (j + 1 < slotsPerDay) {
        const next = cellUsers.get(`${d}|${j + 1}`);
        if (!next || next.size === 0) break;
        if ([...next].sort().join(',') !== sig) break;
        j++;
      }
      out.push({ dayOffset: d, startSlot: i, endSlot: j, userIds: sorted });
      i = j + 1;
    }
  }
  return out;
}

export default function GridPollMessage({
  poll,
  availability,
  userId,
  isWaitlisted,
  pollMessageRef,
  onPollClosed,
  squadMembers,
  onToggleCell,
  onClearMine,
  onProposeDate,
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

  const handleReopen = () => {
    db.reopenPoll(poll.id).then(() => {
      setIsClosed(false);
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

  const grid = (
    <div
      ref={gridBodyRef}
      onPointerMove={handlePointerMove}
      className="select-none"
    >
      {/* Header row: day labels. Past 7 days the columns get too narrow
          for "Sat 4/25" — collapse to single-letter weekday + day number
          and stash the full date in title= so hover recovers it. */}
      <div className="flex">
        <div className="shrink-0 w-10" />
        {Array.from({ length: days }, (_, d) => {
          const h = formatDayHeader(poll.gridDates[d], days > 7);
          return (
            <div key={d} title={h.title} className="flex-1 min-w-0 text-center px-0.5 overflow-hidden">
              <div className="font-mono text-tiny text-dim leading-none truncate">{h.top}</div>
              <div className="font-mono text-tiny text-faint leading-tight truncate">{h.bottom}</div>
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
  );

  // Closed state: pivot from cramped heat-map grid to a ranked list of time
  // blocks. Consecutive slots with the same available user set collapse into a
  // single "5pm–10:30pm" row, so the eye can land on the answer without
  // counting tiles. Original grid is still available in a collapsed details.
  const closedSummary = isClosed ? (
    <ClosedResultsSummary
      poll={poll}
      cellUsers={cellUsers}
      userLabels={userLabels}
      totalUsers={totalUsers}
      days={days}
      slotsPerDay={slotsPerDay}
      userId={userId}
      squadMembers={squadMembers}
      onProposeDate={onProposeDate}
    />
  ) : null;

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

        {isClosed ? (
          <>
            {closedSummary}
            {totalUsers > 0 && (
              <details className="mt-3 group">
                <summary className="font-mono text-tiny uppercase tracking-wider text-dim cursor-pointer select-none px-1 list-none flex items-center gap-1">
                  <span className="group-open:rotate-90 transition-transform inline-block">▸</span>
                  full grid
                </summary>
                <div className="mt-2">{grid}</div>
              </details>
            )}
          </>
        ) : (
          /* Grid fits without horizontal scroll — cells flex to share width.
             touch-action: none on cells prevents iOS from scrolling/zooming mid-drag. */
          grid
        )}

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
            {isCreator && isClosed && (
              <button
                onClick={handleReopen}
                className="bg-transparent border border-border-mid rounded-lg font-mono text-tiny font-bold text-dim cursor-pointer"
                style={{ padding: '4px 10px' }}
              >
                REOPEN POLL
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ClosedResultsSummaryProps {
  poll: GridPoll;
  cellUsers: Map<string, Set<string>>;
  userLabels: Map<string, string>;
  totalUsers: number;
  days: number;
  slotsPerDay: number;
  userId: string | null;
  squadMembers?: { userId: string; displayName: string }[];
  onProposeDate?: (date: string, time: string) => Promise<void>;
}

// Format a list of names as "A", "A and B", "A, B and C", "A, B, C and D".
function joinNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function ProposeButton({ onClick }: { onClick: () => Promise<void> }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const handle = async () => {
    if (state !== 'idle') return;
    setState('busy');
    try {
      await onClick();
      setState('done');
    } catch {
      setState('idle');
    }
  };
  const label = state === 'idle' ? 'PROPOSE' : state === 'busy' ? '…' : 'PROPOSED';
  return (
    <button
      onClick={handle}
      disabled={state !== 'idle'}
      className={cn(
        "shrink-0 rounded-lg font-mono text-tiny font-bold tracking-wider px-3 py-1.5 cursor-pointer disabled:cursor-default",
        state === 'done'
          ? "bg-transparent border border-border-mid text-dim"
          : "bg-dt text-black border border-dt",
      )}
    >
      {label}
    </button>
  );
}

function ClosedResultsSummary({
  poll,
  cellUsers,
  userLabels,
  totalUsers,
  days,
  slotsPerDay,
  userId,
  squadMembers,
  onProposeDate,
}: ClosedResultsSummaryProps) {
  const groups = useMemo(
    () => groupConsecutiveSlots(cellUsers, days, slotsPerDay),
    [cellUsers, days, slotsPerDay],
  );

  // Responders: anyone who voted at least one cell. Non-responders: squad
  // members minus responders. We omit the current user from name lists when
  // they're the viewer ("you" reads weird in third-person summaries here).
  const responderIds = useMemo(() => {
    const ids = new Set<string>();
    for (const set of cellUsers.values()) for (const id of set) ids.add(id);
    return ids;
  }, [cellUsers]);

  const nameOf = (id: string): string => (id === userId ? 'you' : userLabels.get(id) ?? '?');

  const responderNames = [...responderIds].map(nameOf);
  const nonResponderNames =
    squadMembers
      ?.filter((m) => !responderIds.has(m.userId))
      .map((m) => (m.userId === userId ? 'you' : m.displayName)) ?? [];

  if (totalUsers === 0 || groups.length === 0) {
    return (
      <div className="font-mono text-xs text-dim text-center py-6 bg-deep border border-border rounded-lg">
        no responses
        {nonResponderNames.length > 0 && (
          <div className="mt-1 font-mono text-tiny text-faint">
            {joinNames(nonResponderNames)} {nonResponderNames.length === 1 ? "didn't respond" : "didn't respond"}
          </div>
        )}
      </div>
    );
  }

  // Best slots = max-overlap groups. We deliberately drop partial-overlap
  // groups from this summary — they're noise for "when can we meet". Anyone
  // who wants the full picture can expand "full grid" below.
  const maxCount = groups.reduce((m, g) => Math.max(m, g.userIds.length), 0);
  const best = groups
    .filter((g) => g.userIds.length === maxCount)
    .sort((a, b) => {
      if (a.dayOffset !== b.dayOffset) return a.dayOffset - b.dayOffset;
      return a.startSlot - b.startSlot;
    });

  const allRespondersOverlap = maxCount === responderIds.size;

  const headerLine: string = allRespondersOverlap
    ? `${joinNames(responderNames)} ${responderNames.length === 1 ? 'is' : 'are all'} free at:`
    : `most overlap — ${maxCount} of ${responderIds.size} responders:`;

  // When everyone-who-responded overlaps, the per-row name pill is redundant
  // (it's the same set every row). When it's a partial overlap, name pill
  // tells the user *which* subset is in for that block.
  const renderRow = (g: SlotGroup) => {
    const isoDate = poll.gridDates[g.dayOffset];
    const date = formatFullDayLabel(isoDate);
    const startTime = formatSlotLabel(poll.gridHourStart, g.startSlot, poll.gridSlotMinutes);
    const end = formatSlotLabel(poll.gridHourStart, g.endSlot + 1, poll.gridSlotMinutes);
    const range = g.startSlot === g.endSlot ? startTime : `${startTime}–${end}`;
    const showNames = !allRespondersOverlap;
    const names = g.userIds.map(nameOf);
    return (
      <div
        key={`${g.dayOffset}-${g.startSlot}`}
        className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border bg-[rgba(232,255,90,0.08)] border-[rgba(232,255,90,0.35)]"
      >
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="font-serif text-sm text-primary truncate">{date}</div>
          <div className="font-mono text-tiny text-dim">{range}</div>
          {showNames && (
            <span
              className="font-mono text-tiny text-primary truncate"
              title={names.join(', ')}
            >
              {joinNames(names)}
            </span>
          )}
        </div>
        {onProposeDate && (
          <ProposeButton
            onClick={() => onProposeDate(isoDate, startTime)}
          />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2.5">
      <div className="font-mono text-xs text-primary px-1 leading-snug">
        {headerLine}
      </div>
      <div className="space-y-1.5">{best.map(renderRow)}</div>
      {nonResponderNames.length > 0 && (
        <div className="font-mono text-tiny text-faint px-1">
          {joinNames(nonResponderNames)} didn&apos;t respond
        </div>
      )}
    </div>
  );
}
