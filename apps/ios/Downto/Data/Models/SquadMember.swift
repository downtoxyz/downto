// Data/Models/SquadMember.swift — `squad_members` (20260214000001 + role 20260303000001). UNIQUE(squad_id, user_id).
import Foundation

nonisolated struct SquadMember: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let squadId: SquadID
    let userId: UserID
    var role: SquadRole
    let joinedAt: Date
}
