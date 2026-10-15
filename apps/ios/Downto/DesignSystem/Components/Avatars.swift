// DesignSystem/Components/Avatars.swift — AvatarLetter + AvatarStack (DESIGN §4.4; DECISIONS #23).
// `Presence` is the masking boundary: a masked presence carries no id and no name, so the view cannot render the real person.
import SwiftUI

nonisolated enum AvatarSize: Hashable, Sendable, CaseIterable {
    case micro, inline, small, medium, display

    var diameter: CGFloat {
        switch self {
        case .micro: 20
        case .inline: 24
        case .small: 28
        case .medium: 40
        case .display: 72
        }
    }

    /// Inter 600 letter size.
    var letter: CGFloat {
        switch self {
        case .micro: 10
        case .inline: 12
        case .small: 13
        case .medium: 18
        case .display: 32
        }
    }

    var ring: CGFloat {
        switch self {
        case .micro: 1.5
        case .inline, .small, .medium: 2
        case .display: 3
        }
    }

    /// Stack overlap: −6 at ≤ 28, −8 at 40.
    var stackOverlap: CGFloat { diameter <= 28 ? -6 : -8 }

    /// At `micro`/`inline` the kaomoji is replaced by "?" — 8pt kaomoji is illegible.
    var showsKaomoji: Bool { diameter > 24 }
}

/// Extra ring semantics beyond the surface ring (DESIGN §4.4).
nonisolated enum AvatarBadgeRing: Hashable, Sendable {
    case none
    /// 2pt `Color.pool` ring — in the crew pool.
    case pool
    /// 1.5pt dashed `Color.ruleMid` ring — waitlisted.
    case waitlisted
    /// 2pt `Color.dt` ring — "you first" in the detail grid.
    case you
}

struct AvatarLetter: View {
    let presence: Presence
    var size: AvatarSize = .inline
    /// The colour of the surface this avatar sits on (stacked avatars wear it as a 2pt ring). nil → no ring.
    var ring: Color? = nil
    var badgeRing: AvatarBadgeRing = .none
    /// Expired / hidden entries: fill → `ruleLight`, letter → `inkExpired` (decorative dim, never opacity on text).
    var expired = false

    @ScaledMetric private var scale: CGFloat = 1
    @Environment(\.dtIncreaseContrast) private var increaseContrast

    private var diameter: CGFloat { size.diameter * scale }

    var body: some View {
        ZStack {
            Circle().fill(fill)
            if presence.isMasked {
                Circle().strokeBorder(Color.inkDim, style: StrokeStyle(lineWidth: 1, dash: [3, 2]))
            }
            glyph
        }
        .frame(width: diameter, height: diameter)
        .overlay {
            if let ring { Circle().stroke(ring, lineWidth: size.ring).padding(-size.ring / 2) }
        }
        .overlay { badge }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(presence.isMasked ? "mystery host" : presence.label)
    }

    private var fill: Color {
        if expired { return .ruleLight }
        switch presence {
        case .person(let p):
            if p.isMe { return increaseContrast ? .dtInkOnSurface : .dt }
            return .ruleLight
        case .masked:
            return .surface
        }
    }

    @ViewBuilder private var glyph: some View {
        switch presence {
        case .person(let p):
            Text(String(p.avatarLetter.prefix(1)).uppercased())
                .font(.dt.avatarLetter(size: size.letter * scale))
                .foregroundStyle(expired ? Color.inkExpired : (p.isMe ? (increaseContrast ? Color.paper : Color.onDt) : Color.ink))
                .baselineOffset(size.diameter <= 28 ? -1 : 0)
        case .masked(let kaomoji, _):
            if size.showsKaomoji {
                KaomojiText(kaomoji: kaomoji, size: size.diameter * 0.36)
                    .foregroundStyle(Color.ink)
                    .frame(width: diameter - 4)
            } else {
                Text("?")
                    .font(.dt.avatarLetter(size: size.letter * scale))
                    .foregroundStyle(Color.ink)
            }
        }
    }

    @ViewBuilder private var badge: some View {
        switch badgeRing {
        case .none: EmptyView()
        case .pool: Circle().stroke(Color.pool, lineWidth: 2)
        case .waitlisted: Circle().stroke(Color.ruleMid, style: StrokeStyle(lineWidth: 1.5, dash: [3, 2]))
        case .you: Circle().stroke(Color.dt, lineWidth: 2).padding(-1)
        }
    }
}

/// Max 3 + "+N"; overlap −6/−8; each avatar wears a 2pt ring in the surface colour; tap fans out (DESIGN §4.4).
struct AvatarStack: View {
    let presences: [Presence]
    var ring: Color = .card
    var size: AvatarSize = .small
    var max: Int = 3
    /// Expired entries: response-row avatars keep their fills but drop to 0.6 (decorative).
    var dimmed = false
    var onTap: (() -> Void)? = nil

    @State private var fanned = false
    @State private var fanCount = 0
    @Environment(\.dtReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var shown: [Presence] {
        let cap = dynamicTypeSize.isAccessibilitySize ? Swift.min(2, max) : max
        return Array(presences.prefix(cap))
    }

    private var overflow: Int { presences.count - shown.count }
    private var spacing: CGFloat { fanned ? 4 : size.stackOverlap }

    var body: some View {
        HStack(spacing: spacing) {
            ForEach(Array(shown.enumerated()), id: \.offset) { index, presence in
                AvatarLetter(presence: presence, size: size, ring: ring)
                    .zIndex(Double(shown.count - index))   // first on top
                    .transition(.scale(scale: 0.4).combined(with: .opacity))
            }
            if overflow > 0 {
                Text("+\(overflow)")
                    .dtFont(.badge)
                    .foregroundStyle(Color.paper)
                    .frame(width: size.diameter, height: size.diameter)
                    .background(Circle().fill(Color.ink))
                    .overlay(Circle().stroke(ring, lineWidth: size.ring).padding(-size.ring / 2))
                    .dtNumeric(overflow)
            }
        }
        .opacity(dimmed ? 0.6 : 1)
        .animation(DTSpring.stamp, value: shown.count)
        .contentShape(Rectangle())
        .onTapGesture { fan() }
        .dtFeedback(.selection, trigger: fanCount)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
        .accessibilityAddTraits(onTap == nil ? [] : .isButton)
    }

    private var accessibilityText: String {
        let names = presences.map { $0.isMasked ? "hidden member" : $0.label }
        return names.joined(separator: ", ")
    }

    private func fan() {
        onTap?()
        guard !reduceMotion, !fanned else { return }
        fanCount += 1
        withAnimation(DTSpring.ink) { fanned = true }
        Task {
            try? await Task.sleep(for: .milliseconds(900))
            withAnimation(DTSpring.settle) { fanned = false }
        }
    }
}

// MARK: - Previews

nonisolated enum PreviewPresence {
    static func person(_ name: String, me: Bool = false) -> Presence {
        .person(PersonRef(id: UserID(UUID()), displayName: name, username: name.lowercased(), avatarLetter: String(name.prefix(1)), isMe: me))
    }

    static let me = person("Kat", me: true)
    static let sara = person("Sara")
    static let devon = person("Devon")
    static let mo = person("Mo")
    static let lena = person("Lena")
    static let masked = Presence.masked(kaomoji: "(⌐■_■)", scramble: "ᛞ∑√øη")
    static let maskedWide = Presence.masked(kaomoji: "(っ˘ω˘ς)", scramble: "§∆®∆")
}

#Preview("AvatarLetter") {
    VStack(alignment: .leading, spacing: 16) {
        ForEach(AvatarSize.allCases, id: \.self) { size in
            HStack(spacing: 12) {
                AvatarLetter(presence: PreviewPresence.me, size: size)
                AvatarLetter(presence: PreviewPresence.sara, size: size)
                AvatarLetter(presence: PreviewPresence.masked, size: size)
                AvatarLetter(presence: PreviewPresence.sara, size: size, badgeRing: .pool)
                AvatarLetter(presence: PreviewPresence.sara, size: size, badgeRing: .waitlisted)
                AvatarLetter(presence: PreviewPresence.sara, size: size, expired: true)
            }
        }
        AvatarStack(presences: [PreviewPresence.me, PreviewPresence.sara, PreviewPresence.devon, PreviewPresence.mo, PreviewPresence.lena])
    }
    .padding()
    .background(Color.paper)
}
