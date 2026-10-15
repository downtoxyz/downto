// DesignSystem/Tokens/Layout.swift — Space / Radius / Elevation (DESIGN §3).
import SwiftUI

/// 4pt grid (DESIGN §3.1).
nonisolated enum Space {
    static let xxs: CGFloat = 2
    static let xs: CGFloat = 4
    static let s: CGFloat = 8
    static let m: CGFloat = 12
    static let l: CGFloat = 16
    static let xl: CGFloat = 20
    static let xxl: CGFloat = 24
    static let xxxl: CGFloat = 32
    static let huge: CGFloat = 48

    /// Page gutter — 20 (a broadsheet wants margin). Chat gutter — 16.
    static let gutter: CGFloat = 20
    static let chatGutter: CGFloat = 16
    /// Entry inner padding: 16 top/bottom, 20 sides.
    static let entryVertical: CGFloat = 16
    /// Section label: 24 above, 8 below.
    static let sectionAbove: CGFloat = 24
    static let sectionBelow: CGFloat = 8
    /// Sheet inner padding: 24 sides, 12 below the handle region.
    static let sheetGutter: CGFloat = 24
    static let sheetBelowHandle: CGFloat = 12
    /// Bottom content inset on scroll views = Folio height + safe area + this.
    static let scrollBottomExtra: CGFloat = 8
}

/// DESIGN §3.2. All rounded rects are `.continuous`.
nonisolated enum Radius {
    static let none: CGFloat = 0
    static let xs: CGFloat = 6
    static let s: CGFloat = 10
    static let m: CGFloat = 12
    static let l: CGFloat = 16
    static let sheet: CGFloat = 24
    static let pill: CGFloat = 999
    /// Squad-formed stamp: 8. Movie poster: 6.
    static let stamp: CGFloat = 8
    static let poster: CGFloat = 6

    static func shape(_ r: CGFloat) -> RoundedRectangle { RoundedRectangle(cornerRadius: r, style: .continuous) }
}

/// DESIGN §3.3. Paper has no ambient shadow; three levels.
nonisolated enum Elevation: Hashable, Sendable {
    case flat
    /// 1pt top rule `ruleMid` + paper-edge shadow y −1 + soft y 8 / blur 24 (the Folio uses only the rule).
    case laid
    /// y 12 / blur 32 ink@0.16 + 1pt rule `ruleMid`.
    case lifted
}

private struct ElevationModifier: ViewModifier {
    let level: Elevation
    let ruleOnly: Bool
    @Environment(\.colorScheme) private var scheme

    func body(content: Content) -> some View {
        switch level {
        case .flat:
            content
        case .laid:
            content
                .overlay(alignment: .top) { Rectangle().fill(Color.ruleMid).frame(height: 1) }
                .shadow(color: ruleOnly ? .clear : Color.ink.opacity(0.06), radius: 0, x: 0, y: -1)
                .shadow(color: ruleOnly ? .clear : (scheme == .dark ? Color.black.opacity(0.5) : Color.ink.opacity(0.10)), radius: 24, x: 0, y: 8)
        case .lifted:
            content
                .overlay { Radius.shape(Radius.m).stroke(Color.ruleMid, lineWidth: 1) }
                .shadow(color: Color.ink.opacity(0.16), radius: 32, x: 0, y: 12)
        }
    }
}

extension View {
    /// Applies a DESIGN §3.3 elevation. `ruleOnly` is the Folio exception (nothing is under the bottom of the page).
    func elevation(_ level: Elevation, ruleOnly: Bool = false) -> some View {
        modifier(ElevationModifier(level: level, ruleOnly: ruleOnly))
    }

    /// A 1pt `Color.rule` hairline on the given edge (the separator between full-bleed entries).
    func hairline(_ edge: VerticalEdge = .bottom, color: Color = .rule) -> some View {
        overlay(alignment: edge == .bottom ? .bottom : .top) { Rectangle().fill(color).frame(height: 1) }
    }
}
