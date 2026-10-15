// DesignSystem/Components/ExpiryRule.swift — DESIGN §4.2 (DECISIONS #18). Full-bleed 2pt → 3pt past 75%, dt → danger crossfade,
// shimmer on the top timed entry only, `accessibilityHidden` (the "Xh left" label carries the value).
import SwiftUI

/// The view's read of a check's timer: how much has elapsed and the label the byline shows. The store's `ExpiryState` maps onto this.
nonisolated struct EntryExpiry: Hashable, Sendable {
    /// 0 (just posted) … 1 (expired).
    let elapsedFraction: Double
    /// "3h left", "4m 12s left", "expired".
    let label: String
    var isExpired: Bool { elapsedFraction >= 1 }
    var isDanger: Bool { elapsedFraction > 0.75 && !isExpired }
}

struct ExpiryRule: View {
    let expiry: EntryExpiry
    /// Only the top entry of TIMED shimmers.
    var isTopOfSection = false

    @Environment(\.dtReduceMotion) private var reduceMotion

    private var thickness: CGFloat { expiry.isDanger ? 3 : 2 }
    private var fillFraction: CGFloat { CGFloat(max(0, min(1, 1 - expiry.elapsedFraction))) }

    var body: some View {
        GeometryReader { geo in
            let width = geo.size.width * fillFraction
            ZStack(alignment: .leading) {
                Rectangle().fill(expiry.isExpired ? Color.inkFaint : Color.ruleLight)
                if !expiry.isExpired {
                    Rectangle()
                        .fill(fill)
                        .frame(width: width)
                        .overlay(alignment: .leading) {
                            if isTopOfSection && !reduceMotion { Shimmer(width: width) }
                        }
                        .clipped()
                }
            }
            .animation(DTSpring.settle, value: expiry.elapsedFraction)
        }
        .frame(height: thickness)
        .animation(DTSpring.settle, value: thickness)
        .accessibilityHidden(true)
    }

    private var fill: some ShapeStyle {
        // dt → danger crossfade across the last 25%; under Increase Contrast the fill is remapped (track stays ruleLight, §4.2).
        if expiry.isDanger { return AnyShapeStyle(Color.danger) }
        return AnyShapeStyle(DTContrastAware(token: .expiryFill))
    }

    /// A 60pt `clear → white@0.35 → clear` gradient sweeping every 4.0s easeInOut (DESIGN §4.2).
    private struct Shimmer: View {
        let width: CGFloat
        @State private var sweep = false

        var body: some View {
            LinearGradient(colors: [.clear, .white.opacity(0.35), .clear], startPoint: .leading, endPoint: .trailing)
                .frame(width: 60)
                .blendMode(.plusLighter)
                .offset(x: sweep ? width : -60)
                .onAppear {
                    withAnimation(.easeInOut(duration: 4.0).repeatForever(autoreverses: false)) { sweep = true }
                }
        }
    }
}

#Preview("ExpiryRule") {
    VStack(spacing: 24) {
        ForEach([0.1, 0.5, 0.8, 1.0], id: \.self) { f in
            ExpiryRule(expiry: EntryExpiry(elapsedFraction: f, label: "\(Int((1 - f) * 10))h left"), isTopOfSection: f == 0.1)
        }
    }
    .padding(.vertical)
    .background(Color.paper)
}
