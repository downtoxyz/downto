// Data/Models/AppNotification.swift — `notifications` (20260214000004 + related_event_id 20260324000001).
// The Domain-side slice (`NotificationFacts`, ARCHITECTURE §1.0) lives in Domain/NotificationSideEffects.swift — the
// domain lane owns it; `extension AppNotification { var facts }` is added there or in the stores lane once it exists.
import Foundation

nonisolated struct AppNotification: Codable, Identifiable, Hashable, Sendable {
    let id: NotificationID
    let userId: UserID
    let title: String
    let body: String?
    var isRead: Bool
    let type: NotificationType
    let relatedUserId: UserID?
    let relatedSquadId: SquadID?
    let relatedCheckId: CheckID?
    let relatedEventId: EventID?
    let createdAt: Date
}
