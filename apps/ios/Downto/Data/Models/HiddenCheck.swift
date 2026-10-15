// Data/Models/HiddenCheck.swift — `hidden_checks` (20260221100000). Not in the realtime publication (§5.2).
import Foundation

nonisolated struct HiddenCheck: Codable, Identifiable, Hashable, Sendable {
    let id: HiddenRowID
    let userId: UserID
    let checkId: CheckID
    let hiddenAt: Date
}
