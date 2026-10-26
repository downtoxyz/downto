// DowntoTests/Stores/FriendsRebuildTests.swift — FriendsRaw → friends / incoming / outgoing / suggestions / blocked, and the fake-path mutations.
import Foundation
import Testing
@testable import Downto

@Suite("FriendsStore rebuild")
struct FriendsRebuildTests {
    @Test func busyFridayProjectsTheFourLists() throws {
        let (env, people) = try SocialTestSupport.environment()
        let fx = SocialFixtures.busyFriday(me: people.me, profiles: people.all)
        env.friends.load(raw: fx.friends, phase: .loaded(at: .now, stale: false))
        let f = env.friends!
        #expect(f.friends.map(\.username) == ["sara", "mo"])          // available first, then alphabetical: sara (open) before mo (not available)
        #expect(f.incoming.map(\.person.username) == ["lena"])
        #expect(f.outgoing.isEmpty)
        #expect(f.suggestions.map(\.person.username) == ["devon"])
        #expect(f.suggestions.first?.mutualFriendName == "Sara")
        #expect(f.friendIds == [people.sara.id, people.mo.id])
        #expect(f.hasAnyConnection)
        #expect(f.relationship(with: people.sara.id) == .friends)
        #expect(f.relationship(with: people.devon.id) == .none)
        if case .incoming = f.relationship(with: people.lena.id) {} else { Issue.record("lena should be incoming") }
        #expect(f.via(for: people.devon.id) == "Sara")
    }

    @Test func suggestionsExcludeFriendsPendingAndBlocked() throws {
        let (env, people) = try SocialTestSupport.environment()
        var raw = SocialFixtures.busyFriday(me: people.me, profiles: people.all).friends
        raw.suggestions += [
            FoFSuggestion(suggestedUserId: people.sara.id, mutualFriendId: people.mo.id, mutualFriendName: "Mo"),      // already a friend
            FoFSuggestion(suggestedUserId: people.lena.id, mutualFriendId: people.sara.id, mutualFriendName: "Sara"),  // pending
            FoFSuggestion(suggestedUserId: people.devon.id, mutualFriendId: people.mo.id, mutualFriendName: "Mo"),     // second mutual → "+ 1"
        ]
        env.friends.load(raw: raw, phase: .loaded(at: .now, stale: false))
        #expect(env.friends.suggestions.map(\.person.username) == ["devon"])
        #expect(env.friends.suggestions.first?.mutualFriendName == "Sara + 1")
    }

    @Test func blockingHidesTheFriendshipAndListsThem() async throws {
        let (env, people) = try SocialTestSupport.environment()
        env.friends.load(raw: SocialFixtures.busyFriday(me: people.me, profiles: people.all).friends, phase: .loaded(at: .now, stale: false))
        await env.friends.block(people.sara.id)
        #expect(!env.friends.friendIds.contains(people.sara.id))
        #expect(env.friends.blocked.map(\.username) == ["sara"])
        #expect(env.friends.relationship(with: people.sara.id) == .blocked)
        await env.friends.unblock(people.sara.id)
        #expect(env.friends.blocked.isEmpty)
    }

    @Test func requestAcceptAndCancelRoundTrip() async throws {
        let (env, people) = try SocialTestSupport.environment()
        var raw = FriendsRaw()
        raw.profiles = [people.devon.id: people.devon]
        env.friends.load(raw: raw, phase: .loaded(at: .now, stale: false))
        await env.friends.request(people.devon.id)
        guard case .outgoing(let f) = env.friends.relationship(with: people.devon.id) else { Issue.record("expected outgoing"); return }
        #expect(env.friends.hasAnyConnection)
        await env.friends.accept(f)
        #expect(env.friends.relationship(with: people.devon.id) == .friends)
        await env.friends.remove(f)
        #expect(env.friends.relationship(with: people.devon.id) == .none)
        #expect(!env.friends.hasAnyConnection)
    }

    @Test func realtimeDeleteCarriesTheOldRow() async throws {
        let (env, people) = try SocialTestSupport.environment()
        let fx = SocialFixtures.busyFriday(me: people.me, profiles: people.all).friends
        env.friends.load(raw: fx, phase: .loaded(at: .now, stale: false))
        let lena = fx.friendships.values.first { $0.requesterId == people.lena.id }!
        await env.friends.apply(.delete(old: lena, keys: [:]))
        #expect(env.friends.incoming.isEmpty)
        var accepted = lena
        accepted.status = .accepted
        await env.friends.apply(.insert(accepted))
        #expect(env.friends.friendIds.contains(people.lena.id))
    }

    @Test func inviteURLShape() {
        let t = UUID()
        #expect(FriendsStore.inviteURL(t).absoluteString == "https://downto.xyz/friend?token=\(t.uuidString.lowercased())")
    }
}
