// Data/Models/FriendLink.swift — `friend_links` (20260327000003). 24h expiry, one use. The client only ever reads its own
// (RLS: creator_id = auth.uid()); creation goes through `create_friend_link` (→ token) and redemption through `redeem_friend_link`.
import Foundation

nonisolated struct FriendLink: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let creatorId: UserID
    let token: UUID
    let redeemedBy: UserID?
    let redeemedAt: Date?
    let expiresAt: Date
    let createdAt: Date
}
