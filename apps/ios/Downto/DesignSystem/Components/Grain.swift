// DesignSystem/Components/Grain.swift — DESIGN §1.4. Mounted once on the root ZStack above everything, and once per sheet inside
// `.dtSheet` (native sheets render in their own window). Never animates; removed under Reduce Transparency / Increase Contrast (§8).
import SwiftUI

struct Grain: View {
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.dtIncreaseContrast) private var increaseContrast

    var body: some View {
        if !reduceTransparency && !increaseContrast {
            Image("grain-256")
                .resizable(resizingMode: .tile)
                .opacity(scheme == .dark ? 0.045 : 0.03)
                .blendMode(scheme == .dark ? .plusLighter : .multiply)
                .allowsHitTesting(false)
                .ignoresSafeArea()
                .accessibilityHidden(true)
        }
    }
}

extension View {
    /// Lays the grain over this view (root ZStack, sheet shell).
    func dtGrain() -> some View { overlay { Grain() } }
}

#Preview("Grain over paper") {
    ZStack {
        Color.paper.ignoresSafeArea()
        VStack(spacing: 12) {
            Text("grain at 0.03 multiply").dtFont(.body).foregroundStyle(Color.ink)
            Radius.shape(Radius.m).fill(Color.surface).frame(height: 80)
        }
        .padding(Space.gutter)
    }
    .dtGrain()
}
