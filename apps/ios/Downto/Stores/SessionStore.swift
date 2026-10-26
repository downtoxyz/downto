// Stores/SessionStore.swift — auth state over supabase-swift (ARCHITECTURE §6). The Keychain session is the library's.
import Foundation
import Observation
import Supabase
import os

@Observable final class SessionStore {
    typealias State = SessionState

    private(set) var state: State = .booting
    /// The address a code was sent to; OTPView verifies against it.
    private(set) var pendingEmail: String?
    /// Set when the server signed us out from under the user (refresh token revoked) — AuthView shows the context band.
    private(set) var wasSignedOutRemotely = false
    /// Seconds until Supabase will accept another send (429 / over_email_send_rate_limit).
    private(set) var resendBlockedUntil: Date?

    private let auth: AuthClient
    private let log = Logger(subsystem: "xyz.downto.app", category: "session")
    private var watch: Task<Void, Never>?
    private var hadSession = false

    init(auth: AuthClient) {
        self.auth = auth
    }

    /// Fake worlds / previews.
    init(auth: AuthClient, state: State) {
        self.auth = auth
        self.state = state
    }

    func start() {
        guard watch == nil else { return }
        watch = Task { [weak self] in
            guard let self else { return }
            for await (event, session) in auth.authStateChanges {
                switch event {
                case .initialSession, .signedIn, .tokenRefreshed, .userUpdated:
                    if let session {
                        hadSession = true
                        state = .signedIn(UserID(session.user.id))
                    } else if event == .initialSession {
                        state = .signedOut
                    }
                case .signedOut:
                    if hadSession, case .signedIn = state { wasSignedOutRemotely = true }
                    hadSession = false
                    state = .signedOut
                case .passwordRecovery, .mfaChallengeVerified, .userDeleted:
                    break
                }
            }
        }
    }

    func sendCode(email: String) async throws {
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard EmailValidity.isValidShape(trimmed) else { throw AppError.unknown("that doesn't look like an email") }
        do {
            try await auth.signInWithOTP(email: trimmed, shouldCreateUser: true)
            pendingEmail = trimmed
            resendBlockedUntil = nil
        } catch let e as AuthError {
            if case .api(_, let code, _, let response) = e, response.statusCode == 429 || code == .overEmailSendRateLimit {
                resendBlockedUntil = .now.addingTimeInterval(60)
                throw AppError.api(status: 429, message: "too many codes — try again in a minute")
            }
            throw AppError(e)
        }
    }

    func verify(code: String) async throws {
        guard let email = pendingEmail else { throw AppError.unknown("send a code first") }
        let digits = code.filter(\.isNumber)
        guard digits.count == 8 else { throw AppError.unknown("that's not it") }
        do {
            try await auth.verifyOTP(email: email, token: digits, type: .email)
        } catch let e as AuthError {
            throw Self.otpError(e)
        }
    }

    enum OTPFailure: Error, Equatable { case wrong, expired, tooMany, network, other(String) }

    nonisolated static func otpError(_ e: AuthError) -> OTPFailure {
        if case .api(let message, let code, _, _) = e {
            switch code {
            case .otpExpired: return .expired
            case .overRequestRateLimit, .overEmailSendRateLimit: return .tooMany
            default:
                let m = message.lowercased()
                if m.contains("expired") { return .expired }
                if m.contains("invalid") || m.contains("token") { return .wrong }
                return .other(message)
            }
        }
        return .other(e.localizedDescription)
    }

    func clearPendingEmail() { pendingEmail = nil }
    func acknowledgeRemoteSignOut() { wasSignedOutRemotely = false }

    /// The abandoned-onboarding sweep (§6.1): valid session, no profile row → sign out and say so.
    func signOutSwept() async {
        try? await auth.signOut()
        state = .signedOut
    }

    func signOut() async {
        do { try await auth.signOut() } catch { log.error("signOut: \(String(describing: error), privacy: .public)") }
        hadSession = false
        state = .signedOut
    }

    /// Fake worlds only.
    func setFakeState(_ s: State) { state = s }
}
