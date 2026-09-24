// DowntoTests/Domain/SquadCountdownTests.swift — every branch of §10.4, date-only vs timed, proposed vs locked past, sections.
import Foundation
import Testing
@testable import Downto

@Suite("SquadCountdown")
struct SquadCountdownTests {
    static let cal = DomainTestSupport.calendar("America/Los_Angeles")
    static let now = DomainTestSupport.date(2026, 5, 1, 18, 0, 0, calendar: cal)   // Fri May 1 2026 18:00 PDT
    static let h: TimeInterval = 3600
    static let d: TimeInterval = 86_400

    func cd(_ start: Date?, _ status: DateStatus? = .proposed, now: Date = now) -> SquadCountdown.Countdown? {
        SquadCountdown.countdown(eventStart: start, dateStatus: status, now: now)
    }

    // MARK: eventStart

    @Test func eventStartParsesTheTimeOntoLocalMidnight() {
        let cal = Self.cal
        let start = SquadCountdown.eventStart(date: DomainTestSupport.ld(2026, 5, 2), time: "7:20pm", calendar: cal)
        #expect(start == DomainTestSupport.date(2026, 5, 2, 19, 20, calendar: cal))
        #expect(SquadCountdown.eventStart(date: DomainTestSupport.ld(2026, 5, 2), time: "12am", calendar: cal) == DomainTestSupport.date(2026, 5, 2, 0, 0, calendar: cal))
        #expect(SquadCountdown.eventStart(date: DomainTestSupport.ld(2026, 5, 2), time: "12pm", calendar: cal) == DomainTestSupport.date(2026, 5, 2, 12, 0, calendar: cal))
        #expect(SquadCountdown.eventStart(date: DomainTestSupport.ld(2026, 5, 2), time: " 9 PM ", calendar: cal) == DomainTestSupport.date(2026, 5, 2, 21, 0, calendar: cal))
        #expect(SquadCountdown.eventStart(date: DomainTestSupport.ld(2026, 5, 2), time: "10:05am", calendar: cal) == DomainTestSupport.date(2026, 5, 2, 10, 5, calendar: cal))
    }

    @Test func eventStartDateOnlyIsEndOfDay() {
        let cal = Self.cal
        let start = SquadCountdown.eventStart(date: DomainTestSupport.ld(2026, 5, 2), time: nil, calendar: cal)!
        let endOfDay = DomainTestSupport.date(2026, 5, 2, 23, 59, 59, calendar: cal)
        #expect(abs(start.timeIntervalSince(endOfDay) - 0.999) < 0.001)
        // An unparseable time string is treated as date-only (web: the regex fails → falls through to 23:59:59.999).
        #expect(SquadCountdown.eventStart(date: DomainTestSupport.ld(2026, 5, 2), time: "evening", calendar: cal) == start)
        #expect(SquadCountdown.eventStart(date: DomainTestSupport.ld(2026, 5, 2), time: "19:00", calendar: cal) == start)
        #expect(SquadCountdown.eventStart(date: nil, time: "7pm", calendar: cal) == nil)
    }

    @Test func eventStartIsLocalNotUTC() {
        // The web bug this guards: `new Date("2026-04-20")` is UTC midnight = the evening before in PT.
        let la = Self.cal
        let tokyo = DomainTestSupport.calendar("Asia/Tokyo")
        let a = SquadCountdown.eventStart(date: DomainTestSupport.ld(2026, 4, 20), time: "8pm", calendar: la)!
        let b = SquadCountdown.eventStart(date: DomainTestSupport.ld(2026, 4, 20), time: "8pm", calendar: tokyo)!
        #expect(a != b)
        #expect(la.component(.day, from: a) == 20 && tokyo.component(.day, from: b) == 20)
    }

    // MARK: sortKey / isFading

    @Test func sortKeyFallsBackToActivityThenDistantFuture() {
        let s = Self.now, a = Self.now - Self.h
        #expect(SquadCountdown.sortKey(eventStart: s, lastActivityAt: a) == s)
        #expect(SquadCountdown.sortKey(eventStart: nil, lastActivityAt: a) == a)
        #expect(SquadCountdown.sortKey(eventStart: nil, lastActivityAt: nil) == .distantFuture)
    }

    @Test func isFadingRules() {
        let now = Self.now
        #expect(SquadCountdown.isFading(eventStart: now - 25 * Self.h, expiresAt: nil, now: now))
        #expect(!SquadCountdown.isFading(eventStart: now - 23 * Self.h, expiresAt: nil, now: now))
        #expect(!SquadCountdown.isFading(eventStart: now - 24 * Self.h, expiresAt: nil, now: now))       // strictly greater than 24 h
        #expect(SquadCountdown.isFading(eventStart: nil, expiresAt: now + 23 * Self.h, now: now))
        #expect(!SquadCountdown.isFading(eventStart: nil, expiresAt: now + 24 * Self.h, now: now))      // strictly less than 24 h
        #expect(SquadCountdown.isFading(eventStart: nil, expiresAt: now - Self.h, now: now))            // already expired counts
        #expect(!SquadCountdown.isFading(eventStart: nil, expiresAt: nil, now: now))
        #expect(!SquadCountdown.isFading(eventStart: now + 3 * Self.d, expiresAt: now + 5 * Self.d, now: now))
    }

    // MARK: countdown — every branch

    @Test func nilStartIsNil() {
        #expect(cd(nil) == nil)
        #expect(cd(nil, .locked) == nil)
    }

    @Test func pastWithoutLockedDateHidesTheCountdown() {
        #expect(cd(Self.now - 60, .proposed) == nil)
        #expect(cd(Self.now - 60, nil) == nil)
        #expect(cd(Self.now - 60, .unknown) == nil)
        #expect(cd(Self.now - 3 * Self.d, .proposed) == nil)
    }

    @Test func lockedPastIsEndedThenPast() {
        #expect(cd(Self.now - 60, .locked) == .init(label: "ENDED", sub: nil, urgent: false))
        #expect(cd(Self.now - 24 * Self.h, .locked) == .init(label: "ENDED", sub: nil, urgent: false))   // exactly −24 h is not < −24 h
        #expect(cd(Self.now - 24 * Self.h - 1, .locked) == .init(label: "PAST", sub: nil, urgent: false))
        #expect(cd(Self.now - 3 * Self.d, .locked) == .init(label: "PAST", sub: nil, urgent: false))
    }

    @Test func underAnHourIsMinutesUrgent() {
        #expect(cd(Self.now + 29 * 60) == .init(label: "29m", sub: "from now", urgent: true))
        #expect(cd(Self.now + 10) == .init(label: "1m", sub: "from now", urgent: true))          // max(1, round(0.17)) = 1
        #expect(cd(Self.now) == .init(label: "1m", sub: "from now", urgent: true))               // diff 0 is not < 0
        // 31 min rounds to 1 h → the hours branch (web parity; Math.round on hours first).
        #expect(cd(Self.now + 31 * 60) == .init(label: "1h", sub: "from now", urgent: true))
    }

    @Test func underADayIsHoursUrgentBelowSix() {
        #expect(cd(Self.now + 5 * Self.h) == .init(label: "5h", sub: "from now", urgent: true))
        #expect(cd(Self.now + 6 * Self.h) == .init(label: "6h", sub: "from now", urgent: false))
        #expect(cd(Self.now + 23 * Self.h) == .init(label: "23h", sub: "from now", urgent: false))
        #expect(cd(Self.now + 23.6 * Self.h) == .init(label: "1d", sub: "tomorrow", urgent: false))   // rounds to 24 h → days branch
    }

    @Test func underAWeekIsDaysWithTomorrow() {
        #expect(cd(Self.now + 1 * Self.d) == .init(label: "1d", sub: "tomorrow", urgent: false))
        #expect(cd(Self.now + 2 * Self.d) == .init(label: "2d", sub: "away", urgent: false))
        #expect(cd(Self.now + 6 * Self.d) == .init(label: "6d", sub: "away", urgent: false))
        #expect(cd(Self.now + 6.6 * Self.d) == .init(label: "1w", sub: "away", urgent: false))       // rounds to 7 d → weeks
    }

    @Test func underAMonthIsWeeks() {
        #expect(cd(Self.now + 7 * Self.d) == .init(label: "1w", sub: "away", urgent: false))
        #expect(cd(Self.now + 10 * Self.d) == .init(label: "1w", sub: "away", urgent: false))      // round(10/7)=1
        #expect(cd(Self.now + 11 * Self.d) == .init(label: "2w", sub: "away", urgent: false))      // round(11/7)=2
        #expect(cd(Self.now + 29 * Self.d) == .init(label: "4w", sub: "away", urgent: false))
    }

    @Test func monthsBeyond() {
        #expect(cd(Self.now + 30 * Self.d) == .init(label: "1mo", sub: "away", urgent: false))
        #expect(cd(Self.now + 44 * Self.d) == .init(label: "1mo", sub: "away", urgent: false))     // round(44/30)=1
        #expect(cd(Self.now + 45 * Self.d) == .init(label: "2mo", sub: "away", urgent: false))     // round(1.5)=2 (JS half-up)
        #expect(cd(Self.now + 365 * Self.d) == .init(label: "12mo", sub: "away", urgent: false))
    }

    @Test func jsRoundIsHalfTowardPositiveInfinity() {
        #expect(SquadCountdown.jsRound(0.5) == 1)
        #expect(SquadCountdown.jsRound(1.5) == 2)
        #expect(SquadCountdown.jsRound(2.4999) == 2)
        #expect(SquadCountdown.jsRound(-0.5) == 0)
        #expect(SquadCountdown.jsRound(-1.5) == -1)
    }

    @Test func dateOnlyVersusTimedOnTheEventDay() {
        // At 18:00 on the event day, a date-only squad (start = 23:59:59.999) is still "6h from now"; a 7pm one is "1h".
        let dateOnly = SquadCountdown.eventStart(date: DomainTestSupport.ld(2026, 5, 1), time: nil, calendar: Self.cal)
        let timed = SquadCountdown.eventStart(date: DomainTestSupport.ld(2026, 5, 1), time: "7pm", calendar: Self.cal)
        #expect(cd(dateOnly) == .init(label: "6h", sub: "from now", urgent: false))
        #expect(cd(timed) == .init(label: "1h", sub: "from now", urgent: true))
        // The morning after a date-only event: proposed → hidden; locked → ENDED (not PAST until 24 h have passed).
        let nextMorning = DomainTestSupport.date(2026, 5, 2, 9, 0, calendar: Self.cal)
        #expect(cd(dateOnly, .proposed, now: nextMorning) == nil)
        #expect(cd(dateOnly, .locked, now: nextMorning) == .init(label: "ENDED", sub: nil, urgent: false))
    }

    // MARK: sections

    struct Row: Sendable, Equatable { let name: String; let unread: Bool; let start: Date?; let activity: Date?; let expires: Date? }

    @Test func sectionsBucketAndSortLikeGroupsView() {
        let now = Self.now
        let rows = [
            Row(name: "late-upcoming", unread: false, start: now + 5 * Self.d, activity: nil, expires: nil),
            Row(name: "unread-b", unread: true, start: now + 2 * Self.d, activity: nil, expires: nil),
            Row(name: "fading-old", unread: false, start: now - 2 * Self.d, activity: nil, expires: nil),
            Row(name: "unread-a", unread: true, start: now + 1 * Self.d, activity: nil, expires: nil),
            Row(name: "early-upcoming", unread: false, start: now + 1 * Self.d, activity: nil, expires: nil),
            Row(name: "dateless-active", unread: false, start: nil, activity: now - Self.h, expires: nil),
            Row(name: "dateless-silent", unread: false, start: nil, activity: nil, expires: nil),
            Row(name: "fading-expiring", unread: false, start: nil, activity: nil, expires: now + 2 * Self.h),
            Row(name: "unread-but-fading", unread: true, start: now - 3 * Self.d, activity: nil, expires: nil),   // unread wins over fading
        ]
        let s = SquadCountdown.sections(rows, now: now, hasUnread: \.unread, eventStart: \.start, lastActivityAt: \.activity, expiresAt: \.expires)
        #expect(s.newMessages.map(\.name) == ["unread-but-fading", "unread-a", "unread-b"])
        #expect(s.upcoming.map(\.name) == ["dateless-active", "early-upcoming", "late-upcoming", "dateless-silent"])
        #expect(s.fading.map(\.name) == ["fading-old", "fading-expiring"])
        #expect(s.showHeaders)

        let single = SquadCountdown.sections([rows[0]], now: now, hasUnread: \.unread, eventStart: \.start, lastActivityAt: \.activity, expiresAt: \.expires)
        #expect(!single.showHeaders)
        let empty = SquadCountdown.sections([Row](), now: now, hasUnread: \.unread, eventStart: \.start, lastActivityAt: \.activity, expiresAt: \.expires)
        #expect(!empty.showHeaders && empty.newMessages.isEmpty && empty.upcoming.isEmpty && empty.fading.isEmpty)
    }

    @Test func sectionsSortIsStableForEqualKeys() {
        let now = Self.now
        let rows = ["a", "b", "c"].map { Row(name: $0, unread: false, start: nil, activity: nil, expires: nil) }
        let s = SquadCountdown.sections(rows, now: now, hasUnread: \.unread, eventStart: \.start, lastActivityAt: \.activity, expiresAt: \.expires)
        #expect(s.upcoming.map(\.name) == ["a", "b", "c"])
    }
}
