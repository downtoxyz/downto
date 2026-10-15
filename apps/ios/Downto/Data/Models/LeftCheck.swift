// Data/Models/LeftCheck.swift — `left_checks` (20260312000001). Written by `leave_squad`; hydrated, not rendered. Not published.
import Foundation

nonisolated struct LeftCheck: Codable, Identifiable, Hashable, Sendable {
    let id: LeftRowID
    let userId: UserID
    let checkId: CheckID
    let leftAt: Date
}
