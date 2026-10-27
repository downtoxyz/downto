// DesignSystem/Components/Folio.swift — the tab bar (DESIGN §4.11; DECISIONS #13, amended on device 2026-10-27). Three typeset labels
// with a 2pt dt underline sliding with DTSpring.page, now set in a floating Liquid Glass capsule that hugs the home indicator so the
// feed scrolls underneath instead of ending above a paper band. `.isTabBar`. Hidden by `router.hidesFolio` (the host collapses the inset).
import SwiftUI

/// The measured Folio height, published so scroll views can inset by it (DESIGN §4.11).
nonisolated struct FolioHeightKey: PreferenceKey {
    static let defaultValue: CGFloat = 52
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}

struct Folio: View {
    @Binding var selected: Tab
    var squadUnread = false
    var hidden = false
    /// Re-tap the active tab: scroll to top; second re-tap on FEED refreshes.
    var onReselect: (Tab) -> Void = { _ in }

    @Namespace private var underline
    @State private var taps = 0
    @Environment(\.dtReduceMotion) private var reduceMotion

    private let tabs: [(Tab, String)] = [(.feed, "FEED"), (.squads, "SQUADS"), (.you, "YOU")]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(tabs, id: \.0) { tab, label in
                Button {
                    if selected == tab { onReselect(tab) } else { withAnimation(Motion.resolve(.page, reduceMotion: reduceMotion)) { selected = tab } }
                    taps += 1
                } label: {
                    VStack(spacing: 6) {
                        Text(label)
                            .dtFont(.label, size: 11)
                            .foregroundStyle(selected == tab ? AnyShapeStyle(Color.ink) : AnyShapeStyle(DTStockInk(token: .inkMuted)))
                            .multilineTextAlignment(.center)
                            .overlay(alignment: .topTrailing) {
                                if tab == .squads && squadUnread { SquadUnreadDot().offset(x: 4, y: -2) }
                            }
                        ZStack {
                            Color.clear.frame(height: 2)
                            if selected == tab {
                                Rectangle().fill(Color.dt).frame(height: 2)
                                    .matchedGeometryEffect(id: "underline", in: underline)
                            }
                        }
                    }
                    .fixedSize(horizontal: true, vertical: false)   // the underline is as wide as the word, not the capsule third
                    .padding(.vertical, 10)
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(label.capitalized), tab \(index(of: tab)) of 3")
                .accessibilityIdentifier("tab-\(label.lowercased())")
                .accessibilityValue(tab == .squads && squadUnread ? "unread" : "")
                .accessibilityAddTraits(selected == tab ? [.isSelected] : [])
                .accessibilityRemoveTraits(selected == tab ? [] : [.isSelected])
            }
        }
        .padding(.horizontal, 10)
        .frame(maxWidth: .infinity)
        .frame(height: 52)
        .glassEffect(.regular.interactive(), in: .capsule)      // iOS 26 Liquid Glass: the content shows through as it scrolls under
        .padding(.horizontal, Space.gutter)
        .background(GeometryReader { geo in Color.clear.preference(key: FolioHeightKey.self, value: geo.size.height) })
        .dtFeedback(.selection, trigger: taps)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isTabBar)
        .animation(Motion.resolve(.page, reduceMotion: reduceMotion), value: squadUnread)
    }

    private func index(of tab: Tab) -> Int { (tabs.firstIndex { $0.0 == tab } ?? 0) + 1 }
}

/// Hosts the Folio as a bottom `safeAreaInset` whose content collapses to zero height in the same transaction as the offset
/// (DECISIONS #13) so a chat composer sits on the home indicator while the Folio is hidden.
struct FolioInset: ViewModifier {
    @Binding var selected: Tab
    var squadUnread: Bool
    var hidden: Bool
    var onReselect: (Tab) -> Void = { _ in }
    @State private var height: CGFloat = 52
    @Environment(\.dtReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .safeAreaInset(edge: .bottom, spacing: 0) {
                // No paper behind it: the capsule floats 6pt above the home indicator and the scroll content passes beneath.
                Folio(selected: $selected, squadUnread: squadUnread, onReselect: onReselect)
                    .padding(.bottom, 6)
                    .onPreferenceChange(FolioHeightKey.self) { height = $0 }
                    .frame(height: hidden ? 0 : nil)
                    .offset(y: hidden ? height + 60 : 0)
                    .opacity(hidden ? 0 : 1)
                    .allowsHitTesting(!hidden)
                    .animation(Motion.resolve(.page, reduceMotion: reduceMotion), value: hidden)
            }
    }
}

extension View {
    func folio(selected: Binding<Tab>, squadUnread: Bool = false, hidden: Bool = false, onReselect: @escaping (Tab) -> Void = { _ in }) -> some View {
        modifier(FolioInset(selected: selected, squadUnread: squadUnread, hidden: hidden, onReselect: onReselect))
    }
}

#Preview("Folio") {
    struct Host: View {
        @State private var tab: Tab = .feed
        var body: some View {
            VStack(spacing: 24) {
                Folio(selected: $tab)
                Folio(selected: $tab, squadUnread: true)
            }
            .background(Color.paper)
        }
    }
    return Host()
}
