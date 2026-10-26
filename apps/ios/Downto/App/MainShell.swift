// App/MainShell.swift — root ZStack: 3 tab roots → Folio → CreateOverlay → Slip host → offline band → Grain; sheet/cover host
// (ARCHITECTURE §7 "Tabs", §7.0, §7.5; DESIGN §10 order).
import SwiftUI

struct MainShell: View {
    @Environment(AppEnvironment.self) private var env

    var body: some View {
        @Bindable var router = env.router
        ZStack(alignment: .bottom) {
            Color.paper.ignoresSafeArea()
            ZStack {
                tabRoot(.feed) { FeedRootView() }
                tabRoot(.squads) { SquadsRootView() }
                tabRoot(.you) { ProfileView() }
            }
            .folio(selected: $router.tab, squadUnread: !env.squads.unread.isEmpty, hidden: router.hidesFolio) { tab in
                reselect(tab)
            }
            .onChange(of: router.tab) { old, new in if old == .feed, new != .feed { env.feed.markFeedSeen() } }

            if router.isCreateOpen {
                CreateOverlay(mode: .normal)
                    .transition(.opacity)
                    .zIndex(2)
            }

            VStack(spacing: 0) {
                Spacer()
                SlipHost(item: Binding(get: { env.toasts.binding }, set: { env.toasts.binding = $0 })) { env.toasts.tapped($0) }
                    .padding(.bottom, router.hidesFolio ? 8 : 64)
            }
            .zIndex(3)
            .allowsHitTesting(env.toasts.current != nil)

            if env.reachability.isOffline {
                VStack { OfflineBand(); Spacer() }.transition(.move(edge: .top).combined(with: .opacity)).zIndex(4)
            }
        }
        .animation(DTSpring.page, value: router.isCreateOpen)
        .animation(DTSpring.page, value: env.reachability.isOffline)
        .dtGrain()
        .sheet(item: $router.sheet, onDismiss: { router.rootSheetDismissed() }) { s in
            SheetHost(sheet: s)
                .sheet(item: $router.stacked, onDismiss: { router.stackedSheetDismissed() }) { SheetHost(sheet: $0) }
        }
        .fullScreenCover(item: $router.cover) { c in
            switch c {
            case .imageViewer(let url): ImageViewer(url: url)
            }
        }
        .onChange(of: router.sheet) { _, s in if s == .notifications { env.push.clearBadge() } }
    }

    @ViewBuilder private func tabRoot<Content: View>(_ tab: Tab, @ViewBuilder content: () -> Content) -> some View {
        let active = env.router.tab == tab
        content()
            .opacity(active ? 1 : 0)
            .allowsHitTesting(active)
            .accessibilityHidden(!active)
            .animation(.easeInOut(duration: 0.2), value: active)
    }

    private func reselect(_ tab: Tab) {
        switch tab {
        case .feed: env.router.feedPath = []; env.feed.releaseHeldInserts()
        case .squads: env.router.squadPath = []
        case .you: break
        }
    }
}

/// Every root-or-stacked sheet, wrapped in the `.dtSheet` chrome.
struct SheetHost: View {
    let sheet: Sheet
    @Environment(AppEnvironment.self) private var env

    var body: some View {
        Group {
            switch sheet {
            case .editCheck(let id): EditCheckSheet(checkId: id)
            case .checkActions(let id): CheckActionsSheet(checkId: id)
            case .notifications: NotificationsSheet()
            case .friends(let tab): FriendsSheet(initialTab: tab)
            case .userProfile(let id): UserProfileSheet(userId: id)
            case .squadSettings(let id): SquadSettingsSheet(squadId: id)
            case .squadMembers(let id): SquadMembersView(squadId: id)
            case .dateProposal(let id): DateProposalSheet(squadId: id)
            case .report(let target, let id): ReportSheet(target: target, id: id)
            case .editProfile: EditProfileSheet()
            case .syncCalendar, .eventLobby, .editEvent: ComingSoonSheet()
            }
        }
        .presentationBackground(Color.surface)
        .presentationCornerRadius(Radius.sheet)
        .presentationDragIndicator(.hidden)
        .presentationBackgroundInteraction(.disabled)
        .presentationContentInteraction(.scrolls)
        .presentationDetents([.fraction(0.72), .large])
        .paperStock(.surface)
    }
}

/// M2 surfaces that are still in the Sheet enum (§15.1) — unreachable in M1, honest if ever hit.
struct ComingSoonSheet: View {
    var body: some View {
        DTSheetShell(title: "soon ✶") { Text("this is coming to iOS soon").dtFont(.body).foregroundStyle(Color.inkMuted).padding(Space.gutter) }
    }
}

/// Feed tab root: NavigationStack(path: feedPath) → FeedView / CheckDetailView / DeletedCheckView.
struct FeedRootView: View {
    @Environment(AppEnvironment.self) private var env
    @Namespace private var feedNS

    var body: some View {
        @Bindable var router = env.router
        NavigationStack(path: $router.feedPath) {
            FeedView(namespace: feedNS)
                .toolbar(.hidden, for: .navigationBar)
                .navigationDestination(for: FeedDestination.self) { d in
                    switch d {
                    case .checkDetail(let id):
                        CheckDetailView(checkId: id)
                            .navigationTransition(.zoom(sourceID: id, in: feedNS))
                            .toolbar(.hidden, for: .navigationBar)
                    case .deletedCheck(let id, let isMine):
                        DeletedCheckView(checkId: id, isMine: isMine)
                            .toolbar(.hidden, for: .navigationBar)
                    }
                }
        }
    }
}

/// Squads tab root: NavigationStack(path: squadPath) → SquadsView / SquadChatView.
struct SquadsRootView: View {
    @Environment(AppEnvironment.self) private var env

    var body: some View {
        @Bindable var router = env.router
        NavigationStack(path: $router.squadPath) {
            SquadsView()
                .toolbar(.hidden, for: .navigationBar)
                .navigationDestination(for: SquadID.self) { id in
                    SquadChatView(squadId: id).toolbar(.hidden, for: .navigationBar)
                }
        }
    }
}
