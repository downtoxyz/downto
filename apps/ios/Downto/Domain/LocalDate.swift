// Domain/LocalDate.swift — a calendar day with no time zone (ARCHITECTURE §3.2).
// `event_date`, `events.date`, `locked_date`, `grid_dates`, `grid_range_*` are LocalDate, never Date:
// mystery.ts and dateParse.ts both say "compare ISO strings, never Date". LocalDate makes that the only option.
import Foundation

nonisolated struct LocalDate: Hashable, Comparable, Codable, Sendable, CustomStringConvertible {
    let year: Int
    let month: Int
    let day: Int

    init(year: Int, month: Int, day: Int) {
        self.year = year
        self.month = month
        self.day = day
    }

    /// "2026-09-23". nil on any other shape (wrong length, non-digits, out-of-range month/day).
    init?(iso: String) {
        let parts = iso.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 3,
              parts[0].count == 4, parts[1].count == 2, parts[2].count == 2,
              parts.allSatisfy({ $0.allSatisfy(\.isASCII) && $0.allSatisfy(\.isNumber) }),
              let y = Int(parts[0]), let m = Int(parts[1]), let d = Int(parts[2]),
              (1...12).contains(m), (1...31).contains(d)
        else { return nil }
        self.init(year: y, month: m, day: d)
    }

    /// The calendar day `date` falls on in `calendar` (uses the calendar's time zone).
    init(_ date: Date, calendar: Calendar) {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        self.init(year: c.year ?? 1970, month: c.month ?? 1, day: c.day ?? 1)
    }

    /// Zero-padded "%04d-%02d-%02d".
    var iso: String {
        String(format: "%04d-%02d-%02d", year, month, day)
    }

    var description: String { iso }

    /// (year, month, day) tuple compare == lexicographic on `iso`.
    static func < (a: LocalDate, b: LocalDate) -> Bool {
        (a.year, a.month, a.day) < (b.year, b.month, b.day)
    }

    func adding(days: Int, calendar: Calendar) -> LocalDate {
        let start = startOfDay(in: calendar)
        let shifted = calendar.date(byAdding: .day, value: days, to: start) ?? start
        return LocalDate(shifted, calendar: calendar)
    }

    /// Local midnight in `calendar`'s time zone. Used by SquadCountdown only.
    func startOfDay(in calendar: Calendar) -> Date {
        var c = DateComponents()
        c.year = year
        c.month = month
        c.day = day
        c.hour = 0
        c.minute = 0
        c.second = 0
        // `date(from:)` on a fixed-offset or DST calendar resolves a nonexistent midnight forward, which is what we want.
        return calendar.date(from: c) ?? Date(timeIntervalSince1970: 0)
    }

    // MARK: Codable — single-value ISO string

    init(from decoder: any Decoder) throws {
        let c = try decoder.singleValueContainer()
        let s = try c.decode(String.self)
        guard let d = LocalDate(iso: s) else {
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "LocalDate expected YYYY-MM-DD, got \"\(s)\"")
        }
        self = d
    }

    func encode(to encoder: any Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(iso)
    }
}
