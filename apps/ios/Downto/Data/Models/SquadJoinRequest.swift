// Data/Models/SquadJoinRequest.swift — `squad_join_requests` (20260317000002).
import Foundation

nonisolated struct SquadJoinRequest: Codable, Identifiable, Hashable, Sendable {
    let id: JoinRequestID
    let squadId: SquadID
    let userId: UserID
    var status: JoinRequestStatus
    let createdAt: Date
}
