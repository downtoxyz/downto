// Domain/Route.swift — Route, Tab, FriendsTab (ARCHITECTURE §7). Codable so a pending route survives a cold launch (§7.3).
// Sheet / FeedDestination / Cover are Router concerns and live in App/Router.swift, not here.
import Foundation

nonisolated enum Tab: Hashable, Sendable, Codable {
    case feed, squads, you
}

nonisolated enum FriendsTab: Hashable, Sendable, Codable {
    case friends, add
}

/// Where a push tap, a deep link or a slip action wants the app to go. `mapPushToRoute` (Domain/PushRouting.swift) returns one of these.
nonisolated enum Route: Hashable, Sendable, Codable {
    case feed(checkId: CheckID?)
    case squads(squadId: SquadID?)
    case friends(FriendsTab)
    case profile(username: String)
    case check(CheckID)
    case friendToken(UUID)
    /// Home-screen quick action "new check" (DESIGN §7.18) → CreateOverlay.
    case create
}
