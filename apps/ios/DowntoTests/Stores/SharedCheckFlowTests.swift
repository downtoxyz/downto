// DowntoTests/Stores/SharedCheckFlowTests.swift — the §7.1 synthetic card lifecycle on FeedStore (ARCHITECTURE §11.1).
// The pre-gate ordering and the returning-user drain live in AppEnvironment / Router and are the integrator's to pin.
import Foundation
import Testing
@testable import Downto

@Suite("Shared-check card", .serialized)
struct SharedCheckFlowTests {
    func shared(_ id: CheckID, now: Date, mystery: Bool? = nil, date: LocalDate? = nil) -> SharedCheck {
        SharedCheck(id: id, text: "come thru @kat", authorId: Fixtures.saraId, authorName: "Sara", authorAvatar: "S", eventDate: date, eventTime: nil,
                    location: nil, expiresAt: nil, createdAt: now.addingTimeInterval(-3600), responseCount: 2, mystery: mystery)
    }

    @Test func cardAppearsWhenRLSReturnsNoRowAndSurvivesARebuild() throws {
        let (env, built) = try FeedTestSupport.environment(fake: true)
        let id = CheckID(UUID())
        var raw = env.feed.raw
        raw.sharedCheck = shared(id, now: built.now)
        env.feed.load(raw: raw, phase: .loaded(at: built.now, stale: false), now: built.now)
        #expect(env.feed.check(id)?.isSynthetic == true)
        env.feed.rebuild()
        env.feed.tick()
        #expect(env.feed.check(id)?.isSynthetic == true)
        #expect(env.feed.hasChecks)
    }

    @Test func cardYieldsWhenTheRealRowArrivesByRealtime() async throws {
        let (env, built) = try FeedTestSupport.environment(fake: true)
        let id = CheckID(UUID())
        var raw = env.feed.raw
        raw.sharedCheck = shared(id, now: built.now)
        env.feed.load(raw: raw, phase: .loaded(at: built.now, stale: false), now: built.now)
        await env.feed.apply(TableChange<InterestCheck>.insert(Fixtures.check(id, author: Fixtures.saraId, text: "come thru @kat", createdAgo: 3600, now: built.now)))
        #expect(env.feed.check(id)?.isSynthetic == false)
        #expect(env.feed.items.filter { $0.id == "c:\(id)" }.count == 1)
    }

    @Test func downOnTheCardGoesThroughTheAPIAndRestoresOnFailure() async throws {
        // Not fake: the /api call hits the stub (which has no bearer → DowntoAPI throws unauthenticated); PostgREST is never reachable.
        let (env, built) = try FeedTestSupport.environment(fake: false)
        StubURLProtocol.reset()
        let id = CheckID(UUID())
        var raw = env.feed.raw
        raw.sharedCheck = shared(id, now: built.now)
        env.feed.load(raw: raw, phase: .loaded(at: built.now, stale: false), now: built.now)
        let before = env.feed.raw
        await env.feed.toggleDown(id)
        #expect(env.feed.raw == before)
        #expect(env.feed.check(id)?.myResponse == nil)
        #expect(env.feed.raw.checks[id] == nil)
    }

    @Test func mysteryCardIsMaskedForOutsiders() throws {
        let (env, built) = try FeedTestSupport.environment(fake: true)
        let id = CheckID(UUID())
        var raw = env.feed.raw
        let tomorrow = LocalDate(built.now, calendar: Fixtures.calendar).adding(days: 1, calendar: Fixtures.calendar)
        raw.sharedCheck = shared(id, now: built.now, mystery: true, date: tomorrow)
        env.feed.load(raw: raw, phase: .loaded(at: built.now, stale: false), now: built.now)
        let c = try #require(env.feed.check(id))
        #expect(c.author.isMasked)
        #expect(!c.text.contains("@kat"))
        #expect(String(reflecting: c).contains("Sara") == false)
    }

    @Test func clearingTheCardForgetsTheKey() throws {
        let (env, built) = try FeedTestSupport.environment(fake: true)
        let id = CheckID(UUID())
        Defaults.activeSharedCheckId = id
        var raw = env.feed.raw
        raw.sharedCheck = shared(id, now: built.now)
        env.feed.load(raw: raw, phase: .loaded(at: built.now, stale: false), now: built.now)
        env.feed.clearSharedCheck()
        #expect(Defaults.activeSharedCheckId == nil)
        #expect(env.feed.check(id) == nil)
    }
}
