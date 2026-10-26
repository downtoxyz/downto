// Stores/FriendsStore.swift — friends, requests, suggestions, blocks, invite links (ARCHITECTURE §3.9, §4.2, §7.1).
// LANE: social. SKELETON — `// TODO(social)` bodies belong to that lane. The friend gate (Features/Auth) compiles against this API.
import Foundation
import Observation
import Supabase
import os

nonisolated struct FriendsRaw: Codable, Sendable, Equatable {
    var friendships: [FriendshipID: Friendship] = [:]
    var profiles: [UserID: Profile] = [:]
    var suggestions: [FoFSuggestion] = []
    var blocked: [BlockedUser] = []
    init() {}
}

nonisolated struct FriendRequest: Identifiable, Hashable, Sendable {
    let id: FriendshipID
    let person: PersonRef
    let createdAt: Date
    init(id: FriendshipID, person: PersonRef, createdAt: Date) { self.id = id; self.person = person; self.createdAt = createdAt }
}

nonisolated struct SuggestionDisplay: Identifiable, Hashable, Sendable {
    var id: UserID { person.id }
    let person: PersonRef
    let mutualFriendName: String
    init(person: PersonRef, mutualFriendName: String) { self.person = person; self.mutualFriendName = mutualFriendName }
}

@Observable final class FriendsStore {
    private(set) var friends: [PersonRef] = []
    private(set) var incoming: [FriendRequest] = []
    private(set) var outgoing: [FriendRequest] = []
    private(set) var suggestions: [SuggestionDisplay] = []
    private(set) var blocked: [PersonRef] = []
    private(set) var friendIds: Set<UserID> = []
    private(set) var phase: LoadPhase = .idle
    private(set) var raw = FriendsRaw()

    unowned let env: AppEnvironment
    let log = Logger(subsystem: "xyz.downto.app", category: "friends")

    init(env: AppEnvironment) { self.env = env }

    /// The gate's Continue rule (§7.1 step 5).
    var hasAnyConnection: Bool { !friends.isEmpty || !incoming.isEmpty || !outgoing.isEmpty }

    /// TODO(social): friendships (requester or addressee = me) + profiles + get_friends_of_friends + blocked_users → rebuild.
    func hydrate() async {
        guard !env.isFake else { phase = .loaded(at: .now, stale: false); rebuild(); return }
        phase = .loaded(at: .now, stale: false)
        rebuild()
    }
    /// TODO(social): ilike on username/display_name, excludes blocked + me, limit 20.
    func search(_ q: String) async -> [PersonRef] { [] }
    func request(_ id: UserID) async {}
    func accept(_ f: FriendshipID) async {}
    func decline(_ f: FriendshipID) async {}
    func remove(_ f: FriendshipID) async {}
    func cancel(_ f: FriendshipID) async {}
    func block(_ id: UserID) async {}
    func unblock(_ id: UserID) async {}
    func createInviteLink() async -> URL? { nil }
    /// TODO(social): rpc.redeemFriendLink → hydrate → toast per §7 table → .userProfile(creatorId).
    @discardableResult func redeem(token: UUID) async -> PersonRef? { nil }
    func profile(username: String) async -> Profile? { nil }
    func profile(id: UserID) async -> Profile? { raw.profiles[id] }
    func report(_ target: ReportTarget, id: UUID, reason: ReportReason, details: String?) async throws {}
    func apply(_ change: TableChange<Friendship>) async {}
    /// Relationship of `me` to `id`, for UserProfileSheet / rows.
    func relationship(with id: UserID) -> Relationship {
        if friendIds.contains(id) { return .friends }
        if let r = incoming.first(where: { $0.person.id == id }) { return .incoming(r.id) }
        if let r = outgoing.first(where: { $0.person.id == id }) { return .outgoing(r.id) }
        if blocked.contains(where: { $0.id == id }) { return .blocked }
        return .none
    }
    nonisolated enum Relationship: Hashable, Sendable { case none, friends, incoming(FriendshipID), outgoing(FriendshipID), blocked }

    /// TODO(social): raw → the five lists.
    func rebuild() {}

    func reset() { friends = []; incoming = []; outgoing = []; suggestions = []; blocked = []; friendIds = []; raw = FriendsRaw(); phase = .idle }
    func load(raw r: FriendsRaw, phase p: LoadPhase) { raw = r; phase = p; rebuild() }
}
