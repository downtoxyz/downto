// App/RootView.swift — PLACEHOLDER. The real RootView switches on resolveGate(...) (ARCHITECTURE §6.1);
// until the stores and DesignSystem land this is a cream page with the wordmark so the pipeline has something to launch.
import SwiftUI

struct RootView: View {
    var body: some View {
        ZStack {
            // #FCFFE2 — DESIGN §1.2 `Color.paper`; inlined here only because DesignSystem/Tokens does not exist yet.
            Color(red: 0xFC / 255, green: 0xFF / 255, blue: 0xE2 / 255)
                .ignoresSafeArea()
            Text("down to")
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(Color(red: 0x2A / 255, green: 0x2A / 255, blue: 0x1A / 255))
                .accessibilityIdentifier("wordmark")
        }
    }
}

#Preview {
    RootView()
}
