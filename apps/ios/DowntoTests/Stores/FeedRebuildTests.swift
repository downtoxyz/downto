// DowntoTests/Stores/FeedRebuildTests.swift — raw → items with Fixtures.world(.busyFriday) (ARCHITECTURE §11.1).
import Foundation
import Testing
@testable import Downto

@Suite("FeedStore projection")
struct FeedRebuildTests {
    let built = Fixtures.world(.busyFriday)

    func project(_ raw: FeedRaw? = nil, now: Date? = nil, sort: FeedSort = .recent, lastSeen: Date? = nil, seen: Set<CheckID> = []) -> FeedProjection {
        FeedProject.project(raw: raw ?? built.feed, me: Fixtures.katId, now: now ?? built.now, calendar: Fixtures.calendar, sort: sort, lastSeen: lastSeen, seenIds: seen)
    }

    @Test func pinnedTimedTierComesFirstMostUrgentFirst() {
        let p = project()
        let ids = p.items.map(\.id)
        #expect(ids.count == 7)   // 6 checks + 1 event
        // rooftop is 75 % elapsed, car 66 % → rooftop first; both before every open item.
        #expect(ids[0] == "c:\(Fixtures.rooftopId)")
        #expect(ids[1] == "c:\(Fixtures.carId)")
        #expect(p.items[2].expiry.isOpen)
    }

    @Test func recentSortIsCreatedAtDescending() {
        let chrono = project().items.filter { $0.expiry.isOpen }
        let dates = chrono.map(\.createdAt)
        #expect(dates == dates.sorted(by: >))
    }

    @Test func upcomingSortPutsDatedFirstAscending() {
        let chrono = project(sort: .upcoming).items.filter { $0.expiry.isOpen }
        let dated = chrono.compactMap(\.eventDate)
        #expect(dated == dated.sorted())
        #expect(chrono.last?.eventDate == nil)   // movie night has no date → last
    }

    @Test func mysteryCheckIsMaskedForAViewerWhoIsNotTheAuthor() throws {
        let c = try #require(project().items.compactMap(\.check).first { $0.id == Fixtures.mysteryId })
        #expect(c.author.isMasked)
        #expect(c.mystery == .unrevealed)
        #expect(c.guests == .hidden)
        #expect(c.downCount == nil)
        #expect(!c.text.contains("@sara"))              // stripAtMentions
        #expect(c.via == "Sara")
        #expect(String(reflecting: c.author).contains("Devon") == false)
    }

    @Test func mysteryCheckRevealsOnTheDay() throws {
        let day = Fixtures.world(.mysteryDay)
        let c = try #require(project(now: day.now).items.compactMap(\.check).first { $0.id == Fixtures.mysteryId })
        #expect(!c.author.isMasked)
        #expect(c.mystery == .revealedToday)
        #expect(c.downCount == 2)
    }

    @Test func ownCheckIsMineWithNoToggleAndACount() throws {
        let c = try #require(project().items.compactMap(\.check).first { $0.id == Fixtures.climbingId })
        #expect(c.isMine)
        #expect(c.downCount == 0)
        #expect(FeedModels.tint(for: c) == .mine)
    }

    @Test func waitlistedCheckCarriesMyPosition() throws {
        let c = try #require(project().items.compactMap(\.check).first { $0.id == Fixtures.karaokeId })
        #expect(c.myResponse == .waitlist)
        #expect(c.waitlistPosition == 1)
        #expect(c.mySquad?.role == .waitlist)
        #expect(FeedModels.toggle(for: c, pending: false) == .waitlisted(position: 1))
    }

    @Test func downCheckHasSquadLinkAndDownTint() throws {
        let c = try #require(project().items.compactMap(\.check).first { $0.id == Fixtures.movieNightId })
        #expect(c.myResponse == .down)
        #expect(c.mySquad?.squadId == Fixtures.movieSquadId)
        #expect(c.downs.count == 2)
        #expect(c.comments.count == 1)
        let m = FeedModels.checkModel(c, squadUnread: true)
        #expect(m.tint == .down)
        #expect(m.squadLink?.hasUnread == true)
        #expect(m.toggle == .active)
    }

    @Test func hiddenChecksLeaveTheTiersAndListInHidden() {
        var raw = built.feed
        let row = HiddenRowID(UUID())
        raw.hidden[row] = HiddenCheck(id: row, userId: Fixtures.katId, checkId: Fixtures.movieNightId, hiddenAt: built.now)
        let p = project(raw)
        #expect(!p.items.contains { $0.id == "c:\(Fixtures.movieNightId)" })
        #expect(p.hidden.map(\.id) == [Fixtures.movieNightId])
        #expect(p.hidden[0].isHidden)
    }

    @Test func newFlagFollowsLastSeenAndSeenIds() throws {
        let lastSeen = built.now.addingTimeInterval(-60 * 60)   // one hour ago → only "who's got a car" (40 min) is newer
        var p = project(lastSeen: lastSeen)
        var car = try #require(p.items.compactMap(\.check).first { $0.id == Fixtures.carId })
        #expect(car.isNew)
        #expect(!(p.items.compactMap(\.check).first { $0.id == Fixtures.climbingId }!.isNew))
        p = project(lastSeen: lastSeen, seen: [Fixtures.carId])
        car = try #require(p.items.compactMap(\.check).first { $0.id == Fixtures.carId })
        #expect(!car.isNew)
        #expect(project(lastSeen: nil).items.compactMap(\.check).allSatisfy { !$0.isNew })   // first visit: nothing is new
    }

    @Test func expiredTimedChecksAreDropped() {
        let later = built.now.addingTimeInterval(5 * 3600)
        let p = project(now: later)
        #expect(!p.items.contains { $0.id == "c:\(Fixtures.rooftopId)" })
        #expect(!p.items.contains { $0.id == "c:\(Fixtures.carId)" })
    }

    @Test func eventExcludesThePosterFromDownsAndRendersReadOnly() throws {
        let e = try #require(project().items.compactMap(\.event).first)
        #expect(e.poster.id == Fixtures.lenaId)
        #expect(e.downs.map(\.id) == [Fixtures.moId])
        #expect(!e.myIsDown)
        let m = FeedModels.eventModel(e, me: Fixtures.katId, today: Mystery.localToday(built.now, calendar: Fixtures.calendar))
        #expect(m.state == .idle)
        #expect(m.toggle == .idle)
    }

    @Test func pastEventsLeaveTheFeed() {
        let p = project(now: built.now.addingTimeInterval(5 * 86_400))
        #expect(!p.items.contains { $0.event != nil })
    }

    @Test func syntheticSharedCardAppearsFirstAndYieldsToTheRealRow() throws {
        var raw = built.feed
        let id = CheckID(UUID())
        raw.sharedCheck = SharedCheck(id: id, text: "secret rooftop @kat", authorId: Fixtures.saraId, authorName: "Sara", authorAvatar: "S", eventDate: nil,
                                      eventTime: "9pm", location: nil, expiresAt: nil, createdAt: built.now.addingTimeInterval(-10 * 86_400), responseCount: 3, mystery: nil)
        var p = project(raw)
        let first = try #require(p.items.first { $0.expiry.isOpen }?.check)
        #expect(first.id == id)              // first in the chrono tier regardless of age (§7.1); the timed tier still pins above it
        #expect(first.isSynthetic)
        #expect(first.via == "shared link")
        #expect(first.guests == .countOnly(3))
        #expect(!first.author.isMasked)      // mystery nil + signed-in viewer → not masked in the feed
        let m = FeedModels.checkModel(first)
        #expect(m.responseCount == 3)
        // The real row becomes visible → the synthetic one yields.
        raw.checks[id] = Fixtures.check(id, author: Fixtures.saraId, text: "secret rooftop @kat", createdAgo: 10 * 86_400, now: built.now)
        p = project(raw)
        let real = try #require(p.items.compactMap(\.check).first { $0.id == id })
        #expect(!real.isSynthetic)
        #expect(p.items.filter { $0.id == "c:\(id)" }.count == 1)
    }

    @Test func leftChecksAreNeitherPinnedNorExcludedButListed() throws {
        var raw = built.feed
        let row = LeftRowID(UUID())
        raw.left[row] = LeftCheck(id: row, userId: Fixtures.katId, checkId: Fixtures.movieNightId, leftAt: built.now)
        let p = project(raw)
        #expect(p.items.contains { $0.id == "c:\(Fixtures.movieNightId)" })
        #expect(p.left.map(\.id) == [Fixtures.movieNightId])
    }

    @Test func twoHundredChecksProjectFast() {
        var raw = built.feed
        for i in 0..<200 {
            let id = CheckID(UUID())
            raw.checks[id] = Fixtures.check(id, author: Fixtures.saraId, text: "check \(i) @kat", createdAgo: TimeInterval(i * 60), expiresIn: i % 3 == 0 ? 3600 * 6 : nil, now: built.now)
            let r = Fixtures.response(id, Fixtures.devonId, ago: 60, now: built.now)
            raw.responses[r.id] = r
        }
        let clock = ContinuousClock()
        let elapsed = clock.measure { _ = project(raw) }
        // ARCHITECTURE §4.2 budgets < 1 ms in release; debug + Testing overhead is allowed 25×.
        #expect(elapsed < .milliseconds(25), "projection took \(elapsed)")
    }
}
