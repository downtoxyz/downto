// Downto/Features/Feed/FeedView.swift — PLACEHOLDER (LANE: feed). Replace this file wholesale; keep the type name and initializer so MainShell/Router compile.
import SwiftUI

struct FeedView: View {
    let namespace: Namespace.ID
    @Environment(AppEnvironment.self) private var env
    var body: some View {
        VStack(spacing: 0) {
            Masthead(wordmark: "down to", runningHead: "feed lane pending", unreadCount: env.notifications.unreadCount,
                     glowAdd: Defaults.showAddGlow, onBell: { env.router.present(.notifications) }, onAdd: { env.router.isCreateOpen = true })
            EmptyState(headline: "nothing here yet", line: "the feed is being built")
            Spacer()
        }
        .background(Color.paper)
    }
}
