// Data/AppError.swift — error normalisation + toast copy (ARCHITECTURE §3.8).
// Trigger-raised errors carry no structured data: match on code + message, compute the rest locally.
import Foundation
import Supabase

nonisolated enum AppError: Error, Sendable, Equatable {
    /// URLError (offline, timeout, DNS).
    case network
    /// No session, or the refresh failed.
    case unauthenticated
    /// Raw PostgREST / PG error code.
    case postgrest(code: String, message: String)
    /// 42501 — the web shows this as an empty `Error: {}`.
    case rlsDenied
    /// 23505 on profiles.username.
    case usernameTaken
    /// P0001 with message == "USERNAME_COOLDOWN" — the trigger sends NO date (20260313000002); ProfileStore fills `until`.
    case usernameCooldown(until: Date?)
    /// get_check_state.active == false, or RLS returned no row.
    case checkGone(isMine: Bool)
    /// enforce_squad_max_size: 23514 with message hasPrefix "Squad is full" (20260226000005).
    case squadFull
    /// /api/* non-2xx.
    case api(status: Int, message: String)
    case decoding(String)
    case cancelled
    case unknown(String)

    init(_ error: any Error) {
        switch error {
        case let e as AppError:
            self = e
        case is CancellationError:
            self = .cancelled
        case let e as URLError:
            self = e.code == .cancelled ? .cancelled : .network
        case let e as DecodingError:
            self = .decoding(Self.describe(e))
        case let e as PostgrestError:
            self = Self.fromPostgrest(e)
        case let e as AuthError:
            self = Self.fromAuth(e)
        default:
            self = .unknown(error.localizedDescription)
        }
    }

    private static func fromPostgrest(_ e: PostgrestError) -> AppError {
        let code = e.code ?? ""
        let message = e.message
        switch code {
        case "42501":
            return .rlsDenied
        case "23505":
            // unique_violation — the only unique constraint the client can trip from a form is profiles.username.
            let haystack = [message, e.details ?? "", e.hint ?? ""].joined(separator: " ").lowercased()
            return haystack.contains("username") ? .usernameTaken : .postgrest(code: code, message: message)
        case "P0001" where message == "USERNAME_COOLDOWN":
            return .usernameCooldown(until: nil)
        case "23514" where message.hasPrefix("Squad is full"):
            return .squadFull
        case "PGRST301":
            // JWT expired / invalid at PostgREST.
            return .unauthenticated
        default:
            if code.isEmpty, message.lowercased().contains("jwt") { return .unauthenticated }
            return .postgrest(code: code, message: message)
        }
    }

    private static func fromAuth(_ e: AuthError) -> AppError {
        switch e {
        case .sessionMissing:
            return .unauthenticated
        case .api(let message, let errorCode, _, let response):
            if response.statusCode == 401 || errorCode == .sessionExpired || errorCode == .sessionNotFound
                || errorCode == .refreshTokenNotFound || errorCode == .refreshTokenAlreadyUsed || errorCode == .badJWT {
                return .unauthenticated
            }
            return .unknown(message)
        default:
            return .unknown(e.localizedDescription)
        }
    }

    private static func describe(_ e: DecodingError) -> String {
        switch e {
        case .keyNotFound(let key, let ctx): "missing key \(key.stringValue) at \(path(ctx))"
        case .typeMismatch(let type, let ctx): "type mismatch \(type) at \(path(ctx)): \(ctx.debugDescription)"
        case .valueNotFound(let type, let ctx): "null \(type) at \(path(ctx))"
        case .dataCorrupted(let ctx): "corrupt at \(path(ctx)): \(ctx.debugDescription)"
        @unknown default: "\(e)"
        }
    }

    private static func path(_ ctx: DecodingError.Context) -> String {
        ctx.codingPath.map(\.stringValue).joined(separator: ".")
    }

    /// The Slip copy. Empty for `.cancelled` (nothing is shown).
    var toastCopy: String {
        switch self {
        case .network: "no signal ✶"
        case .unauthenticated: "you got logged out — sign in again"
        case .rlsDenied: "not allowed (yet)"
        case .usernameTaken: "that one's taken"
        case .usernameCooldown(let d):
            d.map { "you can change it again \($0.formatted(.relative(presentation: .named)))" } ?? "you changed your username too recently"
        case .checkGone: "press f — that check is gone"
        case .squadFull: "squad's full — you're on the waitlist"
        case .api(_, let m), .postgrest(_, let m), .unknown(let m): m.isEmpty ? "something broke, try again" : m
        case .decoding: "something broke, try again"
        case .cancelled: ""
        }
    }
}
