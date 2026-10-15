// Data/Models/InterestCheck.swift — `interest_checks` (ARCHITECTURE §3.4).
import Foundation

nonisolated struct InterestCheck: Codable, Identifiable, Hashable, Sendable {
    let id: CheckID
    let authorId: UserID
    var text: String
    /// nil = open-ended (no timer).
    var expiresAt: Date?
    var eventDate: LocalDate?
    var eventDateLabel: String?
    /// "7pm", "7:30pm" — a display string; only SquadCountdown parses it.
    var eventTime: String?
    var eventTz: String?
    var dateFlexible: Bool
    var timeFlexible: Bool
    var location: String?
    /// nil = unlimited (20260316000001).
    var maxSquadSize: Int?
    let mystery: Bool
    var letterboxdUrl: String?
    var movieMetadata: MovieMetadata?
    /// Required for the public `/check/[id]` page; set by markCheckShared.
    var sharedAt: Date?
    var archivedAt: Date?
    var lastRalliedAt: Date?
    let createdAt: Date
}
