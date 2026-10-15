// Data/Models/CrewPoolEntry.swift — `crew_pool` ("looking for a squad", 20260217000003). UNIQUE(event_id, user_id).
import Foundation

nonisolated struct CrewPoolEntry: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let eventId: EventID
    let userId: UserID
    let joinedAt: Date
}
