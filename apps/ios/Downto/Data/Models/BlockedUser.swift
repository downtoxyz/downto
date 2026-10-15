// Data/Models/BlockedUser.swift — `blocked_users` (20260424000003). PK (blocker_id, blocked_id); mutual via RLS.
import Foundation

nonisolated struct BlockedUser: Codable, Hashable, Sendable {
    let blockerId: UserID
    let blockedId: UserID
    let createdAt: Date
}
