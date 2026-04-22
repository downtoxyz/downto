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
    imagePath?: string;
    imageWidth?: number;
    imageHeight?: number;
    imagePreviewUrl?: string;
  };
  imageUrl?: string;
  onOpenImage?: (url: string) => void;
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
  imageUrl,
  onOpenImage,
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
        <div className="text-center py-0.5">
          <span className="font-mono text-tiny text-muted">{msg.text}</span>
          {confirmLoading && (
            <div className="font-mono text-tiny text-dim mt-1.5">...</div>
          )}
          {dateConfirmStatus === 'yes' && !confirmLoading && (
            <div className="font-mono text-tiny text-dt mt-1.5">
              you&apos;re in
            </div>
          )}
          {dateConfirmStatus === 'no' && !confirmLoading && (
            <div className="font-mono text-tiny text-faint mt-1.5">
              can&apos;t make it
            </div>
          )}
          {dateConfirmStatus === 'none' && !confirmLoading && (
            <div className="font-mono text-tiny text-dim mt-1.5">
              waiting for responses
            </div>
          )}
        </div>
      );
    }

    if (msg.messageType === 'poll' && activePoll && msg.messageId === activePoll.messageId) {
      return (
        <div className="mb-3">
          <PollMessage
            poll={activePoll}
            pollVotes={pollVotes}
            userId={userId}
            isWaitlisted={isWaitlisted}
            pollMessageRef={pollMessageRef}
            onPollClosed={onPollClosed}
          />
        </div>
      );
    }

    return (
      <div className="text-center py-0.5">
        <span className="font-mono text-tiny text-muted">{msg.text}</span>
      </div>
    );
  }

  // An optimistic message has imagePreviewUrl before it has imagePath, so
  // check either so the bubble renders during upload too.
  const hasImage = !!msg.imagePath || !!msg.imagePreviewUrl;
  const hasText = !!msg.text && msg.text.length > 0;
  const displayUrl = msg.imagePreviewUrl ?? imageUrl;
  // Cap preview to a reasonable max so portrait shots don't hog the viewport.
  // Keep aspect ratio from server-provided dimensions to prevent layout shift.
  const MAX_W = 240;
  const MAX_H = 320;
  let imgStyle: React.CSSProperties | undefined;
  if (hasImage && msg.imageWidth && msg.imageHeight) {
    const ratio = msg.imageWidth / msg.imageHeight;
    let w = Math.min(MAX_W, msg.imageWidth);
    let h = w / ratio;
    if (h > MAX_H) {
      h = MAX_H;
      w = h * ratio;
    }
    imgStyle = { width: Math.round(w), height: Math.round(h) };
  }

  return (
    <div className={cn("flex flex-col", { "items-end": msg.isYou, "items-start": !msg.isYou, "mt-2": isFirstInGroup, "mt-0": !isFirstInGroup })}>
      {isFirstInGroup && !msg.isYou && (
        <span className="font-mono text-tiny text-muted mb-1">
          {msg.sender}
        </span>
      )}
      {hasImage && (
        <div
          className={cn(
            "overflow-hidden bg-deep mb-1",
            msg.isYou ? "rounded-tl-2xl rounded-bl-2xl rounded-tr-2xl rounded-br-lg" : "rounded-tr-2xl rounded-br-2xl rounded-tl-2xl rounded-bl-lg",
          )}
          style={imgStyle}
        >
          {displayUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={displayUrl}
              alt={hasText ? msg.text : "shared image"}
              onClick={() => onOpenImage?.(displayUrl)}
              className="w-full h-full object-cover cursor-pointer"
              loading="lazy"
            />
          ) : null}
        </div>
      )}
      {hasText && (
        <div
          className={cn("select-text font-serif max-w-[80%]",
            msg.isYou
              ? cn("bg-dt text-on-accent rounded-tr-2xl rounded-bl-2xl", {
                  "rounded-tl-2xl": isFirstInGroup && !hasImage,
                  "rounded-tl-lg": !isFirstInGroup || hasImage,
                  "rounded-br": isLastInGroup,
                  "rounded-br-lg": !isLastInGroup,
                })
              : cn("bg-surface text-primary rounded-tl-2xl rounded-br-lg", {
                  "rounded-tr-2xl": isFirstInGroup && !hasImage,
                  "rounded-tr-lg": !isFirstInGroup || hasImage,
                  "rounded-bl": isLastInGroup,
                  "rounded-bl-lg": !isLastInGroup,
                })
          )}
          style={{
            padding: "10px 14px",
            fontSize: 12,
            lineHeight: 1.3,
            letterSpacing: "0.025em",
          }}
        >
          {linkify(msg.text, !!msg.isYou)}
        </div>
      )}
      {isLastInGroup && (
        <span className="font-mono text-tiny text-dim mt-0.5">
          {msg.time}
        </span>
      )}
    </div>
  );
}
