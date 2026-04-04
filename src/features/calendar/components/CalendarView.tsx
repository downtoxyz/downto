"use client";

import { useState, useEffect, useRef } from "react";
import cn from "@/lib/tailwindMerge";
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
    <div className="px-5 animate-fade-in">
      <h2 className="font-serif text-primary mb-1 font-normal" style={{ fontSize: 28 }}>
        Your Events
      </h2>
      <p className="font-mono text-xs text-dim mb-6" style={{ fontSize: 11 }}>
        {monthLabel}
      </p>

      <div className="grid grid-cols-7 gap-1 mb-7">
        {days.map((d, i) => {
          const isSelected = selectedDateKey === d.dateKey;
          const dotColor = isSelected
            ? "#5B9CF6"
            : d.hasEvent
              ? undefined
              : CHECK_DOT_COLOR;
          return (
          <div
            key={i}
            onClick={() => setSelectedDateKey(isSelected ? null : d.dateKey)}
            className={cn(
              "text-center py-2 rounded-lg cursor-pointer",
              isSelected && "bg-[#1C3A5E]",
              !isSelected && d.today && "bg-[#222]",
              !isSelected && !d.today && "bg-transparent",
            )}
          >
            <div className="font-mono text-faint mb-1" style={{ fontSize: 9 }}>
              {d.label}
            </div>
            <div
              className={cn(
                "font-mono text-sm",
                (d.hasDot || isSelected) ? "font-bold" : "font-normal",
              )}
              style={{
                fontSize: 13,
                color: isSelected ? "#5B9CF6" : d.hasDot ? (d.hasEvent ? "#e8ff5a" : CHECK_DOT_COLOR) : undefined,
              }}
            >
              {d.num}
            </div>
            {d.hasDot && (
              <div
                className={cn(
                  "w-1 h-1 rounded-full mx-auto mt-1",
                  !isSelected && d.hasEvent && "bg-dt",
                )}
                style={{
                  ...(dotColor ? { background: dotColor } : {}),
                }}
              />
            )}
          </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-tiny uppercase text-dim" style={{ letterSpacing: "0.15em" }}>
          {countLabel}
        </span>
        {totalItems > 0 && (
          <button
            onClick={openSyncModal}
            className="bg-transparent border border-border-mid rounded-lg font-mono font-bold text-dim cursor-pointer uppercase"
            style={{ padding: "4px 10px", fontSize: 9, letterSpacing: "0.08em" }}
          >
            Sync
          </button>
        )}
      </div>

      {totalItems === 0 ? (
        <div className="text-center text-faint font-mono text-xs" style={{ padding: "40px 20px", lineHeight: 1.8, fontSize: 12 }}>
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
                className="bg-card rounded-xl p-4 mb-2 border border-border flex gap-3.5 items-center cursor-pointer"
              >
                <div className="min-w-[44px] text-center">
                  <div className="font-mono text-dt uppercase" style={{ fontSize: 9 }}>
                    {eDateLabel}
                  </div>
                  <div className="font-serif text-primary" style={{ fontSize: 26 }}>
                    {eDateDay}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-serif text-base text-primary mb-0.5 font-normal" style={{ fontSize: 16 }}>
                    {e.title}
                  </div>
                  <div className="font-mono text-xs text-dim" style={{ fontSize: 11 }}>
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
                  className="bg-card rounded-xl p-4 mb-2 border border-border flex gap-3.5 items-center"
                >
                  <div className="min-w-[44px] text-center">
                    <div className="font-mono uppercase" style={{ fontSize: 9, color: CHECK_DOT_COLOR }}>
                      {cDateLabel}
                    </div>
                    <div className="font-serif text-primary" style={{ fontSize: 26 }}>
                      {cDateDay}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-serif text-base text-primary mb-0.5 font-normal" style={{ fontSize: 16 }}>
                      {c.text}
                    </div>
                    <div className="font-mono text-xs text-dim flex items-center gap-1.5" style={{ fontSize: 11 }}>
                      {c.eventTime && <span>{c.eventTime}</span>}
                      {c.eventTime && <span>·</span>}
                      <span
                        className="font-bold"
                        style={{
                          color: response === "down" ? "#e8ff5a" : response === "waitlist" ? "#888" : "#666",
                        }}
                      >
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
          <div className="font-mono text-tiny uppercase text-dim mt-6 mb-3" style={{ letterSpacing: "0.15em" }}>
            Left ({leftChecks.length})
          </div>
          {leftChecks.map((c) => {
            const cardDate = c.eventDate ? formatCheckCardDate(c.eventDate) : null;
            return (
              <div
                key={`left-${c.id}`}
                className="bg-card rounded-xl p-4 mb-2 border border-border flex gap-3.5 items-center opacity-60"
              >
                {cardDate && (
                  <div className="min-w-[44px] text-center">
                    <div className="font-mono text-faint uppercase" style={{ fontSize: 9 }}>
                      {cardDate.label}
                    </div>
                    <div className="font-serif text-muted" style={{ fontSize: 26 }}>
                      {cardDate.day}
                    </div>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-serif text-base text-muted mb-0.5 font-normal" style={{ fontSize: 16 }}>
                    {c.text}
                  </div>
                  <div className="font-mono text-xs text-faint" style={{ fontSize: 11 }}>
                    {c.author}{c.eventTime ? ` · ${c.eventTime}` : ""}
                  </div>
                </div>
                <button
                  onClick={() => onRedownFromLeft?.(c.id)}
                  className="font-mono text-xs font-bold uppercase text-dt bg-transparent border border-border-mid rounded-xl cursor-pointer whitespace-nowrap"
                  style={{ letterSpacing: "0.08em", padding: "8px 14px", fontSize: 12 }}
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
          className="fixed inset-0 z-100 flex items-end justify-center"
        >
          <div
            onClick={() => setSelectedEvent(null)}
            className="absolute inset-0 bg-black/70 backdrop-blur-[8px]"
            style={{ WebkitBackdropFilter: "blur(8px)" }}
          />
          <div
            className="relative bg-surface rounded-t-3xl w-full max-w-[420px] max-h-[85vh] overflow-y-auto animate-slide-up"
            style={{ padding: "16px 16px 40px" }}
          >
            <div className="w-10 h-1 bg-faint rounded-sm mx-auto mb-3" />
            <EventCard
              event={selectedEvent}
              userId={userId}
              onToggleSave={() => onToggleSave?.(selectedEvent.id)}
              onToggleDown={() => onToggleDown?.(selectedEvent.id)}
              onOpenSocial={() => onOpenSocial?.(selectedEvent)}
              onLongPress={
                (selectedEvent.createdBy === userId || !selectedEvent.createdBy)
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
          className="fixed inset-0 z-[9999] flex items-end justify-center"
        >
          <div
            onClick={closeSyncModal}
            className="absolute inset-0"
            style={{
              background: "rgba(0,0,0,0.7)",
              backdropFilter: syncClosing ? "blur(0px)" : "blur(8px)",
              WebkitBackdropFilter: syncClosing ? "blur(0px)" : "blur(8px)",
              opacity: syncClosing ? 0 : 1,
              transition: "opacity 0.2s ease, backdrop-filter 0.2s ease, -webkit-backdrop-filter 0.2s ease",
            }}
          />
          <div
            className="relative bg-surface rounded-t-3xl max-w-[420px] w-full max-h-[75vh] flex flex-col"
            style={{
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
              className="touch-none"
              style={{ padding: "16px 20px 0" }}
            >
              <div className="flex justify-center mb-3">
                <div className="w-10 h-1 bg-faint rounded-sm" />
              </div>
              <h3 className="font-serif text-lg text-primary font-normal mb-3" style={{ margin: "0 0 12px" }}>
                Sync to Calendar
              </h3>

              {/* Tabs */}
              <div className="flex gap-0 mb-3 border-b border-border">
                {(["export", "subscribe"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setSyncTab(tab)}
                    className={cn(
                      "flex-1 py-2 bg-transparent border-none font-mono text-xs cursor-pointer uppercase",
                      syncTab === tab ? "font-bold text-dt" : "font-normal text-dim",
                    )}
                    style={{
                      borderBottom: syncTab === tab ? "2px solid #e8ff5a" : "2px solid transparent",
                      fontSize: 11,
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
                <div className="flex items-center justify-between mb-2" style={{ padding: "0 20px" }}>
                  <span className="font-mono text-tiny text-dim">
                    {syncSelected.size} of {allExportable.length} selected
                  </span>
                  <button
                    onClick={() => {
                      if (syncSelected.size === allExportable.length) setSyncSelected(new Set());
                      else setSyncSelected(new Set(allExportable.map((e) => e.id)));
                    }}
                    className="bg-transparent border-none font-mono text-tiny text-dt cursor-pointer uppercase py-1"
                    style={{ letterSpacing: "0.08em", padding: "4px 0" }}
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
                  className="flex-1 overflow-y-auto overscroll-contain"
                  style={{ padding: "0 20px" }}
                >
                  {allExportable.map((item) => {
                    const selected = syncSelected.has(item.id);
                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleSyncItem(item.id)}
                        className="flex items-center gap-3 cursor-pointer border-b border-border"
                        style={{ padding: "10px 0" }}
                      >
                        <div
                          className={cn(
                            "w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-all duration-150",
                            selected ? "bg-dt border-2 border-dt" : "bg-transparent border-2 border-border-mid",
                          )}
                          style={{ borderRadius: 6 }}
                        >
                          {selected && <span className="text-black text-xs leading-none" style={{ fontSize: 12 }}>✓</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={cn(
                            "font-mono text-xs whitespace-nowrap overflow-hidden text-ellipsis",
                            selected ? "text-primary" : "text-muted",
                          )} style={{ fontSize: 12 }}>
                            {item.label}
                          </div>
                          <div className="font-mono text-tiny text-faint">
                            {item.sub}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Export action buttons */}
                <div className="flex gap-2" style={{ padding: "16px 20px calc(16px + env(safe-area-inset-bottom, 0px))" }}>
                  <button
                    onClick={() => handleSync("google")}
                    disabled={syncSelected.size === 0}
                    className={cn(
                      "flex-1 py-3 bg-transparent rounded-xl font-mono text-xs font-bold uppercase",
                      syncSelected.size > 0 ? "text-primary cursor-pointer border border-border-mid" : "text-faint cursor-default border border-border",
                    )}
                    style={{ fontSize: 12, letterSpacing: "0.08em" }}
                  >
                    Google Cal
                  </button>
                  <button
                    onClick={() => handleSync("ics")}
                    disabled={syncSelected.size === 0}
                    className={cn(
                      "flex-1 py-3 border-none rounded-xl font-mono text-xs font-bold uppercase",
                      syncSelected.size > 0 ? "bg-dt text-black cursor-pointer" : "bg-border text-faint cursor-default",
                    )}
                    style={{ fontSize: 12, letterSpacing: "0.08em" }}
                  >
                    Download .ics
                  </button>
                </div>
              </>
            ) : (
              /* Subscribe tab */
              <div style={{ padding: "0 20px calc(20px + env(safe-area-inset-bottom, 0px))" }}>
                <p className="font-mono text-xs text-muted mb-4" style={{ fontSize: 11, lineHeight: 1.6 }}>
                  Subscribe once and your calendar app will automatically stay in sync. New events you save will appear automatically — no duplicates.
                </p>

                {tokenLoading ? (
                  <div className="font-mono text-xs text-faint text-center p-5" style={{ fontSize: 11 }}>
                    Loading...
                  </div>
                ) : webcalUrl ? (
                  <>
                    {/* URL display */}
                    <div
                      className="bg-deep border border-border rounded-lg font-mono text-tiny text-dim mb-3 break-all"
                      style={{ padding: "10px 12px", lineHeight: 1.5 }}
                    >
                      {webcalUrl}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2">
                      <a
                        href={webcalUrl}
                        className="block py-3 bg-dt border-none rounded-xl text-black font-mono text-xs font-bold cursor-pointer uppercase text-center no-underline"
                        style={{ fontSize: 12, letterSpacing: "0.08em" }}
                      >
                        Subscribe in Calendar App
                      </a>
                      <button
                        onClick={copySubscribeUrl}
                        className={cn(
                          "py-3 bg-transparent border border-border-mid rounded-xl font-mono text-xs font-bold cursor-pointer uppercase",
                          copied ? "text-dt" : "text-primary",
                        )}
                        style={{ fontSize: 12, letterSpacing: "0.08em" }}
                      >
                        {copied ? "Copied!" : "Copy URL"}
                      </button>
                    </div>

                    <p className="font-mono text-faint text-center mt-3.5" style={{ fontSize: 9, lineHeight: 1.5 }}>
                      Works with Apple Calendar, Google Calendar, Outlook, and any app that supports webcal subscriptions. Your calendar will refresh automatically.
                    </p>
                  </>
                ) : (
                  <div className="font-mono text-xs text-faint text-center p-5" style={{ fontSize: 11 }}>
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
