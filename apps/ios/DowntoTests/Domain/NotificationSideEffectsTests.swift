// DowntoTests/Domain/NotificationSideEffectsTests.swift — every type × (open squad matches / doesn't) × for .squadInvite and
// .dateConfirm the four (previousRole, myRole) pairs (ARCHITECTURE §5.3); exactly one toast per notification; distinct copy.
import Foundation
import Testing
@testable import Downto

@Suite("NotificationSideEffects")
struct NotificationSideEffectsTests {
    static let squad = SquadID(DomainTestSupport.uuid(1))
    static let other = SquadID(DomainTestSupport.uuid(2))
    static let check = CheckID(DomainTestSupport.uuid(3))
    static let event = EventID(DomainTestSupport.uuid(4))
    static let user = UserID(DomainTestSupport.uuid(5))

    static func facts(_ type: NotificationType, squad: SquadID? = nil, check: CheckID? = nil, event: EventID? = nil, user: UserID? = nil) -> NotificationFacts {
        NotificationFacts(type: type, relatedUserId: user, relatedSquadId: squad, relatedCheckId: check, relatedEventId: event)
    }

    static func run(_ n: NotificationFacts, open: SquadID? = nil, previous: SquadRole? = nil, my: SquadRole? = nil) -> [SideEffect] {
        NotificationSideEffects.sideEffects(for: n, openSquadId: open, myRole: { _ in my }, previousRole: { _ in previous })
    }

    static func toasts(_ effects: [SideEffect]) -> [String] {
        effects.compactMap { if case .toast(let s, _) = $0 { s } else { nil } }
    }

    // MARK: squad_invite — four (previousRole, myRole) pairs

    @Test func squadInviteWaitlisted() {
        for prev in [nil, SquadRole.member, .waitlist] {
            let e = Self.run(Self.facts(.squadInvite, squad: Self.squad), previous: prev, my: .waitlist)
            #expect(e == [.refreshSquad(Self.squad), .toast(NotificationSideEffects.waitlistedToast, action: .openSquad(Self.squad))])
        }
    }

    @Test func squadInvitePromoted() {
        let e = Self.run(Self.facts(.squadInvite, squad: Self.squad), previous: .waitlist, my: .member)
        #expect(e == [.refreshSquad(Self.squad), .toast(NotificationSideEffects.promotedToast, action: .openSquad(Self.squad))])
    }

    @Test func squadInviteFormed() {
        let e = Self.run(Self.facts(.squadInvite, squad: Self.squad), previous: nil, my: .member)
        #expect(e == [.refreshSquad(Self.squad), .toast(NotificationSideEffects.formedToast, action: .openSquad(Self.squad))])
    }

    @Test func squadInviteMemberAddedToMine() {
        let e = Self.run(Self.facts(.squadInvite, squad: Self.squad), previous: .member, my: .member)
        #expect(e == [.refreshSquad(Self.squad), .markUnread(Self.squad)])
        #expect(Self.toasts(e).isEmpty)
    }

    @Test func squadInviteRoleUnknownIsSilentAndStillRefreshes() {
        for (prev, my) in [(nil, nil), (SquadRole.member, nil), (SquadRole.waitlist, nil), (nil, SquadRole.unknown), (SquadRole.unknown, .member)] {
            let e = Self.run(Self.facts(.squadInvite, squad: Self.squad), previous: prev, my: my)
            #expect(e == [.refreshSquad(Self.squad)], "\(String(describing: prev)) → \(String(describing: my))")
        }
    }

    @Test func squadInviteWithoutASquadIdDoesNothing() {
        #expect(Self.run(Self.facts(.squadInvite), my: .member).isEmpty)
    }

    @Test func squadInviteIgnoresTheOpenSquad() {
        // The toast is the payload here; open or not, the squad is refreshed and one toast is emitted.
        let e = Self.run(Self.facts(.squadInvite, squad: Self.squad), open: Self.squad, previous: nil, my: .member)
        #expect(Self.toasts(e).count == 1)
    }

    @Test func theThreeSquadInviteToastsAreDistinct() {
        #expect(Set([NotificationSideEffects.waitlistedToast, NotificationSideEffects.formedToast, NotificationSideEffects.promotedToast, NotificationSideEffects.dateConfirmPromotedToast]).count == 4)
    }

    @Test func squadInviteKindMapping() {
        #expect(SquadInviteKind(previousRole: nil, myRole: .waitlist) == .waitlisted)
        #expect(SquadInviteKind(previousRole: .waitlist, myRole: .member) == .promoted)
        #expect(SquadInviteKind(previousRole: nil, myRole: .member) == .formed)
        #expect(SquadInviteKind(previousRole: .member, myRole: .member) == .memberAddedToMine)
        #expect(SquadInviteKind(previousRole: .member, myRole: nil) == nil)
    }

    // MARK: date_confirm — four pairs × open/not open

    @Test func dateConfirmPromotionToasts() {
        let e = Self.run(Self.facts(.dateConfirm, squad: Self.squad), previous: .waitlist, my: .member)
        #expect(e == [.markUnread(Self.squad), .reloadSquadSideTables(Self.squad), .refreshSquad(Self.squad),
                      .toast(NotificationSideEffects.dateConfirmPromotedToast, action: .openSquad(Self.squad))])
    }

    @Test func dateConfirmNonPromotionPairsHaveNoToast() {
        for (prev, my) in [(nil, SquadRole.member), (SquadRole.member, .member), (nil, .waitlist), (SquadRole.member, .waitlist), (SquadRole.waitlist, .waitlist), (nil, nil)] {
            let e = Self.run(Self.facts(.dateConfirm, squad: Self.squad), previous: prev, my: my)
            #expect(e == [.markUnread(Self.squad), .reloadSquadSideTables(Self.squad), .refreshSquad(Self.squad)], "\(String(describing: prev)) → \(String(describing: my))")
        }
    }

    @Test func dateConfirmOnTheOpenSquadSkipsMarkUnread() {
        let e = Self.run(Self.facts(.dateConfirm, squad: Self.squad), open: Self.squad, previous: .waitlist, my: .member)
        #expect(e == [.reloadSquadSideTables(Self.squad), .refreshSquad(Self.squad), .toast(NotificationSideEffects.dateConfirmPromotedToast, action: .openSquad(Self.squad))])
        let e2 = Self.run(Self.facts(.dateConfirm, squad: Self.squad), open: Self.squad, previous: nil, my: .member)
        #expect(e2 == [.reloadSquadSideTables(Self.squad), .refreshSquad(Self.squad)])
        #expect(Self.run(Self.facts(.dateConfirm), my: .member).isEmpty)
    }

    // MARK: the other squad types × open squad matches / doesn't

    @Test func squadMessageAndMentionMarkUnreadUnlessOpen() {
        for t in [NotificationType.squadMessage, .squadMention] {
            #expect(Self.run(Self.facts(t, squad: Self.squad)) == [.markUnread(Self.squad)])
            #expect(Self.run(Self.facts(t, squad: Self.squad), open: Self.other) == [.markUnread(Self.squad)])
            #expect(Self.run(Self.facts(t, squad: Self.squad), open: Self.squad).isEmpty)
            #expect(Self.run(Self.facts(t)).isEmpty)
        }
    }

    @Test func joinRequestAndDateNudgeRefreshAndMarkUnreadUnlessOpen() {
        for t in [NotificationType.squadJoinRequest, .squadDateNudge] {
            #expect(Self.run(Self.facts(t, squad: Self.squad)) == [.refreshSquad(Self.squad), .markUnread(Self.squad)])
            #expect(Self.run(Self.facts(t, squad: Self.squad), open: Self.squad) == [.refreshSquad(Self.squad)])
            #expect(Self.run(Self.facts(t)).isEmpty)
        }
    }

    @Test func pollCreatedReloadsSideTables() {
        #expect(Self.run(Self.facts(.pollCreated, squad: Self.squad)) == [.markUnread(Self.squad), .reloadSquadSideTables(Self.squad)])
        #expect(Self.run(Self.facts(.pollCreated, squad: Self.squad), open: Self.squad) == [.reloadSquadSideTables(Self.squad)])
        #expect(Self.run(Self.facts(.pollCreated)).isEmpty)
    }

    // MARK: check / friend / event types

    @Test func checkTypesRefreshTheCheck() {
        for t in [NotificationType.checkResponse, .checkTag, .checkDateUpdated, .checkTextUpdated, .checkComment, .commentMention, .friendCheck, .checkRevived] {
            #expect(Self.run(Self.facts(t, check: Self.check)) == [.refreshCheck(Self.check)], "\(t)")
            #expect(Self.run(Self.facts(t, check: Self.check), open: Self.squad) == [.refreshCheck(Self.check)], "\(t)")
            #expect(Self.run(Self.facts(t)).isEmpty, "\(t)")
        }
    }

    @Test func checkArchivedRemovesTheCheck() {
        #expect(Self.run(Self.facts(.checkArchived, check: Self.check)) == [.removeCheck(Self.check)])
        #expect(Self.run(Self.facts(.checkArchived)).isEmpty)
    }

    @Test func friendTypes() {
        #expect(Self.run(Self.facts(.friendRequest, user: Self.user)) == [.friendsHydrate])
        #expect(Self.run(Self.facts(.friendRequest)) == [.friendsHydrate])
        #expect(Self.run(Self.facts(.friendAccepted, user: Self.user)) == [.friendsHydrate, .feedRefreshDebounced])
    }

    @Test func eventTypesRefreshTheEvent() {
        for t in [NotificationType.eventDown, .friendEvent, .eventDateUpdated, .eventReminder] {
            #expect(Self.run(Self.facts(t, event: Self.event)) == [.refreshEvent(Self.event)], "\(t)")
            #expect(Self.run(Self.facts(t)).isEmpty, "\(t)")
        }
    }

    @Test func unknownDoesNothing() {
        #expect(Self.run(Self.facts(.unknown, squad: Self.squad, check: Self.check, event: Self.event, user: Self.user)).isEmpty)
    }

    // MARK: invariants

    @Test func atMostOneToastPerNotificationAcrossTheWholeMatrix() {
        let roles: [SquadRole?] = [nil, .member, .waitlist, .unknown]
        for t in NotificationType.allCases {
            for open in [nil, Self.squad, Self.other] {
                for prev in roles {
                    for my in roles {
                        let e = Self.run(Self.facts(t, squad: Self.squad, check: Self.check, event: Self.event, user: Self.user), open: open, previous: prev, my: my)
                        #expect(Self.toasts(e).count <= 1, "\(t) open=\(String(describing: open)) \(String(describing: prev))→\(String(describing: my))")
                        #expect(Set(e).count == e.count, "duplicate effect for \(t)")
                    }
                }
            }
        }
    }

    @Test func squadInviteAndDateConfirmAlwaysRefreshFirst() {
        // The two-pass protocol in NotificationsStore relies on .refreshSquad being present on the first pass whatever the roles are.
        for prev in [nil, SquadRole.member, .waitlist] {
            for my in [nil, SquadRole.member, .waitlist] {
                #expect(Self.run(Self.facts(.squadInvite, squad: Self.squad), previous: prev, my: my).first == .refreshSquad(Self.squad))
                #expect(Self.run(Self.facts(.dateConfirm, squad: Self.squad), previous: prev, my: my).contains(.refreshSquad(Self.squad)))
            }
        }
    }

    @Test func factsInitDefaultsAndIsToast() {
        let f = NotificationFacts(type: .squadMessage)
        #expect(f.relatedSquadId == nil && f.relatedCheckId == nil && f.relatedEventId == nil && f.relatedUserId == nil)
        #expect(SideEffect.toast("x", action: nil).isToast)
        #expect(!SideEffect.friendsHydrate.isToast)
    }
}
