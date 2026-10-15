import Foundation
import Testing
import Supabase
@testable import Downto

@Suite("AppError normalisation")
struct AppErrorTests {
    @Test func uniqueViolationOnUsernameIsUsernameTaken() {
        let e = PostgrestError(details: "Key (username)=(kat) already exists.", hint: nil, code: "23505",
                               message: "duplicate key value violates unique constraint \"profiles_username_key\"")
        #expect(AppError(e) == .usernameTaken)
        #expect(AppError(e).toastCopy == "that one's taken")
    }

    @Test func otherUniqueViolationsStayPostgrest() {
        let e = PostgrestError(details: "Key (check_id, user_id)=(…) already exists.", hint: nil, code: "23505",
                               message: "duplicate key value violates unique constraint \"check_responses_check_id_user_id_key\"")
        #expect(AppError(e) == .postgrest(code: "23505", message: e.message))
    }

    @Test func rlsDenied() {
        let e = PostgrestError(details: nil, hint: nil, code: "42501", message: "new row violates row-level security policy for table \"interest_checks\"")
        #expect(AppError(e) == .rlsDenied)
        #expect(AppError(e).toastCopy == "not allowed (yet)")
    }

    @Test func usernameCooldownCarriesNoDate() {
        // 20260313000002: RAISE EXCEPTION 'USERNAME_COOLDOWN' USING ERRCODE = 'P0001' — no structured data.
        let e = PostgrestError(details: nil, hint: nil, code: "P0001", message: "USERNAME_COOLDOWN")
        #expect(AppError(e) == .usernameCooldown(until: nil))
        #expect(AppError(e).toastCopy == "you changed your username too recently")
        let other = PostgrestError(details: nil, hint: nil, code: "P0001", message: "something else")
        #expect(AppError(other) == .postgrest(code: "P0001", message: "something else"))
    }

    @Test func squadFullOnlyForTheTriggersMessage() {
        let full = PostgrestError(details: nil, hint: nil, code: "23514", message: "Squad is full (4/4)")
        #expect(AppError(full) == .squadFull)
        #expect(AppError(full).toastCopy == "squad's full — you're on the waitlist")
        let other = PostgrestError(details: nil, hint: nil, code: "23514", message: "new row for relation \"check_comments\" violates check constraint")
        #expect(AppError(other) == .postgrest(code: "23514", message: other.message))
    }

    @Test func urlErrorsAreNetworkExceptCancelled() {
        #expect(AppError(URLError(.notConnectedToInternet)) == .network)
        #expect(AppError(URLError(.timedOut)) == .network)
        #expect(AppError(URLError(.cancelled)) == .cancelled)
        #expect(AppError(CancellationError()) == .cancelled)
        #expect(AppError(URLError(.notConnectedToInternet)).toastCopy == "no signal ✶")
        #expect(AppError(CancellationError()).toastCopy.isEmpty)
    }

    @Test func apiErrorsPassThrough() {
        let e = AppError.api(status: 401, message: "Unauthorized")
        #expect(AppError(e) == e)
        #expect(e.toastCopy == "Unauthorized")
        #expect(AppError.api(status: 500, message: "").toastCopy == "something broke, try again")
    }

    @Test func authSessionMissingIsUnauthenticated() {
        #expect(AppError(AuthError.sessionMissing) == .unauthenticated)
        #expect(AppError.unauthenticated.toastCopy == "you got logged out — sign in again")
    }

    @Test func decodingErrorsAreDescribed() {
        struct Row: Decodable { let id: UUID }
        do {
            _ = try JSONDecoder().decode(Row.self, from: Data("{}".utf8))
            Issue.record("expected a throw")
        } catch {
            guard case .decoding(let desc) = AppError(error) else { Issue.record("not .decoding: \(AppError(error))"); return }
            #expect(desc.contains("id"))
            #expect(AppError(error).toastCopy == "something broke, try again")
        }
    }

    @Test func unknownErrorsKeepTheirDescription() {
        struct Weird: Error, LocalizedError { var errorDescription: String? { "weird" } }
        #expect(AppError(Weird()) == .unknown("weird"))
        #expect(AppError.unknown("").toastCopy == "something broke, try again")
    }

    @Test func checkGoneCopy() {
        #expect(AppError.checkGone(isMine: true).toastCopy == "press f — that check is gone")
    }
}
