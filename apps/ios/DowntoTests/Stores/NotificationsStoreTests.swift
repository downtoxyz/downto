// DowntoTests/Stores/NotificationsStoreTests.swift — the §5.3 two-pass run: refreshSquad first, toast/markUnread decided on the
// re-queried role; exactly one toast per notification; deduped against the optimistic path by key.
import Foundation
import Testing
@testable import Downto

@Suite("NotificationsStore")
struct NotificationsStoreTests {
    static let squad = SquadID(SocialFixtures.uuid(700))

    static func notification(_ type: NotificationType, squad: SquadID? = nil, check: CheckID? = nil, user: UserID? = nil, me: UserID) -> AppNotification {
        AppNotification(id: NotificationID(UUID()), userId: me, title: "t", body: "b", isRead: false, type: type,
                        relatedUserId: user, relatedSquadId: squad, relatedCheckId: check, relatedEventId: nil, createdAt: .now)
    }

    static func toasts(_ effects: [SideEffect]) -> [String] { effects.compactMap { if case .toast(let s, _) = $0 { s } else { nil } } }

    @Test func waitlistedInviteRefreshesSquadThenToastsOnce() async throws {
        let (env, people) = try SocialTestSupport.environment()
        env.squads.load(raw: SocialTestSupport.squadsRaw(squad: Self.squad, me: people.me.id, role: .waitlist), phase: .loaded(at: .now, stale: false))
        await env.notifications.prepend(Self.notification(.squadInvite, squad: Self.squad, me: people.me.id))
        let fx = env.notifications.executedEffects
        #expect(fx.first == .refreshSquad(Self.squad))
        #expect(Self.toasts(fx) == [NotificationSideEffects.waitlistedToast])
        #expect(env.toasts.current?.text == NotificationSideEffects.waitlistedToast)
        #expect(env.notifications.unreadCount == 1)
    }

    @Test func memberInviteWithNoPriorRoleIsFormed() async throws {
        let (env, people) = try SocialTestSupport.environment()
        // Role is .member both before and after (refreshSquad is a stub in this lane); previousRole is read before → .member too,
        // so this is the (member, member) "added to mine" case: markUnread, no toast.
        env.squads.load(raw: SocialTestSupport.squadsRaw(squad: Self.squad, me: people.me.id, role: .member), phase: .loaded(at: .now, stale: false))
        await env.notifications.prepend(Self.notification(.squadInvite, squad: Self.squad, me: people.me.id))
        let fx = env.notifications.executedEffects
        #expect(fx == [.refreshSquad(Self.squad), .markUnread(Self.squad)])
        #expect(env.toasts.current == nil)
        #expect(env.squads.unread.contains(Self.squad))
    }

    @Test func unknownRoleStaysSilent() async throws {
        let (env, people) = try SocialTestSupport.environment()
        env.squads.load(raw: SocialTestSupport.squadsRaw(squad: Self.squad, me: people.me.id, role: nil), phase: .loaded(at: .now, stale: false))
        await env.notifications.prepend(Self.notification(.squadInvite, squad: Self.squad, me: people.me.id))
        #expect(env.notifications.executedEffects == [.refreshSquad(Self.squad)])
        #expect(env.toasts.current == nil)
    }

    @Test func optimisticPathToastDedupesTheInviteToast() async throws {
        let (env, people) = try SocialTestSupport.environment()
        env.squads.load(raw: SocialTestSupport.squadsRaw(squad: Self.squad, me: people.me.id, role: .waitlist), phase: .loaded(at: .now, stale: false))
        env.toasts.show("check is full — you're #2 on the waitlist", key: "squad:\(Self.squad)")
        await env.notifications.prepend(Self.notification(.squadInvite, squad: Self.squad, me: people.me.id))
        #expect(env.toasts.current?.text == "check is full — you're #2 on the waitlist")
        env.toasts.binding = nil
        #expect(env.toasts.current == nil)
    }

    @Test func squadMessageForTheOpenChatDoesNotMarkUnread() async throws {
        let (env, people) = try SocialTestSupport.environment()
        env.router.squadPath = [Self.squad]
        await env.notifications.prepend(Self.notification(.squadMessage, squad: Self.squad, me: people.me.id))
        #expect(env.notifications.executedEffects.isEmpty)
        env.router.squadPath = []
        await env.notifications.prepend(Self.notification(.squadMessage, squad: Self.squad, me: people.me.id))
        #expect(env.notifications.executedEffects == [.markUnread(Self.squad)])
    }

    @Test func checkTypesRefreshTheCheck() async throws {
        let (env, people) = try SocialTestSupport.environment()
        let c = CheckID(UUID())
        await env.notifications.prepend(Self.notification(.checkResponse, check: c, me: people.me.id))
        #expect(env.notifications.executedEffects == [.refreshCheck(c)])
    }

    @Test func friendAcceptedHydratesFriendsAndDebouncesTheFeed() async throws {
        let (env, people) = try SocialTestSupport.environment()
        await env.notifications.prepend(Self.notification(.friendAccepted, user: people.sara.id, me: people.me.id))
        #expect(env.notifications.executedEffects == [.friendsHydrate, .feedRefreshDebounced])
        #expect(env.friends.phase.isSettled)
    }

    @Test func duplicateIdsAreIgnoredAndCountsRecompute() async throws {
        let (env, people) = try SocialTestSupport.environment()
        let n = Self.notification(.friendRequest, user: people.lena.id, me: people.me.id)
        await env.notifications.prepend(n)
        await env.notifications.prepend(n)
        #expect(env.notifications.items.count == 1)
        #expect(env.notifications.pendingFriendRequests.count == 1)
        await env.notifications.markAllReadExceptFriendRequests()
        #expect(env.notifications.unreadCount == 1)   // friend requests stay unread
        await env.notifications.markRead(n.id)
        #expect(env.notifications.unreadCount == 0)
    }

    @Test func glyphMapCoversEveryType() {
        for t in NotificationType.allCases where t != .unknown {
            #expect(NotificationGlyph(t).tint != .unknown, "\(t)")
        }
        #expect(NotificationGlyph(.unknown).glyph == "·")
    }
}
