"use client";

import React, { useState, useEffect } from "react";
import * as db from "@/lib/db";
import { color } from "@/lib/styles";
import cn from "@/lib/tailwindMerge";

type DateOption = { date: string; time: string | null };
type WhenSlot = { date: string; startMin: number | null; endMin: number | null; label: string | null };

interface PollMessageProps {
  poll: {
    id: string; messageId: string; question: string;
    options: string[] | DateOption[] | WhenSlot[];
    status: string; createdBy: string; multiSelect: boolean;
    // 'availability' polls and 'when' polls with availability collection style
    // aren't rendered here (ChatMessage routes them to GridPollMessage), but the
    // type is widened so ChatMessage can pass the shared poll entry through
    // without narrowing.
    pollType?: 'text' | 'dates' | 'availability' | 'when';
    collectionStyle?: 'preference' | 'availability';
  };
  pollVotes: Array<{ userId: string; optionIndex: number; displayName: string }>;
  userId: string | null;
  isWaitlisted: boolean;
  pollMessageRef: React.RefObject<HTMLDivElement | null>;
  onPollClosed?: () => void;
}

function formatDateOption(o: DateOption): string {
  const d = new Date(o.date + 'T00:00:00');
  const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
  return o.time ? `${dayLabel} · ${o.time}` : dayLabel;
}

function formatMinuteOfDay(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h24 >= 12 ? 'pm' : 'am';
  const h12 = ((h24 + 11) % 12) + 1;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
}

function formatWhenSlot(s: WhenSlot): string {
  const d = new Date(s.date + 'T00:00:00');
  const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
  // Display priority: explicit label → concrete time range → day-only.
  if (s.label) return `${dayLabel} · ${s.label}`;
  if (s.startMin !== null && s.endMin !== null) {
    return `${dayLabel} · ${formatMinuteOfDay(s.startMin)}–${formatMinuteOfDay(s.endMin)}`;
  }
  if (s.startMin !== null) return `${dayLabel} · ${formatMinuteOfDay(s.startMin)}`;
  return dayLabel;
}

export default function PollMessage({
  poll,
  pollVotes,
  userId,
  isWaitlisted,
  pollMessageRef,
  onPollClosed,
}: PollMessageProps) {
  const [votes, setVotes] = useState(pollVotes);
  const [isClosed, setIsClosed] = useState(poll.status === 'closed');

  useEffect(() => {
    setVotes(pollVotes);
  }, [pollVotes]);

  const handleVote = (optionIndex: number) => {
    if (!userId) return;
    setVotes((prev) => {
      const isMyVote = prev.some((v) => v.userId === userId && v.optionIndex === optionIndex);
      if (isMyVote) return prev.filter((v) => !(v.userId === userId && v.optionIndex === optionIndex));
      if (poll.multiSelect) return [...prev, { userId, optionIndex, displayName: 'You' }];
      return [...prev.filter((v) => v.userId !== userId), { userId, optionIndex, displayName: 'You' }];
    });
    db.votePoll(poll.id, optionIndex).catch(() => {});
  };

  const handleClose = () => {
    db.closePoll(poll.id).then(() => {
      setIsClosed(true);
      onPollClosed?.();
    }).catch(() => {});
  };

  const uniqueVoters = new Set(votes.map((v) => v.userId));
  const totalVoters = uniqueVoters.size;
  const myVotes = userId ? new Set(votes.filter((v) => v.userId === userId).map((v) => v.optionIndex)) : new Set<number>();
  const isCreator = userId === poll.createdBy;

  const isDatesPoll = poll.pollType === 'dates';
  const isWhenPoll = poll.pollType === 'when';
  // Render in chronological order for date-like polls; vote lookups use the
  // option's original index so sorting doesn't break tallies.
  const renderOrder: Array<{ origIndex: number; label: string }> = isDatesPoll
    ? (poll.options as DateOption[])
        .map((o, i) => ({ origIndex: i, o }))
        .sort((a, b) => {
          if (a.o.date !== b.o.date) return a.o.date < b.o.date ? -1 : 1;
          return (a.o.time ?? '').localeCompare(b.o.time ?? '');
        })
        .map(({ origIndex, o }) => ({ origIndex, label: formatDateOption(o) }))
    : isWhenPoll
    ? (poll.options as WhenSlot[])
        .map((s, i) => ({ origIndex: i, s }))
        .sort((a, b) => {
          if (a.s.date !== b.s.date) return a.s.date < b.s.date ? -1 : 1;
          const aStart = a.s.startMin ?? -1;
          const bStart = b.s.startMin ?? -1;
          return aStart - bStart;
        })
        .map(({ origIndex, s }) => ({ origIndex, label: formatWhenSlot(s) }))
    : (poll.options as string[]).map((label, i) => ({ origIndex: i, label }));

  return (
    <div ref={pollMessageRef} className="flex justify-center py-2">
      <div className="bg-card border border-border-mid rounded-xl p-4 max-w-[300px] w-full">
        <div className="flex items-center gap-1.5 mb-1">
          <svg width="18" height="18" viewBox="0 0 256 256" fill="currentColor"><path d="M224,200h-8V40a8,8,0,0,0-8-8H152a8,8,0,0,0-8,8V80H96a8,8,0,0,0-8,8v40H48a8,8,0,0,0-8,8v64H32a8,8,0,0,1,0-16H224a8,8,0,0,1,0,16ZM160,48h40V200H160ZM104,96h40V200H104ZM56,144H88v56H56Z"/></svg>
          <span className="font-serif text-base text-primary">{poll.question}</span>
        </div>
        <div className="font-mono text-tiny text-faint mb-2.5">
          {isDatesPoll || isWhenPoll ? 'tap every time that works' : poll.multiSelect ? 'Select all that apply' : 'Pick one'}
        </div>
        <div className="flex flex-col gap-1.5">
          {renderOrder.map(({ origIndex: oi, label }) => {
            const isMyVote = myVotes.has(oi);
            const votersForOption = votes.filter((v) => v.optionIndex === oi);
            const count = votersForOption.length;
            const pct = totalVoters > 0 ? Math.round((count / totalVoters) * 100) : 0;
            const canVote = !isClosed && !isWaitlisted;
            return (
              <div
                key={oi}
                onClick={canVote ? () => handleVote(oi) : undefined}
                className={cn(
                  "relative rounded-lg overflow-hidden",
                  isMyVote ? "bg-dt border-none" : "bg-transparent border border-border-mid",
                  canVote ? "cursor-pointer" : "cursor-default"
                )}
                style={{ padding: '8px 12px' }}
              >
                {totalVoters > 0 && (
                  <div
                    className="absolute left-0 top-0 bottom-0 rounded-lg transition-[width] duration-300 ease-in-out"
                    style={{
                      width: `${pct}%`,
                      background: isMyVote ? 'rgba(0,0,0,0.1)' : `${color.accent}15`,
                    }}
                  />
                )}
                <div className="relative flex justify-between items-center">
                  <span className={cn(
                    "font-mono text-xs",
                    isMyVote ? "text-black font-bold" : "text-primary font-normal"
                  )}>{label}</span>
                  {totalVoters > 0 && (
                    <span className={cn(
                      "font-mono text-tiny font-bold",
                      isMyVote ? "text-black" : "text-dim"
                    )}>{pct}%</span>
                  )}
                </div>
                {count > 0 && (
                  <div
                    className="relative font-mono text-tiny mt-0.5"
                    style={{ color: isMyVote ? 'rgba(0,0,0,0.6)' : color.faint }}
                  >
                    {votersForOption.map((v) => v.userId === userId ? 'You' : v.displayName).join(', ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-between items-center mt-2.5">
          <span className="font-mono text-tiny text-faint">
            {totalVoters} vote{totalVoters !== 1 ? 's' : ''}{isClosed ? ' · closed' : ''}
          </span>
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
  );
}
