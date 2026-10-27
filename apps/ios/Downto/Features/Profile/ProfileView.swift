// Features/Profile/ProfileView.swift — the "You" tab (DESIGN §7.10; ARCHITECTURE §15 "Profile"). Sync-to-calendar and Theme rows hidden (§15.1).
import SwiftUI
import UIKit

struct ProfileView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.scenePhase) private var scenePhase
    @State private var haptics = Defaults.hapticsEnabled
    @State private var pushPref = true
    @State private var confirm: DTConfirm?
    @State private var showDelete = false
    @State private var copiedFlash = false
    @State private var copies = 0
    @State private var loggingOut = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header.padding(.top, 24)
                if let me = env.profile.me {
                    AvailabilitySlider(value: me.availability) { a in Task { try? await env.profile.update(ProfilePatch(availability: .some(a))) } }
                        .padding(.top, 20)
                }
                leftChecks
                people
                settings
                ArchivedChecksSection()
                BlockedUsersSection()
                account
                Color.clear.frame(height: 32)
            }
            .padding(.horizontal, Space.gutter)
        }
        .background(Color.paper)
        .task { await env.profile.loadArchived(); await env.push.refreshAuthorization() }
        .onChange(of: scenePhase) { _, p in if p == .active { Task { await env.push.refreshAuthorization() } } }
        .onChange(of: haptics) { _, v in Defaults.hapticsEnabled = v }
        .dtConfirmDialog($confirm) { a in
            switch a.title {
            case "LOG OUT": loggingOut = true; Task { await env.signOut() }
            case "RESET": Task { await env.profile.resetOnboarding() }
            default: break
            }
        }
        .sheet(isPresented: $showDelete) { DeleteAccountSheet() }
        .dtFeedback(.impact(weight: .light), trigger: copies)
    }

    // MARK: Header

    private var header: some View {
        let me = env.profile.me
        let ref = me?.personRef(me: env.me) ?? PersonRef(id: env.me ?? UserID(UUID()), displayName: "you", username: "", avatarLetter: "?", isMe: true)
        return HStack(alignment: .top, spacing: 16) {
            AvatarLetter(presence: .person(ref), size: .display)
            VStack(alignment: .leading, spacing: 4) {
                Text(me?.displayName ?? "you").dtFont(.display).foregroundStyle(Color.ink).lineLimit(2)
                Text("@\(me?.username ?? "")").dtFont(.body).foregroundStyle(.inkMuted)
                Button { env.router.present(.editProfile) } label: {
                    Text("EDIT").dtFont(.label).foregroundStyle(.dtInk).frame(minHeight: 32)
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: Sections

    @ViewBuilder private var leftChecks: some View {
        let left = env.feed.leftChecks
        if !left.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                SectionLabel(text: "checks you left", count: left.count).padding(.leading, -Space.gutter)
                ForEach(left) { c in
                    ColophonRow(title: c.text) {
                        DTButton(title: "DOWN ?", variant: .outline) { Task { await env.feed.toggleDown(c.id) } }
                    }
                }
            }
        }
    }

    private var people: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionLabel(text: "people").padding(.leading, -Space.gutter)
            ColophonRow(title: "friends", action: { env.router.present(.friends(tab: .friends)) }) {
                HStack(spacing: 8) {
                    if !env.friends.incoming.isEmpty { NotificationDot() }
                    Text("\(env.friends.friends.count)").dtFont(.meta).foregroundStyle(.inkMuted).dtNumeric(env.friends.friends.count)
                    Text("›").dtFont(.body).foregroundStyle(.inkMuted)
                }
            }
            if let ig = env.profile.me?.igHandle, !ig.isEmpty, let url = URL(string: "https://instagram.com/\(ig)") {
                ColophonRow(title: "instagram", action: { UIApplication.shared.open(url) }) {
                    Text("@\(ig)").dtFont(.meta).foregroundStyle(.dtInk)
                }
            }
        }
    }

    private var settings: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionLabel(text: "settings").padding(.leading, -Space.gutter)
            ColophonRow(title: "haptics") {
                Toggle("", isOn: $haptics).labelsHidden().tint(Color.dt).accessibilityLabel("haptics")
            }
            notificationsRow
            ColophonRow(title: "edition") {
                Picker("edition", selection: Binding(get: { env.edition.current }, set: { env.edition.set($0) })) {
                    ForEach(Edition.allCases, id: \.self) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 200)
                .accessibilityLabel("edition")
            }
        }
    }

    @ViewBuilder private var notificationsRow: some View {
        switch env.push.authorization {
        case .authorized, .provisional, .ephemeral:
            ColophonRow(title: "notifications") {
                Toggle("", isOn: $pushPref).labelsHidden().tint(Color.dt).accessibilityLabel("notifications")
                    .onChange(of: pushPref) { _, on in
                        Task { if on { env.push.registerIfAuthorized(); await env.push.syncIfNeeded() } else { await env.push.unregister() } }
                    }
            }
            .onAppear { pushPref = Defaults.pushRegisteredForUser == env.me }
        case .denied:
            VStack(alignment: .leading, spacing: 4) {
                ColophonRow(title: "notifications", action: openSettings) {
                    HStack(spacing: 8) {
                        Text("off in settings").dtFont(.meta).foregroundStyle(.inkMuted)
                        Text("OPEN SETTINGS →").dtFont(.button).foregroundStyle(.dtInk)
                    }
                }
                Text("you'll miss 'X is down' — turn it on in Settings").dtFont(.meta).foregroundStyle(.inkMuted).padding(.bottom, 8)
            }
        default:
            ColophonRow(title: "notifications", action: { Task { await env.push.requestPermission() } }) {
                Text("ENABLE").dtFont(.button).foregroundStyle(.dtInk)
            }
        }
    }

    private var account: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionLabel(text: "account").padding(.leading, -Space.gutter)
            if env.profile.me?.isTest == true {
                ColophonRow(title: "reset onboarding", titleStyle: AnyShapeStyle(.warnInk), action: {
                    confirm = DTConfirm("reset onboarding?", message: "test accounts only — you'll go back to setup", actions: [.init("RESET", destructive: true)])
                }) { EmptyView() }
            }
            ColophonRow(title: "about") {
                Text(env.config.build).dtFont(.meta).foregroundStyle(.inkMuted)
            }
            .background(copiedFlash ? Color.checkDown : Color.clear)
            .animation(.easeOut(duration: 0.6), value: copiedFlash)
            .onLongPressGesture(minimumDuration: 0.6) {
                UIPasteboard.general.string = env.config.build
                copies += 1
                copiedFlash = true
                Task { try? await Task.sleep(for: .milliseconds(500)); copiedFlash = false }
            }
            ColophonRow(title: loggingOut ? "logging out…" : "log out", action: {
                confirm = DTConfirm("log out?", actions: [.init("LOG OUT")])
            }) { EmptyView() }
            ColophonRow(title: "delete account", titleStyle: AnyShapeStyle(.dangerInk), action: { showDelete = true }) { EmptyView() }
        }
    }

    private func openSettings() {
        if let url = URL(string: UIApplication.openNotificationSettingsURLString) { UIApplication.shared.open(url) }
    }
}

/// Type-your-username confirm (DESIGN §7.10 "Delete account").
struct DeleteAccountSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var typed = ""
    @State private var deleting = false
    @FocusState private var focused: Bool

    private var username: String { env.profile.me?.username ?? "" }
    private var matches: Bool { !username.isEmpty && typed.lowercased() == username }

    var body: some View {
        DTSheetShell(title: "delete account") {
            VStack(alignment: .leading, spacing: 20) {
                Text("this deletes your checks, squads and messages. type @\(username) to confirm.").dtFont(.body).foregroundStyle(Color.ink)
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 2) {
                        Text("@").dtFont(.title).foregroundStyle(.inkDim)
                        TextField("", text: $typed, prompt: Text(username).foregroundStyle(Color.inkFaint))
                            .dtFont(.title).foregroundStyle(Color.ink)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                            .focused($focused)
                    }
                    Rectangle().fill(matches ? Color.danger : Color.ruleMid).frame(height: matches ? 2 : 1).animation(DTSpring.settle, value: matches)
                }
                Button {
                    deleting = true
                    Task {
                        do { try await env.deleteAccount(); dismiss() }
                        catch { env.toasts.show(AppError(error).toastCopy, style: .error); deleting = false }
                    }
                } label: {
                    Text(deleting ? "DELETING" : "DELETE MY ACCOUNT").dtFont(.buttonLarge)
                        .foregroundStyle(matches ? Color.paper : Color.inkFaint)
                        .frame(maxWidth: .infinity).frame(height: 52)
                        .background(Capsule().fill(matches ? Color.danger : Color.clear))
                        .overlay { if !matches { Capsule().strokeBorder(Color.inkFaint, lineWidth: 1) } }
                        .animation(DTSpring.settle, value: matches)
                }
                .buttonStyle(DTPressStyle())
                .disabled(!matches || deleting)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, Space.sheetGutter)
            .padding(.top, 8)
        }
        .presentationDetents([.fraction(0.5), .large])
        .presentationBackground(Color.surface)
        .presentationCornerRadius(Radius.sheet)
        .presentationDragIndicator(.hidden)
        .onAppear { focused = true }
    }
}
