/**
 * .ics (iCalendar) generation and Google Calendar URL builder.
 * No external dependencies — RFC 5545 compliant.
 */

export interface ICSEventParams {
  uid: string;
  title: string;
  date: string;       // ISO date: "2026-02-14"
  time?: string;       // Display time: "11PM-5AM", "8pm", "8:00 PM", "TBD", etc.
  venue?: string;
  description?: string;
}

// ── Time parsing ─────────────────────────────────────────────────────────

/**
 * Parse a time string like "8pm", "11PM", "8:00 PM", "Doors 8pm" into { hours, minutes }.
 * When `inferAmPm` is provided, bare numbers like "11" are interpreted using that hint.
 */
function parseTime(raw: string, inferAmPm?: "am" | "pm"): { hours: number; minutes: number } | null {
  // Try with explicit AM/PM first
  const m = raw.trim().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (m) {
    let hours = parseInt(m[1], 10);
    const minutes = m[2] ? parseInt(m[2], 10) : 0;
    const ampm = m[3].toLowerCase();
    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;
    if (hours > 23 || minutes > 59) return null;
    return { hours, minutes };
  }

  // Bare number like "11" or "11:00" — use inferAmPm if provided
  const bare = raw.trim().match(/(\d{1,2})(?::(\d{2}))?/);
  if (bare && inferAmPm) {
    let hours = parseInt(bare[1], 10);
    const minutes = bare[2] ? parseInt(bare[2], 10) : 0;
    if (inferAmPm === "pm" && hours < 12) hours += 12;
    if (inferAmPm === "am" && hours === 12) hours = 0;
    if (hours > 23 || minutes > 59) return null;
    return { hours, minutes };
  }

  return null;
}

/** Detect the AM/PM from a string, if present */
function detectAmPm(raw: string): "am" | "pm" | null {
  if (/am/i.test(raw)) return "am";
  if (/pm/i.test(raw)) return "pm";
  return null;
}

/** Parse display time like "11PM-5AM", "11-5pm", "8pm" into start/end times */
function parseTimeRange(display: string): {
  start: { hours: number; minutes: number };
  end?: { hours: number; minutes: number };
  endNextDay?: boolean;
} | null {
  if (!display || display === "TBD") return null;

  // Try range: "11PM-5AM" or "11-5pm" or "11PM - 5AM"
  const rangeMatch = display.match(/^(.+?)\s*[-–]\s*(.+)$/);
  if (rangeMatch) {
    const [, rawStart, rawEnd] = rangeMatch;
    const startAmPm = detectAmPm(rawStart);
    const endAmPm = detectAmPm(rawEnd);

    // Infer missing AM/PM from the other side:
    // "11-5pm" → end is PM, start 11 is before 5pm → 11am
    // "2-5pm" → end is PM, start 2 is before 5 in same period → 2pm
    // "11-5am" → end is AM → start is PM (overnight)
    const inferStart = startAmPm ?? (() => {
      if (!endAmPm) return null;
      const sNum = parseInt(rawStart.match(/\d+/)?.[0] ?? "0", 10);
      const eNum = parseInt(rawEnd.match(/\d+/)?.[0] ?? "0", 10);
      if (endAmPm === "am") return "pm" as const; // "11-5am" → 11pm-5am overnight
      // endAmPm is "pm": decide if start is AM or PM
      // If start hour > end hour (e.g. 11 > 5), it's likely a daytime span: 11am-5pm
      // If start hour <= end hour (e.g. 2 < 5), same period: 2pm-5pm
      if (sNum > eNum) return "am" as const; // "11-5pm" → 11am-5pm
      return "pm" as const; // "2-5pm" → 2pm-5pm
    })();
    const inferEnd = endAmPm ?? startAmPm;

    const start = parseTime(rawStart, inferStart ?? undefined);
    const end = parseTime(rawEnd, inferEnd ?? undefined);
    if (start && end) {
      const endNextDay = end.hours < start.hours || (end.hours === start.hours && end.minutes < start.minutes);
      return { start, end, endNextDay };
    }
  }

  // Single time: "8pm"
  const single = parseTime(display);
  if (single) return { start: single };

  return null;
}

// ── .ics formatting helpers ──────────────────────────────────────────────

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatICSDate(isoDate: string): string {
  // "2026-02-14" -> "20260214"
  return isoDate.replace(/-/g, "");
}

function formatICSDateTime(isoDate: string, hours: number, minutes: number): string {
  return `${formatICSDate(isoDate)}T${pad(hours)}${pad(minutes)}00`;
}

function addDays(isoDate: string, days: number): string {
  // Parse manually to avoid UTC timezone shift
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  const ry = date.getFullYear();
  const rm = (date.getMonth() + 1).toString().padStart(2, "0");
  const rd = date.getDate().toString().padStart(2, "0");
  return `${ry}-${rm}-${rd}`;
}

function escapeICS(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

// ── Public API ───────────────────────────────────────────────────────────

export function generateICSEvent(params: ICSEventParams, timezone?: string): string {
  const { uid, title, date, time, venue, description } = params;
  const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const parsed = parseTimeRange(time ?? "");

  const lines: string[] = [
    "BEGIN:VEVENT",
    `UID:${uid}@downto.app`,
    `DTSTAMP:${formatICSDate(new Date().toISOString().split("T")[0])}T000000Z`,
    `SUMMARY:${escapeICS(title)}`,
  ];

  if (parsed) {
    lines.push(`DTSTART;TZID=${tz}:${formatICSDateTime(date, parsed.start.hours, parsed.start.minutes)}`);
    if (parsed.end) {
      const endDate = parsed.endNextDay ? addDays(date, 1) : date;
      lines.push(`DTEND;TZID=${tz}:${formatICSDateTime(endDate, parsed.end.hours, parsed.end.minutes)}`);
    } else {
      // Default 2-hour duration
      const endH = parsed.start.hours + 2;
      const endDate = endH >= 24 ? addDays(date, 1) : date;
      lines.push(`DTEND;TZID=${tz}:${formatICSDateTime(endDate, endH % 24, parsed.start.minutes)}`);
    }
  } else {
    // All-day event
    lines.push(`DTSTART;VALUE=DATE:${formatICSDate(date)}`);
    lines.push(`DTEND;VALUE=DATE:${formatICSDate(addDays(date, 1))}`);
  }

  if (venue) lines.push(`LOCATION:${escapeICS(venue)}`);
  if (description) lines.push(`DESCRIPTION:${escapeICS(description)}`);

  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

export function generateICSCalendar(events: ICSEventParams[], timezone?: string): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//downto//downto.app//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events.map((e) => generateICSEvent(e, timezone)),
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

export function downloadICS(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function buildGoogleCalendarUrl(params: ICSEventParams): string {
  const { title, date, time, venue, description } = params;
  const parsed = parseTimeRange(time ?? "");

  const base = "https://calendar.google.com/calendar/render";
  const query = new URLSearchParams({ action: "TEMPLATE", text: title });

  if (parsed) {
    const start = formatICSDateTime(date, parsed.start.hours, parsed.start.minutes);
    let end: string;
    if (parsed.end) {
      const endDate = parsed.endNextDay ? addDays(date, 1) : date;
      end = formatICSDateTime(endDate, parsed.end.hours, parsed.end.minutes);
    } else {
      const endH = parsed.start.hours + 2;
      const endDate = endH >= 24 ? addDays(date, 1) : date;
      end = formatICSDateTime(endDate, endH % 24, parsed.start.minutes);
    }
    query.set("dates", `${start}/${end}`);
  } else {
    // All-day
    const start = formatICSDate(date);
    const end = formatICSDate(addDays(date, 1));
    query.set("dates", `${start}/${end}`);
  }

  if (venue) query.set("location", venue);
  if (description) query.set("details", description);

  return `${base}?${query.toString()}`;
}
