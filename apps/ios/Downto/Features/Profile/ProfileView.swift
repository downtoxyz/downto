// Downto/Features/Profile/ProfileView.swift — PLACEHOLDER (LANE: social). Replace this file wholesale; keep the type name and initializer so MainShell/Router compile.
import SwiftUI

struct ProfileView: View {
    @Environment(AppEnvironment.self) private var env
    var body: some View {
        VStack(spacing: 16) {
            Text(env.profile.me?.displayName ?? "you").dtFont(.display).foregroundStyle(Color.ink)
            DTButton(title: "LOG OUT", variant: .outline) { Task { await env.signOut() } }
            Spacer()
        }
        .padding(.top, 60)
        .frame(maxWidth: .infinity)
        .background(Color.paper)
    }
}
