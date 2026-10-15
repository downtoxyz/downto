// Data/Models/CheckCoAuthor.swift — `check_co_authors` (20260305000001).
import Foundation

nonisolated struct CheckCoAuthor: Codable, Identifiable, Hashable, Sendable {
    let id: CoAuthorRowID
    let checkId: CheckID
    let userId: UserID
    let invitedBy: UserID
    var status: CoAuthorStatus
    let createdAt: Date
}
