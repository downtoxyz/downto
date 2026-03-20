"use client";

import React, { useState, useEffect } from "react";
import * as db from "@/lib/db";
import { font, color } from "@/lib/styles";

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
    <div ref={pollMessageRef} style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
      <div style={{
        background: color.card,
        border: `1px solid ${color.borderMid}`,
        borderRadius: 14,
        padding: 16,
        maxWidth: 300,
        width: '100%',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 16 }}>📊</span>
          <span style={{ fontFamily: font.serif, fontSize: 16, color: color.text }}>{poll.question}</span>
        </div>
        <div style={{ fontFamily: font.mono, fontSize: 10, color: color.faint, marginBottom: 10 }}>
          {poll.multiSelect ? 'Select all that apply' : 'Pick one'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                style={{
                  position: 'relative',
                  border: isMyVote ? 'none' : `1px solid ${color.borderMid}`,
                  background: isMyVote ? color.accent : 'transparent',
                  borderRadius: 10,
                  padding: '8px 12px',
                  cursor: canVote ? 'pointer' : 'default',
                  overflow: 'hidden',
                }}
              >
                {totalVoters > 0 && (
                  <div style={{
                    position: 'absolute',
                    left: 0, top: 0, bottom: 0,
                    width: `${pct}%`,
                    background: isMyVote ? 'rgba(0,0,0,0.1)' : `${color.accent}15`,
                    borderRadius: 10,
                    transition: 'width 0.3s ease',
                  }} />
                )}
                <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{
                    fontFamily: font.mono,
                    fontSize: 12,
                    color: isMyVote ? '#000' : color.text,
                    fontWeight: isMyVote ? 700 : 400,
                  }}>{opt}</span>
                  {totalVoters > 0 && (
                    <span style={{
                      fontFamily: font.mono,
                      fontSize: 10,
                      color: isMyVote ? '#000' : color.dim,
                      fontWeight: 700,
                    }}>{pct}%</span>
                  )}
                </div>
                {count > 0 && (
                  <div style={{
                    position: 'relative',
                    fontFamily: font.mono,
                    fontSize: 10,
                    color: isMyVote ? 'rgba(0,0,0,0.6)' : color.faint,
                    marginTop: 2,
                  }}>
                    {votersForOption.map((v) => v.userId === userId ? 'You' : v.displayName).join(', ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <span style={{ fontFamily: font.mono, fontSize: 10, color: color.faint }}>
            {totalVoters} vote{totalVoters !== 1 ? 's' : ''}{isClosed ? ' · closed' : ''}
          </span>
          {isCreator && !isClosed && (
            <button
              onClick={handleClose}
              style={{
                background: 'transparent',
                border: `1px solid ${color.borderMid}`,
                borderRadius: 8,
                padding: '4px 10px',
                fontFamily: font.mono,
                fontSize: 10,
                fontWeight: 700,
                color: color.dim,
                cursor: 'pointer',
              }}
            >
              CLOSE POLL
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
