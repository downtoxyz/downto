"use client";

import { useState, useEffect } from "react";
import { font, color } from "@/lib/styles";
import type { Event, InterestCheck } from "@/lib/ui-types";
import EventCard from "@/components/events/EventCard";

const CHECK_DOT_COLOR = "#AF52DE";

const CalendarView = ({
  events,
  checks = [],
  myCheckResponses = {},
  onToggleSave,
  onToggleDown,
  onOpenSocial,
  onEditEvent,
  userId,
  isDemoMode,
  leftChecks = [],
  onRedownFromLeft,
}: {
  events: Event[];
  checks?: InterestCheck[];
  myCheckResponses?: Record<string, "down" | "maybe">;
  onToggleSave?: (id: string) => void;
  onToggleDown?: (id: string) => void;
  onOpenSocial?: (event: Event) => void;
  onEditEvent?: (event: Event) => void;
  userId?: string;
  isDemoMode?: boolean;
  leftChecks?: InterestCheck[];
  onRedownFromLeft?: (checkId: string) => void;
}) => {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  // Sync selectedEvent with latest events prop
  useEffect(() => {
    if (selectedEvent) {
      const updated = events.find((e) => e.id === selectedEvent.id);
      if (updated) setSelectedEvent(updated);
      else setSelectedEvent(null);
    }
  }, [events]);
  const saved = events.filter((e) => e.saved);

  // Calendar-worthy checks: have eventDate AND (user responded down/maybe OR user is the author)
  const calendarChecks = checks.filter(
    (c) => c.eventDate && (myCheckResponses[c.id] || c.authorId === userId)
  );

  // Build a 2-week grid starting from Monday of the current week
  const today = new Date();
  const todayDate = today.getDate();
  const todayMonth = today.getMonth();
  const todayYear = today.getFullYear();

  // Find Monday of this week (0=Sun, 1=Mon, ...)
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(todayYear, todayMonth, todayDate + mondayOffset);

  const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  // Build date keys from saved events for matching (e.g., "Feb 14" -> "1-14")
  const MONTH_ABBREVS: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  const savedDateKeys = new Set(
    saved.map((e) => {
      const match = e.date.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d+)/);
      if (!match) return "";
      return `${MONTH_ABBREVS[match[1]]}-${parseInt(match[2])}`;
    }).filter(Boolean)
  );

  // Build date keys from calendar-worthy checks (eventDate is ISO: "2026-03-05")
  const checkDateKeyFromIso = (isoDate: string) => {
    const d = new Date(isoDate + "T00:00:00");
    return `${d.getMonth()}-${d.getDate()}`;
  };
  const checkDateKeys = new Set(
    calendarChecks.map((c) => checkDateKeyFromIso(c.eventDate!))
  );

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const dateKey = `${d.getMonth()}-${d.getDate()}`;
    const hasEvent = savedDateKeys.has(dateKey);
    const hasCheck = checkDateKeys.has(dateKey);
    return {
      label: DAY_LABELS[i % 7],
      num: d.getDate(),
      dateKey,
      today: d.getDate() === todayDate && d.getMonth() === todayMonth && d.getFullYear() === todayYear,
      hasEvent,
      hasCheck,
      hasDot: hasEvent || hasCheck,
    };
  });

  const eventDateKey = (e: Event) => {
    const match = e.date.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d+)/);
    if (!match) return "";
    return `${MONTH_ABBREVS[match[1]]}-${parseInt(match[2])}`;
  };

  const filteredEvents = selectedDateKey
    ? saved.filter((e) => eventDateKey(e) === selectedDateKey)
    : saved;

  const filteredChecks = selectedDateKey
    ? calendarChecks.filter((c) => checkDateKeyFromIso(c.eventDate!) === selectedDateKey)
    : calendarChecks;

  // Merge events and checks into a single date-sorted list
  type CalItem = { type: "event"; data: Event } | { type: "check"; data: InterestCheck };
  const calItems: CalItem[] = [
    ...filteredEvents.map((e) => ({ type: "event" as const, data: e })),
    ...filteredChecks.map((c) => ({ type: "check" as const, data: c })),
  ].sort((a, b) => {
    const dateA = a.type === "event"
      ? (a.data as Event).rawDate ?? ""
      : (a.data as InterestCheck).eventDate ?? "";
    const dateB = b.type === "event"
      ? (b.data as Event).rawDate ?? ""
      : (b.data as InterestCheck).eventDate ?? "";
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    return dateA.localeCompare(dateB);
  });

  const totalItems = calItems.length;

  // Header: show month(s) covered by the 2-week span
  const startMonth = monday.getMonth();
  const endDate = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 13);
  const endMonth = endDate.getMonth();
  const monthLabel = startMonth === endMonth
    ? `${MONTH_NAMES[startMonth]} ${monday.getFullYear()}`
    : `${MONTH_NAMES[startMonth]} – ${MONTH_NAMES[endMonth]} ${endDate.getFullYear()}`;

  // Count label
  const countLabel = (() => {
    if (!selectedDateKey) {
      const parts: string[] = [];
      if (saved.length > 0) parts.push(`${saved.length} saved`);
      if (calendarChecks.length > 0) parts.push(`${calendarChecks.length} check${calendarChecks.length !== 1 ? "s" : ""}`);
      return parts.length > 0 ? `Upcoming (${parts.join(" · ")})` : "Upcoming";
    }
    const parts: string[] = [];
    if (filteredEvents.length > 0) parts.push(`${filteredEvents.length} event${filteredEvents.length !== 1 ? "s" : ""}`);
    if (filteredChecks.length > 0) parts.push(`${filteredChecks.length} check${filteredChecks.length !== 1 ? "s" : ""}`);
    return parts.join(" · ") || "0 events";
  })();

  // Unified date formatter for card display
  // Today → "TODAY" + day, within 2-week grid → "THU" + day, outside → "MAR" + day
  const gridDateKeys = new Set(days.map((d) => d.dateKey));
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTH_ABBREVS_REV = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const formatCardDate = (dateKey: string, dateObj: Date) => {
    const todayKey = `${todayMonth}-${todayDate}`;
    if (dateKey === todayKey) return { label: "Today", day: dateObj.getDate().toString() };
    if (gridDateKeys.has(dateKey)) return { label: DAY_NAMES[dateObj.getDay()], day: dateObj.getDate().toString() };
    return { label: MONTH_ABBREVS_REV[dateObj.getMonth()], day: dateObj.getDate().toString() };
  };

  const formatEventCardDate = (e: Event) => {
    const key = eventDateKey(e);
    const match = e.date.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d+)/);
    if (!match) return { label: e.date.split(",")[0], day: e.date.split(" ").pop() || "" };
    const d = new Date(today.getFullYear(), MONTH_ABBREVS[match[1]], parseInt(match[2]));
    return formatCardDate(key, d);
  };

  const formatCheckCardDate = (isoDate: string) => {
    const d = new Date(isoDate + "T00:00:00");
    const key = `${d.getMonth()}-${d.getDate()}`;
    return formatCardDate(key, d);
  };

  return (
    <div style={{ padding: "0 20px", animation: "fadeIn 0.3s ease" }}>
      <h2
        style={{
          fontFamily: font.serif,
          fontSize: 28,
          color: color.text,
          marginBottom: 4,
          fontWeight: 400,
        }}
      >
        Your Events
      </h2>
      <p style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, marginBottom: 24 }}>
        {monthLabel}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 4,
          marginBottom: 28,
        }}
      >
        {days.map((d, i) => {
          const isSelected = selectedDateKey === d.dateKey;
          const dotColor = isSelected
            ? "#5B9CF6"
            : d.hasEvent
              ? color.accent
              : CHECK_DOT_COLOR;
          return (
          <div
            key={i}
            onClick={() => setSelectedDateKey(isSelected ? null : d.dateKey)}
            style={{
              textAlign: "center",
              padding: "8px 0",
              borderRadius: 10,
              background: isSelected ? "#1C3A5E" : d.today ? "#222" : "transparent",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 9,
                color: color.faint,
                marginBottom: 4,
              }}
            >
              {d.label}
            </div>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 13,
                color: isSelected ? "#5B9CF6" : d.hasDot ? (d.hasEvent ? color.accent : CHECK_DOT_COLOR) : color.dim,
                fontWeight: d.hasDot || isSelected ? 700 : 400,
              }}
            >
              {d.num}
            </div>
            {d.hasDot && (
              <div
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  background: dotColor,
                  margin: "4px auto 0",
                }}
              />
            )}
          </div>
          );
        })}
      </div>

      <div
        style={{
          fontFamily: font.mono,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          color: color.dim,
          marginBottom: 12,
        }}
      >
        {countLabel}
      </div>

      {totalItems === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "40px 20px",
            color: color.faint,
            fontFamily: font.mono,
            fontSize: 12,
            lineHeight: 1.8,
          }}
        >
          {selectedDateKey ? "Nothing on this day." : (<>No events saved yet.<br />Hit + to save your first event.</>)}
        </div>
      ) : (
        <>
          {calItems.map((item) => {
            if (item.type === "event") {
              const e = item.data as Event;
              const { label: eDateLabel, day: eDateDay } = formatEventCardDate(e);
              return (
              <div
                key={e.id}
                onClick={() => setSelectedEvent(e)}
                style={{
                  background: color.card,
                  borderRadius: 14,
                  padding: 16,
                  marginBottom: 8,
                  border: `1px solid ${color.border}`,
                  display: "flex",
                  gap: 14,
                  alignItems: "center",
                  cursor: "pointer",
                }}
              >
                <div style={{ minWidth: 44, textAlign: "center" }}>
                  <div
                    style={{
                      fontFamily: font.mono,
                      fontSize: 9,
                      color: color.accent,
                      textTransform: "uppercase",
                    }}
                  >
                    {eDateLabel}
                  </div>
                  <div style={{ fontFamily: font.serif, fontSize: 26, color: color.text }}>
                    {eDateDay}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontFamily: font.serif,
                      fontSize: 16,
                      color: color.text,
                      marginBottom: 2,
                      fontWeight: 400,
                    }}
                  >
                    {e.title}
                  </div>
                  <div style={{ fontFamily: font.mono, fontSize: 11, color: color.dim }}>
                    {e.venue} · {e.time}
                  </div>
                </div>
              </div>
              );
            } else {
              const c = item.data as InterestCheck;
              const { label: cDateLabel, day: cDateDay } = formatCheckCardDate(c.eventDate!);
              const response = myCheckResponses[c.id];
              return (
                <div
                  key={`check-${c.id}`}
                  style={{
                    background: color.card,
                    borderRadius: 14,
                    padding: 16,
                    marginBottom: 8,
                    border: `1px solid ${color.border}`,
                    display: "flex",
                    gap: 14,
                    alignItems: "center",
                  }}
                >
                  <div style={{ minWidth: 44, textAlign: "center" }}>
                    <div
                      style={{
                        fontFamily: font.mono,
                        fontSize: 9,
                        color: CHECK_DOT_COLOR,
                        textTransform: "uppercase",
                      }}
                    >
                      {cDateLabel}
                    </div>
                    <div style={{ fontFamily: font.serif, fontSize: 26, color: color.text }}>
                      {cDateDay}
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: font.serif,
                        fontSize: 16,
                        color: color.text,
                        marginBottom: 2,
                        fontWeight: 400,
                      }}
                    >
                      {c.text}
                    </div>
                    <div style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, display: "flex", alignItems: "center", gap: 6 }}>
                      {c.eventTime && <span>{c.eventTime}</span>}
                      {c.eventTime && <span>·</span>}
                      <span style={{
                        color: response === "down" ? color.accent : response === "maybe" ? color.muted : color.dim,
                        fontWeight: 700,
                      }}>
                        {response === "down" ? "✓ Down" : response === "maybe" ? "✓ Maybe" : "Yours"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            }
          })}
        </>
      )}

      {leftChecks.length > 0 && !selectedDateKey && (
        <>
          <div
            style={{
              fontFamily: font.mono,
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: color.dim,
              marginTop: 24,
              marginBottom: 12,
            }}
          >
            Left ({leftChecks.length})
          </div>
          {leftChecks.map((c) => {
            const cardDate = c.eventDate ? formatCheckCardDate(c.eventDate) : null;
            return (
              <div
                key={`left-${c.id}`}
                style={{
                  background: color.card,
                  borderRadius: 14,
                  padding: 16,
                  marginBottom: 8,
                  border: `1px solid ${color.border}`,
                  display: "flex",
                  gap: 14,
                  alignItems: "center",
                  opacity: 0.6,
                }}
              >
                {cardDate && (
                  <div style={{ minWidth: 44, textAlign: "center" }}>
                    <div
                      style={{
                        fontFamily: font.mono,
                        fontSize: 9,
                        color: color.faint,
                        textTransform: "uppercase",
                      }}
                    >
                      {cardDate.label}
                    </div>
                    <div style={{ fontFamily: font.serif, fontSize: 26, color: color.muted }}>
                      {cardDate.day}
                    </div>
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: font.serif,
                      fontSize: 16,
                      color: color.muted,
                      marginBottom: 2,
                      fontWeight: 400,
                    }}
                  >
                    {c.text}
                  </div>
                  <div style={{ fontFamily: font.mono, fontSize: 11, color: color.faint }}>
                    {c.author}{c.eventTime ? ` · ${c.eventTime}` : ""}
                  </div>
                </div>
                <button
                  onClick={() => onRedownFromLeft?.(c.id)}
                  style={{
                    fontFamily: font.mono,
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: color.accent,
                    background: "transparent",
                    border: `1px solid ${color.borderMid}`,
                    borderRadius: 12,
                    padding: "8px 14px",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Re-down
                </button>
              </div>
            );
          })}
        </>
      )}

      {selectedEvent && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          <div
            onClick={() => setSelectedEvent(null)}
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.7)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
          />
          <div
            style={{
              position: "relative",
              background: color.surface,
              borderRadius: "24px 24px 0 0",
              width: "100%",
              maxWidth: 420,
              padding: "16px 16px 40px",
              maxHeight: "85vh",
              overflowY: "auto",
              animation: "slideUp 0.3s ease-out",
            }}
          >
            <div
              style={{
                width: 40,
                height: 4,
                background: color.faint,
                borderRadius: 2,
                margin: "0 auto 12px",
              }}
            />
            <EventCard
              event={selectedEvent}
              onToggleSave={() => onToggleSave?.(selectedEvent.id)}
              onToggleDown={() => onToggleDown?.(selectedEvent.id)}
              onOpenSocial={() => onOpenSocial?.(selectedEvent)}
              onLongPress={
                (selectedEvent.createdBy === userId || !selectedEvent.createdBy || isDemoMode)
                  ? () => onEditEvent?.(selectedEvent)
                  : undefined
              }
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarView;
