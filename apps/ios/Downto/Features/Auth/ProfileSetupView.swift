// Features/Auth/ProfileSetupView.swift — "who are you?" (DESIGN §7.2). display name ≤ 30, username ^[a-z0-9_]{3,20}$, live CheckEntry preview.
import SwiftUI

struct ProfileSetupView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var displayName = ""
    @State private var username = ""
    @State private var igHandle = ""
    @State private var saving = false
    @State private var usernameLine: UsernameLine = .none
    @State private var checkTask: Task<Void, Never>?
    @State private var flips = 0
    @FocusState private var focus: Field?

    enum Field { case name, username, ig }
    enum UsernameLine: Equatable { case none, checking, taken, invalid, good }

    private static let usernameRule = /^[a-z0-9_]{3,20}$/

    private var usernameValid: Bool { username.wholeMatch(of: Self.usernameRule) != nil }
    private var formValid: Bool { !displayName.trimmingCharacters(in: .whitespaces).isEmpty && usernameValid && usernameLine != .taken }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                Text("who are you?").dtFont(.display).foregroundStyle(Color.ink).padding(.top, 48)

                field(title: "display name", text: $displayName, field: .name, prompt: "your name") {
                    Text("\(displayName.count)/30").dtFont(.meta).foregroundStyle(displayName.count >= 30 ? AnyShapeStyle(.dangerInk) : AnyShapeStyle(Color.inkMuted))
                        .contentTransition(.numericText())
                }
                .onChange(of: displayName) { old, v in
                    if v.count > 30 { displayName = String(v.prefix(30)) }
                    if old.prefix(1).uppercased() != v.prefix(1).uppercased() { flips += 1 }
                }

                VStack(alignment: .leading, spacing: 6) {
                    field(title: "username", text: $username, field: .username, prompt: "username", prefix: "@") { EmptyView() }
                        .onChange(of: username) { _, v in
                            let cleaned = v.lowercased().filter { $0.isLetter || $0.isNumber || $0 == "_" }
                            if cleaned != v { username = String(cleaned.prefix(20)); return }
                            scheduleCheck()
                        }
                    usernameHint
                }

                field(title: "instagram (optional)", text: $igHandle, field: .ig, prompt: "handle", prefix: "@") { EmptyView() }

                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel(text: "how you'll show up")
                    CheckEntry(model: previewModel)
                        .allowsHitTesting(false)
                        .id(flips)
                        .transition(.identity)
                }
                .padding(.top, 8)
            }
            .padding(.horizontal, Space.gutter)
            .padding(.bottom, 120)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Color.paper)
        .safeAreaInset(edge: .bottom) {
            DTButton(title: saving ? "SAVING" : "THAT'S ME →", variant: .primary, size: .buttonLarge, disabled: !formValid || saving) {
                Task { await save() }
            }
            .padding(.horizontal, Space.gutter).padding(.bottom, 8)
            .background(Color.paper)
        }
        .onAppear {
            if let me = env.profile.me { username = me.username.hasPrefix("user_") ? "" : me.username; igHandle = me.igHandle ?? "" }
            focus = .name
        }
    }

    private var previewModel: CheckEntryModel {
        let name = displayName.trimmingCharacters(in: .whitespaces)
        let ref = PersonRef(id: env.me ?? UserID(UUID()), displayName: name.isEmpty ? "you" : name, username: username,
                            avatarLetter: name.isEmpty ? "?" : String(name.prefix(1)).uppercased(), isMe: true)
        return CheckEntryModel(id: "preview", author: .person(ref), isMine: true, text: "who's down for something tonight?", tint: .mine, toggle: .idle)
    }

    @ViewBuilder private var usernameHint: some View {
        switch usernameLine {
        case .none: Text(" ").dtFont(.meta)
        case .checking: Text("checking…").dtFont(.meta).foregroundStyle(Color.inkMuted)
        case .taken: Text("that one's taken").dtFont(.meta).foregroundStyle(.dangerInk)
        case .invalid: Text("3–20 letters, numbers or _").dtFont(.meta).foregroundStyle(Color.inkMuted)
        case .good: Text("✓ looks good").dtFont(.meta).foregroundStyle(.successInk)
        }
    }

    private func scheduleCheck() {
        checkTask?.cancel()
        guard !username.isEmpty else { usernameLine = .none; return }
        guard usernameValid else { usernameLine = .invalid; return }
        usernameLine = .checking
        let u = username
        checkTask = Task {
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }
            let ok = await env.profile.isUsernameAvailable(u)
            guard !Task.isCancelled, u == username else { return }
            usernameLine = ok ? .good : .taken
        }
    }

    private func field<Trailing: View>(title: String, text: Binding<String>, field: Field, prompt: String, prefix: String? = nil,
                                       @ViewBuilder trailing: () -> Trailing) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).dtFont(.label).foregroundStyle(.inkMuted)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                if let prefix { Text(prefix).dtFont(.title).foregroundStyle(.inkDim) }
                TextField("", text: text, prompt: Text(prompt).foregroundStyle(Color.inkFaint))
                    .dtFont(.title).foregroundStyle(Color.ink)
                    .textInputAutocapitalization(field == .name ? .words : .never)
                    .autocorrectionDisabled()
                    .focused($focus, equals: field)
                    .submitLabel(field == .ig ? .done : .next)
                    .onSubmit { focus = field == .name ? .username : field == .username ? .ig : nil }
                trailing()
            }
            Rectangle().fill(focus == field ? Color.dt : Color.ruleMid).frame(height: focus == field ? 2 : 1)
                .animation(DTSpring.settle, value: focus)
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        do {
            try await env.profile.saveSetup(displayName: displayName, username: username, igHandle: igHandle)
        } catch let e as AppError {
            if e == .usernameTaken { usernameLine = .taken } else { env.toasts.show(e.toastCopy, style: .error) }
        } catch {
            env.toasts.show(AppError(error).toastCopy, style: .error)
        }
    }
}
