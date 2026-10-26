// Features/Auth/AuthView.swift — email → 8-digit OTP (ARCHITECTURE §6, §15; look DESIGN §7.1).
import SwiftUI
import SafariServices

struct AuthView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var email = ""
    @State private var sending = false
    @State private var showInvalid = false
    @State private var suggestion: String?
    @State private var stage: Stage = .email
    @State private var invalidCount = 0
    @State private var safariURL: URL?
    @FocusState private var emailFocused: Bool

    enum Stage: Equatable { case email, code }

    private var sharedBanner: SharedCheck? { env.feed.raw.sharedCheck }

    var body: some View {
        ZStack {
            Color.paper.ignoresSafeArea()
            switch stage {
            case .email: emailStage.transition(.opacity.combined(with: .move(edge: .leading)))
            case .code: OTPView(onBack: { withAnimation(DTSpring.page) { stage = .email } }).transition(.opacity.combined(with: .move(edge: .trailing)))
            }
        }
        .animation(DTSpring.page, value: stage)
        .sheet(item: $safariURL) { SafariSheet(url: $0).ignoresSafeArea() }
        .task { await loadBanner() }
        .onAppear { if env.session.pendingEmail != nil { stage = .code } }
    }

    private var emailStage: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer(minLength: 0).frame(maxHeight: .infinity)
            Text("down to").dtFont(.masthead).foregroundStyle(Color.ink)
            Text("see who's down.").dtFont(.body).foregroundStyle(Color.inkMuted).padding(.top, 6)

            if env.session.wasSignedOutRemotely {
                contextBand("you were signed out — sign in again to pick up where you left off").padding(.top, 24)
            } else if let s = sharedBanner {
                sharedCheckBand(s).padding(.top, 24)
            } else if let u = Defaults.pendingAddUsername {
                contextBand("sign in to add @\(u)").padding(.top, 24)
            }

            VStack(alignment: .leading, spacing: 8) {
                TextField("", text: $email, prompt: Text("your@email").foregroundStyle(Color.inkFaint))
                    .dtFont(.title)
                    .foregroundStyle(Color.ink)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($emailFocused)
                    .submitLabel(.send)
                    .onSubmit { Task { await send() } }
                    .onChange(of: email) { _, v in
                        showInvalid = false
                        suggestion = EmailValidity.suggestFix(v.trimmingCharacters(in: .whitespaces).lowercased())
                    }
                    .accessibilityLabel("email")
                Rectangle()
                    .fill(showInvalid ? Color.danger : (emailFocused ? Color.dt : Color.ruleMid))
                    .frame(height: showInvalid || emailFocused ? 2 : 1)
                    .animation(DTSpring.settle, value: emailFocused)
                    .animation(DTSpring.settle, value: showInvalid)
                if showInvalid {
                    Text("that doesn't look like an email").dtFont(.meta).foregroundStyle(.dangerInk)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                } else if let s = suggestion {
                    Button { email = s; suggestion = nil } label: {
                        Text("did you mean \(s)?").dtFont(.meta).foregroundStyle(.dtInk)
                    }
                    .buttonStyle(.plain)
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
            .padding(.top, 40)
            .animation(DTSpring.page, value: suggestion)
            .dtFeedback(.error, trigger: invalidCount)

            Spacer(minLength: 0).frame(maxHeight: .infinity)

            HStack(spacing: 6) {
                footerLink("terms", "https://downto.xyz/terms")
                Text("·").dtFont(.meta).foregroundStyle(.inkDim)
                footerLink("privacy", "https://downto.xyz/privacy")
            }
            .padding(.bottom, 12)
        }
        .padding(.horizontal, Space.gutter)
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 6) {
                if let until = env.session.resendBlockedUntil, until > .now {
                    RateLimitCountdown(until: until)
                }
                DTButton(title: sending ? "SENDING" : "SEND CODE →", variant: .primary, size: .buttonLarge, disabled: sending || rateLimited) {
                    Task { await send() }
                }
            }
            .padding(.horizontal, Space.gutter)
            .padding(.bottom, 8)
            .background(Color.paper)
        }
        .onAppear { emailFocused = true }
    }

    private var rateLimited: Bool { env.session.resendBlockedUntil.map { $0 > .now } ?? false }

    private func send() async {
        let trimmed = email.trimmingCharacters(in: .whitespaces).lowercased()
        if !EmailValidity.isValidShape(trimmed) {
            withAnimation(DTSpring.page) { showInvalid = true }
            invalidCount += 1
            // The CTA stays enabled so the user can insist (web parity) — a second tap sends anyway.
            if invalidCount < 2 { return }
        }
        sending = true
        defer { sending = false }
        do {
            try await env.session.sendCode(email: trimmed)
            env.session.acknowledgeRemoteSignOut()
            withAnimation(DTSpring.page) { stage = .code }
        } catch let e as AppError {
            switch e {
            case .network: env.toasts.show("couldn't send the code — check your connection", style: .error)
            case .api(429, _): break   // the countdown under the pill says it
            default: env.toasts.show(e.toastCopy, style: .error)
            }
        } catch {
            env.toasts.show(AppError(error).toastCopy, style: .error)
        }
    }

    private func loadBanner() async {
        guard let id = Defaults.pendingCheckId, env.feed.raw.sharedCheck == nil else { return }
        _ = await env.feed.injectSharedCheck(id)
        Defaults.activeSharedCheckId = nil   // only the pre-gate sequence promotes it (§7.1)
    }

    /// §7.3 — mystery-safe: nil mystery → mask.
    private func sharedCheckBand(_ s: SharedCheck) -> some View {
        let masked = Mystery.isUnrevealed(mystery: s.mystery ?? true, authorId: s.authorId, eventDate: s.eventDate, viewer: nil, now: .now, calendar: .current)
        let name = masked ? Censor.kaomoji(seed: s.id.description) : s.authorName
        let text = masked ? Censor.stripAtMentions(s.text) : s.text
        return VStack(alignment: .leading, spacing: 4) {
            Text("\(name) wants to know if you're down").dtFont(.bodySmall).foregroundStyle(Color.ink)
            Text(text).dtFont(.headline).foregroundStyle(Color.ink).lineLimit(3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 12).padding(.horizontal, 14)
        .background(Color.checkNew)
    }

    private func contextBand(_ text: String) -> some View {
        Text(text).dtFont(.bodySmall).foregroundStyle(Color.ink)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 12).padding(.horizontal, 14)
            .background(Color.checkNew)
    }

    private func footerLink(_ title: String, _ url: String) -> some View {
        Button { safariURL = URL(string: url) } label: { Text(title).dtFont(.meta).foregroundStyle(.inkDim) }.buttonStyle(.plain)
    }
}

/// "try again in 0:58" under a disabled pill (DESIGN §7.1 rate-limited).
struct RateLimitCountdown: View {
    let until: Date
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { ctx in
            let s = max(0, Int(until.timeIntervalSince(ctx.date).rounded(.up)))
            Text("try again in \(s / 60):\(String(format: "%02d", s % 60))")
                .dtFont(.meta).foregroundStyle(Color.inkMuted)
                .contentTransition(.numericText(countsDown: true))
        }
    }
}

extension URL: @retroactive Identifiable {
    public var id: String { absoluteString }
}

struct SafariSheet: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
    func updateUIViewController(_ c: SFSafariViewController, context: Context) {}
}
