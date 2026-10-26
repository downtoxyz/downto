// Stores/NotificationsStore.swift — bell sheet rows + realtime side effects (ARCHITECTURE §4.2, §5.3, §7.4; DESIGN §7.9).
// LANE: social.
import Foundation
import Observation
import Supabase
import os

extension AppNotification {
    /// The Domain-side slice NotificationSideEffects takes (§1.0).
    var facts: NotificationFacts {
        NotificationFacts(type: type, relatedUserId: relatedUserId, relatedSquadId: relatedSquadId, relatedCheckId: relatedCheckId, relatedEventId: relatedEventId)
    }
}

/// DESIGN §7.9 glyph / tint map. Decorative: the title carries the type.
nonisolated struct NotificationGlyph: Hashable, Sendable {
    enum Tint: Hashable, Sendable { case dt, squad, warn, pool, danger, newLime, unknown }
    let glyph: String
    let tint: Tint

    init(_ type: NotificationType) {
        switch type {
        case .friendCheck, .checkTextUpdated, .checkDateUpdated, .squadMessage: self.init("✶", .dt)
        case .checkResponse, .eventDown, .friendAccepted: self.init("✓", .dt)
        case .checkTag: self.init("+", .dt)
        case .checkComment: self.init("¶", .dt)
        case .commentMention, .squadMention: self.init("@", .dt)
        case .squadInvite, .squadJoinRequest: self.init("→", .squad)
        case .pollCreated: self.init("▲", .dt)
        case .dateConfirm, .squadDateNudge: self.init("?", .warn)
        case .friendEvent, .eventDateUpdated: self.init("↗", .pool)
        case .eventReminder: self.init("◷", .pool)
        case .friendRequest: self.init("☺", .dt)
        case .checkArchived: self.init("⌫", .danger)
        case .checkRevived: self.init("✶", .newLime)
        case .unknown: self.init("·", .unknown)
        }
    }

    private init(_ glyph: String, _ tint: Tint) { self.glyph = glyph; self.tint = tint }
}

@Observable final class NotificationsStore {
    static let pageSize = 50

    private(set) var items: [AppNotification] = []
    private(set) var unreadCount: Int = 0
    private(set) var pendingFriendRequests: [AppNotification] = []
    private(set) var phase: LoadPhase = .idle

    unowned let env: AppEnvironment
    let log = Logger(subsystem: "xyz.downto.app", category: "notifications")
    private var feedRefreshDebounce: Task<Void, Never>?
    /// Test seam: every effect the two-pass run executed, in order.
    private(set) var executedEffects: [SideEffect] = []

    init(env: AppEnvironment) { self.env = env }

    // MARK: Load

    func hydrate() async {
        guard !env.isFake else { phase = .loaded(at: .now, stale: false); recompute(); return }
        guard let me = env.me else { return }
        if !phase.isSettled { phase = .loading }
        do {
            let rows: [AppNotification] = try await env.supabase.from("notifications").select()
                .eq("user_id", value: me).order("created_at", ascending: false).limit(Self.pageSize).execute().value
            // Row merge: keep anything newer that realtime prepended while the select was in flight.
            let fetchedIds = Set(rows.map(\.id))
            let newest = rows.first?.createdAt ?? .distantPast
            let newer = items.filter { !fetchedIds.contains($0.id) && $0.createdAt > newest }
            items = (newer + rows).sorted { $0.createdAt > $1.createdAt }
            phase = .loaded(at: .now, stale: false)
            recompute()
            try? await env.cache.save(items, name: "notifications", userId: me)
        } catch {
            log.error("hydrate: \(String(describing: error), privacy: .public)")
            phase = .failed(AppError(error), hadSnapshot: !items.isEmpty)
        }
    }

    func refresh() async { await hydrate() }

    // MARK: Realtime (§5.3 two-pass)

    func prepend(_ n: AppNotification) async {
        guard !items.contains(where: { $0.id == n.id }) else { return }
        items.insert(n, at: 0)
        if items.count > Self.pageSize { items.removeLast(items.count - Self.pageSize) }
        recompute()
        await runSideEffects(for: n.facts)
    }

    /// Pass 1 with the roles we have (always yields `.refreshSquad` for squad types) → await the refresh → pass 2 with fresh
    /// roles, executing only the toast / markUnread effects. Toast copy is never decided on stale membership.
    func runSideEffects(for facts: NotificationFacts) async {
        guard let me = env.me else { return }
        let previous: [SquadID: SquadRole?] = facts.relatedSquadId.map { [$0: env.squads.role(of: me, in: $0)] } ?? [:]
        guard let squads = env.squads else { return }
        let myRole: (SquadID) -> SquadRole? = { squads.role(of: me, in: $0) }
        let previousRole: (SquadID) -> SquadRole? = { previous[$0] ?? nil }

        let first = NotificationSideEffects.sideEffects(for: facts, openSquadId: env.router.openSquadId, myRole: myRole, previousRole: previousRole)
        let refreshesSquad = first.contains { if case .refreshSquad = $0 { true } else { false } }
        for e in first {
            if refreshesSquad, Self.isMembershipSensitive(e) { continue }
            await execute(e)
        }
        guard refreshesSquad else { return }
        let second = NotificationSideEffects.sideEffects(for: facts, openSquadId: env.router.openSquadId, myRole: myRole, previousRole: previousRole)
        for e in second where Self.isMembershipSensitive(e) { await execute(e) }
    }

    nonisolated private static func isMembershipSensitive(_ e: SideEffect) -> Bool {
        switch e {
        case .toast, .markUnread: true
        default: false
        }
    }

    private func execute(_ e: SideEffect) async {
        executedEffects.append(e)
        switch e {
        case .refreshCheck(let c): await env.feed.refreshCheck(c)
        case .removeCheck: await env.feed.refresh()
        case .refreshSquad(let s): await env.squads.refreshSquad(s)
        case .markUnread(let s): env.squads.markUnread(s)
        case .reloadSquadSideTables(let s):
            if let chat = env.squads.openChat, chat.squadId == s { await chat.reloadSideTables() }
        case .friendsHydrate: await env.friends.hydrate()
        case .feedRefreshDebounced:
            feedRefreshDebounce?.cancel()
            feedRefreshDebounce = Task { [weak self] in
                try? await Task.sleep(for: .seconds(2))
                guard !Task.isCancelled else { return }
                await self?.env.feed.refresh()
            }
        case .refreshEvent(let id): await env.feed.refreshEvent(id)
        case .toast(let text, let action):
            var key: String?
            if case .openSquad(let s) = action { key = "squad:\(s)" }
            env.toasts.show(text, key: key, action: action)
        }
    }

    // MARK: Read state

    func markAllReadExceptFriendRequests() async {
        let ids = items.filter { !$0.isRead && $0.type != .friendRequest }.map(\.id)
        guard !ids.isEmpty else { return }
        for i in items.indices where ids.contains(items[i].id) { items[i].isRead = true }
        recompute()
        guard !env.isFake, let me = env.me else { return }
        do {
            try await env.supabase.from("notifications").update(["is_read": true]).eq("user_id", value: me)
                .eq("is_read", value: false).neq("type", value: NotificationType.friendRequest.rawValue).execute()
        } catch { log.error("markAllRead: \(String(describing: error), privacy: .public)") }
    }

    func markRead(_ id: NotificationID) async {
        guard let i = items.firstIndex(where: { $0.id == id }), !items[i].isRead else { return }
        items[i].isRead = true
        recompute()
        guard !env.isFake else { return }
        do { try await env.supabase.from("notifications").update(["is_read": true]).eq("id", value: id).execute() }
        catch { log.error("markRead: \(String(describing: error), privacy: .public)") }
    }

    // MARK: Tap routing (§7.4)

    func tap(_ n: AppNotification) async {
        await markRead(n.id)
        let env = env
        switch n.type {
        case .friendRequest:
            env.router.dismissAll { env.router.present(.friends(tab: .add)) }
        case .friendAccepted:
            env.router.dismissAll {
                if let u = n.relatedUserId { env.router.present(.userProfile(u)) } else { env.router.present(.friends(tab: .friends)) }
            }
        case .squadMessage, .squadInvite, .squadMention, .squadJoinRequest, .pollCreated, .dateConfirm, .squadDateNudge:
            env.router.go(.squads(squadId: n.relatedSquadId), env: env)
        case .friendCheck, .checkResponse, .checkTag, .checkDateUpdated, .checkTextUpdated, .checkComment, .commentMention, .checkRevived, .checkArchived:
            if let c = n.relatedCheckId { env.router.go(.check(c), env: env) } else { env.router.go(.feed(checkId: nil), env: env) }
        case .eventDown, .friendEvent, .eventDateUpdated, .eventReminder:
            env.router.go(.feed(checkId: nil), env: env)
        case .unknown:
            break
        }
    }

    /// "someone's down ✶" when the check's guests are still hidden (mystery) — never leak a responder through the bell.
    func rowBody(for n: AppNotification) -> String {
        if n.type == .checkResponse, let c = n.relatedCheckId, env.feed.isGuestsHidden(c) { return "someone's down ✶" }
        return n.body ?? n.title
    }

    func recompute() {
        unreadCount = items.filter { !$0.isRead }.count
        pendingFriendRequests = items.filter { $0.type == .friendRequest && !$0.isRead }
    }

    func reset() { items = []; unreadCount = 0; pendingFriendRequests = []; phase = .idle; executedEffects = []; feedRefreshDebounce?.cancel() }
    func load(items rows: [AppNotification], phase p: LoadPhase) { items = rows; phase = p; recompute() }
}
