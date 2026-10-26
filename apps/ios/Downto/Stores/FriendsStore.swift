// Stores/FriendsStore.swift — friends, requests, suggestions, blocks, invite links (ARCHITECTURE §3.9, §4.2, §7.1, §7.4; DESIGN §7.12).
// LANE: social.
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

extension Profile {
    func personRef(me: UserID?) -> PersonRef {
        PersonRef(id: id, displayName: displayName, username: username, avatarLetter: avatarLetter, isMe: id == me)
    }
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
    private var feedRefreshDebounce: Task<Void, Never>?

    init(env: AppEnvironment) { self.env = env }

    /// The gate's Continue rule (§7.1 step 5).
    var hasAnyConnection: Bool { !friends.isEmpty || !incoming.isEmpty || !outgoing.isEmpty }

    /// Availability of a known profile, for the FRIENDS tab glyph.
    func availability(of id: UserID) -> Availability? { raw.profiles[id]?.availability }

    // MARK: Load

    func hydrate() async {
        guard !env.isFake else { phase = .loaded(at: .now, stale: false); rebuild(); return }
        guard let me = env.me else { return }
        if !phase.isSettled { phase = .loading }
        do {
            let f: [Friendship] = try await env.supabase.from("friendships").select()
                .or("requester_id.eq.\(me),addressee_id.eq.\(me)").execute().value
            let b: [BlockedUser] = try await env.supabase.from("blocked_users").select().eq("blocker_id", value: me).execute().value
            let s = (try? await env.rpc.friendsOfFriends()) ?? []

            var ids = Set<UserID>()
            for x in f { ids.insert(x.requesterId); ids.insert(x.addresseeId) }
            for x in b { ids.insert(x.blockedId) }
            for x in s { ids.insert(x.suggestedUserId) }
            ids.remove(me)
            let profiles = try await fetchProfiles(Array(ids))

            raw.friendships = Dictionary(uniqueKeysWithValues: f.map { ($0.id, $0) })
            raw.blocked = b
            raw.suggestions = s
            raw.profiles.merge(profiles) { _, new in new }
            phase = .loaded(at: .now, stale: false)
            rebuild()
        } catch {
            log.error("hydrate: \(String(describing: error), privacy: .public)")
            phase = .failed(AppError(error), hadSnapshot: !raw.friendships.isEmpty)
        }
    }

    private func fetchProfiles(_ ids: [UserID]) async throws -> [UserID: Profile] {
        var out: [UserID: Profile] = [:]
        var start = 0
        while start < ids.count {
            let chunk = Array(ids[start..<min(start + 100, ids.count)])
            let rows: [Profile] = try await env.supabase.from("profiles").select().in("id", values: chunk).execute().value
            for r in rows { out[r.id] = r }
            start += 100
        }
        return out
    }

    // MARK: Projection

    func rebuild() {
        let me = env.me
        let blockedIds = Set(raw.blocked.map(\.blockedId))
        var friends: [PersonRef] = [], incoming: [FriendRequest] = [], outgoing: [FriendRequest] = []
        var friendIds = Set<UserID>()
        for f in raw.friendships.values.sorted(by: { $0.createdAt > $1.createdAt }) {
            let other = f.requesterId == me ? f.addresseeId : f.requesterId
            guard !blockedIds.contains(other), let p = raw.profiles[other] else { continue }
            let ref = p.personRef(me: me)
            switch f.status {
            case .accepted:
                friends.append(ref); friendIds.insert(other)
            case .pending:
                let req = FriendRequest(id: f.id, person: ref, createdAt: f.createdAt)
                if f.addresseeId == me { incoming.append(req) } else { outgoing.append(req) }
            case .blocked, .unknown:
                continue
            }
        }
        // Available first, then alphabetical (DESIGN §7.12).
        func rank(_ p: PersonRef) -> Int {
            switch raw.profiles[p.id]?.availability { case .open: 0; case .awkward: 1; default: 2 }
        }
        self.friends = friends.sorted { (rank($0), $0.displayName.lowercased()) < (rank($1), $1.displayName.lowercased()) }
        self.incoming = incoming
        self.outgoing = outgoing
        self.friendIds = friendIds
        let pendingIds = Set(incoming.map(\.person.id) + outgoing.map(\.person.id))
        var seen = Set<UserID>()
        suggestions = raw.suggestions.compactMap { s in
            guard !friendIds.contains(s.suggestedUserId), !pendingIds.contains(s.suggestedUserId), !blockedIds.contains(s.suggestedUserId),
                  s.suggestedUserId != me, seen.insert(s.suggestedUserId).inserted, let p = raw.profiles[s.suggestedUserId] else { return nil }
            let extra = raw.suggestions.filter { $0.suggestedUserId == s.suggestedUserId }.count - 1
            return SuggestionDisplay(person: p.personRef(me: me), mutualFriendName: extra > 0 ? "\(s.mutualFriendName) + \(extra)" : s.mutualFriendName)
        }
        blocked = raw.blocked.compactMap { raw.profiles[$0.blockedId]?.personRef(me: me) }
    }

    // MARK: Search / lookup

    func search(_ q: String) async -> [PersonRef] {
        guard !env.isFake, let me = env.me else { return [] }
        let term = q.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "@", with: "").replacingOccurrences(of: "%", with: "")
        guard term.count >= 2 else { return [] }
        let pattern = "%\(term)%"
        do {
            let rows: [Profile] = try await env.supabase.from("profiles").select()
                .or("username.ilike.\(pattern),display_name.ilike.\(pattern)").neq("id", value: me).limit(20).execute().value
            let blockedIds = Set(raw.blocked.map(\.blockedId))
            for r in rows { raw.profiles[r.id] = r }
            return rows.filter { !blockedIds.contains($0.id) }.map { $0.personRef(me: me) }
        } catch {
            log.error("search: \(String(describing: error), privacy: .public)")
            return []
        }
    }

    func profile(username: String) async -> Profile? {
        let u = username.lowercased().replacingOccurrences(of: "@", with: "")
        if let p = raw.profiles.values.first(where: { $0.username == u }) { return p }
        guard !env.isFake else { return nil }
        let rows: [Profile]? = try? await env.supabase.from("profiles").select().eq("username", value: u).limit(1).execute().value
        if let p = rows?.first { raw.profiles[p.id] = p }
        return rows?.first
    }

    func profile(id: UserID) async -> Profile? {
        if let p = raw.profiles[id] { return p }
        guard !env.isFake else { return nil }
        let rows: [Profile]? = try? await env.supabase.from("profiles").select().eq("id", value: id).limit(1).execute().value
        if let p = rows?.first { raw.profiles[p.id] = p }
        return rows?.first
    }

    // MARK: Mutations — before → optimistic → await → reconcile-or-restore (§4.5)

    func request(_ id: UserID) async {
        guard let me = env.me else { return }
        let before = raw
        let temp = FriendshipID(UUID())
        raw.friendships[temp] = Friendship(id: temp, requesterId: me, addresseeId: id, status: .pending, createdAt: .now, updatedAt: nil)
        rebuild()
        guard !env.isFake else { return }
        do {
            let inserted: Friendship = try await env.supabase.from("friendships")
                .insert(["requester_id": me.description, "addressee_id": id.description, "status": "pending"]).select().single().execute().value
            raw.friendships.removeValue(forKey: temp)
            raw.friendships[inserted.id] = inserted
            rebuild()
        } catch { restore(before, error) }
    }

    func accept(_ f: FriendshipID) async {
        guard var row = raw.friendships[f] else { return }
        let before = raw
        row.status = .accepted
        raw.friendships[f] = row
        rebuild()
        guard !env.isFake else { return }
        do {
            try await env.supabase.from("friendships").update(["status": "accepted"]).eq("id", value: f).execute()
            debouncedFeedRefresh()
        } catch { restore(before, error) }
    }

    func decline(_ f: FriendshipID) async { await delete(f) }
    func remove(_ f: FriendshipID) async { await delete(f); debouncedFeedRefresh() }
    func cancel(_ f: FriendshipID) async { await delete(f) }

    private func delete(_ f: FriendshipID) async {
        let before = raw
        raw.friendships.removeValue(forKey: f)
        rebuild()
        guard !env.isFake else { return }
        do { try await env.supabase.from("friendships").delete().eq("id", value: f).execute() }
        catch { restore(before, error) }
    }

    /// Insert blocked_users + delete the friendship, then refetch feed + squads (RLS now hides them).
    func block(_ id: UserID) async {
        guard let me = env.me else { return }
        let before = raw
        raw.blocked.append(BlockedUser(blockerId: me, blockedId: id, createdAt: .now))
        let friendship = raw.friendships.values.first { ($0.requesterId == id && $0.addresseeId == me) || ($0.requesterId == me && $0.addresseeId == id) }
        if let friendship { raw.friendships.removeValue(forKey: friendship.id) }
        rebuild()
        guard !env.isFake else { return }
        do {
            try await env.supabase.from("blocked_users").insert(["blocker_id": me.description, "blocked_id": id.description]).execute()
            if let friendship { _ = try? await env.supabase.from("friendships").delete().eq("id", value: friendship.id).execute() }
            await env.feed.refresh()
            await env.squads.refresh()
        } catch { restore(before, error) }
    }

    func unblock(_ id: UserID) async {
        guard let me = env.me else { return }
        let before = raw
        raw.blocked.removeAll { $0.blockedId == id }
        rebuild()
        guard !env.isFake else { return }
        do {
            try await env.supabase.from("blocked_users").delete().eq("blocker_id", value: me).eq("blocked_id", value: id).execute()
            await env.feed.refresh()
            await env.squads.refresh()
        } catch { restore(before, error) }
    }

    func createInviteLink() async -> URL? {
        if env.isFake { return Self.inviteURL(UUID()) }
        do { return Self.inviteURL(try await env.rpc.createFriendLink()) }
        catch {
            env.toasts.show(AppError(error).toastCopy, style: .error)
            return nil
        }
    }

    nonisolated static func inviteURL(_ token: UUID) -> URL {
        AppConfig.webBase.appending(path: "friend").appending(queryItems: [URLQueryItem(name: "token", value: token.uuidString.lowercased())])
    }

    /// §7 table: "you and {name} are friends ✶" → .userProfile; already friends / invalid toasts.
    @discardableResult
    func redeem(token: UUID) async -> PersonRef? {
        guard !env.isFake else { return nil }
        do {
            let result = try await env.rpc.redeemFriendLink(token)
            switch result.outcome {
            case .friends(let id, let name):
                await hydrate()
                env.toasts.show("you and \(name) are friends ✶", style: .success)
                env.router.present(.userProfile(id))
                debouncedFeedRefresh()
                return raw.profiles[id]?.personRef(me: env.me)
                    ?? PersonRef(id: id, displayName: name, username: "", avatarLetter: String(name.prefix(1)).uppercased(), isMe: false)
            case .alreadyFriends:
                env.toasts.show("already friends ✶")
            case .invalid(let reason):
                env.toasts.show(reason.lowercased().contains("expired") ? "that link expired" : reason.lowercased(), style: .error)
            }
        } catch {
            env.toasts.show(AppError(error).toastCopy, style: .error)
        }
        return nil
    }

    func report(_ target: ReportTarget, id: UUID, reason: ReportReason, details: String?) async throws {
        guard let me = env.me else { throw AppError.unauthenticated }
        guard !env.isFake else { return }
        let trimmed = details?.trimmingCharacters(in: .whitespacesAndNewlines)
        let row = ReportedContent(reporterId: me, targetType: target, targetId: id, reason: reason, details: (trimmed?.isEmpty ?? true) ? nil : trimmed)
        do { try await env.supabase.from("reported_content").insert(row).execute() }
        catch { throw AppError(error) }
    }

    // MARK: Realtime (friendships has REPLICA IDENTITY FULL — deletes carry the old row)

    func apply(_ change: TableChange<Friendship>) async {
        switch change {
        case .insert(let f), .update(let f, _):
            raw.friendships[f.id] = f
            let other = f.requesterId == env.me ? f.addresseeId : f.requesterId
            if raw.profiles[other] == nil, let p = await profile(id: other) { raw.profiles[other] = p }
            if f.status == .accepted { debouncedFeedRefresh() }
        case .delete(let old, _):
            if let old { raw.friendships.removeValue(forKey: old.id) }
            else if let id = change.deletedKeyUUID { raw.friendships.removeValue(forKey: FriendshipID(id)) }
        }
        rebuild()
    }

    private func debouncedFeedRefresh() {
        feedRefreshDebounce?.cancel()
        feedRefreshDebounce = Task { [weak self] in
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }
            await self?.env.feed.refresh()
        }
    }

    private func restore(_ before: FriendsRaw, _ error: any Error) {
        raw = before
        rebuild()
        env.toasts.show(AppError(error).toastCopy, style: .error)
    }

    /// Relationship of `me` to `id`, for UserProfileSheet / rows.
    func relationship(with id: UserID) -> Relationship {
        if friendIds.contains(id) { return .friends }
        if let r = incoming.first(where: { $0.person.id == id }) { return .incoming(r.id) }
        if let r = outgoing.first(where: { $0.person.id == id }) { return .outgoing(r.id) }
        if blocked.contains(where: { $0.id == id }) { return .blocked }
        return .none
    }
    nonisolated enum Relationship: Hashable, Sendable { case none, friends, incoming(FriendshipID), outgoing(FriendshipID), blocked }

    /// "Sara" / "Sara + 2" for a FoF suggestion, nil otherwise.
    func via(for id: UserID) -> String? { suggestions.first { $0.id == id }?.mutualFriendName }

    func reset() { friends = []; incoming = []; outgoing = []; suggestions = []; blocked = []; friendIds = []; raw = FriendsRaw(); phase = .idle; feedRefreshDebounce?.cancel() }
    func load(raw r: FriendsRaw, phase p: LoadPhase) { raw = r; phase = p; rebuild() }
}
