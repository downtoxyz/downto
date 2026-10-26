// Features/Feed/DeletedCheckView.swift — a check that is gone (DESIGN §7.5, §4.13): quip via WobbleRenderer, "press f" as the
// whole button, "REVIVE IT →" for the owner. Pushed on the Feed stack (ARCHITECTURE §7 FeedDestination.deletedCheck).
import SwiftUI

struct DeletedCheckView: View {
    let checkId: CheckID
    let isMine: Bool
    @Environment(AppEnvironment.self) private var env
    @State private var reviving = false

    static let quips = ["that check is gone.", "the host took it down.", "nothing to see here anymore."]

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Text("✶").dtFont(.display).foregroundStyle(.inkMuted)
            WobbleText(text: Self.quips[abs(checkId.hashValue) % Self.quips.count], style: .display)
                .foregroundStyle(Color.ink)
                .multilineTextAlignment(.center)
            if isMine {
                Button { Task { await revive() } } label: { Text("REVIVE IT →").dtFont(.button).foregroundStyle(.dtInk).frame(minHeight: 44) }
                    .buttonStyle(.plain)
                    .disabled(reviving)
            }
            Spacer()
            DTButton(title: "press f", variant: .primary, size: .buttonLarge) { env.router.feedPath = [] }
                .padding(.horizontal, Space.gutter)
                .padding(.bottom, 16)
        }
        .padding(.horizontal, Space.gutter)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.paper.ignoresSafeArea())
        .background(InteractivePopEnabler().frame(width: 0, height: 0))
    }

    private func revive() async {
        reviving = true
        defer { reviving = false }
        await env.feed.revive(checkId)
        if env.feed.raw.checks[checkId]?.archivedAt == nil, env.feed.raw.checks[checkId] != nil {
            env.router.feedPath = [.checkDetail(checkId)]
        }
    }
}
