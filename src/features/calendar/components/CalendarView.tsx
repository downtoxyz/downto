"use client";

import { useState, useEffect, useRef } from "react";
import { font, color } from "@/lib/styles";
import type { Event, InterestCheck } from "@/lib/ui-types";
import EventCard from "@/features/events/components/EventCard";
import { generateICSCalendar, downloadICS, buildGoogleCalendarUrl, type ICSEventParams } from "@/lib/ics";
import * as db from "@/lib/db";

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
  myCheckResponses?: Record<string, "down" | "waitlist">;
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
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncSelected, setSyncSelected] = useState<Set<string>>(new Set());
  const [syncTab, setSyncTab] = useState<"export" | "subscribe">("export");
  const [calendarToken, setCalendarToken] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Convert Event or Check to ICS params
  const eventToICS = (e: Event): ICSEventParams => ({
    uid: e.id,
    title: e.title,
    date: e.rawDate ?? "",
    time: e.time,
    venue: e.venue,
  });
  const checkToICS = (c: InterestCheck): ICSEventParams => ({
    uid: c.id,
    title: c.text,
    date: c.eventDate ?? "",
    time: c.eventTime,
    venue: c.location,
  });

  // Swipe-to-dismiss for sync modal
  const syncTouchStartY = useRef(0);
  const [syncDragOffset, setSyncDragOffset] = useState(0);
  const syncScrollRef = useRef<HTMLDivElement>(null);
  const syncIsDragging = useRef(false);
  const [syncClosing, setSyncClosing] = useState(false);

  const closeSyncModal = () => {
    setSyncClosing(true);
    setTimeout(() => { setShowSyncModal(false); setSyncClosing(false); setSyncDragOffset(0); }, 200);
  };

  const syncHandleSwipeStart = (e: React.TouchEvent) => {
    syncTouchStartY.current = e.touches[0].clientY;
    syncIsDragging.current = false;
  };
  const syncHandleSwipeMove = (e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - syncTouchStartY.current;
    if (dy > 0) { syncIsDragging.current = true; setSyncDragOffset(dy); }
  };
  const syncHandleSwipeEnd = () => {
    if (syncDragOffset > 60) closeSyncModal();
    else setSyncDragOffset(0);
    syncIsDragging.current = false;
  };
  const syncHandleScrollTouchStart = (e: React.TouchEvent) => {
    syncTouchStartY.current = e.touches[0].clientY;
    syncIsDragging.current = false;
  };
  const syncHandleScrollTouchMove = (e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - syncTouchStartY.current;
    const atTop = syncScrollRef.current ? syncScrollRef.current.scrollTop <= 0 : true;
    if (atTop && dy > 0) { syncIsDragging.current = true; e.preventDefault(); setSyncDragOffset(dy); }
  };
  const syncHandleScrollTouchEnd = () => {
    if (syncIsDragging.current) syncHandleSwipeEnd();
  };

  const toggleSyncItem = (id: string) => {
    setSyncSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  // All exportable items for sync modal
  const allExportable: { id: string; label: string; sub: string; params: ICSEventParams }[] = [
    ...saved.filter((e) => e.rawDate).map((e) => ({
      id: e.id,
      label: e.title,
      sub: [e.date, e.time].filter(Boolean).join(" · "),
      params: eventToICS(e),
    })),
    ...calendarChecks.filter((c) => c.eventDate).map((c) => ({
      id: `check-${c.id}`,
      label: c.text,
      sub: [c.eventDate, c.eventTime].filter(Boolean).join(" · "),
      params: checkToICS(c),
    })),
  ];

  const openSyncModal = () => {
    setSyncSelected(new Set(allExportable.map((e) => e.id)));
    setSyncTab("export");
    setCopied(false);
    setShowSyncModal(true);
    // Fetch calendar token for subscribe tab
    if (!calendarToken && !tokenLoading) {
      setTokenLoading(true);
      db.getCalendarToken().then((t) => { setCalendarToken(t); setTokenLoading(false); }).catch(() => setTokenLoading(false));
    }
  };

  const userTz = typeof window !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "America/New_York";
  const webcalUrl = calendarToken
    ? `webcal://${typeof window !== "undefined" ? window.location.host : ""}/api/calendar/${calendarToken}?tz=${encodeURIComponent(userTz)}`
    : null;
  const httpsCalUrl = calendarToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/calendar/${calendarToken}?tz=${encodeURIComponent(userTz)}`
    : null;

  const copySubscribeUrl = async () => {
    if (!webcalUrl) return;
    try { await navigator.clipboard.writeText(webcalUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };

  const handleSync = (target: "google" | "ics") => {
    const selected = allExportable.filter((e) => syncSelected.has(e.id));
    if (selected.length === 0) return;
    if (target === "google" && selected.length === 1) {
      window.open(buildGoogleCalendarUrl(selected[0].params), "_blank");
    } else {
      const cal = generateICSCalendar(selected.map((e) => e.params));
      downloadICS("downto-calendar.ics", cal);
    }
    setShowSyncModal(false);
  };

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
      if (e.rawDate) {
        const [, m, d] = e.rawDate.split("-").map(Number);
        return `${m - 1}-${d}`;
      }
      const match = e.date.match(/(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d+)/i);
      if (!match) return "";
      return `${MONTH_ABBREVS[match[1].slice(0, 3)]}-${parseInt(match[2])}`;
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
    if (e.rawDate) {
      const [, m, d] = e.rawDate.split("-").map(Number);
      return `${m - 1}-${d}`;
    }
    const match = e.date.match(/(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d+)/i);
    if (!match) return "";
    return `${MONTH_ABBREVS[match[1].slice(0, 3)]}-${parseInt(match[2])}`;
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
    // Prefer rawDate (ISO) for reliable day-of-week calculation
    if (e.rawDate) {
      const [y, m, day] = e.rawDate.split("-").map(Number);
      const d = new Date(y, m - 1, day);
      const key = `${d.getMonth()}-${d.getDate()}`;
      return formatCardDate(key, d);
    }
    // Fallback: parse display date
    const key = eventDateKey(e);
    const match = e.date.match(/(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d+)/i);
    if (!match) return { label: e.date.split(",")[0], day: e.date.split(" ").pop() || "" };
    const monthStr = match[1].slice(0, 3);
    const d = new Date(today.getFullYear(), MONTH_ABBREVS[monthStr], parseInt(match[2]));
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
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <span style={{
          fontFamily: font.mono,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          color: color.dim,
        }}>
          {countLabel}
        </span>
        {totalItems > 0 && (
          <button
            onClick={openSyncModal}
            style={{
              background: "transparent",
              border: `1px solid ${color.borderMid}`,
              borderRadius: 8,
              padding: "4px 10px",
              fontFamily: font.mono,
              fontSize: 9,
              fontWeight: 700,
              color: color.dim,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Sync
          </button>
        )}
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
                        color: response === "down" ? color.accent : response === "waitlist" ? color.muted : color.dim,
                        fontWeight: 700,
                      }}>
                        {response === "down" ? "✓ Down" : response === "waitlist" ? "✓ Waitlisted" : "Yours"}
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
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
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
              userId={userId}
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

      {/* Sync modal */}
      {showSyncModal && (
        <div
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          <div
            onClick={closeSyncModal}
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.7)",
              backdropFilter: syncClosing ? "blur(0px)" : "blur(8px)",
              WebkitBackdropFilter: syncClosing ? "blur(0px)" : "blur(8px)",
              opacity: syncClosing ? 0 : 1,
              transition: "opacity 0.2s ease, backdrop-filter 0.2s ease, -webkit-backdrop-filter 0.2s ease",
            }}
          />
          <div
            style={{
              position: "relative",
              background: color.surface,
              borderRadius: "24px 24px 0 0",
              maxWidth: 420,
              width: "100%",
              maxHeight: "75vh",
              display: "flex",
              flexDirection: "column",
              animation: syncClosing ? undefined : "slideUp 0.3s ease-out",
              transform: syncClosing ? "translateY(100%)" : `translateY(${syncDragOffset}px)`,
              transition: syncClosing ? "transform 0.2s ease-in" : (syncDragOffset === 0 ? "transform 0.2s ease-out" : "none"),
            }}
          >
            {/* Drag handle + header */}
            <div
              onTouchStart={syncHandleSwipeStart}
              onTouchMove={syncHandleSwipeMove}
              onTouchEnd={syncHandleSwipeEnd}
              style={{ touchAction: "none", padding: "16px 20px 0" }}
            >
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
                <div style={{ width: 40, height: 4, background: color.faint, borderRadius: 2 }} />
              </div>
              <h3 style={{ fontFamily: font.serif, fontSize: 18, color: color.text, margin: "0 0 12px", fontWeight: 400 }}>
                Sync to Calendar
              </h3>

              {/* Tabs */}
              <div style={{ display: "flex", gap: 0, marginBottom: 12, borderBottom: `1px solid ${color.border}` }}>
                {(["export", "subscribe"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setSyncTab(tab)}
                    style={{
                      flex: 1,
                      padding: "8px 0",
                      background: "transparent",
                      border: "none",
                      borderBottom: syncTab === tab ? `2px solid ${color.accent}` : "2px solid transparent",
                      fontFamily: font.mono,
                      fontSize: 11,
                      fontWeight: syncTab === tab ? 700 : 400,
                      color: syncTab === tab ? color.accent : color.dim,
                      cursor: "pointer",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {tab === "export" ? "Export" : "Auto Sync"}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content */}
            {syncTab === "export" ? (
              <>
                {/* Select all / count */}
                <div style={{ padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontFamily: font.mono, fontSize: 10, color: color.dim }}>
                    {syncSelected.size} of {allExportable.length} selected
                  </span>
                  <button
                    onClick={() => {
                      if (syncSelected.size === allExportable.length) setSyncSelected(new Set());
                      else setSyncSelected(new Set(allExportable.map((e) => e.id)));
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      fontFamily: font.mono,
                      fontSize: 10,
                      color: color.accent,
                      cursor: "pointer",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      padding: "4px 0",
                    }}
                  >
                    {syncSelected.size === allExportable.length ? "Deselect All" : "Select All"}
                  </button>
                </div>

                {/* Selectable event list */}
                <div
                  ref={syncScrollRef}
                  onTouchStart={syncHandleScrollTouchStart}
                  onTouchMove={syncHandleScrollTouchMove}
                  onTouchEnd={syncHandleScrollTouchEnd}
                  style={{ flex: 1, overflowY: "auto", padding: "0 20px", overscrollBehavior: "contain" }}
                >
                  {allExportable.map((item) => {
                    const selected = syncSelected.has(item.id);
                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleSyncItem(item.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "10px 0",
                          borderBottom: `1px solid ${color.border}`,
                          cursor: "pointer",
                        }}
                      >
                        <div style={{
                          width: 20,
                          height: 20,
                          borderRadius: 6,
                          border: `2px solid ${selected ? color.accent : color.borderMid}`,
                          background: selected ? color.accent : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          transition: "all 0.15s",
                        }}>
                          {selected && <span style={{ color: "#000", fontSize: 12, lineHeight: 1 }}>✓</span>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontFamily: font.mono,
                            fontSize: 12,
                            color: selected ? color.text : color.muted,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}>
                            {item.label}
                          </div>
                          <div style={{ fontFamily: font.mono, fontSize: 10, color: color.faint }}>
                            {item.sub}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Export action buttons */}
                <div style={{ padding: "16px 20px calc(16px + env(safe-area-inset-bottom, 0px))", display: "flex", gap: 8 }}>
                  <button
                    onClick={() => handleSync("google")}
                    disabled={syncSelected.size === 0}
                    style={{
                      flex: 1,
                      padding: "12px 0",
                      background: "transparent",
                      border: `1px solid ${syncSelected.size > 0 ? color.borderMid : color.border}`,
                      borderRadius: 12,
                      color: syncSelected.size > 0 ? color.text : color.faint,
                      fontFamily: font.mono,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: syncSelected.size > 0 ? "pointer" : "default",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    Google Cal
                  </button>
                  <button
                    onClick={() => handleSync("ics")}
                    disabled={syncSelected.size === 0}
                    style={{
                      flex: 1,
                      padding: "12px 0",
                      background: syncSelected.size > 0 ? color.accent : color.border,
                      border: "none",
                      borderRadius: 12,
                      color: syncSelected.size > 0 ? "#000" : color.faint,
                      fontFamily: font.mono,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: syncSelected.size > 0 ? "pointer" : "default",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    Download .ics
                  </button>
                </div>
              </>
            ) : (
              /* Subscribe tab */
              <div style={{ padding: "0 20px calc(20px + env(safe-area-inset-bottom, 0px))" }}>
                <p style={{ fontFamily: font.mono, fontSize: 11, color: color.muted, lineHeight: 1.6, marginBottom: 16 }}>
                  Subscribe once and your calendar app will automatically stay in sync. New events you save will appear automatically — no duplicates.
                </p>

                {tokenLoading ? (
                  <div style={{ fontFamily: font.mono, fontSize: 11, color: color.faint, textAlign: "center", padding: 20 }}>
                    Loading...
                  </div>
                ) : webcalUrl ? (
                  <>
                    {/* URL display */}
                    <div style={{
                      background: color.deep,
                      border: `1px solid ${color.border}`,
                      borderRadius: 10,
                      padding: "10px 12px",
                      marginBottom: 12,
                      fontFamily: font.mono,
                      fontSize: 10,
                      color: color.dim,
                      wordBreak: "break-all",
                      lineHeight: 1.5,
                    }}>
                      {webcalUrl}
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <a
                        href={webcalUrl}
                        style={{
                          display: "block",
                          padding: "12px 0",
                          background: color.accent,
                          border: "none",
                          borderRadius: 12,
                          color: "#000",
                          fontFamily: font.mono,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          textAlign: "center",
                          textDecoration: "none",
                        }}
                      >
                        Subscribe in Calendar App
                      </a>
                      <button
                        onClick={copySubscribeUrl}
                        style={{
                          padding: "12px 0",
                          background: "transparent",
                          border: `1px solid ${color.borderMid}`,
                          borderRadius: 12,
                          color: copied ? color.accent : color.text,
                          fontFamily: font.mono,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                      >
                        {copied ? "Copied!" : "Copy URL"}
                      </button>
                    </div>

                    <p style={{ fontFamily: font.mono, fontSize: 9, color: color.faint, lineHeight: 1.5, marginTop: 14, textAlign: "center" }}>
                      Works with Apple Calendar, Google Calendar, Outlook, and any app that supports webcal subscriptions. Your calendar will refresh automatically.
                    </p>
                  </>
                ) : (
                  <div style={{ fontFamily: font.mono, fontSize: 11, color: color.faint, textAlign: "center", padding: 20 }}>
                    Could not load subscription URL.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarView;
