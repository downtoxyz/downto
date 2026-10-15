// DesignSystem/Components/Masthead.swift — DESIGN §4.12. Height 56, paper, no rule; wordmark left, running head under it on Feed;
// right cluster (sort toggle, bell with dot/count, the "+" that rotates 45° into "×" while Create is open, with the first-check glow).
import SwiftUI

// `FeedSort` lives in Domain/FeedOrdering.swift; the toggle renders its raw value uppercased.

struct Masthead: View {
    let wordmark: String
    var runningHead: String? = nil
    var sort: Binding<FeedSort>? = nil
    var unreadCount = 0
    var hasUnreadDot = false
    var glowAdd = false
    var isCreateOpen = false
    var showsAdd = true
    var onBell: () -> Void = {}
    var onAdd: () -> Void = {}

    @State private var sortTaps = 0
    @State private var addTaps = 0
    @State private var glowRadius: CGFloat = 8
    @State private var ripple = false
    @Environment(\.dtReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(wordmark).dtFont(.wordmark).foregroundStyle(Color.ink).accessibilityAddTraits(.isHeader)
                if let head = runningHead, !dynamicTypeSize.isAccessibilitySize {
                    Text(head).dtFont(.meta).foregroundStyle(.inkMuted)
                }
            }
            Spacer(minLength: 8)
            if let sort {
                sortToggle(sort)
            }
            bell
            if showsAdd { addButton }
        }
        .padding(.horizontal, Space.gutter)
        .frame(minHeight: 56)
        .background(Color.paper)
        .dtFeedback(.selection, trigger: sortTaps)
        .dtFeedback(.impact(weight: .medium), trigger: addTaps)
    }

    /// At ≥ accessibility1 the running head leaves the masthead and becomes the first row of the feed (DESIGN §4.12).
    var runningHeadBand: some View {
        Group {
            if let head = runningHead, dynamicTypeSize.isAccessibilitySize {
                Text(head).dtFont(.bodySmall).foregroundStyle(.inkMuted)
                    .padding(.horizontal, Space.gutter)
                    .frame(maxWidth: .infinity, minHeight: 32, alignment: .leading)
                    .background(Color.surface)
                    .paperStock(.surface)
            }
        }
    }

    private func sortToggle(_ sort: Binding<FeedSort>) -> some View {
        HStack(spacing: 8) {
            ForEach(FeedSort.allCases, id: \.self) { s in
                Text(s.rawValue.uppercased())
                    .dtFont(.label)
                    .foregroundStyle(sort.wrappedValue == s ? AnyShapeStyle(Color.ink) : AnyShapeStyle(DTStockInk(token: .inkMuted)))
                    .overlay(alignment: .bottom) { if sort.wrappedValue == s { Rectangle().fill(Color.ink).frame(height: 1).offset(y: 2) } }
                    .animation(DTCurve.crossfade, value: sort.wrappedValue)
            }
        }
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .onTapGesture {
            sort.wrappedValue = sort.wrappedValue == .recent ? .upcoming : .recent
            sortTaps += 1
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("sort")
        .accessibilityValue(sort.wrappedValue.rawValue)
        .accessibilityAddTraits(.isButton)
        .accessibilityAdjustableAction { _ in sort.wrappedValue = sort.wrappedValue == .recent ? .upcoming : .recent }
    }

    private var bell: some View {
        Button(action: onBell) {
            Image(systemName: "bell")
                .font(.system(size: 22, weight: .regular))
                .foregroundStyle(Color.ink)
                .frame(width: 44, height: 44)
                .overlay(alignment: .topTrailing) {
                    if unreadCount > 0 {
                        NotificationBadge(count: unreadCount).offset(x: -4, y: 6)
                    } else if hasUnreadDot {
                        NotificationDot().offset(x: -7, y: 9)
                    }
                }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(unreadCount > 0 ? "notifications, \(unreadCount) unread" : "notifications")
    }

    private var addButton: some View {
        Button {
            addTaps += 1
            onAdd()
        } label: {
            ZStack {
                if glowAdd && !reduceMotion {
                    Circle().stroke(Color.dt.opacity(0.35), lineWidth: 1.5)
                        .frame(width: 36, height: 36)
                        .scaleEffect(ripple ? 1.6 : 1.0)
                        .opacity(ripple ? 0 : 0.35)
                }
                Circle().fill(DTContrastAware(token: .dtFill))
                    .frame(width: 36, height: 36)
                    .shadow(color: glowAdd ? Color.dt.opacity(0.55) : .clear, radius: reduceMotion ? 14 : glowRadius)
                Text("+")
                    .font(.dt.avatarLetter(size: 22))
                    .foregroundStyle(DTContrastAware(token: .onDtFill))
                    .rotationEffect(.degrees(isCreateOpen && !reduceMotion ? 45 : 0))
                    .animation(DTSpring.page, value: isCreateOpen)
            }
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(DTPressStyle())
        .accessibilityLabel(isCreateOpen ? "close" : "new check")
        .onAppear {
            guard glowAdd, !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 2.0).repeatForever(autoreverses: true)) { glowRadius = 18 }
            withAnimation(.easeOut(duration: 2.0).repeatForever(autoreverses: false).delay(1)) { ripple = true }
        }
    }
}

#Preview("Masthead") {
    struct Host: View {
        @State private var sort: FeedSort = .recent
        var body: some View {
            VStack(spacing: 0) {
                Masthead(wordmark: "down to", runningHead: "tue sep 23 · 3 friends out tonight", sort: $sort, unreadCount: 3)
                Masthead(wordmark: "squads", hasUnreadDot: true, glowAdd: true)
                Masthead(wordmark: "you", isCreateOpen: true)
            }
            .background(Color.paper)
        }
    }
    return Host()
}
