// Data/Models/CheckResponse.swift — `check_responses` (ARCHITECTURE §3.4). Surrogate `id` PK: realtime DELETE payloads
// carry only `{id}` (§3.3), so the row id is kept.
import Foundation

nonisolated struct CheckResponse: Codable, Identifiable, Hashable, Sendable {
    let id: ResponseRowID
    let checkId: CheckID
    let userId: UserID
    /// The DB may convert a `down` into `waitlist` when the check is capped (`cap_down_responses`).
    var response: ResponseKind
    let createdAt: Date

    init(id: ResponseRowID, checkId: CheckID, userId: UserID, response: ResponseKind, createdAt: Date) {
        self.id = id
        self.checkId = checkId
        self.userId = userId
        self.response = response
        self.createdAt = createdAt
    }
}
