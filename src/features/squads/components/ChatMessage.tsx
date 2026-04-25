"use client";

import React from "react";
import * as db from "@/lib/db";
import cn from "@/lib/tailwindMerge";
import PollMessage from "./PollMessage";
import GridPollMessage from "./GridPollMessage";
import type { AvailabilityCell } from "./GridPollMessage";

type WhenSlot = { date: string; startMin: number | null; endMin: number | null; label: string | null };

// Reconstruct grid params from a 'when:availability' poll's slot list. The
// creator emits slots on a uniform grid (same hour window + slot_minutes per
// day), so we can recover gridDates/hourStart/hourEnd/slotMinutes from them.
// Slots without a concrete startMin (whole-day) are ignored for grid
// reconstruction — they wouldn't fit a cell.
function deriveGridFromSlots(slots: WhenSlot[]): {
  gridDates: string[];
  gridHourStart: number;
  gridHourEnd: number;
  gridSlotMinutes: 30 | 60;
  // (dayOffset, slotIndex) → option index in the original slot array
  cellToSlotIndex: Map<string, number>;
  // reverse, for rendering votes
  slotIndexToCell: Map<number, { dayOffset: number; slotIndex: number }>;
} | null {
  const ranged = slots
    .map((s, i) => ({ s, i }))
    .filter((x): x is { s: WhenSlot & { startMin: number; endMin: number }; i: number } =>
      x.s.startMin !== null && x.s.endMin !== null);
  if (ranged.length === 0) return null;
  const dates = Array.from(new Set(ranged.map((x) => x.s.date))).sort();
  const starts = ranged.map((x) => x.s.startMin);
  const ends = ranged.map((x) => x.s.endMin);
  const hourStart = Math.floor(Math.min(...starts) / 60);
  const hourEnd = Math.ceil(Math.max(...ends) / 60);
  // All slots should share duration; pick the first.
  const duration = ranged[0].s.endMin - ranged[0].s.startMin;
  const slotMinutes: 30 | 60 = duration === 30 ? 30 : 60;
  const cellToSlotIndex = new Map<string, number>();
  const slotIndexToCell = new Map<number, { dayOffset: number; slotIndex: number }>();
  for (const { s, i } of ranged) {
    const dayOffset = dates.indexOf(s.date);
    const slotIndex = (s.startMin - hourStart * 60) / slotMinutes;
    if (dayOffset < 0 || slotIndex < 0 || !Number.isInteger(slotIndex)) continue;
    cellToSlotIndex.set(`${dayOffset}|${slotIndex}`, i);
    slotIndexToCell.set(i, { dayOffset, slotIndex });
  }
  return { gridDates: dates, gridHourStart: hourStart, gridHourEnd: hourEnd, gridSlotMinutes: slotMinutes, cellToSlotIndex, slotIndexToCell };
}

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
  dateConfirmStatus: 'yes' | 'no' | 'pending' | 'none' | 'loading';

  // poll — for a poll message, this is the poll record that matches msg.messageId.
  // Undefined for non-poll messages (or if the poll is still loading).
  poll?: {
    id: string; messageId: string; question: string;
    options: string[] | Array<{ date: string; time: string | null }> | WhenSlot[];
    status: string; createdBy: string; multiSelect: boolean;
    // 'dates' and 'availability' are legacy; new polls use 'when' with collectionStyle.
    pollType?: 'text' | 'dates' | 'availability' | 'when';
    collectionStyle?: 'preference' | 'availability';
    // Legacy 'availability' poll type's grid params:
    gridDates?: string[];
    gridHourStart?: number;
    gridHourEnd?: number;
    gridSlotMinutes?: 30 | 60;
  };
  pollVotes: Array<{ userId: string; optionIndex: number; displayName: string }>;
  pollAvailability?: Array<{ userId: string; dayOffset: number; slotIndex: number; displayName: string }>;
  userId: string | null;
  isWaitlisted: boolean;
  pollMessageRef: React.RefObject<HTMLDivElement | null>;
  onPollClosed?: (pollId: string) => void;
  squadMembers?: { userId: string; displayName: string }[];
  onProposeDateFromPoll?: (pollId: string, date: string, time: string) => Promise<void>;
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
  poll,
  pollVotes,
  pollAvailability,
  userId,
  isWaitlisted,
  pollMessageRef,
  onPollClosed,
  squadMembers,
  onProposeDateFromPoll,
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

    if (msg.messageType === 'poll' && poll && msg.messageId === poll.messageId) {
      // Legacy 'availability' polls: cells come from squad_poll_availability.
      if (poll.pollType === 'availability' && poll.gridDates && poll.gridDates.length > 0
          && poll.gridHourStart !== undefined && poll.gridHourEnd !== undefined && poll.gridSlotMinutes) {
        return (
          <div className="mb-3">
            <GridPollMessage
              poll={{
                id: poll.id,
                messageId: poll.messageId,
                question: poll.question,
                status: poll.status,
                createdBy: poll.createdBy,
                gridDates: poll.gridDates,
                gridHourStart: poll.gridHourStart,
                gridHourEnd: poll.gridHourEnd,
                gridSlotMinutes: poll.gridSlotMinutes,
              }}
              availability={pollAvailability ?? []}
              userId={userId}
              isWaitlisted={isWaitlisted}
              pollMessageRef={pollMessageRef}
              onPollClosed={onPollClosed}
              squadMembers={squadMembers}
              onToggleCell={async (d, s) => { await db.toggleAvailabilityCell(poll.id, d, s); }}
              onClearMine={async () => { await db.clearMyAvailability(poll.id); }}
              onProposeDate={onProposeDateFromPoll
                ? async (date, time) => { await onProposeDateFromPoll(poll.id, date, time); }
                : undefined}
            />
          </div>
        );
      }
      // 'when' polls with availability collection style: grid UI backed by
      // option-index votes in squad_poll_votes. Grid dims are derived from
      // the slot list (creator emits uniform slots).
      if (poll.pollType === 'when' && poll.collectionStyle === 'availability') {
        const grid = deriveGridFromSlots(poll.options as WhenSlot[]);
        if (grid) {
          const cells: AvailabilityCell[] = pollVotes.flatMap((v) => {
            const cell = grid.slotIndexToCell.get(v.optionIndex);
            return cell ? [{ userId: v.userId, dayOffset: cell.dayOffset, slotIndex: cell.slotIndex, displayName: v.displayName }] : [];
          });
          return (
            <div className="mb-3">
              <GridPollMessage
                poll={{
                  id: poll.id,
                  messageId: poll.messageId,
                  question: poll.question,
                  status: poll.status,
                  createdBy: poll.createdBy,
                  gridDates: grid.gridDates,
                  gridHourStart: grid.gridHourStart,
                  gridHourEnd: grid.gridHourEnd,
                  gridSlotMinutes: grid.gridSlotMinutes,
                }}
                availability={cells}
                userId={userId}
                isWaitlisted={isWaitlisted}
                pollMessageRef={pollMessageRef}
                onPollClosed={onPollClosed}
                squadMembers={squadMembers}
                onToggleCell={async (d, s) => {
                  const idx = grid.cellToSlotIndex.get(`${d}|${s}`);
                  if (idx === undefined) return;
                  await db.votePoll(poll.id, idx);
                }}
                onClearMine={async () => { await db.clearMyWhenVotes(poll.id); }}
                onProposeDate={onProposeDateFromPoll
                  ? async (date, time) => { await onProposeDateFromPoll(poll.id, date, time); }
                  : undefined}
              />
            </div>
          );
        }
      }
      // Everything else (text, dates, when:preference) → list rendering.
      return (
        <div className="mb-3">
          <PollMessage
            poll={poll}
            pollVotes={pollVotes}
            userId={userId}
            isWaitlisted={isWaitlisted}
            pollMessageRef={pollMessageRef}
            onPollClosed={() => onPollClosed?.(poll.id)}
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
