/**
 * Tests for the mystery-check reveal logic.
 *
 * Anchors:
 *   - "today" in every test is FROZEN_NOW (Mon 2026-04-27, 14:00 local).
 *     vi.useFakeTimers + vi.setSystemTime pin it. localTodayISO is computed
 *     from the *passed-in* Date though, so we mostly construct fresh Dates
 *     per case rather than relying on the frozen clock.
 *   - All event_date values are local-tz YYYY-MM-DD, mirroring how the
 *     creation path stores them.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { isMysteryUnrevealed, localTodayISO } from "./mystery";

// Mon Apr 27 2026, 14:00:00 in the local timezone.
const FROZEN_NOW = new Date(2026, 3, 27, 14, 0, 0);

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

const AUTHOR = "00000000-0000-0000-0000-000000000aaa";
const VIEWER = "00000000-0000-0000-0000-000000000bbb";

describe("localTodayISO", () => {
  it("formats in local tz, not UTC (avoids the toISOString() midnight-shift trap)", () => {
    // 2026-04-27 14:00 local = guaranteed to be 2026-04-27 in any non-equator
    // timezone. The point is to lock down that we're NOT going through
    // toISOString() which would emit a UTC date.
    expect(localTodayISO(FROZEN_NOW)).toBe("2026-04-27");
  });

  it("zero-pads single-digit months and days", () => {
    expect(localTodayISO(new Date(2026, 0, 5, 9, 0, 0))).toBe("2026-01-05");
  });
});

describe("isMysteryUnrevealed", () => {
  describe("non-mystery checks", () => {
    it("returns false when mystery=false, regardless of viewer or date", () => {
      expect(
        isMysteryUnrevealed(
          { mystery: false, authorId: AUTHOR, eventDate: "2030-01-01" },
          VIEWER,
          FROZEN_NOW,
        ),
      ).toBe(false);
    });

    it("returns false when mystery=false even with no event_date", () => {
      expect(
        isMysteryUnrevealed(
          { mystery: false, authorId: AUTHOR, eventDate: null },
          VIEWER,
          FROZEN_NOW,
        ),
      ).toBe(false);
    });
  });

  describe("author viewing their own mystery check", () => {
    it("never redacts — author always sees their own check unredacted", () => {
      expect(
        isMysteryUnrevealed(
          { mystery: true, authorId: AUTHOR, eventDate: "2030-01-01" },
          AUTHOR,
          FROZEN_NOW,
        ),
      ).toBe(false);
    });

    it("not redacted even when event_date is past (irrelevant for the author)", () => {
      expect(
        isMysteryUnrevealed(
          { mystery: true, authorId: AUTHOR, eventDate: "2025-01-01" },
          AUTHOR,
          FROZEN_NOW,
        ),
      ).toBe(false);
    });

    it("not redacted with no event_date either", () => {
      expect(
        isMysteryUnrevealed(
          { mystery: true, authorId: AUTHOR, eventDate: null },
          AUTHOR,
          FROZEN_NOW,
        ),
      ).toBe(false);
    });
  });

  describe("non-author viewing a mystery check", () => {
    it("redacts when event_date is in the future", () => {
      expect(
        isMysteryUnrevealed(
          { mystery: true, authorId: AUTHOR, eventDate: "2026-04-30" },
          VIEWER,
          FROZEN_NOW,
        ),
      ).toBe(true);
    });

    it("REVEALS on the event_date itself (event_date == today, not >)", () => {
      // This is the load-bearing assertion: the spec says "reveals on the
      // day of the event", which means equal-to-today should reveal, not
      // redact. localTodayISO(FROZEN_NOW) === "2026-04-27", so an event_date
      // of "2026-04-27" should NOT be unrevealed.
      expect(
        isMysteryUnrevealed(
          { mystery: true, authorId: AUTHOR, eventDate: "2026-04-27" },
          VIEWER,
          FROZEN_NOW,
        ),
      ).toBe(false);
    });

    it("reveals when event_date is in the past", () => {
      expect(
        isMysteryUnrevealed(
          { mystery: true, authorId: AUTHOR, eventDate: "2026-04-26" },
          VIEWER,
          FROZEN_NOW,
        ),
      ).toBe(false);
    });

    it("redacts (treats as unrevealed) when event_date is missing", () => {
      // The DB CHECK constraint should make this unreachable in prod, but
      // defensively we treat null as 'still hidden' rather than 'reveal' —
      // failing safe avoids accidental author leak.
      expect(
        isMysteryUnrevealed(
          { mystery: true, authorId: AUTHOR, eventDate: null },
          VIEWER,
          FROZEN_NOW,
        ),
      ).toBe(true);
    });

    it("redacts logged-out viewers (userId=null) too", () => {
      // Shared-link / guest path: no auth, so by definition not the author.
      expect(
        isMysteryUnrevealed(
          { mystery: true, authorId: AUTHOR, eventDate: "2026-04-30" },
          null,
          FROZEN_NOW,
        ),
      ).toBe(true);
    });
  });

  describe("reveal boundary across local midnight", () => {
    it("redacted at 23:59 the day before event", () => {
      const lateNight = new Date(2026, 3, 27, 23, 59, 0); // Mon 23:59
      expect(
        isMysteryUnrevealed(
          { mystery: true, authorId: AUTHOR, eventDate: "2026-04-28" },
          VIEWER,
          lateNight,
        ),
      ).toBe(true);
    });

    it("revealed at 00:00 on the event day", () => {
      const justAfterMidnight = new Date(2026, 3, 28, 0, 0, 0); // Tue 00:00
      expect(
        isMysteryUnrevealed(
          { mystery: true, authorId: AUTHOR, eventDate: "2026-04-28" },
          VIEWER,
          justAfterMidnight,
        ),
      ).toBe(false);
    });
  });
});
