// Domain/ID.swift — phantom-typed IDs (ARCHITECTURE §3.3). Domain, not Data, so Domain functions can name UserID/CheckID/… (§1.0).
import Foundation

/// A UUID that knows which table it identifies. `ID<CheckTag>` and `ID<SquadTag>` are distinct types,
/// so passing a squad id where a check id is expected is a compile error.
nonisolated struct ID<Tag>: Hashable, Sendable, Codable, CustomStringConvertible {
    let raw: UUID

    init(_ raw: UUID) { self.raw = raw }

    /// nil unless `string` is a well-formed UUID (any case).
    init?(_ string: String) {
        guard let u = UUID(uuidString: string) else { return nil }
        raw = u
    }

    init(from decoder: any Decoder) throws {
        raw = try decoder.singleValueContainer().decode(UUID.self)
    }

    func encode(to encoder: any Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(raw)
    }

    /// Lowercase, the way Postgres and JS render it (Censor seeds depend on this).
    var description: String { raw.uuidString.lowercased() }
}

/// Lets `[ID<Tag>: V]` encode as a JSON object keyed by the UUID string instead of a flat `[key, value, key, value]` array
/// (JSONEncoder only emits objects for String/Int keys or `CodingKeyRepresentable` keys). `FeedRaw` & co. depend on this (§3.9).
nonisolated extension ID: CodingKeyRepresentable {
    nonisolated struct Key: CodingKey {
        let stringValue: String
        var intValue: Int? { nil }
        init(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { nil }
    }

    var codingKey: any CodingKey { Key(stringValue: raw.uuidString) }

    init?<T: CodingKey>(codingKey: T) {
        guard let u = UUID(uuidString: codingKey.stringValue) else { return nil }
        raw = u
    }
}

nonisolated enum UserTag {}
nonisolated enum CheckTag {}
nonisolated enum SquadTag {}
nonisolated enum EventTag {}
nonisolated enum MessageTag {}
nonisolated enum PollTag {}
nonisolated enum NotificationTag {}
nonisolated enum FriendshipTag {}
nonisolated enum CommentTag {}
// Surrogate-PK row tables (§3.3): realtime DELETE payloads carry only `{id}`, so every row model keeps its row id.
nonisolated enum ResponseRowTag {}
nonisolated enum CoAuthorRowTag {}
nonisolated enum HiddenRowTag {}
nonisolated enum LeftRowTag {}
nonisolated enum JoinRequestTag {}
nonisolated enum ConfirmRowTag {}

typealias UserID = ID<UserTag>
typealias CheckID = ID<CheckTag>
typealias SquadID = ID<SquadTag>
typealias EventID = ID<EventTag>
typealias MessageID = ID<MessageTag>
typealias PollID = ID<PollTag>
typealias NotificationID = ID<NotificationTag>
typealias FriendshipID = ID<FriendshipTag>
typealias CommentID = ID<CommentTag>
typealias ResponseRowID = ID<ResponseRowTag>
typealias CoAuthorRowID = ID<CoAuthorRowTag>
typealias HiddenRowID = ID<HiddenRowTag>
typealias LeftRowID = ID<LeftRowTag>
typealias JoinRequestID = ID<JoinRequestTag>
typealias ConfirmRowID = ID<ConfirmRowTag>
