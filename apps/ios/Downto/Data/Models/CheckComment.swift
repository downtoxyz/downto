// Data/Models/CheckComment.swift — `check_comments` (20260311000002 + mentions 20260319000001 + event_id 20260417000001).
// A row has `check_id` OR `event_id` (never `checkId!` — §4.10).
import Foundation

nonisolated struct CheckComment: Codable, Identifiable, Hashable, Sendable {
    let id: CommentID
    let checkId: CheckID?
    let eventId: EventID?
    let userId: UserID
    /// ≤ 280 chars (DB CHECK).
    let text: String
    let mentions: [UserID]
    let createdAt: Date
}
