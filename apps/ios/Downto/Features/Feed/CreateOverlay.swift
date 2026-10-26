// Downto/Features/Feed/CreateOverlay.swift — PLACEHOLDER (LANE: feed). Replace this file wholesale; keep the type name and initializer so MainShell/Router compile.
import SwiftUI

nonisolated enum CreateMode: Sendable {
    case normal
    /// FirstCheck: "skip for now" top-right; onPosted after the first successful createCheck.
    case first(onSkip: @Sendable @MainActor () -> Void, onPosted: @Sendable @MainActor () -> Void)
}

struct CreateOverlay: View {
    let mode: CreateMode
    @Environment(AppEnvironment.self) private var env
    var body: some View {
        VStack(spacing: 16) {
            Text("new check").dtFont(.display).foregroundStyle(Color.ink)
            Text("create overlay pending").dtFont(.body).foregroundStyle(Color.inkMuted)
            switch mode {
            case .normal: DTButton(title: "CLOSE", variant: .text) { env.router.isCreateOpen = false }
            case .first(let onSkip, _): DTButton(title: "SKIP FOR NOW", variant: .text) { onSkip() }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.paper.ignoresSafeArea())
    }
}
