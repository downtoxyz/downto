// Data/Models/ReportedContent.swift — `reported_content` (20260424000003). Append-only; the client only INSERTs, never reads,
// so this is Encodable-only. `reporter_id` has no default and the RLS WITH CHECK requires it to be auth.uid().
import Foundation

nonisolated struct ReportedContent: Encodable, Hashable, Sendable {
    let reporterId: UserID
    let targetType: ReportTarget
    let targetId: UUID
    let reason: ReportReason
    let details: String?

    init(reporterId: UserID, targetType: ReportTarget, targetId: UUID, reason: ReportReason, details: String?) {
        self.reporterId = reporterId
        self.targetType = targetType
        self.targetId = targetId
        self.reason = reason
        self.details = details
    }
}
