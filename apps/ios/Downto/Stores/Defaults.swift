// Stores/Defaults.swift — typed accessors over UserDefaults, every key `dt.`-namespaced (ARCHITECTURE §4.6).
// `clearAll(except:)` is the logout sweep; `feedSort` is the one key that survives it.
import Foundation

enum Defaults {
    enum Key: String, CaseIterable, Sendable {
        case lastSeenFeedAt = "dt.lastSeenFeedAt"
        case feedSort = "dt.feedSort"
        case pendingRoute = "dt.pendingRoute"
        case pendingRouteAt = "dt.pendingRouteAt"
        case pendingCheckId = "dt.pendingCheckId"
        case activeSharedCheckId = "dt.activeSharedCheckId"
        case pendingFriendToken = "dt.pendingFriendToken"
        case pendingAddUsername = "dt.pendingAddUsername"
        case seenNotifPrompt = "dt.seenNotifPrompt"
        case skippedFirstCheck = "dt.skippedFirstCheck"
        case showAddGlow = "dt.showAddGlow"
        case notifNudgeDismissed = "dt.notifNudgeDismissed"
        case pushToken = "dt.push.token"
        case pushRegisteredForUser = "dt.push.registeredForUser"
        case pushRegisteredAt = "dt.push.registeredAt"
        case hapticsEnabled = "dt.hapticsEnabled"
        case seenIds = "dt.seenIds"
        case revealedSeen = "dt.revealedSeen"
    }

    static var store: UserDefaults = .standard

    // MARK: Feed
    static var lastSeenFeedAt: Date? {
        get { store.object(forKey: Key.lastSeenFeedAt.rawValue) as? Date }
        set { set(newValue, .lastSeenFeedAt) }
    }
    static var feedSort: FeedSort {
        get { (store.string(forKey: Key.feedSort.rawValue)).flatMap(FeedSort.init(rawValue:)) ?? .recent }
        set { store.set(newValue.rawValue, forKey: Key.feedSort.rawValue) }
    }
    /// Check ids the reader has had on screen (NEW flag seen-tracking, DESIGN §4.1).
    static var seenIds: Set<CheckID> {
        get { Set((store.stringArray(forKey: Key.seenIds.rawValue) ?? []).compactMap { UUID(uuidString: $0).map(CheckID.init) }) }
        set { store.set(newValue.map(\.description), forKey: Key.seenIds.rawValue) }
    }
    static var revealedSeen: Set<CheckID> {
        get { Set((store.stringArray(forKey: Key.revealedSeen.rawValue) ?? []).compactMap { UUID(uuidString: $0).map(CheckID.init) }) }
        set { store.set(newValue.map(\.description), forKey: Key.revealedSeen.rawValue) }
    }

    // MARK: Pending intents (§7.4)
    static var pendingRoute: Route? {
        get { store.data(forKey: Key.pendingRoute.rawValue).flatMap { try? JSONDecoder().decode(Route.self, from: $0) } }
        set {
            if let newValue, let data = try? JSONEncoder().encode(newValue) {
                store.set(data, forKey: Key.pendingRoute.rawValue)
                store.set(Date.now, forKey: Key.pendingRouteAt.rawValue)
            } else {
                store.removeObject(forKey: Key.pendingRoute.rawValue)
                store.removeObject(forKey: Key.pendingRouteAt.rawValue)
            }
        }
    }
    static var pendingRouteAt: Date? { store.object(forKey: Key.pendingRouteAt.rawValue) as? Date }
    static var pendingCheckId: CheckID? {
        get { id(.pendingCheckId) }
        set { set(newValue?.description, .pendingCheckId) }
    }
    static var activeSharedCheckId: CheckID? {
        get { id(.activeSharedCheckId) }
        set { set(newValue?.description, .activeSharedCheckId) }
    }
    static var pendingFriendToken: UUID? {
        get { store.string(forKey: Key.pendingFriendToken.rawValue).flatMap(UUID.init(uuidString:)) }
        set { set(newValue?.uuidString, .pendingFriendToken) }
    }
    static var pendingAddUsername: String? {
        get { store.string(forKey: Key.pendingAddUsername.rawValue) }
        set { set(newValue, .pendingAddUsername) }
    }

    // MARK: Onboarding flags
    static var seenNotifPrompt: Bool { get { bool(.seenNotifPrompt) } set { store.set(newValue, forKey: Key.seenNotifPrompt.rawValue) } }
    static var skippedFirstCheck: Bool { get { bool(.skippedFirstCheck) } set { store.set(newValue, forKey: Key.skippedFirstCheck.rawValue) } }
    static var showAddGlow: Bool { get { bool(.showAddGlow) } set { store.set(newValue, forKey: Key.showAddGlow.rawValue) } }
    static var notifNudgeDismissed: Bool { get { bool(.notifNudgeDismissed) } set { store.set(newValue, forKey: Key.notifNudgeDismissed.rawValue) } }
    static var hapticsEnabled: Bool {
        get { store.object(forKey: Key.hapticsEnabled.rawValue) as? Bool ?? true }
        set { store.set(newValue, forKey: Key.hapticsEnabled.rawValue) }
    }

    // MARK: Push (§8.1)
    static var pushToken: String? { get { store.string(forKey: Key.pushToken.rawValue) } set { set(newValue, .pushToken) } }
    static var pushRegisteredForUser: UserID? { get { id(.pushRegisteredForUser) } set { set(newValue?.description, .pushRegisteredForUser) } }
    static var pushRegisteredAt: Date? { get { store.object(forKey: Key.pushRegisteredAt.rawValue) as? Date } set { set(newValue, .pushRegisteredAt) } }

    // MARK: Chat drafts
    static func draft(_ squadId: SquadID) -> String { store.string(forKey: "dt.draft.\(squadId)") ?? "" }
    static func setDraft(_ text: String, _ squadId: SquadID) {
        if text.isEmpty { store.removeObject(forKey: "dt.draft.\(squadId)") } else { store.set(text, forKey: "dt.draft.\(squadId)") }
    }

    /// Logout: every `dt.*` key except the listed ones.
    static func clearAll(except keep: Set<Key> = [.feedSort]) {
        for (k, _) in store.dictionaryRepresentation() where k.hasPrefix("dt.") {
            if let key = Key(rawValue: k), keep.contains(key) { continue }
            store.removeObject(forKey: k)
        }
    }

    // MARK: helpers
    private static func bool(_ k: Key) -> Bool { store.bool(forKey: k.rawValue) }
    private static func id<Tag>(_ k: Key) -> ID<Tag>? { store.string(forKey: k.rawValue).flatMap(UUID.init(uuidString:)).map(ID<Tag>.init) }
    private static func set(_ v: (any Sendable)?, _ k: Key) {
        if let v { store.set(v, forKey: k.rawValue) } else { store.removeObject(forKey: k.rawValue) }
    }
}
