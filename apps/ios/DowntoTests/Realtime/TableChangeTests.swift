import Foundation
import Testing
import Supabase
@testable import Downto

/// The `data` object of a `postgres_changes` Realtime message, exactly as the server frames it.
private nonisolated struct PostgresChangesPayload: Decodable {
    let type: PostgresChangeEvent
    let schema: String
    let table: String
    let record: [String: AnyJSON]
    let oldRecord: [String: AnyJSON]

    enum CodingKeys: String, CodingKey { case type, schema, table, record, oldRecord = "old_record" }
}

@Suite("TableChange decoding")
struct TableChangeTests {
    static func payload(_ key: String) throws -> PostgresChangesPayload {
        let all = try JSONDecoder().decode([String: PostgresChangesPayload].self, from: FixtureLoader.data("realtime_postgres_changes"))
        return try #require(all[key])
    }

    @Test func insertDecodesTheFullRow() throws {
        let p = try Self.payload("insert")
        #expect(p.table == "check_responses")
        let change = try TableChange<CheckResponse>(event: p.type, record: p.record, oldRecord: p.oldRecord)
        guard case .insert(let row) = change else { return Issue.record("expected .insert, got \(change)") }
        #expect(row.id.description == "f0000000-0000-4000-8000-000000000009")
        #expect(row.checkId.description == "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1")
        #expect(row.response == .down)
        #expect(row.createdAt == PostgresTimestamp.parse("2026-05-01T18:04:11.123456+00:00"))
        #expect(change.row == row)
        #expect(change.deletedKeyUUID == nil)
    }

    @Test func updateWithPartialOldRecordHasNilOld() throws {
        // Without REPLICA IDENTITY FULL the old_record of an UPDATE is the primary key only → `old` must be nil, not a decode failure.
        let p = try Self.payload("update")
        let change = try TableChange<CheckResponse>(event: p.type, record: p.record, oldRecord: p.oldRecord)
        guard case .update(let new, let old) = change else { return Issue.record("expected .update") }
        #expect(new.response == .down, "waitlist → down promotion (§5.6 path 1)")
        #expect(old == nil)
    }

    @Test func deleteOnSurrogatePKTableCarriesOnlyTheId() throws {
        let p = try Self.payload("delete")
        let change = try TableChange<CheckResponse>(event: p.type, record: p.record, oldRecord: p.oldRecord)
        guard case .delete(let old, let keys) = change else { return Issue.record("expected .delete") }
        #expect(old == nil)
        #expect(keys.count == 1)
        #expect(keys["id"]?.stringValue == "f0000000-0000-4000-8000-000000000001")
        #expect(change.deletedID(ResponseRowID.self)?.description == "f0000000-0000-4000-8000-000000000001")
        #expect(change.row == nil)
    }

    @Test func deleteOnReplicaIdentityFullTableDecodesTheOldRow() throws {
        // friendships is the one table with REPLICA IDENTITY FULL (20260216000006).
        let p = try Self.payload("delete_full")
        #expect(p.table == "friendships")
        let change = try TableChange<Friendship>(event: p.type, record: p.record, oldRecord: p.oldRecord)
        guard case .delete(let old, let keys) = change else { return Issue.record("expected .delete") }
        let row = try #require(old)
        #expect(row.status == .pending)
        #expect(row.requesterId.description == "44444444-4444-4444-8444-444444444444")
        #expect(keys["status"]?.stringValue == "pending")
        #expect(change.deletedID(FriendshipID.self) == row.id)
    }

    @Test func insertWithMissingColumnsThrows() {
        let record: [String: AnyJSON] = ["id": "f0000000-0000-4000-8000-000000000009", "response": "down"]
        #expect(throws: DecodingError.self) {
            _ = try TableChange<CheckResponse>(event: .insert, record: record, oldRecord: [:])
        }
    }

    @Test func unknownEnumValueInARowDecodesAsUnknown() throws {
        var record = try Self.payload("insert").record
        record["response"] = "maybe"   // pre-20260316 value that RLS could still hold in old rows
        let change = try TableChange<CheckResponse>(event: .insert, record: record, oldRecord: [:])
        #expect(change.row?.response == .unknown)
    }

    @Test func deleteWithoutAnIdKeyIsNotAnId() throws {
        let change = try TableChange<CheckResponse>(event: .delete, record: [:], oldRecord: ["check_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"])
        #expect(change.deletedKeyUUID == nil)
        #expect(change.deletedID(ResponseRowID.self) == nil)
    }

    @Test func allIsRejected() {
        #expect(throws: DecodingError.self) {
            _ = try TableChange<CheckResponse>(event: .all, record: [:], oldRecord: [:])
        }
    }

    @Test func decodesOffTheMainActor() async throws {
        let p = try Self.payload("insert")
        let record = p.record
        let response: ResponseKind? = try await Task.detached {
            try TableChange<CheckResponse>(event: .insert, record: record, oldRecord: [:]).row?.response
        }.value
        #expect(response == .down)
    }
}

@Suite("ChangeBuffer")
struct ChangeBufferTests {
    struct Raw: Equatable { var rows: [String: Int] = [:] }

    @Test func changeDuringSelectSurvivesAnOlderMerge() {
        var raw = Raw(rows: ["a": 1])
        var buffer = ChangeBuffer<Raw>()
        let gen = buffer.beginSelect()
        #expect(buffer.inFlight == 1)
        // A friend's DOWN lands while the select is in flight.
        buffer.record({ $0.rows["b"] = 2 }, into: &raw)
        #expect(raw.rows["b"] == 2)
        #expect(buffer.pendingCount == 1)
        // The (older) select result does not contain "b".
        buffer.endSelect(gen, merge: { $0.rows.merge(["a": 1]) { _, new in new } }, into: &raw)
        #expect(raw.rows == ["a": 1, "b": 2])
        #expect(buffer.inFlight == 0)
        #expect(buffer.pendingCount == 0, "pending is cleared once nothing is in flight")
    }

    @Test func deleteDuringSelectStaysDeleted() {
        var raw = Raw(rows: ["a": 1, "b": 2])
        var buffer = ChangeBuffer<Raw>()
        let gen = buffer.beginSelect()
        buffer.record({ $0.rows["b"] = nil }, into: &raw)
        // The select re-fetches "b" (it predates the delete).
        buffer.endSelect(gen, merge: { $0.rows.merge(["a": 1, "b": 2]) { _, new in new } }, into: &raw)
        #expect(raw.rows == ["a": 1])
    }

    @Test func changesAreNotRecordedWhenNothingIsInFlight() {
        var raw = Raw()
        var buffer = ChangeBuffer<Raw>()
        buffer.record({ $0.rows["a"] = 1 }, into: &raw)
        #expect(raw.rows == ["a": 1])
        #expect(buffer.pendingCount == 0)
    }

    @Test func olderChangesAreNotReplayedOverANewerSelect() {
        var raw = Raw()
        var buffer = ChangeBuffer<Raw>()
        let g1 = buffer.beginSelect()
        buffer.record({ $0.rows["x"] = 1 }, into: &raw)         // recorded at generation 1
        let g2 = buffer.beginSelect()                            // a second select starts AFTER the change
        buffer.endSelect(g2, merge: { $0.rows["x"] = 5 }, into: &raw)   // newer server truth for x
        #expect(raw.rows["x"] == 5, "a change recorded before this select began must not clobber its result")
        buffer.endSelect(g1, merge: { _ in }, into: &raw)
        #expect(raw.rows["x"] == 1, "…but it IS replayed over the older select it raced")
        #expect(buffer.inFlight == 0)
    }

    @Test func abortEndsTheSelect() {
        var raw = Raw()
        var buffer = ChangeBuffer<Raw>()
        let g = buffer.beginSelect()
        buffer.record({ $0.rows["a"] = 1 }, into: &raw)
        buffer.abortSelect(g)
        #expect(buffer.inFlight == 0)
        #expect(buffer.pendingCount == 0)
        #expect(raw.rows == ["a": 1])
    }
}
