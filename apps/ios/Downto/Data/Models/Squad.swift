// Data/Models/Squad.swift — `squads` (ARCHITECTURE §3.4). One active squad per check (unique).
import Foundation

nonisolated struct Squad: Codable, Identifiable, Hashable, Sendable {
    let id: SquadID
    var name: String
    let checkId: CheckID?
    let eventId: EventID?
    let createdBy: UserID
    var meetingSpot: String?
    var arrivalTime: String?
    var transportNotes: String?
    /// nil = no expiry (open-ended check squads).
    var expiresAt: Date?
    var graceStartedAt: Date?
    var warnedAt: Date?
    var archivedAt: Date?
    var dateNudgeSentAt: Date?
    var lockedDate: LocalDate?
    var dateStatus: DateStatus?
    let createdAt: Date
}
