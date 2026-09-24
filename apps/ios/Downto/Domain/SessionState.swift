// Domain/SessionState.swift — SessionStore.state's type; lives in Domain so resolveGate can take it (ARCHITECTURE §1.0, §6).
import Foundation

nonisolated enum SessionState: Hashable, Sendable {
    case booting
    case signedOut
    case signedIn(UserID)

    var userId: UserID? {
        if case .signedIn(let id) = self { return id }
        return nil
    }
}
