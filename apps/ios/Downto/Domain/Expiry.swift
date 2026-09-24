// Domain/Expiry.swift — computeExpiry (ARCHITECTURE §10.3). Port of the web's computeExpiry (useChecks.ts / useOnboarding.tsx).
import Foundation

nonisolated enum ExpiryState: Hashable, Sendable {
    /// `expires_at` is null — an open-ended check.
    case open
    /// `expires_at` has passed.
    case expired
    /// Time left, split the way the web prints it, plus how much of the timer has elapsed (0…100).
    case remaining(hours: Int, minutes: Int, percent: Double)

    /// "open" | "expired" | "3h" | "42m" — the web's `expiresIn` string.
    var label: String {
        switch self {
        case .open: "open"
        case .expired: "expired"
        case .remaining(let h, let m, _): h > 0 ? "\(h)h" : "\(m)m"
        }
    }

    /// The web flips the expiry bar to danger once more than 75 % of the timer has elapsed.
    var isDanger: Bool {
        if case .remaining(_, _, let p) = self { p > 75 } else { false }
    }

    var percent: Double {
        switch self {
        case .open: 0
        case .expired: 100
        case .remaining(_, _, let p): p
        }
    }

    var isExpired: Bool { self == .expired }
    var isOpen: Bool { self == .open }
}

/// nil → `.open`; remaining ≤ 0 → `.expired`; else hours = floor(rem / 3600), minutes = floor(rem % 3600 / 60),
/// percent = min(100, elapsed / total × 100).
nonisolated func computeExpiry(expiresAt: Date?, createdAt: Date, now: Date) -> ExpiryState {
    guard let expiresAt else { return .open }
    let remaining = expiresAt.timeIntervalSince(now)
    if remaining <= 0 { return .expired }
    let total = expiresAt.timeIntervalSince(createdAt)
    let elapsed = now.timeIntervalSince(createdAt)
    let hours = Int((remaining / 3600).rounded(.down))
    let minutes = Int((remaining.truncatingRemainder(dividingBy: 3600) / 60).rounded(.down))
    // total ≤ 0 would be a row whose expires_at ≤ created_at; the web divides by zero (→ Infinity → clamped to 100).
    let percent: Double = total > 0 ? min(100, elapsed / total * 100) : 100
    return .remaining(hours: hours, minutes: max(0, minutes), percent: max(0, percent))
}
