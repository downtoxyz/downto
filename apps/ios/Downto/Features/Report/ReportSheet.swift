// Features/Report/ReportSheet.swift — report (+ optionally block) any UGC (DESIGN §7.14; ARCHITECTURE §15). M1 targets: .check, .profile.
import SwiftUI

struct ReportSheet: View {
    let target: ReportTarget
    let id: UUID
    @Environment(AppEnvironment.self) private var env
    @State private var reason: ReportReason?
    @State private var details = ""
    @State private var alsoBlock = false
    @State private var sending = false
    @State private var taps = 0
    @State private var sent = 0
    @FocusState private var detailsFocused: Bool

    private var subjectUser: UserID? { target == .profile ? UserID(id) : nil }
    private var quote: String {
        switch target {
        case .profile: "@\(env.friends.raw.profiles[UserID(id)]?.username ?? "someone")"
        case .check: env.feed.raw.checks[CheckID(id)]?.text ?? "a check"
        default: "this"
        }
    }
    private var canSend: Bool {
        guard let reason, !sending else { return false }
        return reason != .other || !details.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        DTSheetShell(title: "report") {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text(quote).dtFont(.bodySmall).foregroundStyle(.inkMuted).lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(RoundedRectangle(cornerRadius: Radius.m).fill(Color.deep))

                    VStack(spacing: 0) {
                        ForEach(ReportReason.allCases, id: \.self) { r in
                            Button {
                                taps += 1
                                withAnimation(DTSpring.ink) { reason = r }
                            } label: {
                                HStack {
                                    Text(r.rawValue).dtFont(.body).foregroundStyle(Color.ink)
                                    Spacer()
                                    ZStack {
                                        Circle().strokeBorder(Color.ruleMid, lineWidth: 1.5).frame(width: 22, height: 22)
                                        if reason == r {
                                            Circle().fill(Color.dt).frame(width: 22, height: 22)
                                            Text("·").dtFont(.headline).foregroundStyle(Color.onDt)
                                        }
                                    }
                                }
                                .frame(minHeight: 52)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(DTPressStyle())
                            .overlay(alignment: .bottom) { Rectangle().fill(Color.rule).frame(height: 1) }
                            .accessibilityAddTraits(reason == r ? [.isSelected] : [])
                        }
                    }
                    .dtFeedback(.selection, trigger: taps)

                    VStack(alignment: .leading, spacing: 6) {
                        TextField("", text: $details, prompt: Text(reason == .other ? "what happened? (required)" : "anything else?").foregroundStyle(Color.inkFaint), axis: .vertical)
                            .dtFont(.body).foregroundStyle(Color.ink)
                            .lineLimit(2...6)
                            .focused($detailsFocused)
                            .onChange(of: details) { _, v in if v.count > 500 { details = String(v.prefix(500)) } }
                        Rectangle().fill(detailsFocused ? Color.dt : Color.ruleMid).frame(height: detailsFocused ? 2 : 1).animation(DTSpring.settle, value: detailsFocused)
                        if details.count >= 450 {
                            Text("\(details.count)/500").dtFont(.meta).foregroundStyle(.inkMuted).frame(maxWidth: .infinity, alignment: .trailing)
                        }
                    }

                    if let u = subjectUser, u != env.me {
                        Toggle(isOn: $alsoBlock) {
                            Text("block \(env.friends.raw.profiles[u]?.displayName ?? "them") too").dtFont(.bodySmall).foregroundStyle(Color.ink)
                        }
                        .tint(Color.dt)
                    }

                    Button(action: send) {
                        Text(sending ? "SENDING" : "SEND REPORT").dtFont(.buttonLarge)
                            .foregroundStyle(Color.paper)
                            .frame(maxWidth: .infinity).frame(height: 52)
                            .background(Capsule().fill(canSend ? Color.ink : Color.inkFaint))
                    }
                    .buttonStyle(DTPressStyle())
                    .disabled(!canSend)
                    Color.clear.frame(height: 24)
                }
                .padding(.horizontal, Space.sheetGutter)
                .padding(.top, 8)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .presentationDetents(detailsFocused ? [.large] : [.height(520), .large])
        .onAppear { alsoBlock = target == .profile }
        .dtFeedback(.success, trigger: sent)
    }

    private func send() {
        guard let reason else { return }
        sending = true
        Task {
            do {
                try await env.friends.report(target, id: id, reason: reason, details: details)
                if alsoBlock, let u = subjectUser { await env.friends.block(u) }
                if target == .check { await env.feed.hide(CheckID(id)) }
                sent += 1
                env.toasts.show("reported. we'll take a look.", style: .success)
                env.router.stacked = nil
                env.router.sheet = nil
            } catch {
                env.toasts.show(AppError(error).toastCopy, style: .error, action: .retry, actionTitle: "RETRY")
                sending = false
            }
        }
    }
}
