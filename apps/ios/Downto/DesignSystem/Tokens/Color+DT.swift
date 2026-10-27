// DesignSystem/Tokens/Color+DT.swift — DESIGN §1.2–§1.3 (colour sets), the `\.paperStock` stock rule, the stock-resolving
// ShapeStyles and the Increase Contrast / Reduce Transparency remaps of DESIGN §8. Views never see hex.
import SwiftUI

// MARK: - Asset Catalog tokens

private final class DTBundleToken {}

nonisolated extension Color {
    /// Every token is an Asset Catalog colour set (Any + Dark) under Resources/Assets.xcassets/Colors — see scripts/gen-colors.py.
    private static func dt(_ name: String) -> Color {
        Color(Edition.current == .dragonfruit ? "df_\(name)" : name, bundle: Bundle(for: DTBundleToken.self))
    }

    // Stocks
    static var paper: Color { dt("paper") }
    static var card: Color { dt("card") }
    static var surface: Color { dt("surface") }
    static var deep: Color { dt("deep") }
    // Ink
    static var ink: Color { dt("ink") }
    static var inkMuted: Color { dt("inkMuted") }
    static var inkMutedOnSurface: Color { dt("inkMutedOnSurface") }
    static var inkExpired: Color { dt("inkExpired") }
    static var inkDim: Color { dt("inkDim") }
    static var inkFaint: Color { dt("inkFaint") }
    // Rules
    static var rule: Color { dt("rule") }
    static var ruleLight: Color { dt("ruleLight") }
    static var ruleMid: Color { dt("ruleMid") }
    // Magenta
    static var dt: Color { dt("dt") }
    static var dtInk: Color { dt("dtInk") }
    static var dtInkOnSurface: Color { dt("dtInkOnSurface") }
    static var onDt: Color { dt("onDt") }
    static var dtFaint: Color { dt("dtFaint") }
    static var dtSubtle: Color { dt("dtSubtle") }
    static var dtLight: Color { dt("dtLight") }
    static var dtMid: Color { dt("dtMid") }
    // Semantic
    static var pool: Color { dt("pool") }
    static var poolInk: Color { dt("poolInk") }
    static var poolInkOnSurface: Color { dt("poolInkOnSurface") }
    static var squad: Color { dt("squad") }
    static var squadInk: Color { dt("squadInk") }
    static var squadInkOnSurface: Color { dt("squadInkOnSurface") }
    static var danger: Color { dt("danger") }
    static var dangerInk: Color { dt("dangerInk") }
    static var dangerInkOnSurface: Color { dt("dangerInkOnSurface") }
    static var success: Color { dt("success") }
    static var successInk: Color { dt("successInk") }
    static var successInkOnSurface: Color { dt("successInkOnSurface") }
    static var warn: Color { dt("warn") }
    static var warnInk: Color { dt("warnInk") }
    static var info: Color { dt("info") }
    static var unreadSquad: Color { dt("unreadSquad") }
    static var newLime: Color { dt("newLime") }
    static var newInk: Color { dt("newInk") }
    // Card-state tints (§1.3)
    static var checkMine: Color { dt("checkMine") }
    static var checkDown: Color { dt("checkDown") }
    static var checkNew: Color { dt("checkNew") }
    static var checkNewRule: Color { dt("checkNewRule") }
    static var waitlistBg: Color { dt("waitlistBg") }
    static var downIdle: Color { dt("downIdle") }
    static var downIdleRule: Color { dt("downIdleRule") }
    static var heroWash: Color { dt("heroWash") }
    static var heroWashDown: Color { dt("heroWashDown") }

    /// Every token name, for the gallery swatch page and the asset-presence test.
    static let dtTokenNames: [String] = [
        "paper", "card", "surface", "deep", "ink", "inkMuted", "inkMutedOnSurface", "inkExpired", "inkDim", "inkFaint",
        "rule", "ruleLight", "ruleMid", "dt", "dtInk", "dtInkOnSurface", "onDt", "dtFaint", "dtSubtle", "dtLight", "dtMid",
        "pool", "poolInk", "poolInkOnSurface", "squad", "squadInk", "squadInkOnSurface", "danger", "dangerInk", "dangerInkOnSurface",
        "success", "successInk", "successInkOnSurface", "warn", "warnInk", "info", "unreadSquad", "newLime", "newInk",
        "checkMine", "checkDown", "checkNew", "checkNewRule", "waitlistBg", "downIdle", "downIdleRule", "heroWash", "heroWashDown",
    ]

    static func dtToken(_ name: String) -> Color { dt(name) }
}

// MARK: - Paper stock (DESIGN §1.2 "the stock rule")

/// Which stock a view sits on. `.dtSheet` sets `.surface`; every `Color.deep` card sets `.deep` on its content.
nonisolated enum PaperStock: Hashable, Sendable {
    case paper, surface, deep

    var isDarkStock: Bool { self != .paper }

    /// The fill for this stock.
    var fill: Color {
        switch self {
        case .paper: .paper
        case .surface: .surface
        case .deep: .deep
        }
    }
}

nonisolated private struct PaperStockKey: EnvironmentKey {
    static let defaultValue: PaperStock = .paper
}

/// Optional override of the system Reduce Motion flag (the system value is read-only in the environment); the gallery and the
/// snapshot tests set it so the reduced choreography can be rendered on demand.
nonisolated private struct ReduceMotionOverrideKey: EnvironmentKey {
    static let defaultValue: Bool? = nil
}

nonisolated extension EnvironmentValues {
    var paperStock: PaperStock {
        get { self[PaperStockKey.self] }
        set { self[PaperStockKey.self] = newValue }
    }

    var dtReduceMotionOverride: Bool? {
        get { self[ReduceMotionOverrideKey.self] }
        set { self[ReduceMotionOverrideKey.self] = newValue }
    }

    /// The flag every motion helper reads: the override when set, else the system setting (DESIGN §5, §8).
    var dtReduceMotion: Bool { dtReduceMotionOverride ?? accessibilityReduceMotion }

    /// DESIGN §8 "Increase Contrast" lives on `colorSchemeContrast`, not `accessibilityContrast`.
    var dtIncreaseContrast: Bool { colorSchemeContrast == .increased }
}

extension View {
    /// Declares the stock this subtree sits on so `.dtInk`, `.inkMuted`, … resolve their surface variants.
    func paperStock(_ stock: PaperStock) -> some View { environment(\.paperStock, stock) }
}

// MARK: - Stock-resolving ShapeStyles

/// The coloured-ink tokens with a surface variant (DESIGN §1.2). `Text("OPEN →").foregroundStyle(.dtInk)` gives `#C400C6` on the
/// feed and `#A000A2` on a sheet without the call site knowing. Under Increase Contrast every `*Ink` resolves to its surface variant
/// on all stocks (DESIGN §8).
nonisolated enum DTInkToken: Hashable, Sendable, CaseIterable {
    case dtInk, inkMuted, squadInk, dangerInk, successInk, warnInk, poolInk

    nonisolated func resolve(stock: PaperStock, increaseContrast: Bool) -> Color {
        let dark = stock.isDarkStock || increaseContrast
        switch self {
        case .dtInk: return dark ? .dtInkOnSurface : .dtInk
        case .inkMuted: return dark ? .inkMutedOnSurface : .inkMuted
        case .squadInk: return dark ? .squadInkOnSurface : .squadInk
        case .dangerInk: return dark ? .dangerInkOnSurface : .dangerInk
        case .successInk: return dark ? .successInkOnSurface : .successInk
        case .warnInk: return .warnInk          // one value; on `deep` it is never text (DESIGN §1.2 hard floor)
        case .poolInk: return dark ? .poolInkOnSurface : .poolInk
        }
    }
}

nonisolated struct DTStockInk: ShapeStyle, Hashable, Sendable {
    let token: DTInkToken

    nonisolated func resolve(in environment: EnvironmentValues) -> Color {
        token.resolve(stock: environment.paperStock, increaseContrast: environment.dtIncreaseContrast)
    }
}

extension ShapeStyle where Self == DTStockInk {
    static var dtInk: DTStockInk { DTStockInk(token: .dtInk) }
    static var inkMuted: DTStockInk { DTStockInk(token: .inkMuted) }
    static var squadInk: DTStockInk { DTStockInk(token: .squadInk) }
    static var dangerInk: DTStockInk { DTStockInk(token: .dangerInk) }
    static var successInk: DTStockInk { DTStockInk(token: .successInk) }
    static var warnInk: DTStockInk { DTStockInk(token: .warnInk) }
    static var poolInk: DTStockInk { DTStockInk(token: .poolInk) }
}

/// The Increase Contrast / Reduce Transparency remaps of DESIGN §8 for the tokens that are not `*Ink`s.
nonisolated struct DTContrastAware: ShapeStyle, Hashable, Sendable {
    nonisolated enum Token: Hashable, Sendable {
        /// `inkDim` → `inkMuted` under Increase Contrast.
        case inkDim
        /// `inkFaint` → `inkDim` under Increase Contrast.
        case inkFaint
        /// `rule` → `ruleMid` under Increase Contrast.
        case rule
        /// A `Color.dt` fill → `dtInkOnSurface` under Increase Contrast (DOWN active pill, "+", send circle, primary CTAs, your avatar).
        case dtFill
        /// Text on a `dtFill` — `onDt`, or `paper` under Increase Contrast.
        case onDtFill
        /// The `dtFaint` press tint → opaque `ruleLight` under Reduce Transparency.
        case pressTint
        /// The expiry fill: `dt`, or `dtInkOnSurface` under Increase Contrast (the track stays `ruleLight`, §4.2).
        case expiryFill
    }

    let token: Token

    nonisolated func resolve(in environment: EnvironmentValues) -> Color {
        let hc = environment.dtIncreaseContrast
        switch token {
        case .inkDim: return hc ? .inkMuted : .inkDim
        case .inkFaint: return hc ? .inkDim : .inkFaint
        case .rule: return hc ? .ruleMid : .rule
        case .dtFill, .expiryFill: return hc ? .dtInkOnSurface : .dt
        case .onDtFill: return hc ? .paper : .onDt
        case .pressTint: return environment.accessibilityReduceTransparency ? .ruleLight : .dtFaint
        }
    }
}

extension ShapeStyle where Self == DTContrastAware {
    static var inkDim: DTContrastAware { DTContrastAware(token: .inkDim) }
    static var inkFaint: DTContrastAware { DTContrastAware(token: .inkFaint) }
    static var rule: DTContrastAware { DTContrastAware(token: .rule) }
    static var dtFill: DTContrastAware { DTContrastAware(token: .dtFill) }
    static var onDtFill: DTContrastAware { DTContrastAware(token: .onDtFill) }
    static var pressTint: DTContrastAware { DTContrastAware(token: .pressTint) }
    static var expiryFill: DTContrastAware { DTContrastAware(token: .expiryFill) }
}
