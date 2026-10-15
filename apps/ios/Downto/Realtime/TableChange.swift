// Realtime/TableChange.swift — decoding of Postgres change payloads → TableChange<T> (ARCHITECTURE §5.2).
// For tables without REPLICA IDENTITY FULL (everything except `friendships`) a DELETE carries only the primary key —
// for the surrogate-PK tables that is `{id}` alone — so `.delete` exposes the raw `keys` and `old` is nil.
import Foundation
import Supabase

nonisolated enum TableChange<T: Decodable & Sendable>: Sendable {
    case insert(T)
    case update(new: T, old: T?)
    case delete(old: T?, keys: [String: AnyJSON])

    /// From a live supabase-swift action.
    init(_ action: AnyAction, decoder: JSONDecoder = JSON.decoder) throws {
        switch action {
        case .insert(let a): try self.init(event: .insert, record: a.record, oldRecord: [:], decoder: decoder)
        case .update(let a): try self.init(event: .update, record: a.record, oldRecord: a.oldRecord, decoder: decoder)
        case .delete(let a): try self.init(event: .delete, record: [:], oldRecord: a.oldRecord, decoder: decoder)
        }
    }

    /// From the raw `record` / `old_record` objects of a Postgres-changes payload. `old` decodes leniently: a partial
    /// old row (PK only) yields nil rather than a decode failure. `.all` is not a change and throws.
    init(event: PostgresChangeEvent, record: [String: AnyJSON], oldRecord: [String: AnyJSON], decoder: JSONDecoder = JSON.decoder) throws {
        switch event {
        case .insert:
            self = .insert(try record.decode(as: T.self, decoder: decoder))
        case .update:
            let new = try record.decode(as: T.self, decoder: decoder)
            let old = try? oldRecord.decode(as: T.self, decoder: decoder)
            self = .update(new: new, old: old)
        case .delete:
            let old = try? oldRecord.decode(as: T.self, decoder: decoder)
            self = .delete(old: old, keys: oldRecord)
        case .all:
            throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "PostgresChangeEvent.all is not a row change"))
        }
    }

    /// The `id` primary key carried by a DELETE (or the row's id for insert/update when `T: Identifiable` is not known here).
    var deletedKeyUUID: UUID? {
        guard case .delete(_, let keys) = self else { return nil }
        return Self.uuid(from: keys["id"])
    }

    /// Typed form: `change.deletedID(ResponseRowID.self)`.
    func deletedID<Tag>(_: ID<Tag>.Type) -> ID<Tag>? {
        deletedKeyUUID.map(ID<Tag>.init)
    }

    /// The row for insert/update (nil for a delete).
    var row: T? {
        switch self {
        case .insert(let r), .update(let r, _): r
        case .delete: nil
        }
    }

    static func uuid(from json: AnyJSON?) -> UUID? {
        json?.stringValue.flatMap(UUID.init(uuidString:))
    }
}

extension TableChange: Equatable where T: Equatable {}
extension TableChange: Hashable where T: Hashable {}
