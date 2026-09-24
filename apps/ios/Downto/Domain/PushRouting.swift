// Domain/PushRouting.swift — mapPushToRoute (ARCHITECTURE §7.3, INVENTORY §5). Port of src/lib/pushNavigation.ts
// `mapPushToNavigateAction`, so a tap on an OS push and a tap on the in-app notification row land in the same place.
//
// `event_comment` is not a value of the notifications.type CHECK today (DECISIONS #35) — it decodes as `.unknown` and routes nowhere.
import Foundation

/// The APNs custom payload `{type, relatedId}` → where to go. nil = unmapped (`check_archived`, `check_revived`, unknown types).
/// `relatedId` is the first non-null of related_squad_id / related_check_id / related_event_id / related_user_id (INVENTORY §5);
/// a malformed id degrades to the tab without a target rather than dropping the tap.
nonisolated func mapPushToRoute(type: String, relatedId: String?) -> Route? {
    let uuid = relatedId.flatMap(UUID.init(uuidString:))
    switch NotificationType(rawValue: type) ?? .unknown {
    case .friendRequest: return .friends(.add)
    case .friendAccepted: return .friends(.friends)
    case .squadMessage, .squadInvite, .squadMention, .squadJoinRequest, .pollCreated, .dateConfirm, .squadDateNudge:
        return .squads(squadId: uuid.map(SquadID.init))
    case .friendCheck, .checkResponse, .checkTag, .checkDateUpdated, .checkTextUpdated, .checkComment, .commentMention:
        return .feed(checkId: uuid.map(CheckID.init))
    case .eventDown, .friendEvent, .eventDateUpdated, .eventReminder:
        return .feed(checkId: nil)
    case .checkArchived, .checkRevived, .unknown:
        return nil
    }
}
