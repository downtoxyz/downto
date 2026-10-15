// Data/Models/SquadPollVote.swift — `squad_poll_votes` (20260317000001). UNIQUE(poll_id, user_id) per option row.
import Foundation

nonisolated struct SquadPollVote: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let pollId: PollID
    let userId: UserID
    let optionIndex: Int
    let createdAt: Date
}
