/** Format a Date as YYYY-MM-DD in the local timezone (avoids UTC date-shift) */
export const toLocalISODate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** Strip HTML tags and trim whitespace */
export const sanitize = (s: string, maxLen = 200): string =>
  s.replace(/<[^>]*>/g, "").trim().slice(0, maxLen);

/** Sanitize an array of vibe tags */
export const sanitizeVibes = (vibes: string[]): string[] =>
  vibes
    .map((v) => sanitize(v, 30).toLowerCase().replace(/[^a-z0-9 -]/g, ""))
    .filter((v) => v.length > 0)
    .slice(0, 5);

/** Try to parse a human date string like "Sat, Feb 15" or "tonight" into YYYY-MM-DD */
export const parseDateToISO = (display: string): string | null => {
  if (!display || display === "TBD") return null;
  const lower = display.toLowerCase().trim();
  const today = new Date();

  if (lower === "tonight" || lower === "today" || lower === "tn") {
    return toLocalISODate(today);
  }
  if (lower === "tomorrow") {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return toLocalISODate(d);
  }

  // Try "Feb 15", "February 15", "Sat, Feb 15", "2/15", "3/19", etc.
  const year = today.getFullYear();

  const tryParseSingle = (input: string): string | null => {
    // Strip ordinal suffixes (1st, 2nd, 3rd, 4th, etc.) so Date.parse works
    const cleaned = input.replace(/(\d+)(st|nd|rd|th)\b/gi, "$1");

    // Handle "M/D" or "M/D/YY" formats — append year with slash so Date.parse works
    const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})$/);
    const withYear = slashMatch ? `${cleaned}/${year}` : `${cleaned} ${year}`;
    const parsed = new Date(withYear);
    if (!isNaN(parsed.getTime())) {
      // If the date is more than 2 months in the past, assume next year
      const twoMonthsAgo = new Date(today);
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
      if (parsed < twoMonthsAgo) {
        parsed.setFullYear(year + 1);
      }
      return toLocalISODate(parsed);
    }
    return null;
  };

  // Try the full string first
  const direct = tryParseSingle(display);
  if (direct) return direct;

  // Handle date ranges: "Mar 25 – Mar 28", "Feb 14 - Feb 16", "3/25 – 3/28"
  const parts = display.split(/\s*[–—-]\s*/);
  if (parts.length >= 2) {
    const first = tryParseSingle(parts[0].trim());
    if (first) return first;
  }

  return null;
};

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTH_NAMES: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

/** Todoist-style: scan free text for date phrases, return { label, iso } or null */
export const parseNaturalDate = (text: string): { label: string; iso: string } | null => {
  const lower = text.toLowerCase();
  const today = new Date();
  const todayDay = today.getDay();

  const fmt = toLocalISODate;
  const lbl = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  // "tonight" / "today" / "tn"
  if (/\b(tonight|today|tn)\b/.test(lower)) {
    return { label: "Today", iso: fmt(today) };
  }
  // "tomorrow" / "tmrw" / "tmr"
  if (/\b(tomorrow|tmrw|tmr)\b/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() + 1);
    return { label: lbl(d), iso: fmt(d) };
  }
  // "this weekend"
  if (/\bthis weekend\b/.test(lower)) {
    const d = new Date(today);
    const daysToSat = (6 - todayDay + 7) % 7 || 7;
    d.setDate(d.getDate() + (todayDay === 6 ? 0 : daysToSat));
    return { label: lbl(d), iso: fmt(d) };
  }
  // "next weekend"
  if (/\bnext weekend\b/.test(lower)) {
    const d = new Date(today);
    const daysToSat = (6 - todayDay + 7) % 7 || 7;
    d.setDate(d.getDate() + daysToSat + (todayDay <= 0 ? 6 : 0));
    if (d.getTime() - today.getTime() < 7 * 86400000) d.setDate(d.getDate() + 7);
    return { label: lbl(d), iso: fmt(d) };
  }
  // "in N days"
  const inDaysMatch = lower.match(/\bin (\d+) days?\b/);
  if (inDaysMatch) {
    const d = new Date(today); d.setDate(d.getDate() + parseInt(inDaysMatch[1]));
    return { label: lbl(d), iso: fmt(d) };
  }
  // "in a week" / "next week"
  if (/\b(in a week|next week)\b/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() + 7);
    return { label: lbl(d), iso: fmt(d) };
  }
  // "in N weeks" / "in two weeks" etc.
  const inWeeksMatch = lower.match(/\bin (\d+|two|three|four) weeks?\b/);
  if (inWeeksMatch) {
    const wordToNum: Record<string, number> = { two: 2, three: 3, four: 4 };
    const n = wordToNum[inWeeksMatch[1]] ?? parseInt(inWeeksMatch[1]);
    if (n > 0) {
      const d = new Date(today); d.setDate(d.getDate() + n * 7);
      return { label: lbl(d), iso: fmt(d) };
    }
  }
  // "next month"
  if (/\bnext month\b/.test(lower)) {
    const d = new Date(today); d.setMonth(d.getMonth() + 1, 1);
    return { label: lbl(d), iso: fmt(d) };
  }
  // "in N months"
  const inMonthsMatch = lower.match(/\bin (\d+|two|three) months?\b/);
  if (inMonthsMatch) {
    const wordToNum: Record<string, number> = { two: 2, three: 3 };
    const n = wordToNum[inMonthsMatch[1]] ?? parseInt(inMonthsMatch[1]);
    if (n > 0) {
      const d = new Date(today); d.setMonth(d.getMonth() + n, 1);
      return { label: lbl(d), iso: fmt(d) };
    }
  }
  // "next [day]" — skip this week
  const nextDayMatch = lower.match(/\bnext (mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (nextDayMatch) {
    const key = nextDayMatch[1].slice(0, 3);
    const targetDay = DAY_NAMES.findIndex(d => d.startsWith(key));
    if (targetDay >= 0) {
      const d = new Date(today);
      let diff = (targetDay - todayDay + 7) % 7;
      if (diff === 0) diff = 7;
      d.setDate(d.getDate() + diff + 7);
      return { label: lbl(d), iso: fmt(d) };
    }
  }
  // "this [day]" — if today matches, interpret as today
  const thisDayMatch = lower.match(/\bthis (mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (thisDayMatch) {
    const key = thisDayMatch[1].slice(0, 3);
    const targetDay = DAY_NAMES.findIndex(d => d.startsWith(key));
    if (targetDay >= 0) {
      const d = new Date(today);
      const diff = (targetDay - todayDay + 7) % 7;
      d.setDate(d.getDate() + diff);
      return { label: lbl(d), iso: fmt(d) };
    }
  }
  // Explicit numeric dates — checked BEFORE bare day name so "thurs 4/16" uses 4/16 not "thurs"
  // "feb 20" / "february 20th" / "mar 5"
  const monthDayMatch = lower.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (monthDayMatch) {
    const month = MONTH_NAMES[monthDayMatch[1].slice(0, 3)];
    const day = parseInt(monthDayMatch[2]);
    if (month !== undefined && day >= 1 && day <= 31) {
      const d = new Date(today.getFullYear(), month, day);
      if (d.getTime() < today.getTime() - 14 * 86400000) d.setFullYear(d.getFullYear() + 1);
      return { label: lbl(d), iso: fmt(d) };
    }
  }
  // "1/20" / "2/14" / "12/25" — NOT "1/20/2026" time-like patterns etc.
  const slashMatch = lower.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (slashMatch) {
    const month = parseInt(slashMatch[1]) - 1;
    const day = parseInt(slashMatch[2]);
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const d = new Date(today.getFullYear(), month, day);
      if (d.getTime() < today.getTime() - 14 * 86400000) d.setFullYear(d.getFullYear() + 1);
      return { label: lbl(d), iso: fmt(d) };
    }
  }
  // Bare day name — "friday", "sat", "sun", etc. (today if matches, else next occurrence)
  const bareDayMatch = lower.match(/\b(mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (bareDayMatch && bareDayMatch.index !== undefined) {
    // Skip "the sun" / "a sun" — article + "sun" isn't referring to Sunday
    const isFalseSun = bareDayMatch[1] === "sun" && /\b(the|a)\s+$/.test(lower.slice(0, bareDayMatch.index));
    if (!isFalseSun) {
      const key = bareDayMatch[1].slice(0, 3);
      const targetDay = DAY_NAMES.findIndex(d => d.startsWith(key));
      if (targetDay >= 0) {
        const d = new Date(today);
        const diff = (targetDay - todayDay + 7) % 7;
        d.setDate(d.getDate() + diff);
        return { label: lbl(d), iso: fmt(d) };
      }
    }
  }
  return null;
};

/** Scan free text for time phrases, return display string like "7pm" or null */
export const parseNaturalTime = (text: string): string | null => {
  const lower = text.toLowerCase();

  // "noon"
  if (/\bnoon\b/.test(lower)) return "12pm";
  // "midnight"
  if (/\bmidnight\b/.test(lower)) return "12am";

  // "at 7", "at 7pm", "at 7 pm", "at 7:30", "at 7:30pm" — "at" prefix makes it a time
  const atMatch = lower.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (atMatch) {
    return formatTimeMatch(parseInt(atMatch[1]), atMatch[2] || null, atMatch[3] as "am" | "pm" | undefined);
  }

  // "7pm", "7 pm", "7:30pm", "7:30 pm" — requires explicit am/pm (no false positives on dates)
  const meridiemMatch = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (meridiemMatch) {
    return formatTimeMatch(parseInt(meridiemMatch[1]), meridiemMatch[2] || null, meridiemMatch[3] as "am" | "pm");
  }

  return null;
};

const formatTimeMatch = (rawHour: number, minutes: string | null, meridiem: "am" | "pm" | undefined): string | null => {
  if (rawHour === 0 || rawHour > 12) return null;
  const suffix = meridiem ?? "pm";
  return minutes ? `${rawHour}:${minutes}${suffix}` : `${rawHour}${suffix}`;
};

/** Parse a location from text, e.g. "dinner at Jollibee" → "Jollibee" */
// TODO: disabled — parsing not reliable enough yet
export const parseNaturalLocation = (_text: string): string | null => {
  return null; // disabled
  const lower = _text.toLowerCase(); // eslint-disable-line no-unreachable

  // Skip "at" followed by time-like words
  const timeWords = /^(noon|midnight|night|\d{1,2}(:\d{2})?\s*(am|pm)?)\b/;

  // Match "at {location}" — capture everything after "at" until end or temporal/stop words
  const atMatch = lower.match(/\bat\s+(.+?)(?:\s*[·|,]|\s+(?:on|at|around|from|with|tonight|today|tomorrow|tmrw|tmr|tn|this|next|in|mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\s*$)/);
  if (atMatch && atMatch[1]) {
    const candidate = atMatch[1].trim();
    if (timeWords.test(candidate)) return null;
    if (candidate.length < 2 || candidate.length > 50) return null;
    // Capitalize first letter of each space-separated word (avoid apostrophe boundaries)
    return candidate.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  return null;
};

// ── Span-finding helpers (for inline highlighting) ─────────────────────

export type TextSpan = { start: number; end: number; type: "date" | "time" | "location" };

/** Find the position of the first date phrase in text (mirrors parseNaturalDate priority) */
export const findDateSpan = (text: string): TextSpan | null => {
  const lower = text.toLowerCase();

  // Order matches parseNaturalDate priority
  const patterns: RegExp[] = [
    /\b(tonight|today|tn)\b/,
    /\b(tomorrow|tmrw|tmr)\b/,
    /\bthis weekend\b/,
    /\bnext weekend\b/,
    /\bin \d+ days?\b/,
    /\b(in a week|next week)\b/,
    /\bin (\d+|two|three|four) weeks?\b/,
    /\bnext month\b/,
    /\bin (\d+|two|three) months?\b/,
    /\bnext (mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
    /\bthis (mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
    /\b(mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?\b/,
    /\b\d{1,2}\/\d{1,2}\b/,
  ];

  for (const pattern of patterns) {
    const m = lower.match(pattern);
    if (m && m.index !== undefined) {
      // Verify parseNaturalDate would actually parse this
      if (parseNaturalDate(text)) {
        return { start: m.index, end: m.index + m[0].length, type: "date" };
      }
    }
  }
  return null;
};

/** Find the position of the first time phrase in text (mirrors parseNaturalTime priority) */
export const findTimeSpan = (text: string): TextSpan | null => {
  const lower = text.toLowerCase();

  // "noon" / "midnight" — include "at " prefix if present
  for (const word of ["noon", "midnight"] as const) {
    const re = new RegExp(`\\bat\\s+${word}\\b|\\b${word}\\b`);
    const m = lower.match(re);
    if (m && m.index !== undefined) {
      return { start: m.index, end: m.index + m[0].length, type: "time" };
    }
  }

  // "at 7", "at 7pm", "at 7:30pm"
  const atRe = /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/;
  const atM = lower.match(atRe);
  if (atM && atM.index !== undefined) {
    const hour = parseInt(atM[1]);
    if (hour >= 1 && hour <= 12) {
      return { start: atM.index, end: atM.index + atM[0].length, type: "time" };
    }
  }

  // "7pm", "7:30pm"
  const meridiemRe = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/;
  const merM = lower.match(meridiemRe);
  if (merM && merM.index !== undefined) {
    const hour = parseInt(merM[1]);
    if (hour >= 1 && hour <= 12) {
      return { start: merM.index, end: merM.index + merM[0].length, type: "time" };
    }
  }

  return null;
};

/** Find the position of the "at {location}" phrase in text (mirrors parseNaturalLocation) */
export const findLocationSpan = (text: string): TextSpan | null => {
  if (!parseNaturalLocation(text)) return null;

  const lower = text.toLowerCase();
  const timeWords = /^(noon|midnight|night|\d{1,2}(:\d{2})?\s*(am|pm)?)\b/;
  const atRe = /\bat\s+(.+?)(?:\s*[·|,]|\s+(?:on|at|around|from|with)\s|\s*$)/;
  const m = lower.match(atRe);
  if (!m || m.index === undefined) return null;

  const candidate = m[1].trim();
  if (timeWords.test(candidate)) return null;
  if (candidate.length < 2) return null;

  const atPrefix = lower.slice(m.index).match(/^at\s+/);
  if (!atPrefix) return null;
  const start = m.index;
  const end = m.index + atPrefix[0].length + candidate.length;
  return { start, end, type: "location" };
};

/** Find all date/time/location spans in text, sorted by position */
export const findDateTimeSpans = (text: string): TextSpan[] => {
  const spans: TextSpan[] = [];
  const dateSpan = findDateSpan(text);
  if (dateSpan) spans.push(dateSpan);
  const timeSpan = findTimeSpan(text);
  if (timeSpan) spans.push(timeSpan);
  // Remove overlaps between date and time: keep the first (date has priority)
  if (spans.length === 2) {
    const [a, b] = spans;
    if (a.start < b.end && b.start < a.end) {
      spans.pop();
    }
  }
  // Add location span, trimming any overlap with date/time spans
  const locSpan = findLocationSpan(text);
  if (locSpan) {
    let { start, end } = locSpan;
    for (const s of spans) {
      if (start < s.end && s.start < end) {
        // Date/time span overlaps — trim location to end before it
        if (s.start > start) {
          end = s.start;
        } else {
          start = end; // fully overlapped, discard
        }
      }
    }
    // Trim trailing whitespace from adjusted span
    const trimmed = text.slice(start, end).trimEnd();
    end = start + trimmed.length;
    if (end > start && trimmed.length >= 3) {
      spans.push({ start, end, type: "location" });
    }
  }
  return spans.sort((a, b) => a.start - b.start);
};

/** Strip detected date/time phrases from text, collapse whitespace */
export const stripDateTimeText = (text: string): string => {
  const spans = findDateTimeSpans(text);
  if (spans.length === 0) return text;
  // Remove spans from right to left to preserve indices
  let result = text;
  for (let i = spans.length - 1; i >= 0; i--) {
    result = result.slice(0, spans[i].start) + result.slice(spans[i].end);
  }
  return result.replace(/\s{2,}/g, " ").trim();
};

/** Format a date as relative time ago (e.g., "2h", "5m", "now") */
export const formatTimeAgo = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  if (diffMins > 0) return `${diffMins}m`;
  return "now";
};
