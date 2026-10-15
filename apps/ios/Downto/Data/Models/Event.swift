// Data/Models/Event.swift — `events` (ARCHITECTURE §3.4).
import Foundation

nonisolated struct Event: Codable, Identifiable, Hashable, Sendable {
    let id: EventID
    var title: String
    var venue: String?
    var neighborhood: String?
    var date: LocalDate?
    /// "Fri, Feb 14" or "Tonight"
    var dateDisplay: String?
    /// "11PM-5AM"
    var timeDisplay: String?
    var vibes: [String]
    var note: String?
    var imageUrl: String?
    var igHandle: String?
    /// Original Instagram post URL.
    var igUrl: String?
    var diceUrl: String?
    var letterboxdUrl: String?
    var raUrl: String?
    var movieMetadata: MovieMetadata?
    /// Kept in sync with `visibility` by `sync_event_is_public`.
    var isPublic: Bool
    var visibility: EventVisibility
    /// ON DELETE SET NULL — nullable in the schema.
    let createdBy: UserID?
    let createdAt: Date
}
