"use client";

import React from "react";
import { color } from "@/lib/styles";
import type { Squad } from "@/lib/ui-types";

const getEventSortKey = (s: Squad): number => {
  if (s.eventIsoDate) {
    const t = new Date(s.eventIsoDate).getTime();
    if (!Number.isNaN(t)) return t;
  }
  if (s.lastActivityAt) {
    const t = new Date(s.lastActivityAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return Number.MAX_SAFE_INTEGER;
};

const isFading = (s: Squad): boolean => {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  // Event is "fading" only once it's been 24h since the event time
  if (s.eventIsoDate) {
    const t = new Date(s.eventIsoDate).getTime();
    if (!Number.isNaN(t) && now - t > DAY_MS) return true;
  }
  // Or when the squad is within 24h of its own expiry
  if (s.expiresAt) {
    const ms = new Date(s.expiresAt).getTime() - now;
    if (!Number.isNaN(ms) && ms < DAY_MS) return true;
  }
  return false;
};

const formatEventCompound = (s: Squad): string | null => {
  const date = s.eventDate?.trim();
  const time = s.eventTime?.trim();
  if (date && time) return `${date.toUpperCase()} · ${time}`;
  if (date) return date.toUpperCase();
  if (time) return time;
  return null;
};

const splitLastMsg = (lastMsg: string): { sender: string | null; text: string } => {
  if (!lastMsg) return { sender: null, text: "" };
  const idx = lastMsg.indexOf(":");
  if (idx === -1) return { sender: null, text: lastMsg };
  return { sender: lastMsg.slice(0, idx), text: lastMsg.slice(idx + 1).trim() };
};

const formatCountdown = (squad: Squad): { label: string; sub: string | null; urgent: boolean } | null => {
  if (!squad.eventIsoDate) return null;
  const eventTime = new Date(squad.eventIsoDate).getTime();
  if (Number.isNaN(eventTime)) return null;
  const now = Date.now();
  const diffMs = eventTime - now;
  const diffMin = Math.round(diffMs / (60 * 1000));
  const diffHr = Math.round(diffMs / (60 * 60 * 1000));
  const diffDay = Math.round(diffMs / (24 * 60 * 60 * 1000));

  if (diffMs < -24 * 60 * 60 * 1000) return { label: "PAST", sub: null, urgent: false };
  if (diffMs < 0) return { label: "ENDED", sub: null, urgent: false };
  if (diffHr < 1) return { label: `${Math.max(1, diffMin)}m`, sub: "from now", urgent: true };
  if (diffHr < 24) return { label: `${diffHr}h`, sub: "from now", urgent: diffHr < 6 };
  if (diffDay < 7) return { label: `${diffDay}d`, sub: diffDay === 1 ? "tomorrow" : "away", urgent: false };
  if (diffDay < 30) return { label: `${Math.round(diffDay / 7)}w`, sub: "away", urgent: false };
  return { label: `${Math.round(diffDay / 30)}mo`, sub: "away", urgent: false };
};

const Countdown = ({ squad }: { squad: Squad }) => {
  const cd = formatCountdown(squad);
  if (!cd) {
    return <div className="w-12 shrink-0" />;
  }
  return (
    <div className="w-12 shrink-0 flex flex-col items-center justify-center">
      <span
        className={`font-mono text-base font-bold leading-none ${cd.urgent ? "text-dt" : "text-primary"}`}
      >
        {cd.label}
      </span>
      {cd.sub && (
        <span className="font-mono text-[9px] text-faint uppercase tracking-wider mt-0.5 leading-none">
          {cd.sub}
        </span>
      )}
    </div>
  );
};

const SquadRow = ({
  squad,
  onSelectSquad,
}: {
  squad: Squad;
  onSelectSquad: (squad: Squad) => void;
}) => {
  const { sender, text } = splitLastMsg(squad.lastMsg);
  const eventCompound = formatEventCompound(squad);
  const hasMessage = !!squad.lastMsg;

  return (
    <div
      onClick={() => onSelectSquad({ ...squad, hasUnread: false })}
      className="flex items-center gap-3 px-4 border-b border-border cursor-pointer"
      style={{ minHeight: 64 }}
    >
      <Countdown squad={squad} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-serif text-xs text-primary font-normal truncate leading-tight tracking-[-0.02em]">
            {squad.name}
          </span>
          {squad.isWaitlisted && (
            <span className="font-mono text-[9px] text-faint border border-border rounded px-[5px] py-px shrink-0">
              waitlist
            </span>
          )}
        </div>
        <div className="flex flex-col gap-0.5 mt-0.5">
          {squad.messages && squad.messages.length > 0 ? (
            squad.messages.slice(-3).map((m, i) => {
              const isSys = !m.isYou && m.sender === "system";
              return (
                <div key={m.id ?? i} className="font-mono text-[10px] text-dim truncate">
                  {isSys ? (
                    <span className="text-faint italic">{m.text}</span>
                  ) : (
                    <>
                      <span className="text-muted">{m.isYou ? "You" : m.sender}:</span>{" "}{m.text}
                    </>
                  )}
                </div>
              );
            })
          ) : hasMessage ? (
            <div className="font-mono text-[10px] text-dim truncate">
              {sender ? <><span className="text-muted">{sender}:</span> {text}</> : text}
            </div>
          ) : eventCompound ? (
            <div className="font-mono text-[10px] text-dim truncate">{eventCompound}</div>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 self-start pt-1">
        <span className="font-mono text-tiny text-dim">{squad.time}</span>
        {squad.hasUnread && (
          <span
            data-testid={`squad-unread-dot-${squad.id}`}
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: color.accent }}
          />
        )}
      </div>
    </div>
  );
};

const SectionHeader = ({ label, count }: { label: string; count: number }) => (
  <div
    className="font-mono text-tiny text-dim px-4"
    style={{
      textTransform: "uppercase",
      letterSpacing: "0.15em",
      marginTop: 12,
      marginBottom: 8,
    }}
  >
    {label}
    <span className="text-muted"> · {count}</span>
  </div>
);

const GroupsView = ({
  squads,
  onSelectSquad,
}: {
  squads: Squad[];
  onSelectSquad: (squad: Squad) => void;
}) => {
  const sortByEvent = (a: Squad, b: Squad) => getEventSortKey(a) - getEventSortKey(b);

  const newMessages: Squad[] = [];
  const fading: Squad[] = [];
  const upcoming: Squad[] = [];
  for (const s of squads) {
    if (s.hasUnread) newMessages.push(s);
    else if (isFading(s)) fading.push(s);
    else upcoming.push(s);
  }
  newMessages.sort(sortByEvent);
  fading.sort(sortByEvent);
  upcoming.sort(sortByEvent);

  const nonEmptyBuckets = [newMessages, upcoming, fading].filter((b) => b.length > 0);
  const showHeaders = nonEmptyBuckets.length > 1;

  return (
    <div>
      <div className="px-5">
        <h2 className="font-serif text-[28px] text-primary mb-1 font-normal">
          Your Squads
        </h2>
        <p className="font-mono text-xs text-dim mb-6">
          Groups formed around events
        </p>
      </div>

      {squads.length === 0 ? (
        <div className="px-5">
          <div className="text-center py-[60px] px-5 text-faint font-mono text-xs">
            No squads yet.<br />
            Say you&apos;re down on a friend&apos;s check and a squad forms automatically.
          </div>
        </div>
      ) : (
        <div>
          {newMessages.length > 0 && (
            <>
              {showHeaders && <SectionHeader label="NEW MESSAGES" count={newMessages.length} />}
              {newMessages.map((s) => (
                <SquadRow key={s.id} squad={s} onSelectSquad={onSelectSquad} />
              ))}
            </>
          )}
          {upcoming.length > 0 && (
            <>
              {showHeaders && <SectionHeader label="UPCOMING" count={upcoming.length} />}
              {upcoming.map((s) => (
                <SquadRow key={s.id} squad={s} onSelectSquad={onSelectSquad} />
              ))}
            </>
          )}
          {fading.length > 0 && (
            <>
              {showHeaders && <SectionHeader label="FADING ✶" count={fading.length} />}
              {fading.map((s) => (
                <SquadRow key={s.id} squad={s} onSelectSquad={onSelectSquad} />
              ))}
            </>
          )}
        </div>
      )}

      <div className="text-center py-8 px-5 text-border-mid font-mono text-xs" style={{ lineHeight: 1.8 }}>
        squads dissolve after the event ✶
      </div>
    </div>
  );
};

export default GroupsView;
