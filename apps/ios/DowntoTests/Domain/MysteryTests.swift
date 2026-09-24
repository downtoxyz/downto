// DowntoTests/Domain/MysteryTests.swift — ports all 14 cases of src/features/checks/lib/mystery.test.ts (ARCHITECTURE §9.1)
// and runs the local-midnight boundary in three time zones.
import Foundation
import Testing
@testable import Downto

@Suite("Mystery")
struct MysteryTests {
    static let cal = DomainTestSupport.calendar("America/Los_Angeles")
    static let frozenNow = DomainTestSupport.date(2026, 4, 27, 14, 0, 0, calendar: cal)   // Mon Apr 27 2026 14:00 local
    static let author = UserID(UUID(uuidString: "00000000-0000-0000-0000-000000000aaa")!)
    static let viewer = UserID(UUID(uuidString: "00000000-0000-0000-0000-000000000bbb")!)

    func unrevealed(mystery: Bool, eventDate: String?, viewer: UserID?, now: Date = frozenNow, calendar: Calendar = cal) -> Bool {
        Mystery.isUnrevealed(mystery: mystery, authorId: Self.author, eventDate: eventDate.flatMap(LocalDate.init(iso:)), viewer: viewer, now: now, calendar: calendar)
    }

    func guestsHidden(mystery: Bool, eventDate: String?, now: Date = frozenNow, calendar: Calendar = cal) -> Bool {
        Mystery.isGuestsHidden(mystery: mystery, eventDate: eventDate.flatMap(LocalDate.init(iso:)), now: now, calendar: calendar)
    }

    // MARK: localTodayISO

    @Test("localTodayISO — formats in local tz, not UTC (avoids the toISOString() midnight-shift trap)")
    func localToday_localNotUTC() {
        #expect(Mystery.localToday(Self.frozenNow, calendar: Self.cal).iso == "2026-04-27")
        // 23:30 LA on Apr 27 is Apr 28 in UTC — must still say Apr 27.
        let late = DomainTestSupport.date(2026, 4, 27, 23, 30, calendar: Self.cal)
        #expect(Mystery.localToday(late, calendar: Self.cal).iso == "2026-04-27")
    }

    @Test("localTodayISO — zero-pads single-digit months and days")
    func localToday_zeroPads() {
        #expect(Mystery.localToday(DomainTestSupport.date(2026, 1, 5, 9, 0, calendar: Self.cal), calendar: Self.cal).iso == "2026-01-05")
    }

    // MARK: isMysteryUnrevealed — non-mystery checks

    @Test("non-mystery — returns false when mystery=false, regardless of viewer or date")
    func nonMystery_false() {
        #expect(unrevealed(mystery: false, eventDate: "2030-01-01", viewer: Self.viewer) == false)
    }

    @Test("non-mystery — returns false when mystery=false even with no event_date")
    func nonMystery_noDate() {
        #expect(unrevealed(mystery: false, eventDate: nil, viewer: Self.viewer) == false)
    }

    // MARK: author viewing their own mystery check

    @Test("author — never redacts — author always sees their own check unredacted")
    func author_neverRedacts() {
        #expect(unrevealed(mystery: true, eventDate: "2030-01-01", viewer: Self.author) == false)
    }

    @Test("author — not redacted even when event_date is past (irrelevant for the author)")
    func author_pastDate() {
        #expect(unrevealed(mystery: true, eventDate: "2025-01-01", viewer: Self.author) == false)
    }

    @Test("author — not redacted with no event_date either")
    func author_noDate() {
        #expect(unrevealed(mystery: true, eventDate: nil, viewer: Self.author) == false)
    }

    // MARK: non-author viewing a mystery check

    @Test("non-author — redacts when event_date is in the future")
    func nonAuthor_future() {
        #expect(unrevealed(mystery: true, eventDate: "2026-04-30", viewer: Self.viewer) == true)
    }

    @Test("non-author — REVEALS on the event_date itself (event_date == today, not >)")
    func nonAuthor_revealsOnTheDay() {
        #expect(unrevealed(mystery: true, eventDate: "2026-04-27", viewer: Self.viewer) == false)
    }

    @Test("non-author — reveals when event_date is in the past")
    func nonAuthor_past() {
        #expect(unrevealed(mystery: true, eventDate: "2026-04-26", viewer: Self.viewer) == false)
    }

    @Test("non-author — redacts (treats as unrevealed) when event_date is missing")
    func nonAuthor_missingDate() {
        #expect(unrevealed(mystery: true, eventDate: nil, viewer: Self.viewer) == true)
    }

    @Test("non-author — redacts logged-out viewers (userId=null) too")
    func nonAuthor_loggedOut() {
        #expect(unrevealed(mystery: true, eventDate: "2026-04-30", viewer: nil) == true)
    }

    // MARK: reveal boundary across local midnight

    @Test("boundary — redacted at 23:59 the day before event")
    func boundary_before() {
        let lateNight = DomainTestSupport.date(2026, 4, 27, 23, 59, calendar: Self.cal)
        #expect(unrevealed(mystery: true, eventDate: "2026-04-28", viewer: Self.viewer, now: lateNight) == true)
    }

    @Test("boundary — revealed at 00:00 on the event day")
    func boundary_after() {
        let justAfterMidnight = DomainTestSupport.date(2026, 4, 28, 0, 0, calendar: Self.cal)
        #expect(unrevealed(mystery: true, eventDate: "2026-04-28", viewer: Self.viewer, now: justAfterMidnight) == false)
    }

    // MARK: native extras — the same boundary in three time zones, and isGuestsHidden

    @Test("boundary — local midnight in each viewer time zone", arguments: ["America/Los_Angeles", "Europe/London", "Asia/Tokyo"])
    func boundaryPerTimeZone(_ tz: String) {
        let cal = DomainTestSupport.calendar(tz)
        let before = DomainTestSupport.date(2026, 4, 27, 23, 59, 59, calendar: cal)
        let at = DomainTestSupport.date(2026, 4, 28, 0, 0, 0, calendar: cal)
        #expect(unrevealed(mystery: true, eventDate: "2026-04-28", viewer: Self.viewer, now: before, calendar: cal) == true)
        #expect(unrevealed(mystery: true, eventDate: "2026-04-28", viewer: Self.viewer, now: at, calendar: cal) == false)
        #expect(guestsHidden(mystery: true, eventDate: "2026-04-28", now: before, calendar: cal) == true)
        #expect(guestsHidden(mystery: true, eventDate: "2026-04-28", now: at, calendar: cal) == false)
        // The same instant is a different local day elsewhere: Tokyo's 00:00 Apr 28 is still Apr 27 in LA → still hidden there.
        if tz == "Asia/Tokyo" {
            let la = DomainTestSupport.calendar("America/Los_Angeles")
            #expect(unrevealed(mystery: true, eventDate: "2026-04-28", viewer: Self.viewer, now: at, calendar: la) == true)
        }
    }

    @Test("isGuestsHidden — hides from everyone (author included) until the day, false for non-mystery, true for a missing date")
    func guestsHiddenRules() {
        #expect(guestsHidden(mystery: false, eventDate: "2030-01-01") == false)
        #expect(guestsHidden(mystery: false, eventDate: nil) == false)
        #expect(guestsHidden(mystery: true, eventDate: nil) == true)
        #expect(guestsHidden(mystery: true, eventDate: "2026-04-30") == true)
        #expect(guestsHidden(mystery: true, eventDate: "2026-04-27") == false)
        #expect(guestsHidden(mystery: true, eventDate: "2026-04-26") == false)
        // The author sees their own name but NOT the guests: the two rules disagree on purpose.
        #expect(unrevealed(mystery: true, eventDate: "2026-04-30", viewer: Self.author) == false)
        #expect(guestsHidden(mystery: true, eventDate: "2026-04-30") == true)
    }
}
