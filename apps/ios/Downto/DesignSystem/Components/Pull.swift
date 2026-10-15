// DesignSystem/Components/Pull.swift — custom pull-to-refresh (DESIGN §4.14; DECISIONS #19). PULL / RELEASE / REFRESHING with a 2pt
// dt rule growing from the centre; 72pt threshold; the hold is a 56pt top safeAreaInset spacer; `.scrollBounceBehavior(.always)` is mandatory.
import SwiftUI

nonisolated enum PullPhase: Hashable, Sendable {
    case idle, pulling, armed, refreshing, offline
}

/// The indicator alone (gallery, snapshot): label + rule for a given pull distance and phase.
struct PullIndicator: View {
    let pull: CGFloat
    let phase: PullPhase
    var threshold: CGFloat = 72

    @Environment(\.dtReduceMotion) private var reduceMotion
    @State private var shimmer = false

    private var label: String {
        switch phase {
        case .idle, .pulling: "PULL"
        case .armed: "RELEASE"
        case .refreshing: "REFRESHING"
        case .offline: "OFFLINE"
        }
    }

    var body: some View {
        VStack(spacing: 8) {
            Text(label)
                .dtFont(.label)
                .foregroundStyle(.inkDim)
                .opacity(phase == .refreshing ? 1 : Double(max(0, min(1, (pull - 24) / 24))))
            GeometryReader { geo in
                let width = phase == .refreshing ? geo.size.width : min(1, pull / threshold) * geo.size.width
                Rectangle()
                    .fill(Color.dt)
                    .frame(width: width, height: 2)
                    .overlay {
                        if phase == .refreshing && !reduceMotion {
                            LinearGradient(colors: [.clear, .white.opacity(0.35), .clear], startPoint: .leading, endPoint: .trailing)
                                .frame(width: 60).blendMode(.plusLighter)
                                .offset(x: shimmer ? width : -60)
                                .onAppear { withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: false)) { shimmer = true } }
                        }
                    }
                    .frame(maxWidth: .infinity)
            }
            .frame(height: 2)
            .padding(.horizontal, Space.gutter)
        }
        .frame(height: 56)
        .frame(maxWidth: .infinity)
        .accessibilityHidden(true)
    }
}

/// `.dtPull(isRefreshing:isOffline:onRefresh:)` on a `ScrollView`: tracks overscroll with `onScrollGeometryChange`, arms at 72, holds
/// the content at 56 with a top inset spacer, minimum 500ms, and fires the DESIGN §6.1 haptics.
struct PullRefresh: ViewModifier {
    var isOffline = false
    let onRefresh: () async -> Bool

    @State private var pull: CGFloat = 0
    @State private var phase: PullPhase = .idle
    @State private var armed = false
    @State private var hold: CGFloat = 0
    @State private var armCount = 0
    @State private var landedCount = 0
    @Environment(\.dtReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .scrollBounceBehavior(.always)
            .onScrollGeometryChange(for: CGFloat.self) { geo in
                geo.contentOffset.y + geo.contentInsets.top
            } action: { _, offset in
                pull = -min(0, offset)
                guard phase != .refreshing else { return }
                if isOffline {
                    phase = pull > 0 ? .offline : .idle
                } else if pull >= 72 {
                    if !armed { armed = true; armCount += 1 }
                    phase = .armed
                } else {
                    if pull < 48 { armed = false }
                    phase = pull > 0 ? .pulling : .idle
                }
            }
            .onScrollPhaseChange { _, newPhase in
                guard newPhase == .decelerating || newPhase == .idle, armed, phase != .refreshing, !isOffline else { return }
                armed = false
                start()
            }
            .safeAreaInset(edge: .top, spacing: 0) {
                Color.clear.frame(height: hold)
            }
            .overlay(alignment: .top) {
                if phase != .idle {
                    PullIndicator(pull: pull, phase: phase)
                        .offset(y: phase == .refreshing ? 0 : min(0, pull - 56))
                }
            }
            .dtFeedback(.impact(weight: .light), trigger: armCount)
            .dtFeedback(.impact(flexibility: .soft), trigger: landedCount)
    }

    private func start() {
        phase = .refreshing
        withAnimation(Motion.resolve(.snap, reduceMotion: reduceMotion)) { hold = 56 }
        Task {
            let started = ContinuousClock.now
            let hadNew = await onRefresh()
            let elapsed = ContinuousClock.now - started
            if elapsed < .milliseconds(500) { try? await Task.sleep(for: .milliseconds(500) - elapsed) }
            withAnimation(Motion.resolve(.page, reduceMotion: reduceMotion)) { hold = 0 }
            phase = .idle
            if hadNew { landedCount += 1 }
        }
    }
}

extension View {
    func dtPull(isOffline: Bool = false, onRefresh: @escaping () async -> Bool) -> some View {
        modifier(PullRefresh(isOffline: isOffline, onRefresh: onRefresh))
    }
}

#Preview("Pull") {
    VStack(spacing: 8) {
        PullIndicator(pull: 40, phase: .pulling)
        PullIndicator(pull: 80, phase: .armed)
        PullIndicator(pull: 72, phase: .refreshing)
        PullIndicator(pull: 60, phase: .offline)
    }
    .background(Color.paper)
}
