// App/Router.swift — Sheet / FeedDestination / Cover enums + the Router (ARCHITECTURE §7, §7.0, §7.3, §7.4).
import Foundation
import Observation
import os

nonisolated enum FeedDestination: Hashable, Sendable {
    case checkDetail(CheckID)
    case deletedCheck(CheckID, isMine: Bool)
}

nonisolated enum Sheet: Identifiable, Hashable, Sendable {
    case editCheck(CheckID), checkActions(CheckID)
    case notifications, friends(tab: FriendsTab), userProfile(UserID)
    case squadSettings(SquadID), squadMembers(SquadID), dateProposal(SquadID), report(ReportTarget, UUID)
    case editProfile, syncCalendar
    case eventLobby(EventID), editEvent(EventID)

    var id: String {
        switch self {
        case .editCheck(let c): "editCheck:\(c)"
        case .checkActions(let c): "checkActions:\(c)"
        case .notifications: "notifications"
        case .friends(let t): "friends:\(t)"
        case .userProfile(let u): "userProfile:\(u)"
        case .squadSettings(let s): "squadSettings:\(s)"
        case .squadMembers(let s): "squadMembers:\(s)"
        case .dateProposal(let s): "dateProposal:\(s)"
        case .report(let t, let id): "report:\(t.rawValue):\(id)"
        case .editProfile: "editProfile"
        case .syncCalendar: "syncCalendar"
        case .eventLobby(let e): "eventLobby:\(e)"
        case .editEvent(let e): "editEvent:\(e)"
        }
    }

    /// §7.0 rule 2 — which sheets may stack on which root.
    func allowsStacked(_ child: Sheet) -> Bool {
        switch (self, child) {
        case (.userProfile, .report), (.friends, .userProfile), (.squadSettings, .squadMembers), (.squadSettings, .dateProposal), (.editEvent, .squadMembers): true
        default: false
        }
    }
}

nonisolated enum Cover: Identifiable, Hashable, Sendable {
    case imageViewer(URL)
    var id: String {
        switch self { case .imageViewer(let u): "image:\(u.absoluteString)" }
    }
}

@Observable final class Router {
    static let pendingRouteMaxAge: TimeInterval = 24 * 3600

    var tab: Tab = .feed
    var sheet: Sheet? { didSet { if sheet == nil { stacked = nil } } }
    var stacked: Sheet?
    var cover: Cover?
    var feedPath: [FeedDestination] = []
    var squadPath: [SquadID] = []
    var isCreateOpen = false
    var createPrefill: CreatePrefill?
    var highlightedCheckId: CheckID?
    private(set) var pending: Route?
    private var queuedSheet: Sheet?
    private var drainedIntents = false
    private let log = Logger(subsystem: "xyz.downto.app", category: "router")

    var hidesFolio: Bool { !feedPath.isEmpty || !squadPath.isEmpty || isCreateOpen || cover != nil }
    var openSquadId: SquadID? { squadPath.last }

    init() {
        if let r = Defaults.pendingRoute {
            if let at = Defaults.pendingRouteAt, Date.now.timeIntervalSince(at) > Self.pendingRouteMaxAge {
                Defaults.pendingRoute = nil
            } else {
                pending = r
            }
        }
    }

    // MARK: Sheets (§7.0)

    func present(_ s: Sheet) {
        if sheet == nil { sheet = s; return }
        if let root = sheet, stacked == nil, root.allowsStacked(s) { stacked = s; return }
        if stacked != nil {
            queuedSheet = s
            stacked = nil          // its onDismiss drains queuedSheet as the new stacked
            return
        }
        queuedSheet = s
        sheet = nil                // the root's onDismiss presents queuedSheet as the new root
    }

    /// Hook for `.sheet(item:onDismiss:)` on the root sheet.
    func rootSheetDismissed() {
        if let q = queuedSheet { queuedSheet = nil; sheet = q }
        else if let then = afterDismiss { afterDismiss = nil; then() }
    }
    /// Hook for the stacked sheet's onDismiss.
    func stackedSheetDismissed() {
        if let q = queuedSheet, let root = sheet, root.allowsStacked(q) { queuedSheet = nil; stacked = q }
        else if queuedSheet != nil { sheet = nil }      // not stackable here → becomes the next root
    }

    private var afterDismiss: (() -> Void)?

    /// stacked → sheet → cover, then `then` once everything is down.
    func dismissAll(then: @escaping @MainActor () -> Void) {
        queuedSheet = nil
        cover = nil
        if sheet != nil {
            afterDismiss = then
            stacked = nil
            sheet = nil
        } else {
            then()
        }
    }

    // MARK: Routes (§7.4)

    func go(_ route: Route, env: AppEnvironment, fromTap: Bool = true) {
        dismissAll { [self] in
            Task { await self.dispatch(route, env: env, fromTap: fromTap) }
        }
    }

    private func dispatch(_ route: Route, env: AppEnvironment, fromTap: Bool) async {
        switch route {
        case .feed(let checkId):
            tab = .feed; feedPath = []
            if let id = checkId { await resolveAndShow(id, env: env, pushDetail: false) }
        case .check(let id):
            tab = .feed; feedPath = []
            await resolveAndShow(id, env: env, pushDetail: true)
        case .squads(let squadId):
            tab = .squads
            if let squadId {
                try? await Task.sleep(for: .milliseconds(50))   // let the tab switch animate first (§7)
                squadPath = [squadId]
            }
        case .friends(let t):
            present(.friends(tab: t))
        case .profile(let username):
            present(.friends(tab: .add))
            if let p = await env.friends.profile(username: username) { present(.userProfile(p.id)) }
            else { env.toasts.show("couldn't find @\(username)") }
        case .friendToken(let token):
            await env.friends.redeem(token: token)
        case .create:
            tab = .feed; feedPath = []
            isCreateOpen = true
        }
    }

    private func resolveAndShow(_ id: CheckID, env: AppEnvironment, pushDetail: Bool) async {
        switch await env.feed.resolveCheckRoute(id) {
        case .visible, .outsideNetwork:
            highlightedCheckId = id
            if pushDetail {
                try? await Task.sleep(for: .milliseconds(300))
                feedPath = [.checkDetail(id)]
            }
            Task { try? await Task.sleep(for: .seconds(3)); if self.highlightedCheckId == id { self.highlightedCheckId = nil } }
        case .gone(let isMine):
            feedPath = [.deletedCheck(id, isMine: isMine)]
        case .unreachable:
            env.toasts.show("no signal ✶", style: .error)
        }
    }

    /// Cold-launch / pre-gate: park the route (also on disk).
    func enqueue(_ route: Route) {
        pending = route
        Defaults.pendingRoute = route
    }

    /// RootView: first time Gate == .main && feed.phase is settled. Delete before dispatch.
    func drainPending(env: AppEnvironment) {
        guard let r = pending else { return }
        pending = nil
        Defaults.pendingRoute = nil
        go(r, env: env)
    }

    /// §7.4 — dt.pendingCheckId / pendingFriendToken / pendingAddUsername for an ONBOARDED user; once per session.
    func drainPendingIntents(env: AppEnvironment) async {
        guard !drainedIntents else { return }
        drainedIntents = true
        if let id = Defaults.pendingCheckId {
            Defaults.pendingCheckId = nil
            await dispatch(.check(id), env: env, fromTap: false)
        }
        if let t = Defaults.pendingFriendToken {
            Defaults.pendingFriendToken = nil
            await env.friends.redeem(token: t)
        }
        if let u = Defaults.pendingAddUsername {
            Defaults.pendingAddUsername = nil
            present(.friends(tab: .add))
            if let p = await env.friends.profile(username: u) { present(.userProfile(p.id)) }
        }
    }

    /// A URL while signed out / not onboarded is parked in the dt.pending* keys (§7 table); while onboarded it routes live.
    func handle(url: URL, env: AppEnvironment, gate: Gate) {
        guard let route = DeepLink.route(for: url) else { return }
        if gate == .main { go(route, env: env); return }
        switch route {
        case .check(let id), .feed(let id?): Defaults.pendingCheckId = id
        case .friendToken(let t): Defaults.pendingFriendToken = t
        case .profile(let u): Defaults.pendingAddUsername = u
        default: enqueue(route)
        }
    }

    func reset() {
        tab = .feed; sheet = nil; stacked = nil; cover = nil; feedPath = []; squadPath = []
        isCreateOpen = false; createPrefill = nil; highlightedCheckId = nil; queuedSheet = nil; afterDismiss = nil; drainedIntents = false
    }
}
