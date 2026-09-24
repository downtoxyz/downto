import Foundation
import Testing
@testable import Downto

@Suite("LocalDate")
struct LocalDateTests {
    static func calendar(_ tz: String) -> Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: tz)!
        return c
    }

    @Test func parsesISO() {
        let d = LocalDate(iso: "2026-09-23")
        #expect(d == LocalDate(year: 2026, month: 9, day: 23))
        #expect(d?.iso == "2026-09-23")
    }

    @Test(arguments: ["2026-9-23", "2026-09-23T00:00:00Z", "20260923", "", "2026-13-01", "2026-00-10", "2026-01-32", "abcd-ef-gh", "2026-09-23-01"])
    func rejectsOtherShapes(_ s: String) {
        #expect(LocalDate(iso: s) == nil)
    }

    @Test func zeroPadsISO() {
        #expect(LocalDate(year: 999, month: 1, day: 5).iso == "0999-01-05")
    }

    @Test func comparesLikeISOStrings() {
        let dates = ["2026-12-31", "2027-01-01", "2026-01-15", "2026-01-02"].compactMap(LocalDate.init(iso:))
        let sorted = dates.sorted().map(\.iso)
        #expect(sorted == ["2026-01-02", "2026-01-15", "2026-12-31", "2027-01-01"])
        #expect(LocalDate(iso: "2026-09-23")! < LocalDate(iso: "2026-09-24")!)
        #expect(!(LocalDate(iso: "2026-09-23")! < LocalDate(iso: "2026-09-23")!))
    }

    @Test func fromDateUsesTheCalendarsTimeZone() {
        // 2026-09-24T03:30:00Z is still the 23rd in Los Angeles and already the 24th in Tokyo.
        let instant = Date(timeIntervalSince1970: 1_790_220_600)   // 2026-09-24 03:30:00 UTC
        #expect(LocalDate(instant, calendar: Self.calendar("UTC")).iso == "2026-09-24")
        #expect(LocalDate(instant, calendar: Self.calendar("America/Los_Angeles")).iso == "2026-09-23")
        #expect(LocalDate(instant, calendar: Self.calendar("Asia/Tokyo")).iso == "2026-09-24")
    }

    @Test func addingDaysCrossesMonthAndYear() {
        let cal = Self.calendar("Europe/London")
        #expect(LocalDate(iso: "2026-12-31")!.adding(days: 1, calendar: cal).iso == "2027-01-01")
        #expect(LocalDate(iso: "2026-03-01")!.adding(days: -1, calendar: cal).iso == "2026-02-28")
        #expect(LocalDate(iso: "2028-02-28")!.adding(days: 1, calendar: cal).iso == "2028-02-29")
        #expect(LocalDate(iso: "2026-09-23")!.adding(days: 0, calendar: cal).iso == "2026-09-23")
    }

    @Test func startOfDayIsLocalMidnight() {
        let la = Self.calendar("America/Los_Angeles")
        let midnight = LocalDate(iso: "2026-09-23")!.startOfDay(in: la)
        let comps = la.dateComponents([.year, .month, .day, .hour, .minute, .second], from: midnight)
        #expect(comps.year == 2026 && comps.month == 9 && comps.day == 23)
        #expect(comps.hour == 0 && comps.minute == 0 && comps.second == 0)
        // 2026-09-23 00:00 PDT == 2026-09-23 07:00 UTC
        #expect(midnight == Date(timeIntervalSince1970: 1_790_146_800))
    }

    @Test func codableIsASingleISOString() throws {
        let d = LocalDate(iso: "2026-09-23")!
        let data = try JSONEncoder().encode([d])
        #expect(String(decoding: data, as: UTF8.self) == "[\"2026-09-23\"]")
        let back = try JSONDecoder().decode([LocalDate].self, from: data)
        #expect(back == [d])
        #expect(throws: DecodingError.self) {
            _ = try JSONDecoder().decode([LocalDate].self, from: Data("[\"2026-09-23T00:00:00Z\"]".utf8))
        }
    }

    @Test func decodesOffTheMainActor() async throws {
        let iso = "[\"2026-05-01\"]"
        let d = try await Task.detached {
            try JSONDecoder().decode([LocalDate].self, from: Data(iso.utf8))
        }.value
        #expect(d.first?.iso == "2026-05-01")
    }
}
