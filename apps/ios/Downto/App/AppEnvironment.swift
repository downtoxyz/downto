// App/AppEnvironment.swift — composition root: SupabaseClient + every store, built once (ARCHITECTURE §4.4, §4.4.1, §6.2, §7.1).
import Foundation
import Observation
import Supabase
import os

@Observable final class AppEnvironment {
    let config: AppConfig
    let supabase: SupabaseClient
    let api: DowntoAPI
    let rpc: RPC
    let isFake: Bool

    let session: SessionStore
    let profile: ProfileStore
    let realtime: RealtimeHub
    let router: Router
    let toasts: ToastCenter
    let cache: LocalCache
    let images: ImageCache
    let reachability: Reachability
    // Built after `self` exists (they hold `unowned let env`).
    private(set) var feed: FeedStore!
    private(set) var squads: SquadsStore!
    private(set) var notifications: NotificationsStore!
    private(set) var friends: FriendsStore!
    private(set) var push: PushStore!

    private(set) var lastHydratedAt: Date?
    /// §7.1 — the redeem → respond-shared sequence finished (or was skipped for an onboarded user).
    private(set) var preGateDone = false
    private(set) var bootedForUser: UserID?
    private var preGateTask: Task<Void, Never>?
    private var bootTask: Task<Void, Never>?
    private let log = Logger(subsystem: "xyz.downto.app", category: "env")

    init(config: AppConfig, isFake: Bool = false, apiSession: URLSession? = nil) {
        self.config = config
        self.isFake = isFake
        supabase = makeSupabaseClient(config: config)
        api = DowntoAPI(base: config.apiBase, auth: supabase.auth, session: apiSession ?? DowntoAPI.makeSession())
        rpc = RPC(client: supabase)
        session = SessionStore(auth: supabase.auth)
        profile = ProfileStore(client: supabase, rpc: rpc, isFake: isFake)
        realtime = RealtimeHub(client: supabase)
        router = Router()
        toasts = ToastCenter()
        cache = LocalCache()
        images = ImageCache(storage: isFake ? nil : supabase.storage)
        reachability = Reachability()
        feed = FeedStore(env: self)
        squads = SquadsStore(env: self)
        notifications = NotificationsStore(env: self)
        friends = FriendsStore(env: self)
        push = PushStore(env: self)
        toasts.perform = { [weak self] action in self?.perform(action) }
        realtime.onReconnected = { [weak self] in
            await self?.refreshAll()
            await self?.squads.openChat?.hydrate()
        }
    }

    var me: UserID? { session.state.userId }

    // MARK: Boot (§4.4.1)

    /// Step A — the moment SessionStore reports .signedIn. Only profile.loadMe(); nothing else touches the network yet.
    func loadMeForGate(userId: UserID) async {
        profile.bind(userId: userId)
        let me = await profile.loadMe()
        if me == nil, profile.meLoaded {
            // Abandoned-onboarding sweep (§6.1): the row is gone → sign out and say so.
            await session.signOutSwept()
            toasts.show("your account timed out — sign up again")
        }
    }

    /// Step B — runs once per session as soon as `meLoaded && !me.displayName.isEmpty`. Guard first: an onboarded user
    /// who tapped a link while signed out must NOT be auto-DOWNed (§7.1).
    func runPreGate() {
        guard preGateTask == nil, let me = profile.me else { return }
        preGateTask = Task { [self] in
            defer { preGateDone = true }
            guard !me.onboarded else { return }
            if let t = Defaults.pendingFriendToken {
                Defaults.pendingFriendToken = nil
                await friends.redeem(token: t)
            }
            if let id = Defaults.pendingCheckId {
                Defaults.pendingCheckId = nil
                do { try await api.respondShared(checkId: id) } catch {
                    log.error("respond-shared retry: \(String(describing: error), privacy: .public)")
                    try? await api.respondShared(checkId: id)
                }
                Defaults.activeSharedCheckId = id
                await profile.loadMe()
            }
        }
    }

    /// Step C — exactly once per session, after the gate passed .profileSetup and runPreGate() finished.
    func bootAfterLogin(userId: UserID) {
        guard bootedForUser != userId else { return }
        bootedForUser = userId
        bootTask = Task { [self] in
            await loadSnapshots(userId: userId)
            if !isFake { await realtime.startUserChannels(userId: userId, handlers: userChannelHandlers()) }
            await withTaskGroup(of: Void.self) { g in
                g.addTask { await self.profile.loadMe() }
                g.addTask { await self.feed.hydrate() }
                g.addTask { await self.squads.hydrate() }
                g.addTask { await self.notifications.hydrate() }
                g.addTask { await self.friends.hydrate() }
            }
            lastHydratedAt = .now
            feed.startClock()
            await push.refreshAuthorization()
            push.registerIfAuthorized()
            await push.syncIfNeeded()
            await profile.syncTimezoneIfNeeded()
        }
    }

    private func userChannelHandlers() -> RealtimeHub.UserChannelHandlers {
        var h = RealtimeHub.UserChannelHandlers()
        h.check = { [weak self] c in Task { await self?.feed.apply(c) } }
        h.response = { [weak self] c in Task { await self?.feed.apply(c) } }
        h.coAuthor = { [weak self] c in Task { await self?.feed.apply(c) } }
        h.comment = { [weak self] c in self?.feed.apply(c) }
        h.notification = { [weak self] n in Task { await self?.notifications.prepend(n) } }
        h.friendship = { [weak self] c in Task { await self?.friends.apply(c) } }
        h.decodeFailure = { [weak self] table in
            self?.log.error("realtime decode failure on \(table, privacy: .public) → refresh")
            Task { await self?.feed.refresh() }
        }
        return h
    }

    private func loadSnapshots(userId: UserID) async {
        guard !isFake else { return }
        if let s = await cache.load(FeedRaw.self, name: "feed", userId: userId) { feed.load(raw: s.payload, phase: .loaded(at: s.savedAt, stale: true)) }
        if let s = await cache.load(SquadsRaw.self, name: "squads", userId: userId) { squads.load(raw: s.payload, phase: .loaded(at: s.savedAt, stale: true)) }
        if let s = await cache.load([AppNotification].self, name: "notifications", userId: userId) { notifications.load(items: s.payload, phase: .loaded(at: s.savedAt, stale: true)) }
    }

    /// feed.refresh + squads.refresh + notifications.refresh + friends.hydrate (§4.7.1-aware).
    func refreshAll() async {
        guard bootedForUser != nil else { return }
        await withTaskGroup(of: Void.self) { g in
            g.addTask { await self.feed.refresh() }
            g.addTask { await self.squads.refresh() }
            g.addTask { await self.notifications.refresh() }
            g.addTask { await self.friends.hydrate() }
        }
        lastHydratedAt = .now
    }

    /// ScenePhase.active (§5.4): debounced by the caller.
    func becameActive() async {
        await realtime.resume()
        if let last = lastHydratedAt, Date.now.timeIntervalSince(last) > 30 { await refreshAll() }
        await squads.refreshUnread()
        await push.clearDelivered(for: router.openSquadId)
        push.clearBadge()
        await push.refreshAuthorization()
        await push.syncIfNeeded()
        await profile.syncTimezoneIfNeeded()
        feed.startClock()
    }

    func becameInactive() async {
        feed.markFeedSeen()
        feed.stopClock()
        await realtime.suspend()
    }

    // MARK: Sign-out (§6.2)

    func signOut() async {
        await push.unregister()
        await realtime.stopAll()
        await session.signOut()
        await cache.wipe()
        Defaults.clearAll()
        teardownOnLogout()
        push.reset()
    }

    func deleteAccount() async throws {
        try await api.deleteAccount()
        await signOut()
    }

    func teardownOnLogout() {
        bootTask?.cancel(); bootTask = nil
        preGateTask?.cancel(); preGateTask = nil
        preGateDone = false
        bootedForUser = nil
        lastHydratedAt = nil
        feed.reset(); squads.reset(); notifications.reset(); friends.reset(); profile.reset()
        router.reset(); toasts.reset()
    }

    // MARK: Slip actions

    private func perform(_ action: ToastAction) {
        switch action {
        case .openSquad(let s): router.go(.squads(squadId: s), env: self)
        case .openCheck(let c): router.go(.check(c), env: self)
        case .undoArchive(let c): Task { await feed.revive(c) }
        case .retry: Task { await refreshAll() }
        }
    }
}
