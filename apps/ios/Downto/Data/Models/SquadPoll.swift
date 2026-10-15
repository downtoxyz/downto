// Data/Models/SquadPoll.swift — `squad_polls` (20260317000001 … 20260423000004).
// `grid_range_start/end` were DROPPED in 20260422000003 (replaced by `grid_dates`), so they are not modelled.
import Foundation

nonisolated struct SquadPoll: Codable, Identifiable, Hashable, Sendable {
    let id: PollID
    let squadId: SquadID
    let messageId: MessageID
    let question: String
    let options: [PollOption]
    var status: PollStatus
    let createdBy: UserID
    let multiSelect: Bool
    let pollType: PollType
    let collectionStyle: CollectionStyle?
    /// JSONB array of "YYYY-MM-DD" strings (grid / "when" polls).
    let gridDates: [LocalDate]?
    let gridHourStart: Int?
    let gridHourEnd: Int?
    let gridSlotMinutes: Int?
    let createdAt: Date
}

/// One entry of `squad_polls.options` (JSONB). The route writes **strings** for `text` polls and
/// `{date: "YYYY-MM-DD", time: string|null}` objects for `dates` polls (src/app/api/squads/create-poll/route.ts),
/// so the wire shape is heterogeneous and decoded by hand here — this is a JSON value, not a table column list.
nonisolated enum PollOption: Hashable, Sendable, Codable {
    case text(String)
    case date(LocalDate, time: String?)

    var text: String {
        switch self {
        case .text(let s): s
        case .date(let d, let t): t.map { "\(d.iso) \($0)" } ?? d.iso
        }
    }

    var date: LocalDate? {
        if case .date(let d, _) = self { d } else { nil }
    }

    var time: String? {
        if case .date(_, let t) = self { t } else { nil }
    }

    private enum Keys: String, CodingKey { case date, time }

    init(from decoder: any Decoder) throws {
        if let single = try? decoder.singleValueContainer(), let s = try? single.decode(String.self) {
            self = .text(s)
            return
        }
        let c = try decoder.container(keyedBy: Keys.self)
        let d = try c.decode(LocalDate.self, forKey: .date)
        let t = try c.decodeIfPresent(String.self, forKey: .time)
        self = .date(d, time: t)
    }

    func encode(to encoder: any Encoder) throws {
        switch self {
        case .text(let s):
            var c = encoder.singleValueContainer()
            try c.encode(s)
        case .date(let d, let t):
            var c = encoder.container(keyedBy: Keys.self)
            try c.encode(d, forKey: .date)
            try c.encode(t, forKey: .time)   // explicit null, as the route stores it
        }
    }
}
