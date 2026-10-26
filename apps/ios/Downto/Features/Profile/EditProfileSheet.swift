// Features/Profile/EditProfileSheet.swift — same fields as setup; username change confirm + 14-day cooldown copy (DESIGN §7.10).
import SwiftUI

struct EditProfileSheet: View {
    @Environment(AppEnvironment.self) private var env
    @State private var displayName = ""
    @State private var username = ""
    @State private var igHandle = ""
    @State private var saving = false
    @State private var usernameError: String?
    @State private var confirm: DTConfirm?
    @State private var discardConfirm: DTConfirm?
    @FocusState private var focus: Field?
    enum Field { case name, username, ig }

    private static let usernameRule = /^[a-z0-9_]{3,20}$/
    private var me: Profile? { env.profile.me }
    private var isDirty: Bool {
        guard let me else { return false }
        return displayName.trimmingCharacters(in: .whitespaces) != me.displayName || username != me.username || igHandle != (me.igHandle ?? "")
    }
    private var usernameChanged: Bool { me.map { username != $0.username } ?? false }
    private var valid: Bool {
        !displayName.trimmingCharacters(in: .whitespaces).isEmpty && username.wholeMatch(of: Self.usernameRule) != nil
    }

    var body: some View {
        DTSheetShell(title: "edit profile", trailingAction: (saving ? "SAVING" : "SAVE", { attemptSave() })) {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    field("display name", text: $displayName, field: .name, prompt: "your name") {
                        Text("\(displayName.count)/30").dtFont(.meta).foregroundStyle(displayName.count >= 30 ? AnyShapeStyle(.dangerInk) : AnyShapeStyle(.inkMuted))
                    }
                    .onChange(of: displayName) { _, v in if v.count > 30 { displayName = String(v.prefix(30)) } }

                    VStack(alignment: .leading, spacing: 6) {
                        field("username", text: $username, field: .username, prompt: "username", prefix: "@") { EmptyView() }
                            .onChange(of: username) { _, v in
                                let cleaned = String(v.lowercased().filter { $0.isLetter || $0.isNumber || $0 == "_" }.prefix(20))
                                if cleaned != v { username = cleaned }
                                usernameError = nil
                            }
                        if let usernameError {
                            Text(usernameError).dtFont(.meta).foregroundStyle(.dangerInk)
                        } else if usernameChanged {
                            Text("you can change this once every 14 days").dtFont(.meta).foregroundStyle(.inkMuted)
                        }
                    }

                    field("instagram (optional)", text: $igHandle, field: .ig, prompt: "handle", prefix: "@") { EmptyView() }
                    Color.clear.frame(height: 24)
                }
                .padding(.horizontal, Space.sheetGutter)
                .padding(.top, 8)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .interactiveDismissDisabled(isDirty)
        .onAppear {
            displayName = me?.displayName ?? ""
            username = me?.username ?? ""
            igHandle = me?.igHandle ?? ""
        }
        .dtConfirmDialog($confirm) { _ in Task { await save() } }
    }

    private func attemptSave() {
        guard valid, !saving else { return }
        if usernameChanged {
            confirm = DTConfirm("change your username to @\(username)?", message: "you can change it again in 14 days", actions: [.init("CHANGE")])
        } else {
            Task { await save() }
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        let ig = igHandle.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "^@", with: "", options: .regularExpression)
        var patch = ProfilePatch(displayName: displayName.trimmingCharacters(in: .whitespaces), igHandle: .some(ig.isEmpty ? nil : ig))
        if usernameChanged { patch.username = username }
        do {
            try await env.profile.update(patch)
            env.toasts.show("saved ✶", style: .success)
            env.router.sheet = nil
        } catch let e as AppError {
            switch e {
            case .usernameTaken: usernameError = "that one's taken"
            case .usernameCooldown(let until):
                usernameError = until.map { "you can change this again on \($0.formatted(.dateTime.month(.abbreviated).day()).lowercased())" } ?? "you changed this too recently"
            default: env.toasts.show(e.toastCopy, style: .error)
            }
        } catch {
            env.toasts.show(AppError(error).toastCopy, style: .error)
        }
    }

    private func field<Trailing: View>(_ title: String, text: Binding<String>, field: Field, prompt: String, prefix: String? = nil,
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
                trailing()
            }
            Rectangle().fill(focus == field ? Color.dt : Color.ruleMid).frame(height: focus == field ? 2 : 1)
                .animation(DTSpring.settle, value: focus)
        }
    }
}
