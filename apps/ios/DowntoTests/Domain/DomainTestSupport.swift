// DowntoTests/Domain/DomainTestSupport.swift — shared helpers for the pure Domain suites (no Fixtures, no stores — ARCHITECTURE §12).
import Foundation
@testable import Downto

enum DomainTestSupport {
    static func calendar(_ tz: String) -> Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: tz)!
        c.locale = Locale(identifier: "en_US_POSIX")
        return c
    }

    /// A wall-clock instant in `calendar`'s time zone.
    static func date(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 0, _ min: Int = 0, _ s: Int = 0, calendar: Calendar) -> Date {
        var c = DateComponents()
        c.year = y; c.month = m; c.day = d; c.hour = h; c.minute = min; c.second = s
        return calendar.date(from: c)!
    }

    static func ld(_ y: Int, _ m: Int, _ d: Int) -> LocalDate { LocalDate(year: y, month: m, day: d) }

    static func uuid(_ n: Int) -> UUID {
        UUID(uuidString: String(format: "a1b2c3d4-0000-4000-8000-%012d", n))!
    }
}
