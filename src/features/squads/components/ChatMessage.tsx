"use client";

import React from "react";
import cn from "@/lib/tailwindMerge";
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
        className={cn("underline underline-offset-2 break-all", { "text-black": isDark, "text-dt": !isDark })}
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
        <div className="text-center py-2">
          <span className="font-mono text-tiny text-neutral-500">{msg.text}</span>
          {confirmLoading && (
            <div className="font-mono text-tiny text-neutral-700 mt-1.5">...</div>
          )}
          {dateConfirmStatus === 'yes' && !confirmLoading && (
            <div className="font-mono text-tiny text-dt mt-1.5">
              you&apos;re in
            </div>
          )}
          {dateConfirmStatus === 'none' && !confirmLoading && (
            <div className="font-mono text-tiny text-neutral-700 mt-1.5">
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
      <div className="text-center py-1">
        <span className="font-mono text-tiny text-neutral-500">{msg.text}</span>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", { "items-end": msg.isYou, "items-start": !msg.isYou, "mt-2": isFirstInGroup, "mt-0": !isFirstInGroup })}>
      {isFirstInGroup && !msg.isYou && (
        <span className="font-mono text-tiny text-neutral-500 mb-1">
          {msg.sender}
        </span>
      )}
      <div
        className={cn("select-text py-2 px-3 font-mono text-sm max-w-[80%] leading-snug",
          msg.isYou
            ? cn("bg-dt text-black rounded-tr-2xl rounded-bl-2xl", {
                "rounded-tl-2xl": isFirstInGroup,
                "rounded-tl-lg": !isFirstInGroup,
                "rounded-br": isLastInGroup,
                "rounded-br-lg": !isLastInGroup,
              })
            : cn("bg-neutral-925 text-white rounded-tl-2xl rounded-br-lg", {
                "rounded-tr-2xl": isFirstInGroup,
                "rounded-tr-lg": !isFirstInGroup,
                "rounded-bl": isLastInGroup,
                "rounded-bl-lg": !isLastInGroup,
              })
        )}
      >
        {linkify(msg.text, !!msg.isYou)}
      </div>
      {isLastInGroup && (
        <span className="font-mono text-tiny text-neutral-700 mt-0.5">
          {msg.time}
        </span>
      )}
    </div>
  );
}
