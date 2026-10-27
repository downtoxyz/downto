// Features/Auth/OTPView.swift — 8 slots over an invisible TextField so Mail autofill works (DESIGN §7.1).
import SwiftUI

struct OTPView: View {
    var onBack: () -> Void
    @Environment(AppEnvironment.self) private var env
    @State private var code = ""
    @State private var verifying = false
    @State private var error: String?
    @State private var shake = 0
    @State private var locked = false
    @State private var sentAt = Date.now
    @State private var expired = false
    @State private var popped: Set<Int> = []
    @FocusState private var focused: Bool

    private var email: String { env.session.pendingEmail ?? "" }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer(minLength: 0).frame(maxHeight: .infinity)
            Text("check your email").dtFont(.display).foregroundStyle(Color.ink)
            HStack(spacing: 6) {
                Text(email).dtFont(.meta).foregroundStyle(Color.inkMuted).lineLimit(1)
                Button { env.session.clearPendingEmail(); onBack() } label: { Text("different email").dtFont(.meta).foregroundStyle(.dtInk) }
                    .buttonStyle(.plain)
            }
            .padding(.top, 8)

            slots
                .padding(.top, 36)
                .modifier(Shake(trigger: shake))
                .dtFeedback(.error, trigger: shake)
                .overlay {
                    // The real field, stretched over the slots: tapping focuses it and long-press shows the system Paste menu.
                    TextField("", text: $code)
                        .keyboardType(.numberPad)
                        .textContentType(.oneTimeCode)
                        .focused($focused)
                        .foregroundStyle(.clear)
                        .tint(.clear)
                        .accentColor(.clear)
                        .onChange(of: code) { _, v in onCodeChange(v) }
                        .accessibilityLabel("8 digit code")
                }

            // Mail autofill only works for codes that arrive in Mail/Messages on this device; everyone else pastes.
            PasteButton(payloadType: String.self) { items in
                if let s = items.first { code = String(s.filter(\.isNumber).prefix(8)) }
            }
            .labelStyle(.titleOnly)
            .buttonBorderShape(.capsule)
            .tint(Color.dt)
            .controlSize(.small)
            .padding(.top, 12)
            .accessibilityLabel("paste code")

            Group {
                if let error {
                    Text(error).dtFont(.meta).foregroundStyle(.dangerInk)
                } else {
                    Text(" ").dtFont(.meta)
                }
            }
            .padding(.top, 10)
            .animation(DTSpring.page, value: error)

            Spacer(minLength: 0).frame(maxHeight: .infinity)
        }
        .padding(.horizontal, Space.gutter)
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 8) {
                ResendRow(sentAt: sentAt, promoted: expired || locked) { Task { await resend() } }
                if !(expired || locked) {
                    DTButton(title: verifying ? "CHECKING" : "VERIFY →", variant: .primary, size: .buttonLarge, disabled: verifying || code.count < 8) {
                        Task { await verify() }
                    }
                }
            }
            .padding(.horizontal, Space.gutter)
            .padding(.bottom, 8)
            .background(Color.paper)
        }
        .onAppear { focused = true }
    }

    private var slots: some View {
        HStack(spacing: 0) {
            ForEach(0..<8, id: \.self) { i in
                let ch = i < code.count ? String(code[code.index(code.startIndex, offsetBy: i)]) : "·"
                Text(ch)
                    .dtFont(.numeral)
                    .foregroundStyle(i < code.count ? (locked ? Color.inkFaint : Color.ink) : Color.inkFaint)
                    .frame(maxWidth: .infinity)
                    .scaleEffect(popped.contains(i) ? 1.3 : 1)
                    .animation(.easeOut(duration: 0.06), value: popped)
            }
        }
        .frame(height: 48)
        .padding(.vertical, 8)
        .overlay(alignment: .bottom) { Rectangle().fill(locked ? Color.inkFaint : Color.ruleMid).frame(height: 1) }
    }

    private func onCodeChange(_ v: String) {
        let digits = String(v.filter(\.isNumber).prefix(8))
        if digits != v { code = digits; return }
        error = nil
        if digits.count > 0 {
            let i = digits.count - 1
            popped.insert(i)
            Task { try? await Task.sleep(for: .milliseconds(70)); popped.remove(i) }
        }
        if digits.count == 8 { Task { await verify() } }
    }

    private func verify() async {
        guard !verifying, !locked, code.count == 8 else { return }
        verifying = true
        defer { verifying = false }
        do {
            try await env.session.verify(code: code)
            Defaults.seenNotifPrompt = Defaults.seenNotifPrompt   // no-op; the gate decides what's next
        } catch let f as SessionStore.OTPFailure {
            switch f {
            case .wrong:
                shake += 1; code = ""; error = "that's not it"
                Task { try? await Task.sleep(for: .seconds(2)); if error == "that's not it" { error = nil } }
            case .expired: expired = true; error = "that code expired"
            case .tooMany: locked = true; error = "too many tries — resend a new code"
            case .network: env.toasts.show("no signal ✶", style: .error)
            case .other(let m): error = m
            }
        } catch {
            if AppError(error) == .network { env.toasts.show("no signal ✶", style: .error) } else { shake += 1; code = ""; self.error = "that's not it" }
        }
    }

    private func resend() async {
        do {
            try await env.session.sendCode(email: email)
            sentAt = .now; expired = false; locked = false; code = ""; error = nil
            env.toasts.show("new code sent ✶")
        } catch {
            env.toasts.show(AppError(error).toastCopy, style: .error)
        }
    }
}

private struct ResendRow: View {
    let sentAt: Date
    let promoted: Bool
    let resend: () -> Void
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { ctx in
            let left = max(0, 20 - Int(ctx.date.timeIntervalSince(sentAt)))
            if left > 0 && !promoted {
                Text("resend in 0:\(String(format: "%02d", left))").dtFont(.meta).foregroundStyle(Color.inkMuted)
                    .contentTransition(.numericText(countsDown: true))
                    .frame(maxWidth: .infinity)
            } else if promoted {
                DTButton(title: "RESEND", variant: .primary, size: .buttonLarge, action: resend)
            } else {
                DTButton(title: "RESEND", variant: .text, action: resend).frame(maxWidth: .infinity)
            }
        }
    }
}

struct Shake: ViewModifier, Animatable {
    var trigger: Int
    var animatableData: CGFloat { get { CGFloat(trigger) } set { phase = newValue } }
    @State private var phase: CGFloat = 0
    func body(content: Content) -> some View {
        content.offset(x: sin(phase * .pi * 4) * 6).animation(.easeOut(duration: 0.4), value: trigger)
    }
}
