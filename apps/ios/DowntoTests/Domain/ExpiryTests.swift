// DowntoTests/Domain/ExpiryTests.swift — open / expired / remaining, percent math, isDanger at exactly 75 (ARCHITECTURE §10.3).
import Foundation
import Testing
@testable import Downto

@Suite("Expiry")
struct ExpiryTests {
    static let created = Date(timeIntervalSince1970: 1_800_000_000)
    static let h: TimeInterval = 3600

    @Test func nilExpiresAtIsOpen() {
        let s = computeExpiry(expiresAt: nil, createdAt: Self.created, now: Self.created + 10 * Self.h)
        #expect(s == .open)
        #expect(s.label == "open")
        #expect(s.percent == 0)
        #expect(!s.isDanger && s.isOpen && !s.isExpired)
    }

    @Test func pastOrExactlyNowIsExpired() {
        let expires = Self.created + 4 * Self.h
        #expect(computeExpiry(expiresAt: expires, createdAt: Self.created, now: expires) == .expired)
        #expect(computeExpiry(expiresAt: expires, createdAt: Self.created, now: expires + 1) == .expired)
        #expect(ExpiryState.expired.label == "expired")
        #expect(ExpiryState.expired.percent == 100)
        #expect(!ExpiryState.expired.isDanger)
    }

    @Test func remainingSplitsHoursAndMinutesLikeTheWeb() {
        // 4 h timer, 1 h in: 3 h 0 m left, 25 %.
        let expires = Self.created + 4 * Self.h
        let s = computeExpiry(expiresAt: expires, createdAt: Self.created, now: Self.created + 1 * Self.h)
        #expect(s == .remaining(hours: 3, minutes: 0, percent: 25))
        #expect(s.label == "3h")
        // 42 min 30 s left → "42m" (floor), hours 0.
        let s2 = computeExpiry(expiresAt: expires, createdAt: Self.created, now: expires - 42.5 * 60)
        guard case .remaining(let hrs, let mins, _) = s2 else { Issue.record("expected remaining"); return }
        #expect(hrs == 0 && mins == 42)
        #expect(s2.label == "42m")
        // 1 h 59 m 59 s left → "1h" (the web floors hours and ignores the minutes in the label).
        let s3 = computeExpiry(expiresAt: expires, createdAt: Self.created, now: expires - (2 * Self.h - 1))
        #expect(s3.label == "1h")
    }

    @Test func percentIsElapsedOverTotalClampedTo100() {
        let expires = Self.created + 10 * Self.h
        #expect(computeExpiry(expiresAt: expires, createdAt: Self.created, now: Self.created).percent == 0)
        #expect(computeExpiry(expiresAt: expires, createdAt: Self.created, now: Self.created + 5 * Self.h).percent == 50)
        #expect(computeExpiry(expiresAt: expires, createdAt: Self.created, now: Self.created + 9.9 * Self.h).percent == 99)
        // now before createdAt (clock skew) never goes negative.
        #expect(computeExpiry(expiresAt: expires, createdAt: Self.created, now: Self.created - Self.h).percent == 0)
    }

    @Test func isDangerFlipsStrictlyAbove75() {
        let expires = Self.created + 100 * Self.h
        let at75 = computeExpiry(expiresAt: expires, createdAt: Self.created, now: Self.created + 75 * Self.h)
        #expect(at75.percent == 75)
        #expect(!at75.isDanger)
        let just = computeExpiry(expiresAt: expires, createdAt: Self.created, now: Self.created + 75 * Self.h + 60)
        #expect(just.isDanger)
        #expect(computeExpiry(expiresAt: expires, createdAt: Self.created, now: Self.created + 99 * Self.h).isDanger)
    }

    @Test func degenerateTimerDoesNotDivideByZero() {
        // expires_at == created_at but now < expires: impossible unless clocks skew; must not be NaN.
        let s = computeExpiry(expiresAt: Self.created, createdAt: Self.created, now: Self.created - 60)
        #expect(s == .remaining(hours: 0, minutes: 1, percent: 100))
    }
}
