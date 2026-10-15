// Data/Models/Profile.swift — `profiles` (ARCHITECTURE §3.4; columns from 20260214000001 + later ALTERs).
// snake_case → camelCase via JSON.decoder; no hand-written CodingKeys (§3.2).
import Foundation

nonisolated struct Profile: Codable, Identifiable, Hashable, Sendable {
    let id: UserID                      // = auth uid
    var username: String
    var displayName: String
    /// Unused by the product today (no upload path); kept because it is a column.
    var avatarUrl: String?
    /// GENERATED ALWAYS AS upper(left(display_name, 1)) — read-only.
    let avatarLetter: String
    var availability: Availability?
    var igHandle: String?
    var onboarded: Bool
    let isTest: Bool
    /// Client-synced on load (INVENTORY §2).
    var timezone: String?
    /// Unused (INVENTORY §2) — still a column.
    let themeEnabled: Bool
    let calendarToken: UUID?
    let referredByCheckId: CheckID?
    let usernameChangedAt: Date?
    let createdAt: Date
    let updatedAt: Date
}
