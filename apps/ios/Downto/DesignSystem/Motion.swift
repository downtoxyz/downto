// DesignSystem/Motion.swift — DTSpring.* and the Reduce Motion resolver (DESIGN §5, §8; DECISIONS #7).
// SwiftUI owns `Spring`, so the app's enum is `DTSpring`; DESIGN writes `Spring.page` and means `DTSpring.page`.
import SwiftUI

nonisolated enum DTSpring {
    /// A page turning and lying flat — sheet stagger, Folio underline, toasts, NEW flag, list insertion.
    static let page: Animation = .spring(response: 0.42, dampingFraction: 0.86)
    /// No bounce — expiry width, poll bars, tint/opacity changes, reflow, numeric rolls, un-down.
    static let settle: Animation = .spring(response: 0.55, dampingFraction: 1.00)
    /// Firm — pull hold, toast release, chip selection, handle widen.
    static let snap: Animation = .spring(response: 0.35, dampingFraction: 0.80)
    /// Quick, slight give — press-down/up, avatar fan-out, pill toggles, "+" press.
    static let ink: Animation = .spring(response: 0.26, dampingFraction: 0.72)
    /// Thunk with overshoot — the DOWN stamp, SQUAD FORMED, unread dot, avatar insertion.
    static let stamp: Animation = .spring(response: 0.22, dampingFraction: 0.55)
    /// Slow, ceremonial — mystery reveal only.
    static let reveal: Animation = .spring(response: 0.70, dampingFraction: 0.90)

    /// The dampingFraction of each named spring, for `Motion.resolve` (springs under 0.86 bounce and are flattened under Reduce Motion).
    nonisolated enum Named: Hashable, Sendable, CaseIterable {
        case page, settle, snap, ink, stamp, reveal

        var animation: Animation {
            switch self {
            case .page: DTSpring.page
            case .settle: DTSpring.settle
            case .snap: DTSpring.snap
            case .ink: DTSpring.ink
            case .stamp: DTSpring.stamp
            case .reveal: DTSpring.reveal
            }
        }

        var damping: Double {
            switch self {
            case .page: 0.86
            case .settle: 1.00
            case .snap: 0.80
            case .ink: 0.72
            case .stamp: 0.55
            case .reveal: 0.90
            }
        }
    }
}

/// Fixed-duration curves are used only for masks/wipes, press-in and colour crossfades (DESIGN §5). Labelled forms only.
nonisolated enum DTCurve {
    static let pressIn: Animation = .easeOut(duration: 0.06)
    static let wipe: Animation = .linear(duration: 0.16)
    static let wipeShort: Animation = .linear(duration: 0.14)
    static let crossfade: Animation = .easeInOut(duration: 0.20)
    static let crossfadeLong: Animation = .easeInOut(duration: 0.25)
    static let bandDye: Animation = .snappy(duration: 0.45)
    static let ruleDraw: Animation = .easeOut(duration: 0.22)
    /// Stagger per item (max 6 staggered, the rest arrive together).
    static let stagger: Double = 0.04
    static let maxStaggered = 6
}

/// Every motion decision goes through here so call sites never branch on the Reduce Motion flag themselves.
nonisolated enum Motion {
    /// Maps every spring with damping < 0.86 to `DTSpring.settle` when Reduce Motion is on; springs at or above are kept.
    static func resolve(_ spring: DTSpring.Named, reduceMotion: Bool) -> Animation {
        guard reduceMotion else { return spring.animation }
        return spring.damping < 0.86 ? DTSpring.settle : spring.animation
    }

    /// Any fixed curve becomes a plain 120ms crossfade under Reduce Motion.
    static func resolve(_ curve: Animation, reduceMotion: Bool) -> Animation {
        reduceMotion ? .easeInOut(duration: 0.12) : curve
    }

    /// Offsets, scale and mask radii are disabled under Reduce Motion: returns `identity` (0 for offsets, 1 for scales).
    static func offset(_ value: CGFloat, reduceMotion: Bool) -> CGFloat { reduceMotion ? 0 : value }
    static func scale(_ value: CGFloat, reduceMotion: Bool) -> CGFloat { reduceMotion ? 1 : value }

    /// Stagger delay for item `index` (DESIGN §5: 40ms per item, the first six only).
    static func staggerDelay(_ index: Int, reduceMotion: Bool) -> Double {
        reduceMotion ? 0 : Double(min(index, DTCurve.maxStaggered)) * DTCurve.stagger
    }
}

extension View {
    /// Overrides the Reduce Motion flag for a subtree (the gallery's "Reduce Motion" column, snapshot tests).
    func dtReduceMotion(_ on: Bool) -> some View { environment(\.dtReduceMotionOverride, on) }

    /// Every ticking number: digits roll instead of snapping, animated with `DTSpring.settle` (DESIGN §2.3).
    func dtNumeric<V: Equatable>(_ value: V, countsDown: Bool = false) -> some View {
        contentTransition(.numericText(countsDown: countsDown))
            .animation(DTSpring.settle, value: value)
    }
}
