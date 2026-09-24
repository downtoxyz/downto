// DowntoTests/Domain/FeedOrderingTests.swift — pinned urgency order; recent vs upcoming; dateless after dated; hidden excluded;
// NEW badge; expired dropped (ARCHITECTURE §4.3 / §11.1).
import Foundation
import Testing
@testable import Downto

@Suite("FeedOrdering")
struct FeedOrderingTests {
    struct Item: FeedOrderable, Equatable {
        let name: String
        let createdAt: Date
        let eventDate: LocalDate?
        let expiry: ExpiryState
        let isHidden: Bool

        init(_ name: String, created: TimeInterval, date: LocalDate? = nil, expiry: ExpiryState = .open, hidden: Bool = false) {
            self.name = name
            self.createdAt = Date(timeIntervalSince1970: 1_800_000_000 + created)
            self.eventDate = date
            self.expiry = expiry
            self.isHidden = hidden
        }
    }

    static func names(_ items: [Item]) -> [String] { items.map(\.name) }
    static func ld(_ d: Int) -> LocalDate { LocalDate(year: 2026, month: 5, day: d) }

    @Test func pinnedTierIsMostUrgentFirst() {
        let items = [
            Item("t30", created: 1, expiry: .remaining(hours: 3, minutes: 0, percent: 30)),
            Item("open", created: 2),
            Item("t90", created: 3, expiry: .remaining(hours: 0, minutes: 20, percent: 90)),
            Item("t60", created: 4, expiry: .remaining(hours: 1, minutes: 0, percent: 60)),
        ]
        let t = FeedOrdering.tiers(items, sort: .recent)
        #expect(Self.names(t.pinned) == ["t90", "t60", "t30"])
        #expect(Self.names(t.chrono) == ["open"])
        #expect(Self.names(t.items) == ["t90", "t60", "t30", "open"])
        #expect(t.hidden.isEmpty)
    }

    @Test func pinnedTierIgnoresTheSortToggle() {
        let items = [
            Item("t30", created: 9, date: Self.ld(1), expiry: .remaining(hours: 3, minutes: 0, percent: 30)),
            Item("t90", created: 1, date: Self.ld(30), expiry: .remaining(hours: 0, minutes: 20, percent: 90)),
        ]
        #expect(Self.names(FeedOrdering.tiers(items, sort: .recent).pinned) == ["t90", "t30"])
        #expect(Self.names(FeedOrdering.tiers(items, sort: .upcoming).pinned) == ["t90", "t30"])
    }

    @Test func recentIsCreatedAtDescending() {
        let items = [Item("a", created: 10, date: Self.ld(20)), Item("b", created: 30), Item("c", created: 20, date: Self.ld(1))]
        #expect(Self.names(FeedOrdering.tiers(items, sort: .recent).chrono) == ["b", "c", "a"])
    }

    @Test func upcomingIsDatedAscendingThenDatelessByRecency() {
        let items = [
            Item("dateless-old", created: 10),
            Item("may20", created: 30, date: Self.ld(20)),
            Item("dateless-new", created: 40),
            Item("may1", created: 20, date: Self.ld(1)),
            Item("may5", created: 5, date: Self.ld(5)),
        ]
        #expect(Self.names(FeedOrdering.tiers(items, sort: .upcoming).chrono) == ["may1", "may5", "may20", "dateless-new", "dateless-old"])
    }

    @Test func upcomingKeepsInputOrderForEqualDates() {
        // JS's comparator returns 0 for equal ISO strings and Array.sort is stable; Swift's sort is stable too.
        let items = [Item("x", created: 1, date: Self.ld(5)), Item("y", created: 9, date: Self.ld(5)), Item("z", created: 5, date: Self.ld(5))]
        #expect(Self.names(FeedOrdering.tiers(items, sort: .upcoming).chrono) == ["x", "y", "z"])
    }

    @Test func hiddenChecksAreExcludedFromBothTiersAndListedByRecency() {
        let items = [
            Item("h-old", created: 1, hidden: true),
            Item("open", created: 2),
            Item("h-timed", created: 3, expiry: .remaining(hours: 1, minutes: 0, percent: 50), hidden: true),
            Item("h-new", created: 4, hidden: true),
            Item("timed", created: 5, expiry: .remaining(hours: 1, minutes: 0, percent: 10)),
        ]
        let t = FeedOrdering.tiers(items, sort: .upcoming)
        #expect(Self.names(t.pinned) == ["timed"])
        #expect(Self.names(t.chrono) == ["open"])
        #expect(Self.names(t.hidden) == ["h-new", "h-timed", "h-old"])
    }

    @Test func expiredTimedChecksAreDroppedEverywhere() {
        let items = [
            Item("expired", created: 1, expiry: .expired),
            Item("expired-hidden", created: 2, expiry: .expired, hidden: true),
            Item("open", created: 3),
            Item("timed", created: 4, expiry: .remaining(hours: 0, minutes: 5, percent: 99)),
        ]
        let t = FeedOrdering.tiers(items, sort: .recent)
        #expect(Self.names(t.pinned) == ["timed"])
        #expect(Self.names(t.chrono) == ["open"])
        #expect(t.hidden.isEmpty)
    }

    @Test func emptyInput() {
        let t = FeedOrdering.tiers([Item](), sort: .recent)
        #expect(t.pinned.isEmpty && t.chrono.isEmpty && t.hidden.isEmpty && t.items.isEmpty)
    }

    @Test func newBadge() {
        let seen = Date(timeIntervalSince1970: 1_800_000_000)
        #expect(FeedOrdering.isNew(createdAt: seen + 1, lastSeenFeedAt: seen, isMine: false))
        #expect(!FeedOrdering.isNew(createdAt: seen + 1, lastSeenFeedAt: seen, isMine: true))
        #expect(!FeedOrdering.isNew(createdAt: seen, lastSeenFeedAt: seen, isMine: false))       // strictly greater
        #expect(!FeedOrdering.isNew(createdAt: seen - 1, lastSeenFeedAt: seen, isMine: false))
        #expect(!FeedOrdering.isNew(createdAt: seen + 1, lastSeenFeedAt: nil, isMine: false))    // first visit: nothing is new
    }

    @Test func feedSortIsCodableForDefaults() throws {
        let data = try JSONEncoder().encode(FeedSort.upcoming)
        #expect(String(decoding: data, as: UTF8.self) == "\"upcoming\"")
        #expect(try JSONDecoder().decode(FeedSort.self, from: data) == .upcoming)
        #expect(FeedSort.allCases.count == 2)
    }
}
