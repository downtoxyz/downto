"use client";

import React from "react";
import { font, color } from "@/lib/styles";
import PollMessage from "./PollMessage";

const URL_RE = /(https?:\/\/[^\s<]+)/;

const linkify = (text: string, isDark: boolean): React.ReactNode => {
  const parts = text.split(URL_RE);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    URL_RE.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: isDark ? "#000" : color.accent,
          textDecoration: "underline",
          textUnderlineOffset: 2,
          wordBreak: "break-all",
        }}
      >
        {part.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
      </a>
    ) : (
      part
    )
  );
};

interface ChatMessageProps {
  msg: {
    sender: string;
    text: string;
    time: string;
    isYou?: boolean;
    messageType?: 'date_confirm' | 'poll';
    messageId?: string;
  };
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  isLastConfirm: boolean;

  // date_confirm
  confirmLoading: boolean;
  dateConfirmStatus: 'yes' | 'no' | 'pending' | 'none';

  // poll
  activePoll: {
    id: string; messageId: string; question: string;
    options: string[]; status: string; createdBy: string; multiSelect: boolean;
  } | null;
  pollVotes: Array<{ userId: string; optionIndex: number; displayName: string }>;
  userId: string | null;
  isWaitlisted: boolean;
  pollMessageRef: React.RefObject<HTMLDivElement | null>;
  onPollClosed?: () => void;
}

export default function ChatMessage({
  msg,
  isFirstInGroup,
  isLastInGroup,
  isLastConfirm,
  confirmLoading,
  dateConfirmStatus,
  activePoll,
  pollVotes,
  userId,
  isWaitlisted,
  pollMessageRef,
  onPollClosed,
}: ChatMessageProps) {
  if (msg.sender === "system") {
    if (msg.messageType === 'date_confirm' && isLastConfirm) {
      return (
        <div style={{ textAlign: "center", padding: "8px 0" }}>
          <span style={{ fontFamily: font.mono, fontSize: 10, color: color.dim }}>{msg.text}</span>
          {confirmLoading && (
            <div style={{ fontFamily: font.mono, fontSize: 10, color: color.faint, marginTop: 6 }}>...</div>
          )}
          {dateConfirmStatus === 'yes' && !confirmLoading && (
            <div style={{ fontFamily: font.mono, fontSize: 10, color: color.accent, marginTop: 6 }}>
              you&apos;re in
            </div>
          )}
          {dateConfirmStatus === 'none' && !confirmLoading && (
            <div style={{ fontFamily: font.mono, fontSize: 10, color: color.faint, marginTop: 6 }}>
              waiting for responses
            </div>
          )}
        </div>
      );
    }

    if (msg.messageType === 'poll' && activePoll && msg.messageId === activePoll.messageId) {
      return (
        <PollMessage
          poll={activePoll}
          pollVotes={pollVotes}
          userId={userId}
          isWaitlisted={isWaitlisted}
          pollMessageRef={pollMessageRef}
          onPollClosed={onPollClosed}
        />
      );
    }

    return (
      <div style={{ textAlign: "center", padding: "4px 0" }}>
        <span style={{ fontFamily: font.mono, fontSize: 10, color: color.dim }}>{msg.text}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: msg.isYou ? "flex-end" : "flex-start",
        marginTop: isFirstInGroup ? 8 : 0,
      }}
    >
      {isFirstInGroup && !msg.isYou && (
        <span style={{ fontFamily: font.mono, fontSize: 10, color: color.dim, marginBottom: 3 }}>
          {msg.sender}
        </span>
      )}
      <div
        className="select-text"
        style={{
          background: msg.isYou ? color.accent : color.card,
          color: msg.isYou ? "#000" : color.text,
          padding: "8px 12px",
          borderRadius: msg.isYou
            ? `${isFirstInGroup ? 16 : 8}px 16px ${isLastInGroup ? 4 : 8}px 16px`
            : `16px ${isFirstInGroup ? 16 : 8}px ${isLastInGroup ? 8 : 8}px ${isLastInGroup ? 4 : 8}px`,
          fontFamily: font.mono,
          fontSize: 13,
          maxWidth: "80%",
          lineHeight: 1.4,
        }}
      >
        {linkify(msg.text, !!msg.isYou)}
      </div>
      {isLastInGroup && (
        <span style={{ fontFamily: font.mono, fontSize: 9, color: color.faint, marginTop: 2 }}>
          {msg.time}
        </span>
      )}
    </div>
  );
}
