// Data/Models/SquadDateConfirm.swift — `squad_date_confirms` (20260302000001). Surrogate `id` PK + UNIQUE(squad_id, user_id):
// the `dateConfirms(squadId)` channel is `*`, and a DELETE payload is `{id}` only, so ChatRaw keys these by ConfirmRowID (§3.4, §5.2).
import Foundation

nonisolated struct SquadDateConfirm: Codable, Identifiable, Hashable, Sendable {
    let id: ConfirmRowID
    let squadId: SquadID
    let messageId: MessageID
    let userId: UserID
    /// nil = not answered yet.
    var response: ConfirmResponse?
    var respondedAt: Date?
    let createdAt: Date?
}
