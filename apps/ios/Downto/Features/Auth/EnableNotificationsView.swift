// Features/Auth/EnableNotificationsView.swift — the one-time push ask (DESIGN §7.3). Skip → dt.seenNotifPrompt.
import SwiftUI

struct EnableNotificationsView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var asking = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer()
            Text("we'll tell you when someone's down.").dtFont(.display).foregroundStyle(Color.ink)
            mockRow.padding(.top, 32)
            Spacer()
        }
        .padding(.horizontal, Space.gutter)
        .background(Color.paper)
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 8) {
                DTButton(title: "ENABLE", variant: .primary, size: .buttonLarge, disabled: asking) {
                    asking = true
                    Task { await env.push.requestPermission(); finish() }
                }
                DTButton(title: "SKIP", variant: .text) { finish() }
            }
            .padding(.horizontal, Space.gutter).padding(.bottom, 8)
            .background(Color.paper)
        }
    }

    private func finish() { Defaults.seenNotifPrompt = true; asking = false; env.profile.objectWillChangeNudge() }

    private var mockRow: some View {
        HStack(alignment: .top, spacing: 12) {
            RoundedRectangle(cornerRadius: 8).fill(Color.dt).frame(width: 36, height: 36)
                .overlay { Text("✶").dtFont(.headline).foregroundStyle(Color.onDt) }
            VStack(alignment: .leading, spacing: 2) {
                HStack { Text("down to").dtFont(.bodySmall).foregroundStyle(Color.ink); Spacer(); Text("now").dtFont(.meta).foregroundStyle(Color.inkMuted) }
                Text("sara is down for movie night").dtFont(.body).foregroundStyle(Color.ink)
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 16).fill(Color.deep))
    }
}
