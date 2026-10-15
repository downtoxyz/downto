// Data/Models/SquadReadCursor.swift — `squad_read_cursors` (20260327000001). PK (user_id, squad_id). Drives squad unread dots (§5.5).
import Foundation

nonisolated struct SquadReadCursor: Codable, Hashable, Sendable {
    let userId: UserID
    let squadId: SquadID
    var lastReadAt: Date
}
