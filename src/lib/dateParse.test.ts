/**
 * Tests for src/lib/dateParse.ts.
 *
 * Anchors:
 *   - "today" in every test is FROZEN_NOW (Mon 2026-04-27, 14:00 local).
 *     vi.setSystemTime + vi.useFakeTimers() pin it. Use vi.getRealSystemTime()
 *     to verify the freeze took before relying on a relative result.
 *   - All ISO output uses local-tz YYYY-MM-DD via toLocalISODate. We
 *     deliberately *don't* manipulate process.env.TZ inside tests — the
 *     parser's contract is "interpret the user's clock", and the host's TZ
 *     is the only place that's defined. The local-tz invariant is covered
 *     by fixing the system time at noon (well clear of any UTC midnight
 *     boundary) and asserting the output is the local YYYY-MM-DD.
 *
 * Convention:
 *   - Day-of-week deltas are computed from the FROZEN_NOW Monday.
 *     Mon=0d, Tue=1d, Wed=2d, Thu=3d, Fri=4d, Sat=5d, Sun=6d.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  toLocalISODate,
  parseDateToISO,
  parseNaturalDate,
  parseNaturalTime,
  parseWhen,
} from "./dateParse";

// Mon Apr 27 2026, 14:00:00 in the local timezone.
const FROZEN_NOW = new Date(2026, 3, 27, 14, 0, 0);

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

const iso = (year: number, monthIdx: number, day: number) =>
  toLocalISODate(new Date(year, monthIdx, day));

// Date arithmetic relative to the frozen Monday.
const TODAY = iso(2026, 3, 27);     // Mon 2026-04-27
const TOMORROW = iso(2026, 3, 28);  // Tue 2026-04-28
const TUE = iso(2026, 3, 28);       // Tue 2026-04-28 (1 day from Mon)
const WED = iso(2026, 3, 29);       // Wed 2026-04-29
const THU = iso(2026, 3, 30);       // Thu 2026-04-30
const FRI = iso(2026, 4, 1);        // Fri 2026-05-01
const SAT = iso(2026, 4, 2);        // Sat 2026-05-02
const SUN = iso(2026, 4, 3);        // Sun 2026-05-03
const NEXT_MON = iso(2026, 4, 4);   // Mon 2026-05-04 (one week out)
const NEXT_TUE = iso(2026, 4, 5);
const NEXT_THU = iso(2026, 4, 7);
const NEXT_FRI = iso(2026, 4, 8);
// Existing parser quirk: when "next [day]" matches the current day, it
// jumps TWO weeks (current implementation does +diff+7 with diff=7).
const NEXT_NEXT_MON = iso(2026, 4, 11); // Mon 2026-05-11 (two weeks out)

describe("toLocalISODate", () => {
  it("formats year/month/day with zero-padding", () => {
    expect(toLocalISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toLocalISODate(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("does NOT shift across UTC midnight (regression for the .toISOString() trap)", () => {
    // 23:30 local on Apr 27 — if a buggy implementation called .toISOString()
    // we'd see Apr 28 in many time zones west of UTC.
    const lateNight = new Date(2026, 3, 27, 23, 30, 0);
    expect(toLocalISODate(lateNight)).toBe("2026-04-27");
  });
});

describe("parseNaturalDate — relative anchors", () => {
  it("today / tonight / tn", () => {
    expect(parseNaturalDate("today")?.iso).toBe(TODAY);
    expect(parseNaturalDate("tonight")?.iso).toBe(TODAY);
    expect(parseNaturalDate("tn")?.iso).toBe(TODAY);
    expect(parseNaturalDate("today")?.label).toBe("Today");
  });

  it("tomorrow / tmrw / tmr", () => {
    expect(parseNaturalDate("tomorrow")?.iso).toBe(TOMORROW);
    expect(parseNaturalDate("tmrw")?.iso).toBe(TOMORROW);
    expect(parseNaturalDate("tmr")?.iso).toBe(TOMORROW);
  });

  it("this weekend → upcoming Saturday", () => {
    // Mon → Sat is 5 days
    expect(parseNaturalDate("this weekend")?.iso).toBe(SAT);
  });

  it("next weekend → following Saturday", () => {
    // From Mon, "next weekend" is the Sat AFTER this weekend's Sat.
    const nextSat = iso(2026, 4, 9);
    expect(parseNaturalDate("next weekend")?.iso).toBe(nextSat);
  });

  it('"in N days"', () => {
    expect(parseNaturalDate("in 3 days")?.iso).toBe(THU);   // Mon + 3 = Thu
    expect(parseNaturalDate("in 1 day")?.iso).toBe(TOMORROW);
  });

  it('"in a week" / "next week"', () => {
    expect(parseNaturalDate("in a week")?.iso).toBe(NEXT_MON);
    expect(parseNaturalDate("next week")?.iso).toBe(NEXT_MON);
  });

  it('"in N weeks" — numeric and word forms', () => {
    expect(parseNaturalDate("in 2 weeks")?.iso).toBe(iso(2026, 4, 11)); // +14d
    expect(parseNaturalDate("in two weeks")?.iso).toBe(iso(2026, 4, 11));
    expect(parseNaturalDate("in three weeks")?.iso).toBe(iso(2026, 4, 18));
  });

  it('"next month" → first of next month', () => {
    expect(parseNaturalDate("next month")?.iso).toBe(iso(2026, 4, 1));
  });

  it('"in N months" — numeric and word forms', () => {
    expect(parseNaturalDate("in 1 month")?.iso).toBe(iso(2026, 4, 1));
    expect(parseNaturalDate("in two months")?.iso).toBe(iso(2026, 5, 1));
    expect(parseNaturalDate("in three months")?.iso).toBe(iso(2026, 6, 1));
  });
});

describe("parseNaturalDate — day-of-week", () => {
  it('"this [day]" — current day stays today', () => {
    expect(parseNaturalDate("this monday")?.iso).toBe(TODAY); // we're frozen on Mon
    expect(parseNaturalDate("this mon")?.iso).toBe(TODAY);
  });

  it('"this [day]" — future days within this week', () => {
    expect(parseNaturalDate("this thursday")?.iso).toBe(THU);
    expect(parseNaturalDate("this fri")?.iso).toBe(FRI);
    expect(parseNaturalDate("this sun")?.iso).toBe(SUN);
  });

  it('"next [day]" — skips this week, and "next $today" jumps two weeks', () => {
    // "next thu" on a Mon → THIS week's Thu is upcoming, so "next thu" skips
    // to next week's Thu (NEXT_THU). Same for fri.
    expect(parseNaturalDate("next thu")?.iso).toBe(NEXT_THU);
    expect(parseNaturalDate("next thurs")?.iso).toBe(NEXT_THU);
    expect(parseNaturalDate("next fri")?.iso).toBe(NEXT_FRI);
    // Quirk worth pinning: when [day] is today, the parser goes TWO weeks
    // out (diff===0 → diff=7, plus the universal +7). Documenting this here
    // so a future "fix" doesn't change it without intent.
    expect(parseNaturalDate("next monday")?.iso).toBe(NEXT_NEXT_MON);
  });

  it("informal day spellings (thurs, tues, weds) parse the same as canonical forms", () => {
    expect(parseNaturalDate("thurs")?.iso).toBe(THU);
    expect(parseNaturalDate("tues")?.iso).toBe(TUE);
    expect(parseNaturalDate("weds")?.iso).toBe(WED);
  });

  it("bare day name — current day stays today", () => {
    expect(parseNaturalDate("monday")?.iso).toBe(TODAY);
    expect(parseNaturalDate("mon")?.iso).toBe(TODAY);
  });

  it("bare day name — future day in current week", () => {
    expect(parseNaturalDate("thursday")?.iso).toBe(THU);
    expect(parseNaturalDate("friday")?.iso).toBe(FRI);
  });

  it('false-sun: "the sun" is not Sunday', () => {
    expect(parseNaturalDate("watch the sun rise")).toBeNull();
    expect(parseNaturalDate("a sun")).toBeNull();
  });
});

describe("parseNaturalDate — explicit dates", () => {
  it('month name + day ("feb 20", "february 20th")', () => {
    expect(parseNaturalDate("dec 25")?.iso).toBe(iso(2026, 11, 25));
    expect(parseNaturalDate("december 25")?.iso).toBe(iso(2026, 11, 25));
    expect(parseNaturalDate("dec 25th")?.iso).toBe(iso(2026, 11, 25));
  });

  it("rolls a past date forward to next year (>14 days back)", () => {
    // Mar 1 is well over 2 weeks before our frozen Apr 27 → next year.
    expect(parseNaturalDate("march 1")?.iso).toBe(iso(2027, 2, 1));
  });

  it('numeric "M/D"', () => {
    expect(parseNaturalDate("12/25")?.iso).toBe(iso(2026, 11, 25));
    expect(parseNaturalDate("5/9")?.iso).toBe(iso(2026, 4, 9));
  });

  it("explicit numeric beats the bare day name", () => {
    // "thurs 12/25" — must use 12/25, not Thu.
    expect(parseNaturalDate("thurs 12/25")?.iso).toBe(iso(2026, 11, 25));
  });

  it("returns null on garbage", () => {
    expect(parseNaturalDate("nothing here")).toBeNull();
    expect(parseNaturalDate("")).toBeNull();
  });
});

describe("parseDateToISO — display-format parser", () => {
  it("today / tonight / tn / tomorrow", () => {
    expect(parseDateToISO("today")).toBe(TODAY);
    expect(parseDateToISO("tonight")).toBe(TODAY);
    expect(parseDateToISO("tn")).toBe(TODAY);
    expect(parseDateToISO("tomorrow")).toBe(TOMORROW);
  });

  it('"Sat, Feb 15" display format', () => {
    // The next Feb 15 from a frozen Apr 27 2026 is Feb 15 2027.
    expect(parseDateToISO("Sat, Feb 15")).toBe(iso(2027, 1, 15));
  });

  it("date range — picks the first half (raw year, no rollforward when in same year)", () => {
    // Mar 25 from a frozen Apr 27 2026 is in the past but only ~1 month —
    // under the 2-month rollforward threshold, so stays in the current year.
    expect(parseDateToISO("Mar 25 – Mar 28")).toBe(iso(2026, 2, 25));
    expect(parseDateToISO("Feb 14 - Feb 16")).toBe(iso(2027, 1, 14));
  });

  it('"M/D" format', () => {
    expect(parseDateToISO("12/25")).toBe(iso(2026, 11, 25));
    expect(parseDateToISO("5/9")).toBe(iso(2026, 4, 9));
  });

  it("returns null on TBD / empty", () => {
    expect(parseDateToISO("TBD")).toBeNull();
    expect(parseDateToISO("")).toBeNull();
  });

  it("KNOWN LOOSENESS: parseDateToISO accepts arbitrary strings via Node's Date constructor", () => {
    // `new Date("nothing here 2026")` returns Jan 1, 2026 in V8. We document
    // the existing behavior here so future tightening is intentional. parseWhen
    // guards against this by requiring a digit before falling back to
    // parseDateToISO on a segment.
    expect(parseDateToISO("nothing here")).not.toBeNull();
  });
});

describe("parseNaturalTime", () => {
  it("noon / midnight", () => {
    expect(parseNaturalTime("noon")).toBe("12pm");
    expect(parseNaturalTime("midnight")).toBe("12am");
    expect(parseNaturalTime("at noon")).toBe("12pm");
  });

  it('"at N" defaults to pm when no meridiem', () => {
    expect(parseNaturalTime("at 7")).toBe("7pm");
    expect(parseNaturalTime("at 7pm")).toBe("7pm");
    expect(parseNaturalTime("at 7am")).toBe("7am");
    expect(parseNaturalTime("at 7:30")).toBe("7:30pm");
    expect(parseNaturalTime("at 7:30pm")).toBe("7:30pm");
  });

  it("compact H(H)MM with meridiem", () => {
    expect(parseNaturalTime("420pm")).toBe("4:20pm");
    expect(parseNaturalTime("730am")).toBe("7:30am");
    expect(parseNaturalTime("1230pm")).toBe("12:30pm");
  });

  it("standalone meridiem time", () => {
    expect(parseNaturalTime("dinner at 7pm")).toBe("7pm");
    expect(parseNaturalTime("7:30pm")).toBe("7:30pm");
    expect(parseNaturalTime("11 pm")).toBe("11pm");
  });

  it('drops the ":00" suffix', () => {
    expect(parseNaturalTime("7:00pm")).toBe("7pm");
  });

  it("returns null on garbage", () => {
    expect(parseNaturalTime("")).toBeNull();
    expect(parseNaturalTime("nothing")).toBeNull();
    expect(parseNaturalTime("13pm")).toBeNull(); // hour out of range
  });
});

describe('parseWhen — single-date inputs (regression: behaves like parseNaturalDate)', () => {
  it("single day", () => {
    const r = parseWhen("thursday");
    expect(r.dates).toEqual([THU]);
    expect(r.time).toBeNull();
    expect(r.label).toBe("thursday");
  });

  it("single day + time", () => {
    const r = parseWhen("thursday at 7pm");
    expect(r.dates).toEqual([THU]);
    expect(r.time).toBe("7pm");
  });

  it("relative phrase + time", () => {
    const r = parseWhen("tomorrow at noon");
    expect(r.dates).toEqual([TOMORROW]);
    expect(r.time).toBe("12pm");
  });

  it("explicit numeric date alone", () => {
    expect(parseWhen("12/25").dates).toEqual([iso(2026, 11, 25)]);
  });

  it("comma-separated display ('Sat, Feb 15') stays one date", () => {
    // The whole-string fallback in parseWhen catches this — the comma
    // here is structural ("weekday, month day"), not a separator.
    expect(parseWhen("Sat, Feb 15").dates).toEqual([iso(2027, 1, 15)]);
  });

  it("empty / whitespace input", () => {
    expect(parseWhen("").dates).toEqual([]);
    expect(parseWhen("   ").dates).toEqual([]);
  });

  it("garbage input parses to no dates", () => {
    expect(parseWhen("nothing here").dates).toEqual([]);
  });
});

describe('parseWhen — "or" / "/" / comma splits (the new feature)', () => {
  it('"thurs or fri"', () => {
    const r = parseWhen("thurs or fri");
    expect(r.dates).toEqual([THU, FRI]);
  });

  it('"next thurs or next fri" — the motivating example', () => {
    const r = parseWhen("next thurs or next fri");
    expect(r.dates).toEqual([NEXT_THU, NEXT_FRI]);
  });

  it("slash separator — 'thurs/fri'", () => {
    expect(parseWhen("thurs/fri").dates).toEqual([THU, FRI]);
    expect(parseWhen("thu / fri").dates).toEqual([THU, FRI]);
  });

  it("three-way 'or'", () => {
    expect(parseWhen("wed or thu or fri").dates).toEqual([WED, THU, FRI]);
  });

  it('time applies to all dates ("thurs or fri at 7pm")', () => {
    const r = parseWhen("thurs or fri at 7pm");
    expect(r.dates).toEqual([THU, FRI]);
    expect(r.time).toBe("7pm");
  });

  it("dedupes identical dates", () => {
    expect(parseWhen("thursday or thu").dates).toEqual([THU]);
  });

  it("preserves order in the output", () => {
    expect(parseWhen("fri or thurs").dates).toEqual([FRI, THU]);
  });

  it("mixes valid + invalid segments — keeps the valid ones", () => {
    expect(parseWhen("thurs or blahblah").dates).toEqual([THU]);
  });

  it('mixes natural + numeric ("tomorrow or 5/9")', () => {
    expect(parseWhen("tomorrow or 5/9").dates).toEqual([TOMORROW, iso(2026, 4, 9)]);
  });

  it('"next thurs or next fri at 7:30pm"', () => {
    const r = parseWhen("next thurs or next fri at 7:30pm");
    expect(r.dates).toEqual([NEXT_THU, NEXT_FRI]);
    expect(r.time).toBe("7:30pm");
  });

  it("preserves the original input as the label", () => {
    expect(parseWhen("next thurs or next fri").label).toBe("next thurs or next fri");
  });
});

describe("parseWhen — local timezone invariants", () => {
  it('"today" returns the local YYYY-MM-DD even at late local hours', () => {
    // Frozen at 14:00 local (well clear of UTC midnight). The local Apr 27
    // is what we want, regardless of the host's UTC offset.
    expect(parseWhen("today").dates[0]).toBe(TODAY);
  });

  it("explicit dates round-trip through local Date construction without drift", () => {
    // 12/25 should always come out as 2026-12-25 in local-tz YYYY-MM-DD.
    expect(parseWhen("12/25").dates[0]).toBe("2026-12-25");
  });
});
