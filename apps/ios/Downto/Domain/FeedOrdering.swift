// Domain/FeedOrdering.swift — timed-pinned + chrono tier sort (ARCHITECTURE §4.3). Port of FeedView.tsx's
// visibleChecks / pinnedChecks / chronoItems / hiddenChecks / newItemIds. Pure and generic: FeedStore.project()
// feeds it FeedItems that conform to `FeedOrderable`; tests feed it plain values.
import Foundation

/// Header sort toggle. Persisted in defaults (`dt.feedSort`), so it is Codable.
nonisolated enum FeedSort: String, Codable, Hashable, Sendable, CaseIterable {
    case recent, upcoming
}

/// What the ordering needs to know about a feed entry. Events report `expiry == .open` (they are never timed).
nonisolated protocol FeedOrderable: Sendable {
    var createdAt: Date { get }
    /// Checks: `event_date`; events: `events.date`. The `.upcoming` sort key.
    var eventDate: LocalDate? { get }
    var expiry: ExpiryState { get }
    /// `raw.hidden` contains this check's id. Events are never hidden.
    var isHidden: Bool { get }
}

nonisolated struct FeedTiers<Item: FeedOrderable>: Sendable {
    /// Timed checks that have not expired, most urgent first.
    let pinned: [Item]
    /// Open-ended checks + all events, in the chosen sort.
    let chrono: [Item]
    /// Hidden checks, sorted like chrono `.recent`. Excluded from both tiers.
    let hidden: [Item]

    var items: [Item] { pinned + chrono }
}

nonisolated enum FeedOrdering {
    /// 1. Pinned tier: `expiry != .open` and not expired, sorted by `expiry.percent` descending.
    /// 2. Chrono tier: everything else. `.recent` → createdAt desc; `.upcoming` → dated first ascending by LocalDate, then dateless by createdAt desc.
    /// 3. Hidden items are excluded from both tiers and listed in `hidden` (createdAt desc).
    /// 5. Expired timed checks are dropped everywhere (RLS should already exclude them; this stops a card lingering between cron runs).
    static func tiers<Item: FeedOrderable>(_ items: [Item], sort: FeedSort) -> FeedTiers<Item> {
        let live = items.filter { !$0.expiry.isExpired }
        let hidden = live.filter(\.isHidden).sorted { $0.createdAt > $1.createdAt }
        let visible = live.filter { !$0.isHidden }

        let pinned = visible.filter { !$0.expiry.isOpen }.sorted { $0.expiry.percent > $1.expiry.percent }

        var chrono = visible.filter { $0.expiry.isOpen }
        switch sort {
        case .recent:
            chrono.sort { $0.createdAt > $1.createdAt }
        case .upcoming:
            chrono.sort { a, b in
                switch (a.eventDate, b.eventDate) {
                case (.some, .none): return true
                case (.none, .some): return false
                case (.none, .none): return a.createdAt > b.createdAt
                case (.some(let da), .some(let db)): return da < db
                }
            }
        }
        return FeedTiers(pinned: pinned, chrono: chrono, hidden: hidden)
    }

    /// NEW flag: created since the last feed visit and not mine. No `lastSeenFeedAt` (first visit) → nothing is new (web parity).
    static func isNew(createdAt: Date, lastSeenFeedAt: Date?, isMine: Bool) -> Bool {
        guard let lastSeenFeedAt else { return false }
        return createdAt > lastSeenFeedAt && !isMine
    }
}
