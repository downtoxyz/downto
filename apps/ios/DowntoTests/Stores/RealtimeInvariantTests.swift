// DowntoTests/Stores/RealtimeInvariantTests.swift — FeedStore half of ARCHITECTURE §11.1 "RealtimeInvariantTests".
// (1) idempotent apply, (2) optimistic placeholder replaced by the server echo, (3) failed mutation restores byte-exact,
// (4) `{id}`-only deletes remove exactly that row, (6) unknown delete is a no-op, (10) sub-table change for an unknown check
// never writes raw (it asks for a refreshCheck instead).
import Foundation
import Supabase
import Testing
@testable import Downto

@Suite("FeedStore realtime invariants", .serialized)
struct RealtimeInvariantTests {
    @Test func applyingTheSameChangeTwiceIsANoOp() async throws {
        let (env, built) = try FeedTestSupport.environment(fake: true)
        let r = Fixtures.response(Fixtures.climbingId, Fixtures.saraId, ago: 1, now: built.now)
        await env.feed.apply(TableChange<CheckResponse>.insert(r))
        let once = env.feed.raw
        await env.feed.apply(TableChange<CheckResponse>.insert(r))
        #expect(env.feed.raw == once)
        #expect(env.feed.check(Fixtures.climbingId)?.downCount == 1)
    }

    @Test func serverEchoReplacesTheOptimisticPlaceholder() async throws {
        let (env, built) = try FeedTestSupport.environment(fake: true)
        await env.feed.toggleDown(Fixtures.climbingId)   // fake world: a placeholder row for me
        let placeholders = env.feed.raw.responses.values.filter { $0.checkId == Fixtures.climbingId && $0.userId == Fixtures.katId }
        #expect(placeholders.count == 1)
        let server = CheckResponse(id: ResponseRowID(UUID()), checkId: Fixtures.climbingId, userId: Fixtures.katId, response: .down, createdAt: built.now)
        await env.feed.apply(TableChange<CheckResponse>.insert(server))
        let mine = env.feed.raw.responses.values.filter { $0.checkId == Fixtures.climbingId && $0.userId == Fixtures.katId }
        #expect(mine.count == 1)
        #expect(mine.first?.id == server.id)
    }

    @Test func failedMutationRestoresRawByteExact() async throws {
        // Not fake: Supabase at 127.0.0.1:1 refuses the connection, so the insert throws and the store restores.
        let (env, _) = try FeedTestSupport.environment(fake: false)
        let before = env.feed.raw
        await env.feed.toggleDown(Fixtures.climbingId)
        #expect(env.feed.raw == before)
        #expect(env.feed.inflightIds.isEmpty)
        #expect(env.feed.check(Fixtures.climbingId)?.myResponse == nil)
    }

    @Test func idOnlyDeleteRemovesExactlyThatRow() async throws {
        let (env, _) = try FeedTestSupport.environment(fake: true)
        let victim = try #require(env.feed.raw.responses.values.first { $0.checkId == Fixtures.karaokeId && $0.userId == Fixtures.devonId })
        let countBefore = env.feed.raw.responses.count
        await env.feed.apply(TableChange<CheckResponse>.delete(old: nil, keys: ["id": .string(victim.id.description)]))
        #expect(env.feed.raw.responses[victim.id] == nil)
        #expect(env.feed.raw.responses.count == countBefore - 1)
        #expect(env.feed.check(Fixtures.karaokeId)?.downs.count == 2)

        let comment = try #require(env.feed.raw.comments[Fixtures.movieNightId]?.first)
        env.feed.apply(TableChange<CheckComment>.delete(old: nil, keys: ["id": .string(comment.id.description)]))
        #expect(env.feed.raw.comments[Fixtures.movieNightId]?.isEmpty == true)
    }

    @Test func unknownDeleteIsANoOp() async throws {
        let (env, _) = try FeedTestSupport.environment(fake: true)
        let before = env.feed.raw
        await env.feed.apply(TableChange<CheckResponse>.delete(old: nil, keys: ["id": .string(UUID().uuidString)]))
        await env.feed.apply(TableChange<CheckCoAuthor>.delete(old: nil, keys: ["id": .string(UUID().uuidString)]))
        await env.feed.apply(TableChange<InterestCheck>.delete(old: nil, keys: ["id": .string(UUID().uuidString)]))
        await env.feed.apply(TableChange<CheckResponse>.delete(old: nil, keys: [:]))
        #expect(env.feed.raw == before)
    }

    @Test func responseForAnUnknownCheckNeverWritesRaw() async throws {
        let (env, built) = try FeedTestSupport.environment(fake: true)
        let before = env.feed.raw
        let stranger = Fixtures.response(CheckID(UUID()), Fixtures.saraId, ago: 1, now: built.now)
        await env.feed.apply(TableChange<CheckResponse>.insert(stranger))
        #expect(env.feed.raw == before)   // it asked for refreshCheck (a no-op in the fake world) instead of indexing a row it cannot render
    }

    @Test func eventCommentsAreDroppedInM1() async throws {
        let (env, built) = try FeedTestSupport.environment(fake: true)
        let before = env.feed.raw
        let k = CheckComment(id: CommentID(UUID()), checkId: nil, eventId: Fixtures.fleaEventId, userId: Fixtures.saraId, text: "hi", mentions: [], createdAt: built.now)
        env.feed.apply(TableChange<CheckComment>.insert(k))
        #expect(env.feed.raw == before)
    }

    @Test func checkArchivedViaUpdateLeavesTheFeed() async throws {
        let (env, _) = try FeedTestSupport.environment(fake: true)
        var c = try #require(env.feed.raw.checks[Fixtures.movieNightId])
        c.archivedAt = .now
        await env.feed.apply(TableChange<InterestCheck>.update(new: c, old: nil))
        #expect(env.feed.check(Fixtures.movieNightId) == nil)
        #expect(!env.feed.hasChecks == false)
    }

    @Test func hideAndUnhideAreOptimisticInTheFakeWorld() async throws {
        let (env, _) = try FeedTestSupport.environment(fake: true)
        await env.feed.hide(Fixtures.carId)
        #expect(env.feed.hidden.map(\.id) == [Fixtures.carId])
        #expect(env.feed.check(Fixtures.carId) == nil)
        await env.feed.unhide(Fixtures.carId)
        #expect(env.feed.hidden.isEmpty)
        #expect(env.feed.check(Fixtures.carId) != nil)
    }
}
