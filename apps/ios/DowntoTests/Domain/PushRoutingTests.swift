// DowntoTests/Domain/PushRoutingTests.swift — all 22 notification types + unknown + malformed relatedId (ARCHITECTURE §7.3, INVENTORY §5).
import Foundation
import Testing
@testable import Downto

@Suite("PushRouting")
struct PushRoutingTests {
    static let id = "3f2504e0-4f89-11d3-9a0c-0305e82c3301"
    static let uuid = UUID(uuidString: id)!

    nonisolated static let squadTypes = ["squad_message", "squad_invite", "squad_mention", "squad_join_request", "poll_created", "date_confirm", "squad_date_nudge"]
    nonisolated static let checkTypes = ["friend_check", "check_response", "check_tag", "check_date_updated", "check_text_updated", "check_comment", "comment_mention"]
    nonisolated static let eventTypes = ["event_down", "friend_event", "event_date_updated", "event_reminder"]
    nonisolated static let unmapped = ["check_archived", "check_revived"]

    @Test func friendTypes() {
        #expect(mapPushToRoute(type: "friend_request", relatedId: Self.id) == .friends(.add))
        #expect(mapPushToRoute(type: "friend_request", relatedId: nil) == .friends(.add))
        #expect(mapPushToRoute(type: "friend_accepted", relatedId: Self.id) == .friends(.friends))
        #expect(mapPushToRoute(type: "friend_accepted", relatedId: nil) == .friends(.friends))
    }

    @Test(arguments: squadTypes)
    func squadTypesOpenTheSquad(_ type: String) {
        #expect(mapPushToRoute(type: type, relatedId: Self.id) == .squads(squadId: SquadID(Self.uuid)))
        #expect(mapPushToRoute(type: type, relatedId: nil) == .squads(squadId: nil))
    }

    @Test(arguments: checkTypes)
    func checkTypesHighlightTheCheck(_ type: String) {
        #expect(mapPushToRoute(type: type, relatedId: Self.id) == .feed(checkId: CheckID(Self.uuid)))
        #expect(mapPushToRoute(type: type, relatedId: nil) == .feed(checkId: nil))
    }

    @Test(arguments: eventTypes)
    func eventTypesGoToTheFeedWithoutAHighlight(_ type: String) {
        #expect(mapPushToRoute(type: type, relatedId: Self.id) == .feed(checkId: nil))
        #expect(mapPushToRoute(type: type, relatedId: nil) == .feed(checkId: nil))
    }

    @Test(arguments: unmapped + ["event_comment", "", "bogus", "SQUAD_MESSAGE", "squad_message "])
    func unmappedAndUnknownTypesRouteNowhere(_ type: String) {
        // event_comment is not in the notifications.type CHECK today (DECISIONS #35) → .unknown → nil.
        #expect(mapPushToRoute(type: type, relatedId: Self.id) == nil)
        #expect(mapPushToRoute(type: type, relatedId: nil) == nil)
    }

    @Test(arguments: ["not-a-uuid", "", "3f2504e0-4f89-11d3-9a0c", "3f2504e04f8911d39a0c0305e82c3301x"])
    func malformedRelatedIdDegradesToTheTabWithoutATarget(_ bad: String) {
        #expect(mapPushToRoute(type: "squad_message", relatedId: bad) == .squads(squadId: nil))
        #expect(mapPushToRoute(type: "check_response", relatedId: bad) == .feed(checkId: nil))
        #expect(mapPushToRoute(type: "friend_request", relatedId: bad) == .friends(.add))
    }

    @Test func uppercaseUUIDsAreAccepted() {
        #expect(mapPushToRoute(type: "squad_message", relatedId: Self.id.uppercased()) == .squads(squadId: SquadID(Self.uuid)))
    }

    @Test func every22DBTypesPlusUnknownIsCovered() {
        let all = Set(Self.squadTypes + Self.checkTypes + Self.eventTypes + Self.unmapped + ["friend_request", "friend_accepted"])
        #expect(all.count == 22)
        #expect(all == Set(NotificationType.allCases.filter { $0 != .unknown }.map(\.rawValue)))
        for t in all { _ = mapPushToRoute(type: t, relatedId: Self.id) }
    }
}
