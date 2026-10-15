// DesignSystem/Tokens/Color+DT.swift — DESIGN §1.2–§1.3 (colour sets), the `\.paperStock` stock rule, the stock-resolving
// ShapeStyles and the Increase Contrast / Reduce Transparency remaps of DESIGN §8. Views never see hex.
import SwiftUI

// MARK: - Asset Catalog tokens

private final class DTBundleToken {}

nonisolated extension Color {
    /// Every token is an Asset Catalog colour set (Any + Dark) under Resources/Assets.xcassets/Colors — see scripts/gen-colors.py.
    private static func dt(_ name: String) -> Color { Color(name, bundle: Bundle(for: DTBundleToken.self)) }

    // Stocks
    static let paper = dt("paper")
    static let card = dt("card")
    static let surface = dt("surface")
    static let deep = dt("deep")
    // Ink
    static let ink = dt("ink")
    static let inkMuted = dt("inkMuted")
    static let inkMutedOnSurface = dt("inkMutedOnSurface")
    static let inkExpired = dt("inkExpired")
    static let inkDim = dt("inkDim")
    static let inkFaint = dt("inkFaint")
    // Rules
    static let rule = dt("rule")
    static let ruleLight = dt("ruleLight")
    static let ruleMid = dt("ruleMid")
    // Magenta
    static let dt = dt("dt")
    static let dtInk = dt("dtInk")
    static let dtInkOnSurface = dt("dtInkOnSurface")
    static let onDt = dt("onDt")
    static let dtFaint = dt("dtFaint")
    static let dtSubtle = dt("dtSubtle")
    static let dtLight = dt("dtLight")
    static let dtMid = dt("dtMid")
    // Semantic
    static let pool = dt("pool")
    static let poolInk = dt("poolInk")
    static let poolInkOnSurface = dt("poolInkOnSurface")
    static let squad = dt("squad")
    static let squadInk = dt("squadInk")
    static let squadInkOnSurface = dt("squadInkOnSurface")
    static let danger = dt("danger")
    static let dangerInk = dt("dangerInk")
    static let dangerInkOnSurface = dt("dangerInkOnSurface")
    static let success = dt("success")
    static let successInk = dt("successInk")
    static let successInkOnSurface = dt("successInkOnSurface")
    static let warn = dt("warn")
    static let warnInk = dt("warnInk")
    static let info = dt("info")
    static let unreadSquad = dt("unreadSquad")
    static let newLime = dt("newLime")
    static let newInk = dt("newInk")
    // Card-state tints (§1.3)
    static let checkMine = dt("checkMine")
    static let checkDown = dt("checkDown")
    static let checkNew = dt("checkNew")
    static let checkNewRule = dt("checkNewRule")
    static let waitlistBg = dt("waitlistBg")
    static let downIdle = dt("downIdle")
    static let downIdleRule = dt("downIdleRule")
    static let heroWash = dt("heroWash")
    static let heroWashDown = dt("heroWashDown")

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
