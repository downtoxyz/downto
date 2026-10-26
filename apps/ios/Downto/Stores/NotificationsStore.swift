// Stores/NotificationsStore.swift — bell sheet rows + realtime side effects (ARCHITECTURE §4.2, §5.3).
// LANE: social (notifications + friends + profile). SKELETON — `// TODO(social)` bodies belong to that lane.
import Foundation
import Observation
import Supabase
import os

@Observable final class NotificationsStore {
    private(set) var items: [AppNotification] = []
    private(set) var unreadCount: Int = 0
    private(set) var pendingFriendRequests: [AppNotification] = []
    private(set) var phase: LoadPhase = .idle

    unowned let env: AppEnvironment
    let log = Logger(subsystem: "xyz.downto.app", category: "notifications")

    init(env: AppEnvironment) { self.env = env }

    /// TODO(social): select notifications where user_id = me order created_at desc limit 50.
    func hydrate() async {
        guard !env.isFake else { phase = .loaded(at: .now, stale: false); recompute(); return }
        phase = .loaded(at: .now, stale: false)
        recompute()
    }
    func refresh() async { await hydrate() }
    /// TODO(social): realtime INSERT → prepend + the two-pass NotificationSideEffects run (§5.3).
    func prepend(_ n: AppNotification) async {
        guard !items.contains(where: { $0.id == n.id }) else { return }
        items.insert(n, at: 0)
        recompute()
    }
    func markAllReadExceptFriendRequests() async {}
    func markRead(_ id: NotificationID) async {}
    /// TODO(social): check rows → router.go(.check(id)) (→ feed.resolveCheckRoute); squad rows → .squads(squadId:); friends → sheets.
    func tap(_ n: AppNotification) async {}
    func rowBody(for n: AppNotification) -> String {
        if let c = n.relatedCheckId, env.feed.isGuestsHidden(c) { return "someone's down ✶" }
        return n.body ?? n.title
    }

    func recompute() {
        unreadCount = items.filter { !$0.isRead }.count
        pendingFriendRequests = items.filter { $0.type == .friendRequest && !$0.isRead }
    }

    func reset() { items = []; unreadCount = 0; pendingFriendRequests = []; phase = .idle }
    func load(items rows: [AppNotification], phase p: LoadPhase) { items = rows; phase = p; recompute() }
}
