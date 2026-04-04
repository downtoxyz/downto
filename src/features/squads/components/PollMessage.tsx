"use client";

import React, { useState, useEffect } from "react";
import * as db from "@/lib/db";
import { color } from "@/lib/styles";
import cn from "@/lib/tailwindMerge";

interface PollMessageProps {
  poll: {
    id: string; messageId: string; question: string;
    options: string[]; status: string; createdBy: string; multiSelect: boolean;
  };
  pollVotes: Array<{ userId: string; optionIndex: number; displayName: string }>;
  userId: string | null;
  isWaitlisted: boolean;
  pollMessageRef: React.RefObject<HTMLDivElement | null>;
  onPollClosed?: () => void;
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

  return (
    <div ref={pollMessageRef} className="flex justify-center py-2">
      <div className="bg-card border border-border-mid rounded-xl p-4 max-w-[300px] w-full">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-base">📊</span>
          <span className="font-serif text-base text-primary">{poll.question}</span>
        </div>
        <div className="font-mono text-tiny text-faint mb-2.5">
          {poll.multiSelect ? 'Select all that apply' : 'Pick one'}
        </div>
        <div className="flex flex-col gap-1.5">
          {poll.options.map((opt, oi) => {
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
                  )}>{opt}</span>
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
