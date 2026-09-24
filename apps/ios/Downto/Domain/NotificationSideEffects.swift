// Domain/NotificationSideEffects.swift — what a realtime `notifications` INSERT makes the stores do (ARCHITECTURE §5.3).
// Takes NotificationFacts (type + related ids), never AppNotification, so Domain stays Data-free (§1.0).
import Foundation

/// The Domain-side view of a notification row. `AppNotification` (Data/Models) exposes `var facts: NotificationFacts`.
nonisolated struct NotificationFacts: Hashable, Sendable {
    let type: NotificationType
    let relatedUserId: UserID?
    let relatedSquadId: SquadID?
    let relatedCheckId: CheckID?
    let relatedEventId: EventID?

    init(type: NotificationType, relatedUserId: UserID? = nil, relatedSquadId: SquadID? = nil, relatedCheckId: CheckID? = nil, relatedEventId: EventID? = nil) {
        self.type = type
        self.relatedUserId = relatedUserId
        self.relatedSquadId = relatedSquadId
        self.relatedCheckId = relatedCheckId
        self.relatedEventId = relatedEventId
    }
}

/// What a Slip's tap does. Lives here (not in Data/Payloads) because `SideEffect.toast` names it and Domain is import-clean (§1.0).
nonisolated enum ToastAction: Hashable, Sendable {
    case openSquad(SquadID), undoArchive(CheckID), openCheck(CheckID), retry
}

nonisolated enum SideEffect: Hashable, Sendable {
    case refreshCheck(CheckID), removeCheck(CheckID), refreshSquad(SquadID), markUnread(SquadID)
    case reloadSquadSideTables(SquadID), friendsHydrate, feedRefreshDebounced, refreshEvent(EventID)
    case toast(String, action: ToastAction?)

    var isToast: Bool {
        if case .toast = self { true } else { false }
    }
}

/// What the DB actually sends as `squad_invite` — one type, four meanings; the triggers write no structured discriminator, only
/// `body` copy (formed / waitlisted / promoted / a member added to a squad I'm already in). The effect is therefore chosen by MY ROLE
/// in that squad, which SquadsStore knows (or learns via refreshSquad), never by type alone.
nonisolated enum SquadInviteKind: Hashable, Sendable {
    case formed, waitlisted, promoted, memberAddedToMine

    /// nil = role unknown yet (stay silent, wait for the re-run after `refreshSquad`).
    init?(previousRole: SquadRole?, myRole: SquadRole?) {
        switch (previousRole, myRole) {
        case (_, .waitlist): self = .waitlisted
        case (.waitlist, .member): self = .promoted
        case (nil, .member): self = .formed
        case (.member, .member): self = .memberAddedToMine
        default: return nil
        }
    }
}

nonisolated enum NotificationSideEffects {
    static let waitlistedToast = "squad's full — you're on the waitlist ✶"
    static let promotedToast = "you're in — a spot opened up ✶"
    static let formedToast = "squad formed! → open"
    static let dateConfirmPromotedToast = "you're in — still down? ✶"

    /// `NotificationsStore.prepend` runs this twice: once with the roles it has (always yielding `.refreshSquad`), then again after
    /// `refreshSquad` lands with the fresh `myRole`, executing only the toast / markUnread effects from the second pass (§5.3).
    static func sideEffects(
        for n: NotificationFacts,
        openSquadId: SquadID?,
        myRole: (SquadID) -> SquadRole?,
        previousRole: (SquadID) -> SquadRole?
    ) -> [SideEffect] {
        /// "markUnreadUnlessOpen" in §5.3's prose: no unread dot for the chat the user is looking at.
        func markUnreadUnlessOpen(_ s: SquadID) -> SideEffect? { s == openSquadId ? nil : .markUnread(s) }

        switch n.type {
        case .squadInvite:
            guard let s = n.relatedSquadId else { return [] }
            // refreshSquad ALWAYS runs first (§4.10 wiring); the caller re-queries the roles after it lands and calls this again.
            switch SquadInviteKind(previousRole: previousRole(s), myRole: myRole(s)) {
            case .waitlisted:        return [.refreshSquad(s), .toast(waitlistedToast, action: .openSquad(s))]
            case .promoted:          return [.refreshSquad(s), .toast(promotedToast, action: .openSquad(s))]     // the ONLY promotion toast; §5.6's response-row path emits none
            case .formed:            return [.refreshSquad(s), .toast(formedToast, action: .openSquad(s))]       // DESIGN §5.6 copy; deduped by ToastCenter key "squad:{id}"
            case .memberAddedToMine: return [.refreshSquad(s), .markUnread(s)]                                   // "X is down — squad created" to a creator already in it, or a re-DOWN
            case nil:                return [.refreshSquad(s)]                                                   // role unknown yet: silent, wait for the re-run
            }
        case .squadJoinRequest, .squadDateNudge:
            return n.relatedSquadId.map { [.refreshSquad($0), markUnreadUnlessOpen($0)].compactMap { $0 } } ?? []
        case .squadMessage, .squadMention:
            return n.relatedSquadId.flatMap { markUnreadUnlessOpen($0).map { [$0] } } ?? []
        case .pollCreated:
            return n.relatedSquadId.map { [markUnreadUnlessOpen($0), .reloadSquadSideTables($0)].compactMap { $0 } } ?? []
        case .dateConfirm:
            // Also the date-confirm-flow promotion (20260302000001:93-99): role flips waitlist → member here too.
            guard let s = n.relatedSquadId else { return [] }
            let promoted = previousRole(s) == .waitlist && myRole(s) == .member
            return [markUnreadUnlessOpen(s), .reloadSquadSideTables(s), .refreshSquad(s),
                    promoted ? .toast(dateConfirmPromotedToast, action: .openSquad(s)) : nil].compactMap { $0 }
        case .checkResponse, .checkTag, .checkDateUpdated, .checkTextUpdated, .checkComment, .commentMention, .friendCheck, .checkRevived:
            return n.relatedCheckId.map { [.refreshCheck($0)] } ?? []
        case .checkArchived:
            return n.relatedCheckId.map { [.removeCheck($0)] } ?? []
        case .friendRequest:
            return [.friendsHydrate]
        case .friendAccepted:
            return [.friendsHydrate, .feedRefreshDebounced]          // FoF visibility changed
        case .eventDown, .friendEvent, .eventDateUpdated, .eventReminder:
            return n.relatedEventId.map { [.refreshEvent($0)] } ?? []   // no .eventComment case — DECISIONS #35
        case .unknown:
            return []
        }
    }
}
