// Data/Models/SavedEvent.swift — `saved_events` (20260214000001 + reminders 20260325000003). UNIQUE(user_id, event_id).
import Foundation

nonisolated struct SavedEvent: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let userId: UserID
    let eventId: EventID
    var isDown: Bool
    let savedAt: Date
    let reminded24hAt: Date?
    let reminded2hAt: Date?
}
