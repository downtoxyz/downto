// DesignSystem/Components/Skeleton.swift — "the press" (DESIGN §7.15; DECISIONS #21): shimmer-rule skeletons, the offline band,
// the "still printing…" line. No spinners anywhere.
import SwiftUI

nonisolated enum SkeletonKind: Hashable, Sendable, CaseIterable {
    case feed, squads, notifications, chat, sheetRows
}

/// One shimmer sweep across all blocks in phase every 1.6s (`easeInOut`, `.plusLighter`). Reduce Motion: static.
private struct ShimmerSweep: ViewModifier {
    @State private var sweep = false
    @Environment(\.dtReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content.overlay {
            if !reduceMotion {
                GeometryReader { geo in
                    LinearGradient(colors: [.clear, .white.opacity(0.35), .clear], startPoint: .leading, endPoint: .trailing)
                        .frame(width: 60)
                        .blendMode(.plusLighter)
                        .offset(x: sweep ? geo.size.width : -60)
                        .onAppear { withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: false)) { sweep = true } }
                }
                .allowsHitTesting(false)
            }
        }
        .clipped()
    }
}

extension View {
    func dtShimmer() -> some View { modifier(ShimmerSweep()) }
}

struct Skeleton: View {
    let kind: SkeletonKind
    /// After 8s: "still printing…" under the skeleton.
    var stillPrinting = false

    @Environment(\.paperStock) private var stock

    private var block: Color { stock == .paper ? .surface : .deep }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            switch kind {
            case .feed:
                SectionLabel(text: "timed", starred: true)
                ForEach(0..<4, id: \.self) { i in feedEntry(i).hairline() }
            case .squads:
                ForEach(0..<3, id: \.self) { _ in squadRow.hairline() }
            case .notifications:
                ForEach(0..<4, id: \.self) { _ in notificationRow.hairline() }
            case .chat:
                ForEach(0..<3, id: \.self) { _ in chatGroup }
            case .sheetRows:
                ForEach(0..<2, id: \.self) { _ in sheetRow }
            }
            if stillPrinting {
                Text("still printing…").dtFont(.meta).foregroundStyle(.inkMuted).padding(Space.gutter)
            }
        }
        .dtShimmer()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("loading")
    }

    private func rule(_ fraction: CGFloat, height: CGFloat = 12) -> some View {
        GeometryReader { geo in
            Radius.shape(4).fill(block).frame(width: geo.size.width * fraction, height: height)
        }
        .frame(height: height)
    }

    private func feedEntry(_ i: Int) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) { Circle().fill(block).frame(width: 24, height: 24); rule(0.3) }
            rule(0.9, height: 18)
            rule(0.6, height: 18)
            rule(0.45)
            HStack { Spacer(); Capsule().fill(block).frame(width: 88, height: 36) }
        }
        .padding(.horizontal, Space.gutter)
        .padding(.vertical, Space.entryVertical)
    }

    private var squadRow: some View {
        HStack(spacing: 12) {
            HStack(spacing: -6) { ForEach(0..<3, id: \.self) { _ in Circle().fill(block).frame(width: 28, height: 28) } }
            VStack(alignment: .leading, spacing: 8) { rule(0.5); rule(0.7) }
        }
        .padding(.horizontal, Space.gutter)
        .frame(height: 72)
    }

    private var notificationRow: some View {
        HStack(spacing: 12) {
            Circle().fill(block).frame(width: 32, height: 32)
            VStack(alignment: .leading, spacing: 8) { rule(0.6); rule(0.4) }
        }
        .padding(.horizontal, Space.sheetGutter)
        .frame(height: 64)
    }

    private var chatGroup: some View {
        HStack(alignment: .top, spacing: 8) {
            Circle().fill(block).frame(width: 24, height: 24)
            VStack(alignment: .leading, spacing: 8) { rule(0.6); rule(0.35) }
        }
        .padding(.horizontal, Space.chatGutter)
        .padding(.vertical, 12)
    }

    private var sheetRow: some View {
        HStack(spacing: 12) {
            Circle().fill(block).frame(width: 28, height: 28)
            rule(0.55)
        }
        .padding(.horizontal, Space.sheetGutter)
        .frame(height: 48)
    }
}

/// "✶ press not running — you're offline ✶": a 28pt ink band under the masthead, the only inverted band in the app.
struct OfflineBand: View {
    var nudge = 0
    @State private var offset: CGFloat = 0
    @Environment(\.dtReduceMotion) private var reduceMotion

    var body: some View {
        Text("✶ press not running — you're offline ✶")
            .dtFont(.label)
            .foregroundStyle(Color.paper)
            .frame(maxWidth: .infinity, minHeight: 28)
            .background(Color.ink)
            .offset(y: offset)
            .onChange(of: nudge) { _, _ in
                guard !reduceMotion else { return }
                withAnimation(DTSpring.snap) { offset = 4 }
                Task { try? await Task.sleep(for: .milliseconds(120)); withAnimation(DTSpring.snap) { offset = 0 } }
            }
            .transition(.move(edge: .top).combined(with: .opacity))
            .accessibilityLabel("you're offline")
    }
}

/// The "· reconnecting" strip variant: a running-head suffix the masthead appends (DESIGN §7.15). Provided as a view for the gallery.
struct ReconnectingStrip: View {
    var body: some View {
        Text("· reconnecting").dtFont(.meta).foregroundStyle(.inkMuted)
    }
}

#Preview("Skeletons") {
    ScrollView {
        VStack(spacing: 24) {
            OfflineBand()
            Skeleton(kind: .feed)
            Skeleton(kind: .squads)
            Skeleton(kind: .chat, stillPrinting: true)
            Skeleton(kind: .notifications).background(Color.surface).paperStock(.surface)
        }
    }
    .background(Color.paper)
}
