import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  toLocalISODate,
  sanitize,
  sanitizeVibes,
  parseDateToISO,
  parseNaturalDate,
  parseNaturalTime,
  formatTimeAgo,
} from "./utils";

// ─── toLocalISODate ──────────────────────────────────────────────────────────

describe("toLocalISODate", () => {
  it("formats date as YYYY-MM-DD", () => {
    expect(toLocalISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("zero-pads single-digit month and day", () => {
    expect(toLocalISODate(new Date(2026, 2, 3))).toBe("2026-03-03");
  });

  it("uses local timezone, not UTC", () => {
    // 2026-02-28 at 11pm local — UTC would be next day in some timezones
    const d = new Date(2026, 1, 28, 23, 0, 0);
    expect(toLocalISODate(d)).toBe("2026-02-28");
  });
});

// ─── sanitize ────────────────────────────────────────────────────────────────

describe("sanitize", () => {
  it("strips HTML tags", () => {
    expect(sanitize("<b>hello</b> world")).toBe("hello world");
    expect(sanitize("<p>test</p>")).toBe("test");
  });

  it("trims whitespace", () => {
    expect(sanitize("  hello  ")).toBe("hello");
  });

  it("truncates to maxLen", () => {
    expect(sanitize("abcdefghij", 5)).toBe("abcde");
  });

  it("uses 200 as default maxLen", () => {
    const long = "a".repeat(300);
    expect(sanitize(long)).toHaveLength(200);
  });
});

// ─── sanitizeVibes ───────────────────────────────────────────────────────────

describe("sanitizeVibes", () => {
  it("lowercases and strips special chars", () => {
    expect(sanitizeVibes(["House!", "TECHNO?", "d&b"])).toEqual([
      "house",
      "techno",
      "db",
    ]);
  });

  it("filters empty strings after sanitization", () => {
    expect(sanitizeVibes(["!!!", "ok"])).toEqual(["ok"]);
  });

  it("caps at 5 items", () => {
    const vibes = ["a", "b", "c", "d", "e", "f", "g"];
    expect(sanitizeVibes(vibes)).toHaveLength(5);
  });

  it("allows hyphens and spaces", () => {
    expect(sanitizeVibes(["lo-fi", "late night"])).toEqual([
      "lo-fi",
      "late night",
    ]);
  });
});

// ─── parseDateToISO ──────────────────────────────────────────────────────────

describe("parseDateToISO", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 27)); // Feb 27, 2026
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns today for "tonight"', () => {
    expect(parseDateToISO("tonight")).toBe("2026-02-27");
  });

  it('returns today for "today"', () => {
    expect(parseDateToISO("today")).toBe("2026-02-27");
  });

  it('returns tomorrow for "tomorrow"', () => {
    expect(parseDateToISO("tomorrow")).toBe("2026-02-28");
  });

  it("returns null for TBD", () => {
    expect(parseDateToISO("TBD")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseDateToISO("")).toBeNull();
  });

  it('parses "Feb 15" format', () => {
    expect(parseDateToISO("Feb 15")).toBe("2026-02-15");
  });

  it('parses "Sat, Feb 15" format', () => {
    expect(parseDateToISO("Sat, Feb 15")).toBe("2026-02-15");
  });

  it('parses "2/14" slash format', () => {
    expect(parseDateToISO("2/14")).toBe("2026-02-14");
  });

  it("strips ordinal suffixes", () => {
    expect(parseDateToISO("March 1st")).toBe("2026-03-01");
    expect(parseDateToISO("April 2nd")).toBe("2026-04-02");
    expect(parseDateToISO("May 3rd")).toBe("2026-05-03");
  });

  it("rolls past dates to next year", () => {
    // Nov is well past Feb 27 - more than 2 months ago → rolls to next year
    expect(parseDateToISO("Nov 1")).toBe("2026-11-01");
    // But a date well in the past should roll
    expect(parseDateToISO("8/1")).toBe("2026-08-01");
  });
});

// ─── parseNaturalDate ────────────────────────────────────────────────────────

describe("parseNaturalDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Friday Feb 27, 2026
    vi.setSystemTime(new Date(2026, 1, 27));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('parses "tonight"', () => {
    const r = parseNaturalDate("down for tonight?");
    expect(r?.iso).toBe("2026-02-27");
    expect(r?.label).toBe("Today");
  });

  it('parses "tomorrow" / "tmrw"', () => {
    expect(parseNaturalDate("tmrw works")?.iso).toBe("2026-02-28");
    expect(parseNaturalDate("let's go tomorrow")?.iso).toBe("2026-02-28");
  });

  it('parses "this weekend"', () => {
    // Feb 27 is Friday → this weekend = Sat Feb 28
    const r = parseNaturalDate("this weekend?");
    expect(r?.iso).toBe("2026-02-28");
  });

  it('parses "in 3 days"', () => {
    const r = parseNaturalDate("in 3 days");
    expect(r?.iso).toBe("2026-03-02");
  });

  it('parses bare day names like "friday"', () => {
    // Feb 27 is Fri → next Friday = Mar 6
    const r = parseNaturalDate("friday");
    expect(r?.iso).toBe("2026-03-06");
  });

  it('parses "next friday"', () => {
    // Feb 27 is Fri → next friday skips this week = Mar 13
    const r = parseNaturalDate("next friday");
    expect(r?.iso).toBe("2026-03-13");
  });

  it('parses "feb 20" month-day', () => {
    const r = parseNaturalDate("feb 20");
    expect(r?.iso).toBe("2026-02-20");
  });

  it('parses "1/20" slash format', () => {
    const r = parseNaturalDate("1/20");
    // Jan 20 is past but within 14 days window → next year
    expect(r?.iso).toBe("2027-01-20");
  });

  it("parses embedded date in sentence", () => {
    const r = parseNaturalDate("anyone down for sat?");
    expect(r).not.toBeNull();
    expect(r?.iso).toBe("2026-02-28");
  });

  it("returns null when no date found", () => {
    expect(parseNaturalDate("just vibing")).toBeNull();
  });

  it('does not parse "sun" as Sunday in natural text', () => {
    expect(parseNaturalDate("bask in the sun and play mahjong in prospect park")).toBeNull();
  });

  it('still parses "sunday" and "this sun" / "next sun"', () => {
    expect(parseNaturalDate("let's go sunday")?.iso).toBe("2026-03-01");
    expect(parseNaturalDate("this sun works")?.iso).toBe("2026-03-01");
    expect(parseNaturalDate("next sun")?.iso).toBe("2026-03-08");
  });
});

// ─── parseNaturalTime ────────────────────────────────────────────────────────

describe("parseNaturalTime", () => {
  it('parses "noon"', () => {
    expect(parseNaturalTime("noon")).toBe("12 PM");
  });

  it('parses "midnight"', () => {
    expect(parseNaturalTime("midnight")).toBe("12 AM");
  });

  it('"at 7" defaults to PM', () => {
    expect(parseNaturalTime("at 7")).toBe("7 PM");
  });

  it('parses "7pm"', () => {
    expect(parseNaturalTime("7pm")).toBe("7 PM");
  });

  it('parses "7:30 am"', () => {
    expect(parseNaturalTime("7:30 am")).toBe("7:30 AM");
  });

  it("returns null for hour 0", () => {
    expect(parseNaturalTime("at 0")).toBeNull();
  });

  it("returns null for hour > 12", () => {
    expect(parseNaturalTime("at 13")).toBeNull();
  });

  it("returns null when no time found", () => {
    expect(parseNaturalTime("sometime later")).toBeNull();
  });
});

// ─── formatTimeAgo ───────────────────────────────────────────────────────────

describe("formatTimeAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 27, 12, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "now" for just now', () => {
    expect(formatTimeAgo(new Date(2026, 1, 27, 12, 0, 0))).toBe("now");
  });

  it('returns "5m" for 5 minutes ago', () => {
    expect(formatTimeAgo(new Date(2026, 1, 27, 11, 55, 0))).toBe("5m");
  });

  it('returns "2h" for 2 hours ago', () => {
    expect(formatTimeAgo(new Date(2026, 1, 27, 10, 0, 0))).toBe("2h");
  });

  it('returns "3d" for 3 days ago', () => {
    expect(formatTimeAgo(new Date(2026, 1, 24, 12, 0, 0))).toBe("3d");
  });
});
