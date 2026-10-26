// Features/Auth/FirstCheckView.swift — FirstCheck = CreateOverlay in "first" mode (DESIGN §7.3). Skip → dt.skippedFirstCheck + glow.
import SwiftUI

struct FirstCheckView: View {
    @Environment(AppEnvironment.self) private var env

    var body: some View {
        CreateOverlay(mode: .first(onSkip: {
            Defaults.skippedFirstCheck = true
            Defaults.showAddGlow = true
            env.profile.objectWillChangeNudge()
        }, onPosted: {
            Defaults.skippedFirstCheck = true
            env.profile.objectWillChangeNudge()
        }))
    }
}

extension ProfileStore {
    /// `dt.skippedFirstCheck` lives in UserDefaults, which SwiftUI does not observe; nudging an observed property re-resolves the gate.
    func objectWillChangeNudge() { gateNudge &+= 1 }
}
