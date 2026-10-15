// DesignSystem/Tokens/Typography.swift — DTTextStyle (the DESIGN §2.1 table), Font.dt.*, .dtFont(_:), dtTracking helpers and the
// kaomoji cascade (DESIGN §2.2). DECISIONS #5: every Font is built through UIFontDescriptor (variable Inter via wght/opsz axes,
// static Plex Mono by PostScript name) → UIFont → UIFontMetrics.scaledFont (the single Dynamic Type step) → Font.
// Never `.weight()` / `.bold()`, never `Font.custom`, never `@ScaledMetric` on a size, no clamp.
import SwiftUI
import UIKit

/// The two candidate faces for the feed's check text (DESIGN §2.3, DECISIONS #6). Flip `DTTextStyle.checkTextFace` to compare.
nonisolated enum CheckTextFace: Hashable, Sendable, CaseIterable {
    case inter, mono
}

nonisolated enum DTTextStyle: Hashable, Sendable, CaseIterable {
    case masthead, wordmark, display, title, checkText, headline, numeral, displayCount
    case body, bodySmall, meta, label, button, buttonLarge, badge, system, kaomoji

    /// The one-line switch of DESIGN §2.3: `.inter` (19/24/500) is the default; `.mono` (Plex 15/22/400) is the alternative.
    static let checkTextFace: CheckTextFace = .inter

    nonisolated enum Face: Hashable, Sendable {
        /// Inter variable, `wght` axis + optional `opsz`.
        case inter(wght: CGFloat, opsz: CGFloat?, tabular: Bool)
        /// A static IBM Plex Mono cut by PostScript name.
        case plex(PlexCut)
        /// Plex Medium with the DESIGN §2.2 cascade.
        case kaomoji
    }

    nonisolated enum PlexCut: String, Hashable, Sendable, CaseIterable {
        case regular = "IBMPlexMono"
        case medium = "IBMPlexMono-Medm"
        case semiBold = "IBMPlexMono-SmBld"
        case bold = "IBMPlexMono-Bold"
        case italic = "IBMPlexMono-Italic"

        /// Bold Text steps a Plex cut up one.
        var bolder: PlexCut {
            switch self {
            case .regular: .medium
            case .medium: .semiBold
            case .semiBold, .bold: .bold
            case .italic: .italic
            }
        }
    }

    /// The row of the §2.1 table: size / line height / face / tracking (em) / relativeTo / uppercase.
    nonisolated struct Spec: Hashable, Sendable {
        let size: CGFloat
        let lineHeight: CGFloat
        let face: Face
        let trackingEm: Double
        let relativeTo: UIFont.TextStyle
        let uppercase: Bool
    }

    var spec: Spec {
        switch self {
        case .masthead: Spec(size: 34, lineHeight: 36, face: .inter(wght: 700, opsz: 32, tabular: false), trackingEm: -0.04, relativeTo: .largeTitle, uppercase: false)
        case .wordmark: Spec(size: 26, lineHeight: 28, face: .inter(wght: 700, opsz: 28, tabular: false), trackingEm: -0.04, relativeTo: .title1, uppercase: false)
        case .display: Spec(size: 28, lineHeight: 32, face: .inter(wght: 600, opsz: 28, tabular: false), trackingEm: -0.04, relativeTo: .title1, uppercase: false)
        case .title: Spec(size: 22, lineHeight: 26, face: .inter(wght: 600, opsz: nil, tabular: false), trackingEm: -0.035, relativeTo: .title2, uppercase: false)
        case .checkText:
            switch Self.checkTextFace {
            case .inter: Spec(size: 19, lineHeight: 24, face: .inter(wght: 500, opsz: 14, tabular: false), trackingEm: -0.03, relativeTo: .title3, uppercase: false)
            case .mono: Spec(size: 15, lineHeight: 22, face: .plex(.regular), trackingEm: -0.03, relativeTo: .title3, uppercase: false)
            }
        case .headline: Spec(size: 17, lineHeight: 22, face: .inter(wght: 600, opsz: 14, tabular: false), trackingEm: -0.03, relativeTo: .headline, uppercase: false)
        case .numeral: Spec(size: 40, lineHeight: 44, face: .inter(wght: 700, opsz: 32, tabular: true), trackingEm: -0.04, relativeTo: .largeTitle, uppercase: false)
        case .displayCount: Spec(size: 44, lineHeight: 48, face: .inter(wght: 700, opsz: 32, tabular: true), trackingEm: -0.04, relativeTo: .largeTitle, uppercase: false)
        case .body: Spec(size: 14, lineHeight: 20, face: .plex(.regular), trackingEm: -0.02, relativeTo: .subheadline, uppercase: false)
        case .bodySmall: Spec(size: 13, lineHeight: 18, face: .plex(.regular), trackingEm: -0.03, relativeTo: .footnote, uppercase: false)
        case .meta: Spec(size: 11, lineHeight: 14, face: .plex(.regular), trackingEm: -0.02, relativeTo: .caption1, uppercase: false)
        case .label: Spec(size: 10, lineHeight: 12, face: .plex(.medium), trackingEm: 0.12, relativeTo: .caption2, uppercase: true)
        case .button: Spec(size: 12, lineHeight: 16, face: .plex(.bold), trackingEm: 0.06, relativeTo: .caption1, uppercase: true)
        case .buttonLarge: Spec(size: 14, lineHeight: 18, face: .plex(.bold), trackingEm: 0.10, relativeTo: .subheadline, uppercase: true)
        case .badge: Spec(size: 9, lineHeight: 10, face: .plex(.bold), trackingEm: 0.10, relativeTo: .caption2, uppercase: true)
        case .system: Spec(size: 12, lineHeight: 16, face: .plex(.italic), trackingEm: 0, relativeTo: .caption1, uppercase: false)
        case .kaomoji: Spec(size: 13, lineHeight: 16, face: .kaomoji, trackingEm: 0, relativeTo: .footnote, uppercase: false)
        }
    }

    var size: CGFloat { spec.size }
    var relativeTo: UIFont.TextStyle { spec.relativeTo }
    var trackingEm: Double { spec.trackingEm }
    var uppercase: Bool { spec.uppercase }

    /// Tracking in points at the default size (what `.tracking()` takes).
    var trackingPt: CGFloat { CGFloat(trackingEm) * size }

    /// Line spacing to add for the table's line height (Inter's natural ≈ 1.21×, Plex Mono ≈ 1.30×).
    var lineSpacing: CGFloat {
        let natural: CGFloat
        switch spec.face {
        case .inter: natural = 1.21
        case .plex, .kaomoji: natural = 1.30
        }
        return max(0, spec.lineHeight - size * natural)
    }

    // MARK: Descriptor pipeline

    static let interName = "InterVariable"
    static let wghtTag: Int = 0x7767_6874
    static let opszTag: Int = 0x6F70_737A
    static let variationKey = UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String)

    /// The unscaled descriptor for this style. `bold` is the system Bold Text setting (`wght + 100` / one Plex cut up).
    nonisolated func descriptor(size overrideSize: CGFloat? = nil, bold: Bool = false, face overrideFace: Face? = nil) -> UIFontDescriptor {
        let s = overrideSize ?? size
        switch overrideFace ?? spec.face {
        case .inter(let wght, let opsz, let tabular):
            var variation: [Int: CGFloat] = [Self.wghtTag: min(900, wght + (bold ? 100 : 0))]
            if let opsz { variation[Self.opszTag] = opsz }
            var attrs: [UIFontDescriptor.AttributeName: Any] = [
                .name: Self.interName,
                Self.variationKey: variation,
            ]
            if tabular {
                attrs[.featureSettings] = [[
                    UIFontDescriptor.FeatureKey.type: kNumberSpacingType,
                    UIFontDescriptor.FeatureKey.selector: kMonospacedNumbersSelector,
                ]]
            }
            return UIFontDescriptor(fontAttributes: attrs).withSize(s)
        case .plex(let cut):
            return UIFontDescriptor(name: (bold ? cut.bolder : cut).rawValue, size: s)
        case .kaomoji:
            return Self.kaomojiDescriptor(size: s)
        }
    }

    /// DESIGN §2.2: Plex Medium with an explicit cascade so kaomoji render in one width/weight instead of per-glyph fallback.
    nonisolated static func kaomojiDescriptor(size s: CGFloat) -> UIFontDescriptor {
        let base = UIFontDescriptor(name: PlexCut.medium.rawValue, size: s)
        let cascade: [UIFontDescriptor] = [
            UIFontDescriptor(name: "HiraginoSans-W3", size: s),        // ω ◡ ◕ ■ ˘ — iOS ships W3/W6/W7 only
            UIFontDescriptor(name: "AppleSDGothicNeo-Medium", size: s),  // ᴗ ◍ ⌐ ¯
            UIFont.systemFont(ofSize: s).fontDescriptor,                 // SF / Apple Symbols / Geneva fallbacks
        ]
        return base.addingAttributes([.cascadeList: cascade])
    }

    /// The UIFont after the single Dynamic Type scaling step.
    nonisolated func uiFont(size overrideSize: CGFloat? = nil, bold: Bool = false, face: Face? = nil, compatibleWith traits: UITraitCollection? = nil) -> UIFont {
        let s = overrideSize ?? size
        let base = UIFont(descriptor: descriptor(size: s, bold: bold, face: face), size: s)
        return UIFontMetrics(forTextStyle: relativeTo).scaledFont(for: base, compatibleWith: traits)
    }

    nonisolated func font(size: CGFloat? = nil, bold: Bool = false, face: Face? = nil, compatibleWith traits: UITraitCollection? = nil) -> Font {
        Font(uiFont(size: size, bold: bold, face: face, compatibleWith: traits))
    }

    /// The scaled tracking in points for the current Dynamic Type traits (DESIGN §2: `.tracking()` does not scale by itself).
    nonisolated func scaledTracking(compatibleWith traits: UITraitCollection? = nil, halve: Bool = false) -> CGFloat {
        let scaled = UIFontMetrics(forTextStyle: relativeTo).scaledValue(for: size, compatibleWith: traits)
        return CGFloat(trackingEm) * scaled * (halve ? 0.5 : 1)
    }
}

/// `Font.dt.<style>` — computed properties, not stored constants, so a size change re-resolves.
extension Font {
    enum dt {
        static var masthead: Font { DTTextStyle.masthead.font() }
        static var wordmark: Font { DTTextStyle.wordmark.font() }
        static var display: Font { DTTextStyle.display.font() }
        static var title: Font { DTTextStyle.title.font() }
        static var checkText: Font { DTTextStyle.checkText.font() }
        static var headline: Font { DTTextStyle.headline.font() }
        static var numeral: Font { DTTextStyle.numeral.font() }
        static var displayCount: Font { DTTextStyle.displayCount.font() }
        static var body: Font { DTTextStyle.body.font() }
        static var bodySmall: Font { DTTextStyle.bodySmall.font() }
        static var meta: Font { DTTextStyle.meta.font() }
        static var label: Font { DTTextStyle.label.font() }
        static var button: Font { DTTextStyle.button.font() }
        static var buttonLarge: Font { DTTextStyle.buttonLarge.font() }
        static var badge: Font { DTTextStyle.badge.font() }
        static var system: Font { DTTextStyle.system.font() }
        /// Kaomoji at a given size (avatar diameter × 0.36, min 9; or the host style's size in running text).
        static func kaomoji(size: CGFloat) -> Font { DTTextStyle.kaomoji.font(size: max(9, size)) }
        /// The Inter avatar letter (600) at a given size.
        static func avatarLetter(size: CGFloat) -> Font { DTTextStyle.headline.font(size: size, face: .inter(wght: 600, opsz: 14, tabular: false)) }
        /// A tabular Inter numeral at a custom size (chat countdown at 20, squad-size stepper at 28).
        static func numeral(size: CGFloat) -> Font { DTTextStyle.numeral.font(size: size) }
    }
}

// MARK: - Dynamic Type bridging

extension DynamicTypeSize {
    var uiContentSizeCategory: UIContentSizeCategory {
        switch self {
        case .xSmall: .extraSmall
        case .small: .small
        case .medium: .medium
        case .large: .large
        case .xLarge: .extraLarge
        case .xxLarge: .extraExtraLarge
        case .xxxLarge: .extraExtraExtraLarge
        case .accessibility1: .accessibilityMedium
        case .accessibility2: .accessibilityLarge
        case .accessibility3: .accessibilityExtraLarge
        case .accessibility4: .accessibilityExtraExtraLarge
        case .accessibility5: .accessibilityExtraExtraExtraLarge
        @unknown default: .large
        }
    }

    var traits: UITraitCollection { UITraitCollection(preferredContentSizeCategory: uiContentSizeCategory) }
}

/// The `.dtFont(_:)` modifier: font + scaled tracking + `.textCase(.uppercase)` where the style says + line spacing, re-resolved on
/// every `\.dynamicTypeSize` / `\.legibilityWeight` change. Tracking halves above `.xxLarge` for uppercase styles (DESIGN §8).
private struct DTFontModifier: ViewModifier {
    let style: DTTextStyle
    let size: CGFloat?
    let face: DTTextStyle.Face?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.legibilityWeight) private var legibilityWeight

    func body(content: Content) -> some View {
        let traits = dynamicTypeSize.traits
        let halve = style.uppercase && dynamicTypeSize > .xxLarge
        let tracking = style.scaledTracking(compatibleWith: traits, halve: halve) * ((size ?? style.size) / style.size)
        content
            .font(style.font(size: size, bold: legibilityWeight == .bold, face: face, compatibleWith: traits))
            .tracking(tracking)
            .textCase(style.uppercase ? .uppercase : nil)
            .lineSpacing(style.lineSpacing)
            .padding(.trailing, tracking > 0 ? -tracking : 0)   // trailing tracking is trimmed (DESIGN §2.3)
    }
}

extension View {
    /// Sets a DESIGN §2.1 style. `size` overrides the point size (kaomoji in avatars, the chat countdown at 20).
    func dtFont(_ style: DTTextStyle, size: CGFloat? = nil, face: DTTextStyle.Face? = nil) -> some View {
        modifier(DTFontModifier(style: style, size: size, face: face))
    }

    /// The View-level tracking variant, re-evaluated on Dynamic Type changes.
    func dtTracked(_ style: DTTextStyle) -> some View { modifier(DTTrackedModifier(style: style)) }
}

private struct DTTrackedModifier: ViewModifier {
    let style: DTTextStyle
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    func body(content: Content) -> some View {
        content.tracking(style.scaledTracking(compatibleWith: dynamicTypeSize.traits, halve: style.uppercase && dynamicTypeSize > .xxLarge))
    }
}

extension Text {
    /// `Text`-level tracking in em, scaled for Dynamic Type at call time (the metric is pure and cheap).
    func dtTracking(_ em: Double, style: DTTextStyle, compatibleWith traits: UITraitCollection? = nil) -> Text {
        let scaled = UIFontMetrics(forTextStyle: style.relativeTo).scaledValue(for: style.size, compatibleWith: traits)
        return tracking(CGFloat(em) * scaled)
    }

    /// A `Text` set in a style (for concatenation: `Text("kat").dtStyle(.meta) + Text(" · ")`).
    func dtStyle(_ style: DTTextStyle, size: CGFloat? = nil, bold: Bool = false, face: DTTextStyle.Face? = nil) -> Text {
        font(style.font(size: size, bold: bold, face: face)).tracking(style.trackingPt * ((size ?? style.size) / style.size))
    }
}

/// Strips the zero-width characters `censor.ts` leaves in kaomoji so width measurement and `minimumScaleFactor` behave (DESIGN §2.2).
nonisolated extension String {
    var dtStrippingZeroWidth: String {
        String(unicodeScalars.filter { $0 != "\u{200B}" && $0 != "\u{200C}" && $0 != "\u{FEFF}" })
    }
}

/// A kaomoji `Text`: single line, `.minimumScaleFactor(0.6)`, "mystery host" for VoiceOver (DESIGN §2.2).
struct KaomojiText: View {
    let kaomoji: String
    let size: CGFloat
    var accessibilityLabel = "mystery host"

    var body: some View {
        Text(kaomoji.dtStrippingZeroWidth)
            .dtFont(.kaomoji, size: max(9, size))
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .accessibilityLabel(accessibilityLabel)
    }
}
