// Data/Models/Friendship.swift — `friendships` (20260214000001). REPLICA IDENTITY FULL (20260216000006), so realtime
// DELETEs carry the whole old row — the only table where TableChange.delete(old:) is non-nil (§5.2).
import Foundation

nonisolated struct Friendship: Codable, Identifiable, Hashable, Sendable {
    let id: FriendshipID
    let requesterId: UserID
    let addresseeId: UserID
    var status: FriendshipStatus
    let createdAt: Date
    let updatedAt: Date?
}
